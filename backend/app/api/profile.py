from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.services.link_checker import check_resume_links

router = APIRouter()

class CheckLinksRequest(BaseModel):
    text: str

class UserProfileUpdate(BaseModel):
    base_location: Optional[str] = None
    remote_ok: Optional[bool] = None
    pay_floor_ncr_remote: Optional[int] = None
    target_roles: Optional[List[str]] = None
    target_tiers: Optional[List[str]] = None
    dream_companies: Optional[List[str]] = None
    graduation_date: Optional[str] = None
    auto_apply_enabled: Optional[bool] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None

DEFAULT_PROFILE = {
    "base_location": "Remote / Hybrid",
    "remote_ok": True,
    "pay_floor_ncr_remote": 500000,
    "pay_floor_other_cities": {},
    "target_roles": ["Software Engineer", "Full Stack Developer", "Backend Developer"],
    "target_tiers": ["Tier 1", "Tier 2", "Startup", "MNC"],
    "dream_companies": ["Google", "Microsoft", "Amazon"],
    "auto_apply_enabled": False,
}

def get_or_create_user_profile(user_id: str) -> dict:
    response = supabase.table("user_profile").select("*").eq("user_id", user_id).limit(1).execute()
    if response.data:
        return response.data[0]
    
    # Auto-provision default profile row
    new_profile = {**DEFAULT_PROFILE, "user_id": user_id}
    try:
        insert_resp = supabase.table("user_profile").insert(new_profile).execute()
        if insert_resp.data:
            return insert_resp.data[0]
    except Exception as e:
        print(f"Error auto-creating default profile: {e}")
    return new_profile

@router.get("")
def get_profile(user_id: str = Depends(get_current_user)):
    return get_or_create_user_profile(user_id)

@router.put("")
@router.patch("")
def update_profile(profile_data: UserProfileUpdate, user_id: str = Depends(get_current_user)):
    # Fetch the single profile to get its ID, scoped to user_id
    response = supabase.table("user_profile").select("*").eq("user_id", user_id).limit(1).execute()
    update_dict = profile_data.model_dump(exclude_unset=True)
    
    if not response.data:
        insert_data = {**DEFAULT_PROFILE, **update_dict, "user_id": user_id}
        res = supabase.table("user_profile").insert(insert_data).execute()
        return res.data[0] if res.data else insert_data
    
    profile_id = response.data[0]["id"]
    if not update_dict:
        return response.data[0]
    
    # Update it
    update_response = supabase.table("user_profile").update(update_dict).eq("id", profile_id).eq("user_id", user_id).execute()
    return update_response.data[0] if update_response.data else {**response.data[0], **update_dict}

@router.post("/check-links")
def check_links_endpoint(req: CheckLinksRequest, user_id: str = Depends(get_current_user)):
    """Extracts and verifies all URLs in the provided text, returning broken ones."""
    broken_links = check_resume_links(req.text)
    return {"broken_links": broken_links}

