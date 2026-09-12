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

@router.get("")
def get_profile(user_id: str = Depends(get_current_user)):
    # Fetch the single user profile scoped to user_id
    response = supabase.table("user_profile").select("*").eq("user_id", user_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return response.data[0]

@router.put("")
def update_profile(profile_data: UserProfileUpdate, user_id: str = Depends(get_current_user)):
    # Fetch the single profile to get its ID, scoped to user_id
    response = supabase.table("user_profile").select("id").eq("user_id", user_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile_id = response.data[0]["id"]
    
    # Update it
    update_response = supabase.table("user_profile").update(profile_data.model_dump()).eq("id", profile_id).eq("user_id", user_id).execute()
    return update_response.data[0]
