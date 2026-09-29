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
