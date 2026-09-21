from app.services.inbox_extractor import extract_opportunities_from_text, extract_text_from_file
from app.api.research import discover_careers_url_and_ats
from app.services.link_checker import resolve_redirects_and_detect_promo
from app.services.job_fetcher import fetch_workday_jobs, fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, fetch_generic_fallback
from app.models.inbox import InboxOpportunity, InboxOpportunityStatus, VerificationStatus, SourceType
from app.models.discovery import ATSInfo, ATSSystem
from app.db.supabase_client import supabase
from typing import List, Optional
import uuid
import datetime
import asyncio


ATS_FETCHERS = {
    ATSSystem.GREENHOUSE: fetch_greenhouse_jobs,
    ATSSystem.LEVER: fetch_lever_jobs,
    ATSSystem.ASHBY: fetch_ashby_jobs,
    ATSSystem.SMARTRECRUITERS: fetch_smartrecruiters_jobs,
    ATSSystem.WORKDAY: fetch_workday_jobs,
}


async def fetch_discovered_ats_jobs(ats_info: ATSInfo, role_title: str) -> List[dict]:
    """Use the canonical discovery result to delegate to an existing ATS adapter."""
    fetcher = ATS_FETCHERS[ats_info.system]
    return await asyncio.to_thread(fetcher, ats_info.token, target_keywords=[role_title])

async def process_inbox_source(source_id: str, content: str, source_type: SourceType, user_id: str) -> List[dict]:
    # 1. Extract raw text if it's a file
    if source_type != SourceType.TEXT and source_type != SourceType.URL:
        # content contains the file_path in these cases
        extracted_text = extract_text_from_file(content, source_type.value)
        if not extracted_text or not extracted_text.strip():
            supabase.table("inbox_sources").update({"status": "failed", "raw_content": None}).eq("id", source_id).eq("user_id", user_id).execute()
            print(f"Extraction failed for source {source_id}")
            return []
        content = extracted_text
        
        # Persist the extracted text instead of the temp file path
        supabase.table("inbox_sources").update({"raw_content": content}).eq("id", source_id).eq("user_id", user_id).execute()

    # 2. Extract opportunities
    extracted = extract_opportunities_from_text(content)
    
    results = []
    for opp_data in extracted:
        company = opp_data.get("company")
        role_title = opp_data.get("role_title")
        location = opp_data.get("location")
        submitted_url = opp_data.get("submitted_url")
        meta = opp_data.get("extraction_metadata", {})
        
        status = InboxOpportunityStatus.PENDING
        verified_url = None
        verification_status = None
        
        # 3. Safe Redirect Resolution
        if submitted_url:
            resolution = resolve_redirects_and_detect_promo(submitted_url)
            submitted_url = resolution.get("final_url", submitted_url)
            if resolution.get("is_promo"):
                verification_status = VerificationStatus.PROMO_FUNNEL
                status = InboxOpportunityStatus.UNVERIFIED
        
        # 4. Official Source Verification
        official_url = None
        ats_info = None
        if company:
            # The one canonical discovery service accepts a submitted ATS URL when
            # available, avoiding a duplicate URL-parsing implementation in Inbox.
            discovery = discover_careers_url_and_ats(company, submitted_url)
            official_url = discovery.careers_url
            ats_info = discovery.ats_info
            
            # A submitted URL is verified only when the canonical discovery
            # service positively identifies a supported ATS on that URL.
            if ats_info and official_url and submitted_url and official_url.split('/')[2] in submitted_url:
                if not verification_status:
                    verification_status = VerificationStatus.VERIFIED
                    status = InboxOpportunityStatus.VERIFIED
                verified_url = submitted_url
            else:
                if not verification_status:
                    verification_status = VerificationStatus.UNVERIFIED_THIRD_PARTY
                    status = InboxOpportunityStatus.UNVERIFIED
                        
        if not company or not role_title:
            status = InboxOpportunityStatus.INELIGIBLE
            
        linked_job_id = None
        
        # Shared Job Discovery V2 Pipeline Handoff
        if status != InboxOpportunityStatus.INELIGIBLE and company:
            try:
                jobs_found = []
                if ats_info:
                    jobs_found = await fetch_discovered_ats_jobs(ats_info, role_title)

                if not jobs_found:
                    # Generic fallback
                    fallback_url = official_url or submitted_url
                    if fallback_url:
                        jobs_found = await asyncio.to_thread(fetch_generic_fallback, fallback_url, company, target_keywords=[role_title])
                
                if jobs_found:
                    # Take the first match
                    best_job = jobs_found[0]
                    from app.services.job_pipeline import ParseRequest, process_and_store_job
                    req = ParseRequest(
                        raw_jd=best_job["raw_jd"],
                        source="inbox",
                        source_type=best_job.get("source_type") or source_type.value,
                        source_confidence=best_job.get("source_confidence", 0.4),
                        url=best_job.get("url") or submitted_url,
                        official_apply_url=best_job.get("official_apply_url") or official_url,
                        external_job_id=best_job.get("external_job_id"),
                        company_name=company
                    )
                    pipeline_res = process_and_store_job(req, user_id=user_id)
                    linked_job_id = pipeline_res.get("job_id")
            except Exception as e:
                print(f"V2 Handoff failed for {company} - {role_title}: {e}")
                
        opp_id = str(uuid.uuid4())
        record = {
            "id": opp_id,
            "user_id": user_id,
            "source_id": source_id,
            "company": company,
            "role_title": role_title,
            "location": location,
            "original_submitted_url": submitted_url,
            "verified_official_url": verified_url,
            "status": status.value,
            "verification_status": verification_status.value if verification_status else None,
            "job_id": linked_job_id,
            "extraction_metadata": meta
        }
        
        try:
            supabase.table("inbox_opportunities").insert(record).execute()
            results.append(record)
        except Exception as e:
            # Handle unique constraint violations
            print(f"Skipping duplicate or failed opportunity insertion: {e}")
            
    # Mark source as completed - ALWAYS explicitly scope by user_id for security
    supabase.table("inbox_sources").update({"status": "completed"}).eq("id", source_id).eq("user_id", user_id).execute()
    
    return results
