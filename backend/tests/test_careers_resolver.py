"""
Regression tests: company / role search must never mislead the user to promotional,
aggregator, or invented websites. All network access is mocked.
"""
from unittest.mock import patch

import pytest

from app.services import careers_resolver as cr


# --- 1. Static classification -------------------------------------------------

@pytest.mark.parametrize("url,company", [
    ("https://steamcommunity.com/careers", "Invisalign"),          # reproduced bug
    ("https://www.indeed.com/cmp/Zepto/jobs", "Zepto"),
    ("https://www.naukri.com/zepto-jobs-careers-2288", "Zepto"),
    ("https://www.linkedin.com/company/zepto/jobs", "Zepto"),
    ("https://www.glassdoor.co.in/Jobs/Zepto-Jobs", "Zepto"),
    ("https://www.ambitionbox.com/overview/zepto-overview", "Zepto"),
    ("https://random-seo-site.com/careers", "Zepto"),
    ("https://zepto.com/blog/careers-in-quick-commerce", "Zepto"),   # editorial path
    ("https://zepto.com/pricing", "Zepto"),                          # commercial path
    ("https://zepto.com/brochure.pdf", "Zepto"),
    ("ftp://zepto.com/careers", "Zepto"),
])
def test_rejects_promotional_aggregator_and_foreign_domains(url, company):
    ok, _ = cr.classify_careers_url(url, company)
    assert ok is False


@pytest.mark.parametrize("url,company,kind", [
    ("https://careers.google.com/jobs/results/", "Google", "official"),
    ("https://razorpay.com/careers/", "Razorpay Software Pvt Ltd", "official"),
    ("https://www.zeptonow.com/careers", "Zepto", "official"),
    ("https://jobs.lever.co/razorpay", "Razorpay", "ats"),
    ("https://boards.greenhouse.io/notion", "Notion", "ats"),
    ("https://gehc.wd5.myworkdayjobs.com/wday/cxs/gehc/GEHC_ExternalSite/jobs", "GE HealthCare", "ats"),
    ("https://www.tcs.com/careers", "Tata Consultancy Services (TCS)", "official"),
])
def test_accepts_official_and_ats(url, company, kind):
    ok, k = cr.classify_careers_url(url, company)
    assert ok is True and k == kind


def test_trusted_registry_host_is_scoped_to_its_own_company():
    cr.trust_urls({"barclays": "https://search.jobs.barclays/"})
    assert cr.classify_careers_url("https://search.jobs.barclays/", "Barclays")[0] is True
    assert cr.classify_careers_url("https://search.jobs.barclays/", "Zepto")[0] is False


# --- 2. Strict registry matching ----------------------------------------------

KEYS = ["visa", "stripe", "google", "amazon", "hcltech", "tcs", "eternal", "goldmansachs"]


@pytest.mark.parametrize("name,expected", [
    ("Google", "google"),
    ("Google India", "google"),
    ("Amazon.com", "amazon"),
    ("Amazon Web Services", "amazon"),
    ("HCL Technologies", "hcltech"),
    ("Goldman Sachs", "goldmansachs"),
    ("Tata Consultancy Services (TCS)", "tcs"),
    ("Zomato", "eternal"),
    ("Visa Inc", "visa"),
    ("Invisalign", None),        # contains 'visa' - must NOT match
    ("Stripes Foods", None),     # starts with 'stripe' - must NOT match
    ("Go", None),                # substring of 'google'
    ("", None),
])
def test_registry_matching_is_strict(name, expected):
    assert cr.match_registry_key(name, KEYS) == expected


# --- 3. Discovery never returns unverified / fake links -----------------------

def test_aggregator_only_results_yield_no_url():
    results = [
        {"title": "Zepto Jobs", "href": "https://www.indeed.com/cmp/Zepto/jobs", "body": "x"},
        {"title": "Zepto careers", "href": "https://www.naukri.com/zepto-jobs-careers", "body": "x"},
        {"title": "Zepto", "href": "https://steamcommunity.com/careers", "body": "x"},
    ]
    with patch.object(cr, "verify_url_live", return_value=None):
        assert cr.find_official_careers_url("Zepto", search_fn=lambda q, max_results=8: results) is None


def test_hallucinated_official_looking_url_is_dropped_when_unreachable():
    results = [{"title": "Aggroso Careers", "href": "https://aggroso.com/careers", "body": "x"}]
    with patch.object(cr, "verify_url_live", return_value=None):  # page doesn't exist
        assert cr.find_official_careers_url("Aggroso", search_fn=lambda q, max_results=8: results) is None


