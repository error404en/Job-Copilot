import pytest
from app.api.research import discover_careers_url_and_ats, deep_dive_company, ResearchRequest, KNOWN_COMPANY_ATS
from app.services.company_researcher import research_company
from app.models.discovery import ATSSystem

def test_known_company_ats_registry():
    """Verify that Stripe, Eternal, Qualcomm, and Goldman Sachs are in the known ATS registry."""
    stripe_disc = discover_careers_url_and_ats("stripe")
    assert stripe_disc.careers_url == "https://stripe.com/jobs"
    assert stripe_disc.ats_info is not None
    assert stripe_disc.ats_info.system == ATSSystem.GREENHOUSE
    assert stripe_disc.ats_info.token == "stripe"

    eternal_disc = discover_careers_url_and_ats("eternal")
    assert eternal_disc.careers_url == "https://www.zomato.com/careers"
    assert eternal_disc.ats_info is not None
    assert eternal_disc.ats_info.system == ATSSystem.SMARTRECRUITERS
    assert eternal_disc.ats_info.token == "Zomato1"

    qualcomm_disc = discover_careers_url_and_ats("qualcomm")
    assert qualcomm_disc.careers_url == "https://careers.qualcomm.com/careers"

    gs_disc = discover_careers_url_and_ats("goldman sachs")
    assert gs_disc.careers_url == "https://higher.gs.com/results?JOB_FUNCTION=Software%20Engineering"

def test_company_research_verified_benchmarks():
    """Verify instant verified benchmarks for Qualcomm, Stripe, Eternal, Goldman Sachs."""
    for comp in ["qualcomm", "stripe", "eternal", "goldmansachs"]:
        info = research_company(comp)
        assert "work_culture" in info
        assert "compensation_estimates" in info
        assert "compensation_levels" in info
        assert len(info["compensation_levels"]) > 0

def test_deep_dive_instant_curated_roles():
    """Verify deep dive returns valid roles and careers URLs without timing out."""
    for comp in ["qualcomm", "stripe", "eternal", "goldmansachs"]:
        req = ResearchRequest(company_name=comp)
        res = deep_dive_company(req, user_id="test_user")
        assert len(res["jobs"]) > 0
        assert res["careers_url"] is not None
        assert res["company_info"] is not None
        for j in res["jobs"]:
            assert "role_title" in j
            assert "url" in j

def test_startup_research_resilience():
    """Verify that unknown/small startups gracefully return complete intelligence without crashing."""
    startup_info = research_company("nonexistent_tiny_stealth_startup_123")
    assert "work_culture" in startup_info
    assert "work_life_balance" in startup_info
    assert "perks" in startup_info
    assert "compensation_estimates" in startup_info
    assert "bonds_or_contracts" in startup_info
    assert startup_info["overall_sentiment"] is not None

def test_extract_direct_html_jobs_and_filtering():
    """Verify that direct DOM extraction parses all published roles (tech, intern, business) without artificial drops."""
    from app.services.job_fetcher import extract_direct_html_jobs, fetch_generic_fallback
    from unittest.mock import patch, MagicMock

    mock_html = """
    <html>
      <body>
        <a class="vacancy-card" href="/careers/full-stack-developer">
          <h3>Full Stack Developer</h3>
          <span>Remote-first</span><span>Full-time</span>
        </a>
        <a class="vacancy-card" href="/careers/full-stack-intern">
          <h3>Full Stack Intern</h3>
          <span>Remote-first</span><span>Internship</span>
        </a>
        <a class="vacancy-card" href="/careers/business-development-executive">
          <h3>Business Development Executive</h3>
          <span>Remote-first</span><span>Full-time</span>
        </a>
        <a class="vacancy-card" href="/careers/business-development-intern">
          <h3>Business Development Intern</h3>
          <span>Remote-first</span><span>Internship</span>
        </a>
      </body>
    </html>
    """
    jobs = extract_direct_html_jobs(mock_html, "https://aggroso.com/careers")
    assert len(jobs) == 4
    titles = [j["role_title"] for j in jobs]
    assert "Full Stack Developer" in titles
    assert "Full Stack Intern" in titles
    assert "Business Development Executive" in titles
    assert "Business Development Intern" in titles
    assert all(j["url"].startswith("https://aggroso.com/careers/") for j in jobs)

    # Test fetch_generic_fallback with mock HTTP response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = mock_html
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("requests.get", return_value=mock_resp):
        # 1. No target_keywords -> returns all 4 roles
        all_jobs = fetch_generic_fallback("https://aggroso.com/careers", "aggroso", target_keywords=None)
        assert len(all_jobs) == 4
        all_titles = [j["role_title"] for j in all_jobs]
        assert "Business Development Executive" in all_titles
        assert "Full Stack Intern" in all_titles

        # 2. Explicit keywords -> correctly filters
        intern_jobs = fetch_generic_fallback("https://aggroso.com/careers", "aggroso", target_keywords=["intern"])
        assert len(intern_jobs) == 2
        intern_titles = [j["role_title"] for j in intern_jobs]
        assert "Full Stack Intern" in intern_titles
        assert "Business Development Intern" in intern_titles


