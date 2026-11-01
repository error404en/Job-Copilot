import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.inbox import OpportunityActionRequest, update_opportunity
from app.api.research import discover_careers_url_and_ats
from app.models.discovery import ATSInfo, ATSSystem, CareersDiscoveryResult
from app.models.inbox import SourceType, InboxOpportunityStatus, VerificationStatus
from app.services.inbox_processor import ATS_FETCHERS, fetch_discovered_ats_jobs, process_inbox_source


class Query:
    def __init__(self, data):
        self.data = data
        self.filters = []
        self.update_payload = None

    def select(self, *_args):
        return self

    def update(self, payload):
        self.update_payload = payload
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        return SimpleNamespace(data=self.data)


class SupabaseSequence:
    def __init__(self, queries):
        self.queries = iter(queries)

    def table(self, _name):
        return next(self.queries)


def _opportunity(job_id=None):
    return {
        "id": "opp-1",
        "user_id": "user-a",
        "source_id": "source-1",
        "company": "Acme",
        "role_title": "Backend Engineer",
        "location": "Remote",
        "original_submitted_url": "https://boards.greenhouse.io/acme/jobs/123",
        "verified_official_url": "https://boards.greenhouse.io/acme/jobs/123",
        "extraction_metadata": {"experience_req": "1 year", "skills": ["Python"]},
        "job_id": job_id,
    }


def test_inbox_frontend_uses_proxy_api_client_not_localhost():
    repo_root = Path(__file__).resolve().parents[2]
    source = (repo_root / "frontend/app/inbox/page.tsx").read_text(encoding="utf-8")
    assert "useApiClient" in source
    assert 'apiFetch("/api/inbox/opportunities")' in source
    assert "localhost:8000/api/inbox" not in source


@pytest.mark.parametrize(("url", "system"), [
    ("https://boards.greenhouse.io/acme/jobs/123", ATSSystem.GREENHOUSE),
    ("https://jobs.lever.co/acme/123", ATSSystem.LEVER),
    ("https://jobs.ashbyhq.com/acme/123", ATSSystem.ASHBY),
    ("https://jobs.smartrecruiters.com/acme/123", ATSSystem.SMARTRECRUITERS),
    ("https://acme.wd1.myworkdayjobs.com/en-US/Careers/job/Remote/123", ATSSystem.WORKDAY),
])
def test_canonical_discovery_recognizes_supported_inbox_ats_urls(url, system):
    result = discover_careers_url_and_ats("Acme", url)
    assert result.ats_info is not None
    assert result.ats_info.system == system


def test_canonical_discovery_returns_no_ats_for_custom_url():
    result = discover_careers_url_and_ats("Acme", "https://careers.acme.test/openings")
    assert result.ats_info is None


@pytest.mark.parametrize("system", list(ATSSystem))
def test_all_supported_ats_systems_use_the_canonical_adapter(system):
    fetcher = MagicMock(return_value=[{"source_type": system.value}])
    with patch.dict(ATS_FETCHERS, {system: fetcher}):
        results = asyncio.run(fetch_discovered_ats_jobs(ATSInfo(system=system, token="token"), "Backend Engineer"))

    assert results == [{"source_type": system.value}]
    fetcher.assert_called_once_with("token", target_keywords=["Backend Engineer"])


