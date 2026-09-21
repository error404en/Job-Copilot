import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.api.inbox import OpportunityActionRequest, update_opportunity
from app.api.research import discover_careers_url_and_ats
from app.models.discovery import ATSInfo, ATSSystem, CareersDiscoveryResult
from app.models.inbox import SourceType
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
    source = Path("frontend/app/inbox/page.tsx").read_text(encoding="utf-8")
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
        "raw_jd": "Backend Engineer\nPython",
        "source_type": "generic_playwright",
        "url": "https://careers.acme.test/jobs/1",
        "official_apply_url": "https://careers.acme.test/jobs/1",
    }
    with patch("app.services.inbox_processor.extract_opportunities_from_text", return_value=[{
        "company": "Acme", "role_title": "Backend Engineer", "submitted_url": "https://careers.acme.test"
    }]), patch("app.services.inbox_processor.resolve_redirects_and_detect_promo", return_value={
        "final_url": "https://careers.acme.test", "is_promo": False
    }), patch("app.services.inbox_processor.discover_careers_url_and_ats", return_value=discovery), patch(
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
    }]), patch("app.services.inbox_processor.discover_careers_url_and_ats", return_value=CareersDiscoveryResult()), patch(
        "app.services.inbox_processor.supabase"
    ) as database:
        database.table.return_value.insert.return_value.execute.side_effect = Exception("duplicate key")
        results = asyncio.run(process_inbox_source("source-1", "lead", SourceType.TEXT, "user-a"))

    assert results == []
