from datetime import datetime, timezone
from fastapi import BackgroundTasks, HTTPException
from app.db.supabase_client import supabase
from app.services.jd_parser import parse_job_description
from app.api.profile import get_or_create_user_profile
# We need to import ParseRequest, but it's defined in api.jobs which might cause circular imports.
# We should redefine it here or in a models file.
# For now, we will just use a Pydantic model here.
from pydantic import BaseModel
from typing import Optional

class ParseRequest(BaseModel):
    raw_jd: str
    source: str = "manual"
    source_type: str = "manual"
    source_confidence: float = 0.0
    url: Optional[str] = None
    official_apply_url: Optional[str] = None
    external_job_id: Optional[str] = None
    company_name: Optional[str] = None
    use_groq: bool = False

def process_and_store_job(req: ParseRequest, user_id: str, background_tasks: BackgroundTasks = None, skip_analysis: bool = False):
    """
    Shared business logic for parsing and persisting jobs.
    Called by API routes (jobs.py), Inbox orchestrator (inbox_processor.py), and potentially schedulers.
    """
    target_url = req.url.strip() if req.url else None
    
    # 0. Check if job already exists via stable identity
    if req.company_name or target_url:
        company_val = req.company_name or "Unknown Company"
        pass

    # 1. Get user profile (auto-create default if user is new)
    user_profile = get_or_create_user_profile(user_id)

    # 2. Parse JD
    parsed_job = parse_job_description(req.raw_jd, use_groq=req.use_groq)
    
    # Override company if explicitly provided
    if req.company_name:
        parsed_job.company = req.company_name

    # 3. Save to DB First (Fast)
    resolved_url = target_url or parsed_job.apply_link
    job_insert = {
        "source": req.source,
        "source_type": req.source_type,
        "source_url": target_url,
        "official_apply_url": req.official_apply_url or resolved_url,
        "external_job_id": req.external_job_id,
        "source_confidence": req.source_confidence,
        "url": resolved_url,
        "company": parsed_job.company,
        "role_title": parsed_job.role_title,
        "raw_jd": req.raw_jd,
        "location": parsed_job.location,
        "remote_type": parsed_job.remote_type,
        "pay_min": parsed_job.pay_min,
        "pay_max": parsed_job.pay_max,
        "pay_currency": parsed_job.pay_currency,
        "pay_confidence": parsed_job.pay_confidence,
        "posting_date": parsed_job.posting_date,
        "region_wise_salary": parsed_job.region_wise_salary,
        "deadline": parsed_job.deadline_date,
        "seniority_required": parsed_job.seniority_required,
        "required_skills": parsed_job.required_skills,
        "nice_to_have_skills": parsed_job.nice_to_have_skills,
        "user_id": user_id,
        "analysis_status": "pending" if not skip_analysis else "pending"
    }
    
    try:
        job_resp = supabase.table("jobs").insert(job_insert).execute()
        job_id = job_resp.data[0]["id"]
    except Exception as e:
        err_str = str(e)
        if "duplicate key value" in err_str or "23505" in err_str:
            dedup_col = "external_job_id" if req.external_job_id else "url"
            dedup_val = req.external_job_id if req.external_job_id else resolved_url
            try:
                supabase.table("jobs").update({"last_seen_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", user_id).eq("source_type", req.source_type).eq("company", parsed_job.company).eq(dedup_col, dedup_val).execute()
            except Exception as update_e:
                print(f"Failed to update last_seen_at for duplicate job: {update_e}")
                
            # If it's a duplicate, we need to return the existing job_id so inbox_opportunities can link to it
            existing_job = supabase.table("jobs").select("id").eq("user_id", user_id).eq("source_type", req.source_type).eq("company", parsed_job.company).eq(dedup_col, dedup_val).execute()
            if existing_job.data:
                return {"job_id": existing_job.data[0]["id"], "is_duplicate": True}
            return {"job_id": None, "is_duplicate": True}
        raise HTTPException(status_code=400, detail=f"Failed to insert job: {err_str}")
    
    return {"job_id": job_id, "is_duplicate": False}