def test_generic_fallback_hands_off_to_the_shared_v2_pipeline():
    discovery = CareersDiscoveryResult(careers_url="https://careers.acme.test")
    generic_job = {
        "role_title": "Backend Engineer",
        "raw_jd": "Backend Engineer\nPython",
        "source_type": "generic_playwright",
        "url": "https://careers.acme.test/jobs/1",
        "official_apply_url": "https://careers.acme.test/jobs/1",
    }
    with patch("app.services.inbox_processor.extract_opportunities_from_text", return_value=[{
        "company": "Acme", "role_title": "Backend Engineer", "submitted_url": "https://careers.acme.test"
    }]), patch("app.services.inbox_processor.resolve_lead", return_value={
        "status": InboxOpportunityStatus.VERIFIED,
        "verification_status": VerificationStatus.VERIFIED,
        "verified_url": "https://careers.acme.test/jobs/1",
        "relevance_explanation": "Verified",
        "confidence": 0.9,
        "ats_info": None,
        "official_url": "https://careers.acme.test",
        "final_submitted_url": "https://careers.acme.test"
    }), patch(
        "app.services.inbox_processor.fetch_generic_fallback", return_value=[generic_job]
    ) as generic_fetch, patch("app.services.job_pipeline.process_and_store_job", return_value={
        "job_id": "job-1", "is_duplicate": False
    }) as process_job, patch("app.services.inbox_processor.supabase"):
        results = asyncio.run(process_inbox_source("source-1", "lead", SourceType.TEXT, "user-a"))

    generic_fetch.assert_called_once_with("https://careers.acme.test", "Acme", target_keywords=["Backend Engineer"])
    assert process_job.call_args.kwargs["user_id"] == "user-a"
    assert results[0]["job_id"] == "job-1"


def test_reject_action_updates_only_the_authenticated_users_opportunity():
    selected = Query([_opportunity()])
    updated = Query([{"id": "opp-1", "status": "ineligible"}])
    with patch("app.api.inbox.supabase", SupabaseSequence([selected, updated])):
        result = update_opportunity("opp-1", OpportunityActionRequest(action="reject"), "user-a")

    assert result["status"] == "ineligible"
    assert ("user_id", "user-a") in selected.filters
    assert ("user_id", "user-a") in updated.filters


def test_save_action_uses_v2_pipeline_and_owned_job_linkage():
    selected = Query([_opportunity()])
    source = Query([{"source_type": "text", "raw_content": "some text"}])
    owned_job = Query([{"id": "job-1"}])
    updated = Query([{"id": "opp-1", "job_id": "job-1", "status": "relevant"}])
    with patch("app.api.inbox.supabase", SupabaseSequence([selected, source, owned_job, updated])), patch(
        "app.api.inbox.process_and_store_job", return_value={"job_id": "job-1", "is_duplicate": False}
    ) as process_job:
        result = update_opportunity("opp-1", OpportunityActionRequest(action="save"), "user-a")

    assert result["job_id"] == "job-1"
    assert process_job.call_args.kwargs["user_id"] == "user-a"
    assert process_job.call_args.kwargs["skip_analysis"] is True
    assert ("user_id", "user-a") in source.filters
    assert ("user_id", "user-a") in owned_job.filters
    assert ("user_id", "user-a") in updated.filters


def test_cross_user_opportunity_access_is_rejected():
    with patch("app.api.inbox.supabase", SupabaseSequence([Query([])])):
        with pytest.raises(HTTPException, match="Opportunity not found") as error:
            update_opportunity("opp-1", OpportunityActionRequest(action="reject"), "user-a")
    assert error.value.status_code == 404


def test_cross_user_job_linkage_is_rejected():
    selected = Query([_opportunity(job_id="job-owned-by-another-user")])
    foreign_job = Query([])
    with patch("app.api.inbox.supabase", SupabaseSequence([selected, foreign_job])):
        with pytest.raises(HTTPException, match="outside this user account") as error:
            update_opportunity("opp-1", OpportunityActionRequest(action="save"), "user-a")
    assert error.value.status_code == 409


def test_duplicate_v2_job_is_linked_to_the_users_opportunity():
    selected = Query([_opportunity()])
    source = Query([{"source_type": "text", "raw_content": "some text"}])
    owned_job = Query([{"id": "existing-job"}])
    updated = Query([{"id": "opp-1", "job_id": "existing-job"}])
    with patch("app.api.inbox.supabase", SupabaseSequence([selected, source, owned_job, updated])), patch(
        "app.api.inbox.process_and_store_job", return_value={"job_id": "existing-job", "is_duplicate": True}
    ):
        result = update_opportunity("opp-1", OpportunityActionRequest(action="save"), "user-a")

    assert result["is_duplicate"] is True
    assert result["job_id"] == "existing-job"


