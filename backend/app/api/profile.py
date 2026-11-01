from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
import re
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
    "auto_apply_enabled": True,
}


def extract_identity_from_resume_text(raw_text: str) -> dict:
    """
    Deterministically extracts candidate contact & identity fields (Name, Email, Phone,
    LinkedIn, GitHub, Portfolio) from raw resume text so Auto-Fill works out-of-the-box.
    """
    if not raw_text or not raw_text.strip():
        return {}

    extracted = {}

    # 1. Email
    email_match = re.search(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', raw_text)
    if email_match:
        extracted["email"] = email_match.group(0).strip()

    # 2. Phone (Indian +91 or international 10-digit formats)
    phone_match = re.search(r'(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{3,5}\)?[\s\-]?)?\d{3,5}[\s\-]?\d{4,5}', raw_text)
    if phone_match:
        candidate_phone = phone_match.group(0).strip()
        digits_only = re.sub(r'\D', '', candidate_phone)
        if 10 <= len(digits_only) <= 13:
            extracted["phone"] = candidate_phone

    # 3. LinkedIn URL
    li_match = re.search(r'(?:https?://)?(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_\-]+/?', raw_text, re.IGNORECASE)
    if li_match:
        url = li_match.group(0).strip()
        extracted["linkedin_url"] = url if url.startswith("http") else f"https://{url}"

    # 4. GitHub URL
    gh_match = re.search(r'(?:https?://)?(?:www\.)?github\.com/[a-zA-Z0-9_\-]+/?', raw_text, re.IGNORECASE)
    if gh_match:
        url = gh_match.group(0).strip()
        extracted["github_url"] = url if url.startswith("http") else f"https://{url}"

    # 5. Portfolio / Personal URL (excluding linkedin/github/mailto)
    all_urls = re.findall(r'https?://[a-zA-Z0-9.\-_/~]+', raw_text)
    for u in all_urls:
        u_low = u.lower()
        if not any(skip in u_low for skip in ("linkedin.com", "github.com", "google.com", "leetcode.com", "hackerrank.com", "codeforces.com")):
            extracted["portfolio_url"] = u
            break

    # 6. First & Last Name from top lines of resume
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    skip_headers = {"resume", "curriculum", "vitae", "cv", "page", "contact", "summary", "education", "experience", "skills"}
    for line in lines[:6]:
        # Strip pipes, emails, phones
        clean_line = re.split(r'[|•,@]|http|\+?\d{5,}', line)[0].strip()
        words = [w for w in clean_line.split() if re.match(r'^[A-Za-z.\-]+$', w)]
        if 1 <= len(words) <= 4 and not any(w.lower() in skip_headers for w in words):
            extracted["first_name"] = words[0].title()
            extracted["last_name"] = " ".join(words[1:]).title() if len(words) > 1 else ""
            break

    return extracted


def enrich_profile_from_resumes_if_needed(profile: dict, user_id: str) -> dict:
    """If profile is missing name/email/phone, attempts to backfill from the user's latest uploaded resume."""
    if profile.get("first_name") and profile.get("email") and profile.get("phone"):
        return profile

    try:
        res_rows = supabase.table("resume_versions").select("raw_content, title").eq("user_id", user_id).order("created_at", desc=True).limit(2).execute()
        resumes = res_rows.data or []
        if not resumes:
            return profile

        raw_text = "\n".join([r.get("raw_content") or "" for r in resumes if r.get("raw_content")])
        if not raw_text.strip():
            return profile

        extracted = extract_identity_from_resume_text(raw_text)
        updates = {}
        for field in ("first_name", "last_name", "email", "phone", "linkedin_url", "github_url", "portfolio_url"):
            if not profile.get(field) and extracted.get(field):
                updates[field] = extracted[field]
                profile[field] = extracted[field]

        if updates and profile.get("id"):
            try:
                supabase.table("user_profile").update(updates).eq("id", profile["id"]).eq("user_id", user_id).execute()
            except Exception:
                pass
    except Exception:
        pass

    return profile


def get_or_create_user_profile(user_id: str) -> dict:
    response = supabase.table("user_profile").select("*").eq("user_id", user_id).limit(1).execute()
    if response.data:
        return enrich_profile_from_resumes_if_needed(response.data[0], user_id)
    
    # Auto-provision default profile row
    new_profile = {**DEFAULT_PROFILE, "user_id": user_id}
    try:
        insert_resp = supabase.table("user_profile").insert(new_profile).execute()
        if insert_resp.data:
            return enrich_profile_from_resumes_if_needed(insert_resp.data[0], user_id)
    except Exception as e:
        print(f"Error auto-creating default profile: {e}")
    return enrich_profile_from_resumes_if_needed(new_profile, user_id)

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


@router.post("/sync-from-resume")
def sync_profile_from_resume_endpoint(user_id: str = Depends(get_current_user)):
    """Extracts Name, Email, Phone, LinkedIn, GitHub, and Portfolio from the user's latest resume and updates profile."""
    profile = get_or_create_user_profile(user_id)
    res_rows = supabase.table("resume_versions").select("raw_content, title").eq("user_id", user_id).order("created_at", desc=True).limit(3).execute()
    resumes = res_rows.data or []
    if not resumes:
        raise HTTPException(status_code=404, detail="No uploaded resumes found. Please upload a PDF resume first.")

    raw_text = "\n".join([r.get("raw_content") or "" for r in resumes if r.get("raw_content")])
    extracted = extract_identity_from_resume_text(raw_text)
    if not extracted:
        return profile

    updates = {k: v for k, v in extracted.items() if v}
    updates["auto_apply_enabled"] = True
    if profile.get("id"):
        res = supabase.table("user_profile").update(updates).eq("id", profile["id"]).eq("user_id", user_id).execute()
        if res.data:
            return res.data[0]
    return {**profile, **updates}


