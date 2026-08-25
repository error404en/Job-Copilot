from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from app.db.supabase_client import supabase

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

@router.get("/")
def get_profile():
    # Fetch the single user profile (assuming one row exists)
    response = supabase.table("user_profile").select("*").limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return response.data[0]

@router.put("/")
def update_profile(profile_data: UserProfileUpdate):
    # Fetch the single profile to get its ID
    response = supabase.table("user_profile").select("id").limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile_id = response.data[0]["id"]
    
    # Update it
    update_response = supabase.table("user_profile").update(profile_data.model_dump()).eq("id", profile_id).execute()
    return update_response.data[0]