def test_duplicate_opportunity_is_not_reinserted():
    with patch("app.services.inbox_processor.extract_opportunities_from_text", return_value=[{
        "company": "Acme", "role_title": "Backend Engineer", "submitted_url": None
    }]), patch("app.services.inbox_processor.resolve_lead", return_value={
        "status": InboxOpportunityStatus.UNVERIFIED,
        "verification_status": VerificationStatus.UNVERIFIED_THIRD_PARTY,
        "verified_url": None,
        "relevance_explanation": "No link",
        "confidence": 0.5,
        "ats_info": None,
        "official_url": None,
        "final_submitted_url": None
    }), patch(
        "app.services.inbox_processor.supabase"
    ) as database:
        database.table.return_value.insert.return_value.execute.side_effect = Exception("duplicate key")
        results = asyncio.run(process_inbox_source("source-1", "lead", SourceType.TEXT, "user-a"))

    assert results == []


COMMUNITY_18_LEADS_MESSAGE = """*📌18 Great Opportunities open for freshers & experienced candidates.*

*📌Don't have Resume try our Resume Builder -*
https://atsresumebuilder.in/

*📌 Don't forget to track your job application easily with our new Job Application Tracker - https://atsresumebuilder.in/public/job_tracker/tracker_dashboard*

🔗Company : Amber
Role : Intern - Data Analyst
Qualification : Degree in Business Analytics, Data Science, Economics, Engineering
Passing Year : 2027 | 2026
Location : Pune, India
Salary : 25,000/month (Stipend)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6562

🔗Company : HackerRank
Role : Software Development Engineer Intern
Qualification : Bachelor's degree
Passing Year : 2028 | 2027
Location : Bengaluru, India
Salary : 50,000 - 70,000/Month(Stipend) [Expected]
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6561

🔗Company : PwC
Role : Technology Consulting – Intern
Qualification : Bachelor's or Master's degree
Passing Year : 2027 | 2026
Location : Bengaluru, Hyderabad
Salary : 40,000-50,000/ Month (Stipend)[Expected]
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6560

🔗Company : Paytm
Role : Intern - Talent Acquisition
Qualification : Bachelor’s or Master’s degree (MBA/PGDM in Human Resources)
Passing Year : 2027 | 2026
Location : Gurgaon, Noida
Salary : 20,000/month [Stipend] (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6559

🔗Company : Nasdaq
Role : Campus Program 2027
Qualification : BE/B-Tech/ME/M-Tech/BCA/BSc
Passing Year : 2028 | 2027 | 2026 | 2025
Location : Pan India
Salary : 35,000 - 50,000/ Month (Stipend) [Expected]
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6558

🔗Company : Scopely
Role : Intern - QA Engineer
Qualification : BE/B-Tech/ME/M-Tech
Passing Year : 2027 | 2026
Location : Bengaluru, India
Salary : 6 – 9 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6557

🔗Company : Sigmoid
Role : Resource Management Analyst Intern
Qualification : Bachelor's degree in Human Resources, Business Administration
Passing Year : 2027 | 2026 | 2025
Location : Bengaluru, India
Salary : 20,000 - 25,000/month [Stipend]
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6556

🔗Company : Medpace
Role : Junior Data Engineer
Qualification : Bachelor's Degree in Computer Science, Data Science
Passing Year : 2027 | 2026 | 2025 | 2024
Location : Navi Mumbai
Salary : 5 – 10 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6555

🔗Company : Spektra Systems
Role : AI-Native Software Engineer – Trainee
Qualification : Any body with skills
Passing Year : Freshers/Experienced
Location : Work-from-home/Remote
Salary : 5 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6554

🔗Company : EY
Role : Deployment Specialist-Intern
Qualification : Any Graduate
Passing Year : 2027 | 2026
Location : Bengaluru, India
Salary : 30,000/ Month [Stipend] (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6553

🔗Company : ShareChat
Role : Marketing Intern
Qualification : Any body with skills
Passing Year : 2027 | 2026 | 2025
Location : Bengaluru, India
Salary : 30,000/ Month [Stipend] (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6552

🔗Company : Volvo Group
Role : Graduate Apprentice Trainee - Recruiter
Qualification : Any Graduate
Passing Year : 2026 | 2025
Location : Bengaluru, India
Salary : 25,000/month (Stipend) [Expected]
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6551

🔗Company : Virtusa
Role : Software Testing Engineer
Qualification : Bachelor's degree in Computer Science, Information Technology
Passing Year : 2027 | 2026 | 2025 | 2024
Location : Hyderabad, India
Salary : 5-7 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6550

🔗Company : EY
Role : Associate Analyst
Qualification : Any Graduate
Passing Year : Freshers/Experienced
Location : India - Local Office
Salary : 4 - 5 LPA(Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6549

🔗Company : HSBC
Role : Analyst
Qualification : Graduate in Commerce, Finance or Equivalent
Passing Year : 2026 | 2025
Location : Bengaluru, India
Salary : 8 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6548

🔗Company : Cisco
Role : Software Engineer Trainee_Technical Graduate Apprentice
Qualification : Bachelor's degree
Passing Year : 2026 | 2025
Location : Bengaluru, India
Salary : 4 - 6 LPA(Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6547

🔗Company : Cognizant (Mass-Hiring Update)
Role : Digital Workplace Practice (Service Desk)
Qualification : BCA, BSc, BA, BBA, B.Voc, BMS, BCom, etc
Passing Year : 2026 | 2025 | 2024
Location : Pan India
Salary : 3 - 4 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6546

🔗Company : Primetrace Technologies
Role : Android - SDE 1
Qualification : Any body with skills
Passing Year : Experience(1-3 yrs)
Location : Bengaluru, India
Salary : 12 - 20 LPA (Expected)
📌Link : https://thejobcompany.co.in/frontend/job_details?job_id=6545"""


