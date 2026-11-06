import pytest
from app.services.company_cooldown_policy import (
    get_company_cooldown_policy,
    check_user_cooldown_status,
    COMPANY_COOLDOWN_REGISTRY,
)
from app.services.direct_apply_resolver import (
    is_generic_careers_url,
    build_targeted_portal_search_url,
    generate_careers_portal_filters,
    _extract_direct_links_from_html,
)

def test_cooldown_policy_lookup():
    google = get_company_cooldown_policy("Google")
    assert google is not None
    assert google["cooldown_days"] == 90
    assert google["max_simultaneous_apps"] == 3

    meta = get_company_cooldown_policy("Meta Platforms")
    assert meta is not None
    assert meta["cooldown_days"] == 180

    gs = get_company_cooldown_policy("Goldman Sachs & Co")
    assert gs is not None
    assert gs["cooldown_days"] == 180

    mckinsey = get_company_cooldown_policy("McKinsey")
    assert mckinsey is not None
    assert mckinsey["cooldown_days"] == 365

    unknown = get_company_cooldown_policy("RandomUnknownCompany12345")
    assert unknown is None

def test_direct_apply_url_classification():
    # Generic URLs
    assert is_generic_careers_url("https://www.google.com/about/careers/") is True
    assert is_generic_careers_url("https://greyb.com/careers/") is True
    assert is_generic_careers_url("https://salescode.ai/careers") is True
    assert is_generic_careers_url("https://zs.com/careers/india") is True

    # Direct ATS URLs
    assert is_generic_careers_url("https://jobs.lever.co/company/a1b2c3d4") is False
    assert is_generic_careers_url("https://boards.greenhouse.io/stripe/jobs/123456") is False
    assert is_generic_careers_url("https://jobs.ashbyhq.com/posthog/1234") is False
    assert is_generic_careers_url("https://greyb.keka.com/careers/jobdetails/15484") is False

def test_targeted_portal_search_and_filters():
    base = "https://greyb.com/careers/"
    search_url = build_targeted_portal_search_url(base, "Patent Research Analyst")
    assert "greyb.com" in search_url
    assert "Patent+Research+Analyst" in search_url

    filters = generate_careers_portal_filters(base, "Patent Research Analyst")
    assert "exact_role" in filters
    assert "fresher_intern" in filters
    assert "mid_level" in filters
    assert "senior_lead" in filters
    assert "remote" in filters


def test_vital_job_factors_enrichment():
    from app.services.direct_apply_resolver import (
        extract_work_mode,
        format_job_compensation,
        compute_job_release_recency,
        enrich_job_vital_factors,
    )

    # Work Mode extraction
    assert extract_work_mode("remote") == "remote"
    assert extract_work_mode(None, "Gurgaon (Work from Office) / Hybrid") == "hybrid"
    assert extract_work_mode(None, "Bengaluru, India") == "onsite"
    assert extract_work_mode(None, "Mohali / Chandigarh / Remote") == "remote"

    # Compensation formatting with ₹600k lower threshold baseline
    c1 = format_job_compensation(pay_min=1500000, pay_max=2200000)
    assert c1["display"] == "₹15L–₹22L"
    assert c1["status"] == "above_floor"

    c2 = format_job_compensation(pay_min=600000, pay_max=800000)
    assert c2["display"] == "₹6L–₹8L"
    assert c2["status"] == "meets_floor"

    c3 = format_job_compensation(pay_min=400000, pay_max=500000)
    assert c3["status"] == "below_floor"

    c_unspecified = format_job_compensation(None, None, is_intern=False)
    assert "6.0L+" in c_unspecified["display"]

    c_intern = format_job_compensation(None, None, is_intern=True)
    assert "Stipend" in c_intern["display"]

    # Release recency
    r1 = compute_job_release_recency(posting_date="2026-11-03")
    assert "Released" in r1["label"]
    assert r1["apply_factor"] is not None

    # Full dictionary enrichment
    job = {
        "role_title": "Software Engineer Intern",
        "company": "HackerRank",
        "location": "Bengaluru",
        "pay_min": None,
        "pay_max": None,
        "posting_date": "2026-11-02",
    }
    enriched = enrich_job_vital_factors(job)
    assert "work_mode" in enriched
    assert "compensation_info" in enriched
    assert "release_info" in enriched


def test_html_direct_link_extraction():
    sample_html = """
    <html>
      <body>
        <div class="job-card">
          <h3>Lead AI Engineer</h3>
          <a href="https://jobs.lever.co/company/998877">Apply on Lever</a>
        </div>
      </body>
    </html>
    """
    found = _extract_direct_links_from_html(sample_html, "https://company.com/careers", target_role="Lead AI Engineer")
    assert found == "https://jobs.lever.co/company/998877"
