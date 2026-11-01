from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from app.middleware.auth import get_current_user
from app.models.inbox import UploadInboxRequest, SourceType, InboxSourceStatus, InboxOpportunityStatus
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

    raw_jd = source_res.data[0].get("raw_content")
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
