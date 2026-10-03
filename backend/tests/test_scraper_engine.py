import pytest
from unittest.mock import patch, MagicMock
from app.services.scraper_engine import (
    clean_html_to_markdown,
    scrape_job_posting_url,
    scrape_popular_portal_jobs,
    ScrapedJobResult
)

def test_clean_html_to_markdown():
    html = """
    <html>
      <head><title>Test Job</title></head>
      <body>
        <nav><a href="/home">Home</a></nav>
        <h1>Senior Backend Engineer</h1>
        <p>We are looking for a Python expert to join our platform team.</p>
        <h2>Requirements</h2>
        <ul>
          <li>3+ years Python & FastAPI</li>
          <li>PostgreSQL experience</li>
        </ul>
        <a href="https://example.com/apply">Apply Now</a>
        <footer>Copyright 2026</footer>
      </body>
    </html>
    """
    md = clean_html_to_markdown(html, "https://example.com/jobs/1")
    assert "# Senior Backend Engineer" in md
    assert "We are looking for a Python expert" in md
    assert "## Requirements" in md
    assert "- 3+ years Python & FastAPI" in md
    assert "https://example.com/apply" in md
    assert "Home" not in md  # nav was removed
    assert "Copyright" not in md  # footer was removed


def test_promo_funnel_detection():
    res = scrape_job_posting_url("https://linktr.ee/cooltechcareer")
    assert res.is_promo is True
    assert "Promotional" in res.raw_jd
    assert res.promo_name == "Linktree Landing Page"


def test_greenhouse_api_adapter():
    mock_gh_data = {
        "title": "Senior Data Engineer",
        "absolute_url": "https://boards.greenhouse.io/acme/jobs/12345",
        "location": {"name": "Bengaluru, India"},
        "content": "<p>Build scalable data pipelines using Spark and Delta Lake.</p>"
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.url = "https://boards.greenhouse.io/acme/jobs/12345"
    mock_resp.json.return_value = mock_gh_data

    with patch("requests.get", return_value=mock_resp):
        res = scrape_job_posting_url("https://boards.greenhouse.io/acme/jobs/12345")
        assert res.role_title == "Senior Data Engineer"
        assert res.company_name == "Acme"
        assert "Bengaluru, India" in res.location
        assert "Spark and Delta Lake" in res.raw_jd
        assert res.source_type == "greenhouse_api"


def test_lever_api_adapter():
    mock_lever_data = {
        "text": "Full Stack Engineer",
        "hostedUrl": "https://jobs.lever.co/stripe/abc-123",
        "categories": {"location": "Remote", "commitment": "Full-time"},
        "description": "<p>Design resilient payment interfaces.</p>",
        "lists": [{"text": "Qualifications", "content": "<li>5+ years React and Node.js</li>"}]
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.url = "https://jobs.lever.co/stripe/abc-123"
    mock_resp.json.return_value = mock_lever_data

    with patch("requests.get", return_value=mock_resp):
        res = scrape_job_posting_url("https://jobs.lever.co/stripe/abc-123")
        assert res.role_title == "Full Stack Engineer"
        assert res.company_name == "Stripe"
        assert res.location == "Remote"
        assert "React and Node.js" in res.raw_jd
        assert res.source_type == "lever_api"


def test_json_ld_schema_extractor():
    mock_html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org/",
          "@type": "JobPosting",
          "title": "AI Research Scientist",
          "hiringOrganization": {
            "@type": "Organization",
            "name": "DeepMind"
          },
          "jobLocation": {
            "@type": "Place",
            "address": {
              "@type": "PostalAddress",
              "addressLocality": "London, UK"
            }
          },
          "description": "<p>Conduct fundamental research in reinforcement learning and neural models.</p>"
        }
        </script>
      </head>
      <body>
        <h1>AI Research Scientist</h1>
        <p>Conduct fundamental research in reinforcement learning and neural models.</p>
      </body>
    </html>
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.url = "https://deepmind.google/careers/ai-researcher"
    mock_resp.content = mock_html.encode("utf-8")
    mock_resp.text = mock_html
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    with patch("requests.get", return_value=mock_resp):
        res = scrape_job_posting_url("https://deepmind.google/careers/ai-researcher")
        assert res.role_title == "AI Research Scientist"
        assert res.company_name == "DeepMind"
        assert "London, UK" in res.location
        assert "reinforcement learning" in res.raw_jd


def test_playwright_fallback_when_js_blocked():
    blocked_html = "<html><body>Please enable JavaScript to view this application.</body></html>"
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.url = "https://techcorp.com/careers/cloud-arch"
    mock_resp.content = blocked_html.encode("utf-8")
    mock_resp.text = blocked_html
    mock_resp.__enter__.return_value = mock_resp
    mock_resp.__exit__.return_value = None

    dynamic_mock_result = ScrapedJobResult(
        raw_jd="Rendered React Job Posting: Cloud Architect at TechCorp",
        resolved_url="https://techcorp.com/careers/cloud-arch",
        role_title="Cloud Architect",
        company_name="TechCorp",
        source_type="playwright_dynamic"
    )

    with patch("requests.get", return_value=mock_resp):
        with patch("app.services.scraper_engine._scrape_with_playwright_browser", return_value=dynamic_mock_result) as mock_pw:
            res = scrape_job_posting_url("https://techcorp.com/careers/cloud-arch")
            assert mock_pw.called
            assert res.source_type == "playwright_dynamic"
            assert "Cloud Architect" in res.raw_jd


def test_popular_portal_jobs_himalayas():
    mock_himalayas_api = {
        "jobs": [
            {
                "title": "DevOps Engineer",
                "companyName": "GitLab",
                "companySlug": "gitlab",
                "slug": "devops-engineer",
                "applicationLink": "https://gitlab.com/jobs/devops",
                "description": "<p>Manage Kubernetes clusters.</p>",
                "locationRestrictions": ["Global Remote"]
            }
        ]
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_himalayas_api

    with patch("requests.get", return_value=mock_resp):
        jobs = scrape_popular_portal_jobs("himalayas", limit=5)
        assert len(jobs) == 1
        assert jobs[0]["role_title"] == "DevOps Engineer"
        assert jobs[0]["company"] == "GitLab"
        assert jobs[0]["location"] == "Global Remote"
        assert jobs[0]["source"] == "himalayas"
