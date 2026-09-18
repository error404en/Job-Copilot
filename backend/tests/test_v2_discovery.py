import pytest
from unittest.mock import patch, MagicMock
from app.services.job_fetcher import parse_experience_requirements, fetch_workday_jobs
from app.services.job_pipeline import process_and_store_job, ParseRequest
from fastapi import HTTPException

# --- 1. Hybrid Experience Parser Tests ---

def test_parse_experience_obvious_fresher():
    meta = parse_experience_requirements("SDE 1", "0-2 years of experience required.")
    assert meta["fresher_eligibility"] is True
    assert meta["experience_min_years"] == 0

def test_parse_experience_obvious_senior():
    meta = parse_experience_requirements("Senior Backend Engineer", "8+ years in distributed systems.")
    assert meta["experience_min_years"] >= 5
    assert meta["seniority"] == "senior"

def test_parse_experience_ambiguous():
    # LLM should handle this because of 'preferred' modifier
    # We will mock the LLM call
    with patch('app.services.llm_client._try_groq_json') as mock_llm:
        import json
        mock_llm.return_value = json.dumps({
            "experience_min_years": 0,
            "experience_max_years": 5,
            "experience_required": False,
            "experience_preferred": True,
            "seniority": "0-2yr",
            "fresher_eligibility": True,
            "eligibility_reason": "2 years is preferred but not required.",
            "confidence": 0.9
        })
        
        meta = parse_experience_requirements("Software Engineer", "2 years preferred but open to talented new grads.")
        assert mock_llm.called
        assert meta["experience_preferred"] is True
        assert meta["experience_required"] is False
        assert meta["fresher_eligibility"] is True

# --- 2. Workday Pagination Mock Tests ---

def test_workday_pagination_multi_page():
    # Mock _safe_post to return different pages
    with patch('app.services.job_fetcher._safe_post') as mock_post:
        with patch('app.services.job_fetcher._safe_get') as mock_get:
            with patch('app.services.job_fetcher.validate_safe_url') as mock_validate:
                mock_validate.return_value = True
                
                # Setup JD mock
                mock_jd_resp = MagicMock()
                mock_jd_resp.status_code = 200
                mock_jd_resp.json.return_value = {"jobPostingInfo": {"jobDescription": "JD Text"}}
                mock_get.return_value = mock_jd_resp
                
                # Setup list mock
                mock_page1 = MagicMock()
                mock_page1.status_code = 200
                mock_page1.json.return_value = {
                    "total": 21,
                    "jobPostings": [{"title": f"Job {i}", "externalPath": f"/job/Loc/Job_{i}"} for i in range(20)]
                }
                
                mock_page2 = MagicMock()
                mock_page2.status_code = 200
                mock_page2.json.return_value = {
                    "total": 21,
                    "jobPostings": [{"title": "Job 20", "externalPath": "/job/Loc/Job_20"}]
                }
                
                mock_post.side_effect = [mock_page1, mock_page2]
                
                jobs = fetch_workday_jobs("mastercard/test_site", ["job"])
                assert len(jobs) == 21
                assert mock_post.call_count == 2
                
                # Jobs are fetched concurrently, so sort them by title to verify
                jobs.sort(key=lambda j: int(j["external_job_id"]) if j["external_job_id"].isdigit() else 0)
                assert "0" in [j["external_job_id"] for j in jobs]
                assert jobs[20]["external_job_id"] == "20"
                assert jobs[0]["source_type"] == "workday"

# --- 3. Deduplication Logic Checks ---

def test_job_insert_duplicate_handling():
    # Test that catching a 23505 unique violation updates last_seen_at
    req = ParseRequest(
        raw_jd="JD",
        source="workday",
        source_type="workday",
        company_name="Acme",
        external_job_id="123"
    )
    
    with patch('app.services.job_pipeline.supabase') as mock_supabase, \
         patch('app.services.job_pipeline.parse_job_description') as mock_parse_jd:
         
        # Mock parse
        from app.models.job import ParsedJob
        mock_parse_jd.return_value = ParsedJob(
            role_title="Dummy",
            seniority_required="0-2",
            is_fresher_eligible=True,
            required_skills=[],
            nice_to_have_skills=[],
            work_mode="Remote",
            company="Acme"
        )
        
        # Mock insert to raise an exception indicating duplicate
        mock_insert = mock_supabase.table().insert().execute
        mock_insert.side_effect = Exception("duplicate key value violates unique constraint 'idx_jobs_stable_identity'")
        
        # Mock update
        mock_update = mock_supabase.table().update().eq().eq().eq().eq().execute
        mock_update.return_value = MagicMock()
        
        # Mock select for existing job
        mock_select = mock_supabase.table().select().eq().eq().eq().eq().execute
        mock_select.return_value = MagicMock(data=[{"id": "dummy-job-id"}])
        
        # Call parse and score
        res = process_and_store_job(req, "test_user_id", skip_analysis=True)
        
        assert res["is_duplicate"] is True
        assert res["job_id"] == "dummy-job-id"
        assert mock_update.called

# --- 4. ATS Discovery Tests ---

def test_discover_workday_urls():
    from app.api.research import discover_careers_url_and_ats
    
    # We will just test the regex parsing directly since discover_careers_url_and_ats
    # expects a company name and uses DDG. Let's mock DDG to return specific URLs.
    with patch('app.api.research.DDGS') as mock_ddgs:
        # Test 1: Standard myworkdayjobs with en-US
        mock_instance = mock_ddgs.return_value.__enter__.return_value
        mock_instance.text.return_value = [{"href": "https://pwc.myworkdayjobs.com/en-US/Global_Experienced_Careers"}]
        
        res1 = discover_careers_url_and_ats("PwC")
        assert res1["ats_info"] is not None
        assert res1["ats_info"]["system"] == "workday"
        assert res1["ats_info"]["token"] == "pwc/pwc/Global_Experienced_Careers"
        
        # Test 2: wd5 subdomain with wday/cxs
        mock_instance.text.return_value = [{"href": "https://gehc.wd5.myworkdayjobs.com/wday/cxs/gehc/GEHC_ExternalSite/jobs"}]
        res2 = discover_careers_url_and_ats("GE HealthCare")
        assert res2["ats_info"]["token"] == "gehc.wd5/gehc/GEHC_ExternalSite"
        
        # Test 3: wd1 subdomain with standard site path
        mock_instance.text.return_value = [{"href": "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers"}]
        res3 = discover_careers_url_and_ats("Mastercard")
        assert res3["ats_info"]["token"] == "mastercard.wd1/mastercard/CorporateCareers"
