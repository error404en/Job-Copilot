from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
import asyncio
from datetime import datetime, timezone
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user

router = APIRouter()

class ApplicationCreateRequest(BaseModel):
    job_id: Optional[str] = None
    company: Optional[str] = None
    role_title: Optional[str] = None
    location: Optional[str] = None
    salary: Optional[str] = None
    url: Optional[str] = None
    status: str = "applied" # 'saved', 'applied', 'interview', 'offer', 'rejected'
    notes: Optional[str] = None
    applied_at: Optional[str] = None

class ApplicationUpdateRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    applied_at: Optional[str] = None

@router.get("")
def get_applications(user_id: str = Depends(get_current_user)):
    """
    Fetch all tracked job applications for the logged-in user,
    joined with underlying job and fit analysis data.
    """
    try:
        res = supabase.table("applications") \
            .select("*, jobs(*, job_analyses(*))") \
            .eq("user_id", user_id) \
            .order("applied_at", desc=True, nullsfirst=False) \
            .execute()
        return res.data or []
    except Exception as e:
        print(f"Error fetching applications: {e}")
        # Fallback to plain query if join fails
        res = supabase.table("applications").select("*").eq("user_id", user_id).execute()
        return res.data or []

@router.post("")
def create_or_track_application(req: ApplicationCreateRequest, user_id: str = Depends(get_current_user)):
    """
    Add a job to the tracker.
    Can either link an existing analyzed job via `job_id`, or create a custom entry.
    """
    target_job_id = req.job_id

    # If no existing job_id provided, create a minimal backing job entry
    if not target_job_id:
        if not req.company or not req.role_title:
            raise HTTPException(status_code=400, detail="Company and Role Title are required if job_id is not provided.")
        
        job_insert = {
            "source": "manual_tracker",
            "company": req.company.strip(),
            "role_title": req.role_title.strip(),
            "location": req.location.strip() if req.location else "Location Unclear",
            "url": req.url.strip() if req.url else None,
            "raw_jd": f"Tracked Application: {req.role_title} at {req.company}\nLocation: {req.location or 'Unspecified'}\nSalary: {req.salary or 'Not stated'}",
            "remote_type": "unclear",
            "user_id": user_id
        }
        job_res = supabase.table("jobs").insert(job_insert).execute()
        if not job_res.data:
            raise HTTPException(status_code=500, detail="Failed to create backing job record.")
        target_job_id = job_res.data[0]["id"]
    # 1. Check if the job actually belongs to the user
    if target_job_id:
        job_check = supabase.table("jobs").select("id").eq("id", target_job_id).eq("user_id", user_id).execute()
        if not job_check.data:
            raise HTTPException(status_code=404, detail="Job not found or does not belong to user.")

    # 2. Check if this job is already being tracked by this user
    existing = supabase.table("applications").select("id").eq("job_id", target_job_id).eq("user_id", user_id).execute()
    if existing.data and len(existing.data) > 0:
        # Update existing
        app_id = existing.data[0]["id"]
        update_payload = {"status": req.status}
        if req.notes is not None:
            update_payload["notes"] = req.notes
        if req.applied_at is not None:
            update_payload["applied_at"] = req.applied_at
        supabase.table("applications").update(update_payload).eq("id", app_id).eq("user_id", user_id).execute()
        return {"id": app_id, "status": req.status, "message": "Updated existing application."}

    applied_timestamp = req.applied_at or (datetime.now(timezone.utc).isoformat() if req.status == "applied" else None)

    app_payload = {
        "job_id": target_job_id,
        "status": req.status,
        "notes": req.notes or "",
        "applied_at": applied_timestamp,
        "user_id": user_id
    }

    insert_res = supabase.table("applications").insert(app_payload).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to save application to tracker.")
    
    return insert_res.data[0]

@router.patch("/{application_id}")
def update_application(application_id: str, req: ApplicationUpdateRequest, user_id: str = Depends(get_current_user)):
    """
    Update status, notes, or date for a tracked application.
    """
    update_data = {}
    if req.status is not None:
        update_data["status"] = req.status
        if req.status == "applied" and not req.applied_at:
            update_data["applied_at"] = datetime.now(timezone.utc).isoformat()
    if req.notes is not None:
        update_data["notes"] = req.notes
    if req.applied_at is not None:
        update_data["applied_at"] = req.applied_at

    if not update_data:
        return {"message": "No fields to update."}

    res = supabase.table("applications").update(update_data).eq("id", application_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Application not found.")
    return res.data[0]

@router.delete("/{application_id}")
def delete_application(application_id: str, user_id: str = Depends(get_current_user)):
    """
    Remove an application from tracking.
    """
    supabase.table("applications").delete().eq("id", application_id).eq("user_id", user_id).execute()
    return {"status": "deleted", "id": application_id}

class AutoApplyRequest(BaseModel):
    url: str
    job_id: Optional[str] = None

@router.post("/auto-apply")
async def auto_apply_job(req: AutoApplyRequest, user_id: str = Depends(get_current_user)):
    """
    Triggers the Hermes background auto-apply agent for a specific job URL.
    """
    from app.services.hermes_agent import run_hermes_apply
    
    # Run the background automation asynchronously to prevent blocking
    result = await run_hermes_apply(req.url, req.job_id or "unknown")
    
    if result["status"] == "success" and req.job_id:
        # Check if the job actually belongs to the user
        job_check = await asyncio.to_thread(lambda: supabase.table("jobs").select("id").eq("id", req.job_id).eq("user_id", user_id).execute())
        if not job_check.data:
            raise HTTPException(status_code=404, detail="Job not found or does not belong to user.")

        # Mark as applied in tracker automatically
        existing = await asyncio.to_thread(lambda: supabase.table("applications").select("id").eq("job_id", req.job_id).eq("user_id", user_id).execute())
        applied_timestamp = datetime.now(timezone.utc).isoformat()
        if existing.data and len(existing.data) > 0:
            await asyncio.to_thread(lambda: supabase.table("applications").update({"status": "applied", "applied_at": applied_timestamp}).eq("id", existing.data[0]["id"]).execute())
        else:
            await asyncio.to_thread(lambda: supabase.table("applications").insert({
                "job_id": req.job_id,
                "status": "applied",
                "applied_at": applied_timestamp,
                "notes": "Auto-applied via Hermes Agent",
                "user_id": user_id
            }).execute())

    return result
