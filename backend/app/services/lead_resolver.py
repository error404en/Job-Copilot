"""
Lead resolver: decides whether a social-media / chat lead maps to a REAL
official posting, and whether it is eligible for a fresher in India/remote.
"""
import re
from difflib import SequenceMatcher
from typing import List, Optional, Tuple, Dict, Any
from app.models.inbox import InboxOpportunityStatus, VerificationStatus

_STOP = {
    "the", "a", "an", "and", "or", "of", "for", "in", "at", "to", "with",
    "i", "ii", "iii", "role", "position", "opening", "hiring", "new",
}

_SENIOR_TITLE = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|architect|manager|director|head of|vp|chief)\b", re.I
)
_SENIOR_YOE = re.compile(r"\b([3-9]|1\d)\s*\+?\s*(?:-\s*\d+\s*)?(?:years?|yrs?)\b", re.I)


def _tokens(text: str) -> set:
    return {t for t in re.findall(r"[a-z0-9\+#\.]+", (text or "").lower()) if t not in _STOP and len(t) > 1}


def title_similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    overlap = len(ta & tb) / max(len(ta), 1)  # how much of the lead's role is covered
    seq = SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio()
    return 0.65 * overlap + 0.35 * seq


def match_best_job(jobs: List[dict], role_title: str, min_score: float = 0.55) -> Optional[dict]:
    """Return the posting closest to the lead's role, or None. Never blindly take jobs[0]."""
    best, best_score = None, 0.0
    for job in jobs or []:
        score = title_similarity(role_title, job.get("role_title", ""))
        if score > best_score:
            best, best_score = job, score
    return best if best is not None and best_score >= min_score else None


def lead_gate(company: str, role_title: str, location: str, text: str) -> Tuple[bool, str]:
    """Fresher / India-or-remote / sane-title gate for a lead. Returns (ok, reason)."""
    from app.services.job_validator import validate_role_title
    from app.services.job_fetcher import check_role_location_and_relocation

    ok, reason = validate_role_title(role_title or "", company or "")
    if not ok:
        return False, reason
    if _SENIOR_TITLE.search(role_title or ""):
        return False, f"Senior role not suitable for fresher: '{role_title}'"
    if _SENIOR_YOE.search(text or "") and not re.search(r"\b0\s*-\s*[1-2]\s*(?:years?|yrs?)\b", text or "", re.I):
        return False, "Requires 3+ years of experience"
    info = check_role_location_and_relocation(location or "", text or "")
    if info["is_abroad"] and not info["covers_relocation"]:
        return False, f"Abroad without relocation support: '{location}'"
    return True, "eligible"


def resolve_lead(company: str, role_title: str, location: str, submitted_url: str, source_text: str) -> Dict[str, Any]:
    """
    Full resolution pipeline for a single lead.
    Returns a dict with: status, verification_status, verified_url, relevance_explanation, confidence, best_job
    """
    from app.services.link_checker import resolve_redirects_and_detect_promo
    from app.api.research import discover_careers_url_and_ats
    from app.services.job_validator import is_valid_job_posting
    
    # 1. Base eligibility check
    if not company or not role_title:
        return {
            "status": InboxOpportunityStatus.INELIGIBLE,
            "verification_status": None,
            "verified_url": None,
            "relevance_explanation": "Missing company or role title",
            "confidence": 0.0,
            "best_job": None,
            "final_submitted_url": submitted_url
        }

    ok, reason = lead_gate(company, role_title, location, source_text)
    if not ok:
        return {
            "status": InboxOpportunityStatus.INELIGIBLE,
            "verification_status": None,
            "verified_url": None,
            "relevance_explanation": reason,
            "confidence": 0.0,
            "best_job": None,
            "final_submitted_url": submitted_url
        }

    # 2. Link checking and Promo detection
    final_url = submitted_url
    is_promo = False
    if submitted_url:
        resolution = resolve_redirects_and_detect_promo(submitted_url)
        final_url = resolution.get("final_url", submitted_url)
        is_promo = resolution.get("is_promo", False)

    if is_promo:
        return {
            "status": InboxOpportunityStatus.UNVERIFIED,
            "verification_status": VerificationStatus.PROMO_FUNNEL,
            "verified_url": None,
            "relevance_explanation": "Link appears to be a promotional funnel",
            "confidence": 0.2,
            "best_job": None,
            "final_submitted_url": final_url
        }

    # 3. Validation
    if final_url:
        valid_job, valid_reason = is_valid_job_posting(role_title, final_url, company)
        if not valid_job:
            return {
                "status": InboxOpportunityStatus.INELIGIBLE,
                "verification_status": None,
                "verified_url": None,
                "relevance_explanation": f"Invalid job posting: {valid_reason}",
                "confidence": 0.1,
                "best_job": None,
                "final_submitted_url": final_url
            }

    # 4. ATS Discovery & Verification
    discovery = discover_careers_url_and_ats(company, final_url)
    official_url = discovery.careers_url
    ats_info = discovery.ats_info
    
    verified_url = None
    status = InboxOpportunityStatus.PENDING
    verification_status = None
    confidence = 0.4
    
    if ats_info and official_url and final_url and official_url.split('/')[2] in final_url:
        verification_status = VerificationStatus.VERIFIED
        status = InboxOpportunityStatus.VERIFIED
        verified_url = final_url
        confidence = 0.9
        explanation = "Verified via official ATS link"
    elif final_url:
        verification_status = VerificationStatus.UNVERIFIED_THIRD_PARTY
        status = InboxOpportunityStatus.UNVERIFIED
        confidence = 0.6
        explanation = "Third-party link, requires manual check"
    else:
        verification_status = VerificationStatus.UNVERIFIED_THIRD_PARTY
        status = InboxOpportunityStatus.UNVERIFIED
        explanation = "No direct apply link provided"
        
    return {
        "status": status,
        "verification_status": verification_status,
        "verified_url": verified_url,
        "relevance_explanation": explanation,
        "confidence": confidence,
        "best_job": None,  # Will be populated by caller if fetch is needed
        "final_submitted_url": final_url,
        "ats_info": ats_info,
        "official_url": official_url
    }