def test_structured_broadcast_extracts_all_18_leads_and_ignores_promo_headers():
    from app.services.inbox_extractor import extract_opportunities_from_text
    from app.services.lead_resolver import lead_gate

    leads = extract_opportunities_from_text(COMMUNITY_18_LEADS_MESSAGE)
    assert len(leads) == 18

    companies = [l["company"] for l in leads]
    assert companies[0] == "Amber"
    assert companies[2] == "PwC"
    assert companies[15] == "Cisco"
    assert companies[16] == "Cognizant"  # "(Mass-Hiring Update)" stripped
    assert companies[17] == "Primetrace Technologies"

    # Promo links like atsresumebuilder.in must never be extracted
    for l in leads:
        assert "atsresumebuilder.in" not in (l.get("submitted_url") or "")
        assert "atsresumebuilder.in" not in (l.get("source_text") or "")
        ok, reason = lead_gate(l["company"], l["role_title"], l["location"], l["source_text"])
        assert ok is True, f"Lead {l['company']} - {l['role_title']} failed lead_gate: {reason}"


def test_community_wrapper_unwrapping_and_resolution_for_18_leads():
    from app.services.inbox_extractor import extract_opportunities_from_text
    from app.services.lead_resolver import resolve_lead

    unwrapped_map = {
        "6562": "https://amberstudent.keka.com/careers/jobdetails/146146",
        "6561": "https://hackerrank.com/careers/job?id=8229735",
        "6560": "https://jobs-ta.pwc.com/global/en/job/758969WD/Technology-Consulting-Intern-2027",
        "6559": "https://jobs.lever.co/paytm/426a6834-1397-4e65-94af-69874c790805",
        "6558": "https://gem.com/form?formID=522541ff-73ff-4d77-b51a-2664a79f8c34",
        "6557": "https://job-boards.greenhouse.io/scopely/jobs/5448999008?gh_jid=5448999008",
        "6556": "https://job-boards.greenhouse.io/sigmoid/jobs/8921297002?gh_src=1ozsd7zx2us",
        "6555": "https://careers.medpace.com/jobs/11932",
        "6554": "https://careers.spektrasystems.com/jobs/careers/627374000027511357/AI-Native-Web-Developer---Trainee?",
        "6553": "https://eyglobal.yello.co/jobs/5hVK1BeChlbcjalJ1R_3iw?job_board_id=c1riT--B2O-KySgYWsZO1Q",
        "6552": "https://sharechat.mynexthire.com/employer/jobs?src=careers",
        "6551": "https://jobs.volvogroup.com/job/Bangalore-Graduate-Apprentice-Trainee-Recruiter-562122/1374672255/",
        "6550": "https://virtusa.com/careers/job-search/global/en/job/CREQ261742/Associate",
        "6549": "https://eyglobal.yello.co/jobs/yZimmWg4kDLz6r3kMgWfWw?job_board_id=c1riT--B2O-KySgYWsZO1Q",
        "6548": "https://portal.careers.hsbc.com/careers/job/563774612468498",
        "6547": "https://careers.cisco.com/global/en/job/CISCISGLOBAL2014481EXTERNALENGLOBAL/Software-Engineer-Trainee",
        "6546": "https://app.joinsuperset.com/join/#/signup/student/jobprofiles/a8af19f3-444e-43bd-8828-e8656f637a17",
        "6545": "https://primetrace.keka.com/careers/jobdetails/54884",
    }

    def fake_resolve_redirects(url):
        jid = url.split("job_id=")[-1]
        return {
            "final_url": unwrapped_map[jid],
            "is_promo": False,
            "extracted_jd": f"Job Description for job {jid} with SQL, Python, Cloud engineering.",
        }

    leads = extract_opportunities_from_text(COMMUNITY_18_LEADS_MESSAGE)
    with patch("app.services.link_checker.resolve_redirects_and_detect_promo", side_effect=fake_resolve_redirects), \
         patch("app.api.research.requests.get") as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.text = "<html></html>"
        for l in leads:
            res = resolve_lead(l["company"], l["role_title"], l["location"], l["submitted_url"], l["source_text"])
            assert res["status"] == InboxOpportunityStatus.VERIFIED, f"Expected VERIFIED for {l['company']}, got {res}"
            assert res["verification_status"] == VerificationStatus.VERIFIED
            assert "thejobcompany.co.in" not in res["verified_url"]
            assert res["extracted_jd"] is not None