def test_official_url_is_returned_only_after_live_verification():
    results = [
        {"title": "Zepto", "href": "https://www.indeed.com/cmp/Zepto", "body": "x"},
        {"title": "Zepto Careers", "href": "https://www.zeptonow.com/careers", "body": "x"},
    ]
    with patch.object(cr, "verify_url_live", side_effect=lambda u, c, **kw: u) as live:
        got = cr.find_official_careers_url("Zepto", search_fn=lambda q, max_results=8: results)
    assert got == "https://www.zeptonow.com/careers"
    assert live.called


def test_ats_result_for_another_company_is_not_attributed():
    results = [{"title": "Acme Corp jobs", "href": "https://boards.greenhouse.io/acme", "body": "Acme hiring"}]
    with patch.object(cr, "verify_url_live", return_value=None):
        assert cr.find_official_careers_url("Zepto", search_fn=lambda q, max_results=8: results) is None


def test_ats_token_guard_against_llm_picking_other_company():
    assert cr.token_matches_company("razorpay", "Razorpay Software Pvt Ltd") is True
    assert cr.token_matches_company("stripe", "Zepto") is False


def test_verify_ats_token_definitive_404_is_rejected():
    class R:
        status_code = 404
    with patch.object(cr.requests, "get", return_value=R()):
        assert cr.verify_ats_token("greenhouse", "doesnotexist") is False


def test_verify_ats_token_network_error_is_not_fatal():
    with patch.object(cr.requests, "get", side_effect=Exception("boom")):
        assert cr.verify_ats_token("lever", "whatever") is True


# --- 4. API-level behaviour ---------------------------------------------------

def test_discover_returns_no_url_for_aggregator_only_search():
    from app.api import research
    results = [{"title": "x", "href": "https://www.naukri.com/zepto-jobs", "body": "x"}]
    with patch.object(research, "perform_resilient_search", return_value=results), \
         patch.object(cr, "verify_url_live", return_value=None), \
         patch.object(research, "detect_ats_with_llm", return_value=None):
        res = research.discover_careers_url_and_ats("Zepto Quick Commerce Labs")
    assert res.careers_url is None
    assert res.ats_info is None


def test_supplied_promo_url_is_not_surfaced_or_verified():
    from app.api import research
    with patch.object(research, "detect_ats_with_llm") as llm:
        res = research.discover_careers_url_and_ats("Acme", "https://acme-offers.example.com/win-a-job")
    assert res.careers_url is None and res.ats_info is None
    llm.assert_not_called()  # an LLM guess must never 'verify' a third-party link


def test_deep_dive_never_fabricates_a_website():
    from app.api import research
    req = research.ResearchRequest(company_name="Zepto Technologies Pvt Ltd")
    with patch.object(research, "_discover_company_jobs_and_ats", return_value=([], None, None)), \
         patch.object(research, "research_company", return_value={"work_culture": "x"}):
        out = research.deep_dive_company(req, user_id="u1")
    assert out["careers_url"] is None            # previously 'https://www.zeptotechnologiespvtltd.com'
    assert out["careers_url_verified"] is False


def test_deep_dive_drops_non_official_url_returned_by_worker():
    from app.api import research
    req = research.ResearchRequest(company_name="Invisalign")
    with patch.object(research, "_discover_company_jobs_and_ats",
                      return_value=([], "https://steamcommunity.com/careers", None)), \
         patch.object(research, "research_company", return_value={"work_culture": "x"}):
        out = research.deep_dive_company(req, user_id="u1")
    assert out["careers_url"] is None


def test_deep_dive_keeps_partial_verified_result_on_timeout():
    from app.api import research
    import time

    def slow_worker(name, kw, progress=None):
        progress["careers_url"] = "https://razorpay.com/careers/"
        progress["ats_info"] = None
        time.sleep(0.5)
        return [], "https://razorpay.com/careers/", None

    req = research.ResearchRequest(company_name="Razorpay")
    with patch.object(research, "_discover_company_jobs_and_ats", side_effect=slow_worker), \
         patch.object(research, "research_company", return_value={"work_culture": "x"}), \
         patch("concurrent.futures.Future.result", autospec=True) as fut_result:
        # First .result() (jobs) times out; second (company info) returns normally
        fut_result.side_effect = [TimeoutError("timeout"), {"work_culture": "x"}]
        out = research.deep_dive_company(req, user_id="u1")
    assert out["careers_url"] == "https://razorpay.com/careers/"


def test_chat_search_filters_promotional_hosts():
    results = [
        {"title": "a", "href": "https://steamcommunity.com/careers", "body": ""},
        {"title": "b", "href": "https://www.glassdoor.com/Jobs/x", "body": ""},
        {"title": "c", "href": "https://boards.greenhouse.io/acme/jobs/123", "body": ""},
        {"title": "d", "href": "https://www.linkedin.com/jobs/view/3912345678", "body": ""},
    ]
    kept = [r["title"] for r in cr.filter_search_results(results)]
    assert kept == ["c", "d"]
