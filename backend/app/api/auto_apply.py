from fastapi import APIRouter, HTTPException, Depends, Request
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import limiter

router = APIRouter()

@router.get("/data")
@limiter.limit("5/minute")
def get_auto_apply_data(request: Request, url: str, user_id: str = Depends(get_current_user)):
    """
    Fetches the user profile and the most recent cover letter draft for a given job URL.
    This is used by the Chrome Extension to pre-fill Greenhouse/Lever application forms.
    """
    
    # 1. Fetch the user profile to check if auto-apply is enabled
    profile_res = supabase.table("user_profile").select("*").eq("user_id", user_id).limit(1).execute()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    profile = profile_res.data[0]
    
    if not profile.get("auto_apply_enabled"):
        return {"enabled": False, "message": "Auto-apply is disabled in settings."}
        
    # 2. Try to find the job by URL to get its drafts
    # The URL from the extension might have query params or fragments, so we try a loose match
    # For now, exact match or simple exact match (ignoring query params if we can)
    
    # Clean URL (strip query params for search)
    clean_url = url.split("?")[0]
    
    job_res = supabase.table("jobs").select("id").eq("user_id", user_id).ilike("url", f"%{clean_url}%").limit(1).execute()
    
    cover_letter = ""
    if job_res.data:
        job_id = job_res.data[0]["id"]
        # Fetch the latest draft for this job
        draft_res = supabase.table("application_drafts").select("cover_letter_text").eq("job_id", job_id).eq("user_id", user_id).order("generated_at", desc=True).limit(1).execute()
        if draft_res.data:
            cover_letter = draft_res.data[0]["cover_letter_text"]

    return {
        "enabled": True,
        "first_name": profile.get("first_name", ""),
        "last_name": profile.get("last_name", ""),
        "email": profile.get("email", ""),
        "phone": profile.get("phone", ""),
        "linkedin_url": profile.get("linkedin_url", ""),
        "github_url": profile.get("github_url", ""),
        "portfolio_url": profile.get("portfolio_url", ""),
        "cover_letter": cover_letter
    }
