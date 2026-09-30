import os
from unittest.mock import patch, MagicMock
from app.services.playwright_scraper import _scrape_fast_http, scrape_dynamic_page
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_scrape_fast_http_success():
    """Verify that _scrape_fast_http extracts clean text and JSON-LD schema without Playwright."""
    html_content = """
    <html>
        <head>
            <title>Senior Software Engineer - Stripe</title>
            <script type="application/ld+json">
                {"@type": "JobPosting", "title": "Senior Software Engineer", "description": "Backend API development"}
            </script>
        </head>
        <body>
            <nav><a href="/home">Home</a></nav>
            <h1>Senior Software Engineer</h1>
            <p>We are looking for a backend engineer with Python and distributed systems experience to join our team.</p>
            <p>Key responsibilities include building high-throughput services, working with PostgreSQL and Redis, and deploying to cloud infrastructure.</p>
            <p>Qualifications include 3+ years experience in Python, microservices architecture, and API design.</p>
            <footer>Copyright 2026</footer>
        </body>
    </html>
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = html_content.encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("requests.get", return_value=mock_resp):
        text = _scrape_fast_http("https://example.com/job/123")
        assert "Senior Software Engineer" in text
        assert "Python" in text
        assert "[Structured Job Schema]" in text
        assert "Home" not in text  # nav was stripped
        assert "Copyright" not in text  # footer was stripped

def test_scrape_dynamic_page_prefers_fast_http():
    """Verify scrape_dynamic_page uses fast HTTP and does not invoke sync_playwright when text is sufficient."""
    sample_text = "Software Engineer Job Opening. " * 20  # > 250 characters
    with patch("app.services.playwright_scraper._scrape_fast_http", return_value=sample_text):
        with patch("playwright.sync_api.sync_playwright") as mock_pw:
            result = scrape_dynamic_page("https://example.com/careers")
            assert result == sample_text
            # Playwright must NOT have been called!
            mock_pw.assert_not_called()

def test_scrape_dynamic_page_respects_disable_env():
    """Verify scrape_dynamic_page honors ENABLE_PLAYWRIGHT=false when fast text is sparse."""
    with patch.dict(os.environ, {"ENABLE_PLAYWRIGHT": "false"}):
        with patch("app.services.playwright_scraper._scrape_fast_http", return_value="Short"):
            with patch("playwright.sync_api.sync_playwright") as mock_pw:
                result = scrape_dynamic_page("https://example.com/sparse")
                assert result == "Short"
                mock_pw.assert_not_called()

def test_health_check_memory_endpoint():
    """Verify /health returns healthy status and memory object."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "memory" in data
