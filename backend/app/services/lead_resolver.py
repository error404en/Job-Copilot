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
_JUNIOR_YOE_RANGE = re.compile(r"\b[0-2]\s*(?:[-–]|to)\s*[1-3]\s*(?:years?|yrs?)\b", re.I)


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
    if _SENIOR_YOE.search(text or "") and not _JUNIOR_YOE_RANGE.search(text or ""):
        return False, "Requires 3+ years of experience"
    info = check_role_location_and_relocation(location or "", text or "")
    if info["is_abroad"] and not info["covers_relocation"]:
        return False, f"Abroad without relocation support: '{location}'"
    return True, "eligible"


def evaluate_lead_copilot_fit(company: str, role_title: str, qualification: str = "", source_text: str = "") -> Dict[str, Any]:
    """
    Copilot Triage Classifier: evaluates whether a lead matches Software / AI / Data / Tech Consulting
    career targets ('high_fit' | 'stretch' | 'off_target') and assigns a deterministic fit score.
    """
    r_low = (role_title or "").lower()
    q_low = (qualification or "").lower()
    t_low = (source_text or "").lower()
    if not q_low and "qualification" in t_low:
        for line in t_low.splitlines():
            if "qualification" in line:
                q_low = line
                break

    # 1. Off-Target Non-Tech Domains (HR, Recruiting, Marketing, Pure Commerce, Non-Engineering Service Desk)
    non_tech_roles = (
        "talent acquisition", "recruiter", "human resources", "hr intern",
        "resource management", "marketing intern", "social media", "copywriter",
        "service desk", "voice process", "telecaller", "sales executive",
    )
    if any(nt in r_low for nt in non_tech_roles):
        return {
            "copilot_fit": "off_target",
            "copilot_score": 22,
            "copilot_reason": f"Off-Target Domain: '{role_title}' is an HR, Recruiting, Marketing, or IT Support role outside Software/AI/Data/Consulting.",
        }

    # Check if qualification is strictly non-engineering (e.g. Commerce/Finance only or BCA/BCom/BA service desk)
    if ("commerce" in q_low or "finance" in q_low or "mba/pgdm in human resources" in q_low) and not any(
        eng in q_low for eng in ("engineering", "b.tech", "b-tech", "computer", "data science", "any graduate")
    ):
        return {
            "copilot_fit": "off_target",
            "copilot_score": 26,
            "copilot_reason": f"Degree Mismatch: Requires Commerce/Finance/HR degree rather than Computer Science / Engineering.",
        }

    if "bca" in q_low and "bcom" in q_low and "ba" in q_low and not ("b.tech" in q_low or "b-tech" in q_low or "engineering" in q_low):
        return {
            "copilot_fit": "off_target",
            "copilot_score": 28,
            "copilot_reason": "Off-Target Role: Non-engineering mass support track (BCA/BCom/BA).",
        }

    # 2. High-Fit Core Target Roles (Software, SDE, AI/ML, Data Science/Engineering/Analytics, Tech Consulting, QA)
    core_high_fit = (
        "software development engineer", "software engineer", "sde", "ai-native",
        "artificial intelligence", "machine learning", "genai", "data scientist",
        "data engineer", "data analyst", "technology consulting", "business technology",
        "btsa", "backend", "full stack", "fullstack", "frontend", "android",
        "qa engineer", "software testing", "test engineer", "sdet", "automation engineer",
        "cloud engineer", "devops",
    )
    if any(kw in r_low for kw in core_high_fit):
        score = 88
        if any(top in r_low for top in ("software development engineer", "ai-native", "technology consulting", "data engineer", "software engineer")):
            score = 91
        elif "qa" in r_low or "testing" in r_low:
            score = 80
        return {
            "copilot_fit": "high_fit",
            "copilot_score": score,
            "copilot_reason": f"High-Fit Target Role: Directly matches your Software, AI, Data & Tech Consulting profile ({score}% affinity).",
        }

    # 3. Stretch / Secondary Technical-Adjacent Roles (Campus Program, Deployment, Software Testing, Associate Analyst)
    stretch_keywords = ("testing", "campus program", "deployment", "associate analyst", "analyst", "trainee", "graduate")
    if any(sk in r_low for sk in stretch_keywords) or "engineering" in q_low or "b-tech" in q_low or "computer science" in q_low:
        score = 76 if "testing" in r_low or "campus program" in r_low else 68
        return {
            "copilot_fit": "stretch",
            "copilot_score": score,
            "copilot_reason": f"Stretch / General Tech Role: Eligible graduate track ({score}% affinity) — review JD specialization.",
        }

    return {
        "copilot_fit": "stretch",
        "copilot_score": 62,
        "copilot_reason": "General community lead — verify role specialization before applying.",
    }


def resolve_lead(company: str, role_title: str, location: str, submitted_url: str, source_text: str) -> Dict[str, Any]:
    """
    Full resolution pipeline for a single lead.
    Returns a dict with: status, verification_status, verified_url, relevance_explanation, confidence, best_job
    """
    from app.services.link_checker import resolve_redirects_and_detect_promo
    from app.api.research import discover_careers_url_and_ats
    from app.services.job_validator import is_valid_job_posting
    from app.services.careers_resolver import classify_careers_url
    
    # 1. Base eligibility check
    if not company or not role_title:
        return {
            "status": InboxOpportunityStatus.INELIGIBLE,
            "verification_status": None,
            "verified_url": None,
            "relevance_explanation": "Missing company or role title",
            "confidence": 0.0,
            "best_job": None,
            "final_submitted_url": submitted_url,
            "extracted_jd": None,
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
            "final_submitted_url": submitted_url,
            "extracted_jd": None,
        }

    # 2. Link checking, Community Wrapper Unwrapping, and Promo detection
    final_url = submitted_url
    is_promo = False
    extracted_jd = None
    if submitted_url:
        resolution = resolve_redirects_and_detect_promo(submitted_url)
        final_url = resolution.get("final_url", submitted_url)
        is_promo = resolution.get("is_promo", False)
        extracted_jd = resolution.get("extracted_jd")

    if is_promo:
        return {
            "status": InboxOpportunityStatus.UNVERIFIED,
            "verification_status": VerificationStatus.PROMO_FUNNEL,
            "verified_url": None,
            "relevance_explanation": "Link appears to be a promotional funnel",
            "confidence": 0.2,
            "best_job": None,
            "final_submitted_url": final_url,
            "extracted_jd": extracted_jd,
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
                "final_submitted_url": final_url,
                "extracted_jd": extracted_jd,
            }

    # 4. ATS Discovery & Verification
    discovery = discover_careers_url_and_ats(company, final_url)
    official_url = discovery.careers_url
    ats_info = discovery.ats_info
    
    verified_url = None
    status = InboxOpportunityStatus.PENDING
    verification_status = None
    confidence = 0.4
    
    is_official_or_ats, url_kind = classify_careers_url(final_url, company) if final_url else (False, "")

    if (ats_info and official_url and final_url and official_url.split('/')[2] in final_url) or is_official_or_ats:
        verification_status = VerificationStatus.VERIFIED
        status = InboxOpportunityStatus.VERIFIED
        verified_url = final_url
        confidence = 0.9 if (ats_info or url_kind == "ats") else 0.85
        explanation = "Verified via official ATS link" if (ats_info or url_kind == "ats") else "Verified official company careers portal"
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
        "official_url": official_url,
        "extracted_jd": extracted_jd,
    }
