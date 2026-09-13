from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user

router = APIRouter()

class UserProfileUpdate(BaseModel):
    base_location: str
    remote_ok: bool
    pay_floor_ncr_remote: int
    target_roles: List[str]
    auto_apply_enabled: Optional[bool] = False
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    github_url: Optional[str] = ""
    portfolio_url: Optional[str] = ""

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
def update_profile(profile_data: UserProfileUpdate, user_id: str = Depends(get_current_user)):
    # Fetch the single profile to get its ID, scoped to user_id
    response = supabase.table("user_profile").select("id").eq("user_id", user_id).limit(1).execute()
    if not response.data:
        insert_data = profile_data.model_dump()
        insert_data["user_id"] = user_id
        res = supabase.table("user_profile").insert(insert_data).execute()
        return res.data[0]
    
    profile_id = response.data[0]["id"]
    
    # Update it
    update_response = supabase.table("user_profile").update(profile_data.model_dump()).eq("id", profile_id).eq("user_id", user_id).execute()
    return update_response.data[0]

