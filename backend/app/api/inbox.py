from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from app.middleware.auth import get_current_user
from app.models.inbox import UploadInboxRequest, SourceType, InboxSourceStatus, InboxOpportunityStatus, VerificationStatus
from app.services.job_pipeline import ParseRequest, process_and_store_job
from pydantic import BaseModel
from typing import Literal
from app.services.inbox_processor import process_inbox_source
from app.db.supabase_client import supabase
import uuid
import os

router = APIRouter()


class OpportunityActionRequest(BaseModel):
    action: Literal["reject", "save"]

@router.post("/text")
async def upload_inbox_text(req: UploadInboxRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    source_id = str(uuid.uuid4())
    record = {
        "id": source_id,
        "user_id": user_id,
        "source_type": req.source_type.value,
        "raw_content": req.content,
        "status": InboxSourceStatus.PROCESSING.value
    }
    
    supabase.table("inbox_sources").insert(record).execute()
    
    # Process in background
    background_tasks.add_task(process_inbox_source, source_id, req.content, req.source_type, user_id)
    
    return {"status": "processing", "source_id": source_id}

@router.post("/upload")
async def upload_inbox_file(background_tasks: BackgroundTasks, file: UploadFile = File(...), source_type: str = Form(...), user_id: str = Depends(get_current_user)):
    source_id = str(uuid.uuid4())
    
    if source_type == 'video':
        import shutil
        if not shutil.which("ffmpeg"):
            raise HTTPException(status_code=501, detail="Video processing requires ffmpeg which is not installed in the environment.")
            
    # Save file temporarily using cross-platform temp directory
    import tempfile
    file_ext = os.path.splitext(file.filename)[1]
    file_path = os.path.join(tempfile.gettempdir(), f"{source_id}{file_ext}")
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    try:
        s_type = SourceType(source_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid source type")

    record = {
        "id": source_id,
        "user_id": user_id,
        "source_type": s_type.value,
        "raw_content": file_path, # We store path for backend processing
        "status": InboxSourceStatus.PROCESSING.value
    }
    
    supabase.table("inbox_sources").insert(record).execute()
    
    # Process in background
    background_tasks.add_task(process_inbox_source, source_id, file_path, s_type, user_id)
    
    return {"status": "processing", "source_id": source_id}

@router.get("/sources/{source_id}/progress")
def get_source_progress(source_id: str, user_id: str = Depends(get_current_user)):
    source_res = supabase.table("inbox_sources").select("status").eq("id", source_id).eq("user_id", user_id).execute()
    if not source_res.data:
        raise HTTPException(status_code=404, detail="Source not found")
        
    status = source_res.data[0]["status"]
    
    # Get stats of extracted opportunities
    opps_res = supabase.table("inbox_opportunities").select("status, verification_status").eq("source_id", source_id).eq("user_id", user_id).execute()
    
    verified = 0
    needs_check = 0
    rejected = 0
    pending = 0
    
    for opp in opps_res.data:
        v_stat = opp.get("verification_status")
        o_stat = opp.get("status")
        
        if o_stat == InboxOpportunityStatus.PENDING.value:
            pending += 1
        elif o_stat == InboxOpportunityStatus.INELIGIBLE.value:
            rejected += 1
        elif v_stat == VerificationStatus.VERIFIED.value:
            verified += 1
        else:
            needs_check += 1
            
    return {
        "status": status,
        "extracted_total": len(opps_res.data),
        "verified": verified,
        "needs_check": needs_check,
        "rejected": rejected,
        "pending": pending
    }

@router.get("/opportunities")
def list_opportunities(user_id: str = Depends(get_current_user)):
    res = supabase.table("inbox_opportunities").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return {"opportunities": res.data}


@router.patch("/opportunities/{opportunity_id}")
def update_opportunity(opportunity_id: str, req: OpportunityActionRequest, user_id: str = Depends(get_current_user)):
    opportunity_res = supabase.table("inbox_opportunities").select("*").eq("id", opportunity_id).eq("user_id", user_id).execute()
    if not opportunity_res.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    opportunity = opportunity_res.data[0]

    if req.action == "reject":
        # "ineligible" is the existing schema-supported terminal state for a
        # user-rejected lead; no schema expansion is required.
        result = supabase.table("inbox_opportunities").update({"status": InboxOpportunityStatus.INELIGIBLE.value}).eq("id", opportunity_id).eq("user_id", user_id).execute()
        return result.data[0]

    existing_job_id = opportunity.get("job_id")
    if existing_job_id:
        owned_job = supabase.table("jobs").select("id").eq("id", existing_job_id).eq("user_id", user_id).execute()
        if not owned_job.data:
            raise HTTPException(status_code=409, detail="Opportunity is linked to a job outside this user account")
        return {"opportunity": opportunity, "job_id": existing_job_id, "is_duplicate": True}

    if opportunity.get("status") == InboxOpportunityStatus.INELIGIBLE.value:
        raise HTTPException(status_code=409, detail="Rejected opportunities cannot be saved")

    source_res = supabase.table("inbox_sources").select("source_type, raw_content").eq("id", opportunity["source_id"]).eq("user_id", user_id).execute()
    if not source_res.data:
        raise HTTPException(status_code=404, detail="Inbox source not found")

    meta = opportunity.get("extraction_metadata") or {}
    raw_jd = meta.get("extracted_jd") or meta.get("source_text") or source_res.data[0].get("raw_content")
    import tempfile
    temp_dir = tempfile.gettempdir()
    if not raw_jd or not raw_jd.strip() or raw_jd.startswith("/tmp/") or raw_jd.startswith(temp_dir) or os.path.exists(raw_jd.strip() if len(raw_jd) < 250 else ""):
        raise HTTPException(status_code=422, detail="Cannot save opportunity: Original source content is missing or unextracted.")

    if not opportunity.get("company") or not opportunity.get("role_title"):
        raise HTTPException(status_code=422, detail="Opportunity needs a company and role before it can be saved")

    job_url = opportunity.get("verified_official_url") or opportunity.get("original_submitted_url")
    pipeline_result = process_and_store_job(ParseRequest(
        raw_jd=raw_jd,
        source="inbox",
        source_type=source_res.data[0]["source_type"],
        source_confidence=1.0 if opportunity.get("verified_official_url") else 0.4,
        url=job_url,
        official_apply_url=opportunity.get("verified_official_url"),
        company_name=opportunity["company"],
        role_title=opportunity["role_title"],
    ), user_id=user_id, skip_analysis=True)
    job_id = pipeline_result.get("job_id")
    if not job_id:
        raise HTTPException(status_code=500, detail="Unable to persist the promoted job")

    owned_job = supabase.table("jobs").select("id").eq("id", job_id).eq("user_id", user_id).execute()
    if not owned_job.data:
        raise HTTPException(status_code=409, detail="Refusing to link a job outside this user account")

    result = supabase.table("inbox_opportunities").update({"job_id": job_id, "status": InboxOpportunityStatus.RELEVANT.value}).eq("id", opportunity_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    return {"opportunity": result.data[0], "job_id": job_id, "is_duplicate": pipeline_result.get("is_duplicate", False)}


@router.post("/copilot-optimize")
def copilot_optimize_inbox(user_id: str = Depends(get_current_user)):
    """
    AI Copilot Auto-Cleaner & Triage Optimizer for Lead Ingestion Studio:
    1. Evaluates all inbox leads against candidate target domain (SDE, AI/ML, Data, Consulting/BTSA, QA).
    2. Auto-rejects off-target leads (HR, Talent Acquisition, Recruiting, Marketing, BCA/BCom Service Desk)
       and unlinks/deletes any previously promoted off-target rows from the Dashboard (`jobs` table).
    3. Deduplicates repeated `(company, role_title)` leads.
    4. Auto-promotes and deterministically scores verified `high_fit` leads so they appear on the Dashboard
       with an instant Match Score & Verdict.
    """
    from app.services.lead_resolver import evaluate_lead_copilot_fit
    from app.services.job_pipeline import run_instant_deterministic_analysis
    from app.services.jd_parser import parse_job_description
    from app.api.profile import get_or_create_user_profile

    opps_res = supabase.table("inbox_opportunities").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    opps = opps_res.data or []
    if not opps:
        return {
            "status": "success",
            "promoted_count": 0,
            "cleaned_count": 0,
            "deduplicated_count": 0,
            "high_fit_count": 0,
            "message": "No leads in inbox to optimize."
        }

    # Fetch user profile & resumes once for fast deterministic scoring
    user_profile = get_or_create_user_profile(user_id)
    resumes_resp = supabase.table("resume_versions").select("*").eq("user_id", user_id).execute()
    resumes = resumes_resp.data or []

    # Check tracked application job_ids so we never delete a job the user actively tracked
    apps_res = supabase.table("applications").select("job_id").eq("user_id", user_id).execute()
    tracked_job_ids = {row["job_id"] for row in (apps_res.data or []) if row.get("job_id")}

    promoted_count = 0
    cleaned_count = 0
    deduplicated_count = 0
    high_fit_count = 0
    seen_keys = set()

    for opp in opps:
        opp_id = opp["id"]
        company = (opp.get("company") or "").strip()
        role_title = (opp.get("role_title") or "").strip()
        meta = dict(opp.get("extraction_metadata") or {})
        qual = meta.get("qualification") or ""
        source_text = meta.get("extracted_jd") or meta.get("source_text") or ""

        copilot_eval = evaluate_lead_copilot_fit(
            company=company,
            role_title=role_title,
            qualification=qual,
            source_text=source_text,
        )
        copilot_fit = copilot_eval["copilot_fit"]
        meta["copilot_fit"] = copilot_fit
        meta["copilot_score"] = copilot_eval["copilot_score"]
        meta["copilot_reason"] = copilot_eval["copilot_reason"]

        # Deduplicate repeated (company, role_title) leads
        dedup_key = f"{company.lower()}::{role_title.lower()}"
        if company and role_title and dedup_key in seen_keys:
            if opp.get("status") != InboxOpportunityStatus.INELIGIBLE.value:
                supabase.table("inbox_opportunities").update({
                    "status": InboxOpportunityStatus.INELIGIBLE.value,
                    "extraction_metadata": meta,
                }).eq("id", opp_id).eq("user_id", user_id).execute()
                deduplicated_count += 1
            continue
        if company and role_title:
            seen_keys.add(dedup_key)

        v_stat = opp.get("verification_status")
        existing_job_id = opp.get("job_id")

        # 1. Off-target or promo funnel -> Auto-clean & unlink from Dashboard if previously promoted
        if copilot_fit == "off_target" or v_stat == VerificationStatus.PROMO_FUNNEL.value:
            if existing_job_id and existing_job_id not in tracked_job_ids:
                try:
                    supabase.table("inbox_opportunities").update({"job_id": None}).eq("id", opp_id).eq("user_id", user_id).execute()
                    supabase.table("jobs").delete().eq("id", existing_job_id).eq("user_id", user_id).execute()
                except Exception:
                    pass
                existing_job_id = None

            if opp.get("status") != InboxOpportunityStatus.INELIGIBLE.value or opp.get("job_id"):
                supabase.table("inbox_opportunities").update({
                    "status": InboxOpportunityStatus.INELIGIBLE.value,
                    "job_id": existing_job_id,
                    "extraction_metadata": meta,
                }).eq("id", opp_id).eq("user_id", user_id).execute()
                cleaned_count += 1
            else:
                supabase.table("inbox_opportunities").update({"extraction_metadata": meta}).eq("id", opp_id).eq("user_id", user_id).execute()
            continue

        # 2. High-fit lead -> ensure promoted & scored
        if copilot_fit == "high_fit":
            high_fit_count += 1
            if v_stat == VerificationStatus.VERIFIED.value and not existing_job_id and company and role_title:
                job_url = opp.get("verified_official_url") or opp.get("original_submitted_url")
                raw_jd = source_text or f"{role_title} at {company}"
                try:
                    pipeline_res = process_and_store_job(ParseRequest(
                        raw_jd=raw_jd,
                        source="inbox",
                        source_type="text",
                        source_confidence=1.0 if opp.get("verified_official_url") else 0.7,
                        url=job_url,
                        official_apply_url=opp.get("verified_official_url"),
                        company_name=company,
                        role_title=role_title,
                    ), user_id=user_id, skip_analysis=True)
                    new_job_id = pipeline_res.get("job_id")
                    if new_job_id:
                        existing_job_id = new_job_id
                        promoted_count += 1
                except Exception:
                    pass

            if existing_job_id:
                try:
                    p_job = parse_job_description(source_text or f"{role_title} at {company}")
                    p_job.company = company
                    p_job.role_title = role_title
                    run_instant_deterministic_analysis(
                        job_id=existing_job_id,
                        user_id=user_id,
                        parsed_job=p_job,
                        raw_jd=source_text or f"{role_title} at {company}",
                        user_profile=user_profile,
                        resumes=resumes,
                    )
                except Exception:
                    pass

        supabase.table("inbox_opportunities").update({
            "job_id": existing_job_id,
            "status": InboxOpportunityStatus.RELEVANT.value if opp.get("status") != InboxOpportunityStatus.INELIGIBLE.value else InboxOpportunityStatus.INELIGIBLE.value,
            "extraction_metadata": meta,
        }).eq("id", opp_id).eq("user_id", user_id).execute()

    return {
        "status": "success",
        "promoted_count": promoted_count,
        "cleaned_count": cleaned_count,
        "deduplicated_count": deduplicated_count,
        "high_fit_count": high_fit_count,
        "message": f"Copilot triaged {len(opps)} leads: {high_fit_count} High-Fit target roles ready ({promoted_count} newly promoted & scored), {cleaned_count} off-target leads auto-cleaned, {deduplicated_count} duplicates removed."
    }


@router.delete("/cleanup")
def cleanup_ineligible_opportunities(user_id: str = Depends(get_current_user)):
    """Permanently purges rejected/off-target (`ineligible`) leads from the Lead Ingestion Studio."""
    res = supabase.table("inbox_opportunities").select("id").eq("user_id", user_id).eq("status", InboxOpportunityStatus.INELIGIBLE.value).execute()
    ids = [row["id"] for row in (res.data or [])]
    if not ids:
        return {"status": "success", "deleted_count": 0, "message": "No rejected or off-target leads to purge."}

    for oid in ids:
        supabase.table("inbox_opportunities").delete().eq("id", oid).eq("user_id", user_id).execute()

    return {
        "status": "success",
        "deleted_count": len(ids),
        "message": f"Purged {len(ids)} rejected/off-target leads from your workspace."
    }