def test_copilot_fit_triage_separates_high_fit_stretch_and_off_target_in_18_leads():
    from app.services.inbox_extractor import extract_opportunities_from_text
    from app.services.lead_resolver import evaluate_lead_copilot_fit

    leads = extract_opportunities_from_text(COMMUNITY_18_LEADS_MESSAGE)
    assert len(leads) == 18

    high_fit = []
    stretch = []
    off_target = []

    for l in leads:
        c = evaluate_lead_copilot_fit(
            company=l["company"],
            role_title=l["role_title"],
            qualification=l.get("qualification") or "",
            source_text=l.get("source_text") or "",
        )
        if c["copilot_fit"] == "high_fit":
            high_fit.append(l["company"])
        elif c["copilot_fit"] == "stretch":
            stretch.append(l["company"])
        else:
            off_target.append(l["company"])

    # 9 technical / consulting roles should be high_fit
    assert len(high_fit) == 9
    assert "Amber" in high_fit
    assert "HackerRank" in high_fit
    assert "PwC" in high_fit
    assert "Scopely" in high_fit
    assert "Medpace" in high_fit
    assert "Spektra Systems" in high_fit
    assert "Virtusa" in high_fit
    assert "Cisco" in high_fit
    assert "Primetrace Technologies" in high_fit

    # 6 HR / Marketing / Commerce / Service Desk roles should be off_target
    assert len(off_target) == 6
    assert "Paytm" in off_target
    assert "Sigmoid" in off_target
    assert "ShareChat" in off_target
    assert "Volvo Group" in off_target
    assert "HSBC" in off_target
    assert "Cognizant" in off_target

    # 3 general campus / analyst roles should be stretch
    assert len(stretch) == 3
    assert "Nasdaq" in stretch
    assert stretch.count("EY") == 2


