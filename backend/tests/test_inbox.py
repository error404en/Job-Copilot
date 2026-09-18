import pytest
from unittest.mock import patch, MagicMock
from app.services.inbox_extractor import extract_opportunities_from_text
from app.services.inbox_processor import process_inbox_source
from app.models.inbox import SourceType

# --- 1. LLM Extraction Tests (Mocked) ---

def test_whatsapp_10_jobs(monkeypatch):
    whatsapp_text = """
    Hey, here are some openings:
    1. SDE 1 at Amazon (Bangalore) - 0-1 yrs exp. Apply: amazon.jobs/123
    2. Data Analyst at Google - 2 yrs req.
    3. Frontend Engineer at Meta - Remote.
    (Imagine 7 more here)
    """
    
    with patch("app.services.inbox_extractor._try_groq_json") as mock_llm:
        mock_llm.return_value = [
            {"company": "Amazon", "role_title": "SDE 1", "location": "Bangalore", "submitted_url": "https://amazon.jobs/123"},
            {"company": "Google", "role_title": "Data Analyst", "location": None, "submitted_url": None},
            {"company": "Meta", "role_title": "Frontend Engineer", "location": "Remote", "submitted_url": None}
        ]
        
        results = extract_opportunities_from_text(whatsapp_text)
        assert len(results) == 3
        assert results[0]["company"] == "Amazon"
        
def test_telegram_multiple_links(monkeypatch):
    text = "Apply here: linktr.ee/jobs or bit.ly/meta-jobs"
    with patch("app.services.inbox_extractor._try_groq_json") as mock_llm:
        mock_llm.return_value = [{"submitted_url": "https://bit.ly/meta-jobs"}]
        res = extract_opportunities_from_text(text)
        assert res[0]["submitted_url"] == "https://bit.ly/meta-jobs"

# --- 2. Orchestrator / Verification Tests ---

import asyncio

def test_shortened_url_resolution():
    with patch("app.services.inbox_processor.supabase") as mock_db, \
         patch("app.services.inbox_processor.resolve_redirects_and_detect_promo") as mock_resolve, \
         patch("app.services.inbox_processor.extract_opportunities_from_text") as mock_extract, \
         patch("app.services.inbox_processor.discover_careers_url_and_ats") as mock_discover:
         
         mock_extract.return_value = [{"company": "Meta", "role_title": "SDE", "submitted_url": "https://bit.ly/meta-jobs"}]
         mock_resolve.return_value = {"final_url": "https://metacareers.com/jobs", "is_promo": False}
         mock_discover.return_value = {"careers_url": "https://metacareers.com"}
         
         results = asyncio.run(process_inbox_source("src_1", "text", SourceType.TEXT, "user_1"))
         
         assert results[0]["status"] == "verified"
         assert results[0]["verified_official_url"] == "https://metacareers.com/jobs"
         
def test_promo_url():
    with patch("app.services.inbox_processor.supabase") as mock_db, \
         patch("app.services.inbox_processor.resolve_redirects_and_detect_promo") as mock_resolve, \
         patch("app.services.inbox_processor.extract_opportunities_from_text") as mock_extract:
         
         mock_extract.return_value = [{"company": "Meta", "role_title": "SDE", "submitted_url": "https://linktr.ee/sketchy"}]
         mock_resolve.return_value = {"final_url": "https://linktr.ee/sketchy", "is_promo": True}
         
         results = asyncio.run(process_inbox_source("src_1", "text", SourceType.TEXT, "user_1"))
         
         assert results[0]["verification_status"] == "promo_funnel"
         assert results[0]["status"] == "unverified"
         
def test_duplicate_opportunity():
    with patch("app.services.inbox_processor.supabase") as mock_db, \
         patch("app.services.inbox_processor.extract_opportunities_from_text") as mock_extract:
         
         # Assuming insert throws unique constraint error
         mock_db.table.return_value.insert.return_value.execute.side_effect = Exception("duplicate key value violates unique constraint")
         mock_extract.return_value = [{"company": "Meta", "role_title": "SDE", "submitted_url": None}]
         
         results = asyncio.run(process_inbox_source("src_1", "text", SourceType.TEXT, "user_1"))
         
         # The code should skip duplicate and not crash
         assert len(results) == 0

