"""
Company Application Cooldown & Re-application Policy Registry
Tracks hiring policies of companies that cap or throttle application frequency
(e.g., Google's 90-day cooldown policy, Meta's 180-day rule, etc.).
"""

import re
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
from app.db.supabase_client import supabase

# Comprehensive registry of known company application throttling & cooldown rules
COMPANY_COOLDOWN_REGISTRY = {
    "google": {
        "company_name": "Google / Alphabet",
        "cooldown_days": 90,
        "policy_type": "standard_90d",
        "description": "Google enforces a 90-day cooldown period per role/family from the date of application. If rejected post-interview, technical roles may have a 180-day or 1-year waiting period.",
        "max_simultaneous_apps": 3,
        "recommendation": "Submit only your strongest, best-tailored resume. Maximize your score before applying, as you cannot re-apply for 90 days.",
    },
    "meta": {
        "company_name": "Meta / Facebook",
        "cooldown_days": 180,
        "policy_type": "strict_180d",
        "description": "Meta requires a 180-day (6-month) cooldown between interview rounds for the same role family, and recommends waiting 6 months between general applications.",
        "max_simultaneous_apps": 3,
        "recommendation": "Meta enforces strict candidate tracking across Greenhouse/internal ATS. Ensure full alignment with level guidelines before applying.",
    },
    "amazon": {
        "company_name": "Amazon",
        "cooldown_days": 180,
        "policy_type": "interview_180d",
        "description": "Amazon mandates a 6-month (180-day) cooldown after phone screens or full-loop on-sites before re-interviewing for the same job family.",
        "max_simultaneous_apps": 4,
        "recommendation": "Amazon allows concurrent applications to distinct job IDs, but interview-loop cooldowns apply broadly to software engineering families.",
    },
    "microsoft": {
        "company_name": "Microsoft",
        "cooldown_days": 90,
        "policy_type": "advisory_90d",
        "description": "Microsoft recommends waiting at least 90 days between applications for identical requisitions, and 6 months if an interview was not successful.",
        "max_simultaneous_apps": 5,
        "recommendation": "Target specific teams and align required skills closely with the requisition job ID.",
    },
    "apple": {
        "company_name": "Apple",
        "cooldown_days": 180,
        "policy_type": "advisory_180d",
        "description": "Apple recruiters advise waiting 6 months before re-applying to the same hardware/software org after an interview.",
        "max_simultaneous_apps": 5,
        "recommendation": "Individual Apple organizations hire semi-independently, but recruiters share candidate history notes.",
    },
    "goldmansachs": {
        "company_name": "Goldman Sachs",
        "cooldown_days": 180,
        "policy_type": "cycle_cap",
        "description": "Goldman Sachs limits candidates to 3 applications per hiring year/cycle. Applications beyond 3 are automatically disqualified.",
        "max_simultaneous_apps": 3,
        "recommendation": "Carefully pick your top 3 division preferences; changing applications once submitted is restricted.",
    },
    "uber": {
        "company_name": "Uber",
        "cooldown_days": 180,
        "policy_type": "strict_180d",
        "description": "Uber enforces a 6-month cooldown for technical and engineering interviews.",
        "max_simultaneous_apps": 3,
        "recommendation": "Ensure system design and DSA readiness before applying to engineering roles.",
    },
    "netflix": {
        "company_name": "Netflix",
        "cooldown_days": 180,
        "policy_type": "strict_180d",
        "description": "Netflix adheres to a 6-month to 1-year cooldown for engineering positions.",
        "max_simultaneous_apps": 2,
        "recommendation": "Netflix hires primarily for senior and staff levels; culture alignment is heavily weighted.",
    },
    "stripe": {
        "company_name": "Stripe",
        "cooldown_days": 180,
        "policy_type": "strict_180d",
        "description": "Stripe implements a 6-month waiting period between technical interviews.",
        "max_simultaneous_apps": 2,
        "recommendation": "Stripe practical coding rounds require high fluency in real-world development environments.",
    },
    "salesforce": {
        "company_name": "Salesforce",
        "cooldown_days": 180,
        "policy_type": "advisory_180d",
        "description": "Salesforce recommends 6 months between applications for similar technical titles.",
        "max_simultaneous_apps": 3,
        "recommendation": "Tailor to specific business units (e.g. MuleSoft, Tableau, Core Cloud).",
    },
    "mckinsey": {
        "company_name": "McKinsey & Company",
        "cooldown_days": 365,
        "policy_type": "strict_365d",
        "description": "McKinsey enforces a strict 1-year (12-month) cooldown policy following an interview rejection before re-applying.",
        "max_simultaneous_apps": 1,
        "recommendation": "Preparation is paramount: you have one attempt per calendar year.",
    },
    "bcg": {
        "company_name": "Boston Consulting Group (BCG)",
        "cooldown_days": 365,
        "policy_type": "strict_365d",
        "description": "BCG enforces a 1-year waiting period between interview rounds.",
        "max_simultaneous_apps": 1,
        "recommendation": "Apply only when ready for the Casey chatbot and case study interviews.",
    },
    "bain": {
        "company_name": "Bain & Company",
        "cooldown_days": 365,
        "policy_type": "strict_365d",
        "description": "Bain requires a 12-to-18 month waiting period before re-applying after an interview.",
        "max_simultaneous_apps": 1,
        "recommendation": "Strict cooldown. Ensure consulting and tech consulting skills are verified.",
    },
    "databricks": {
        "company_name": "Databricks",
        "cooldown_days": 180,
        "policy_type": "strict_180d",
        "description": "Databricks enforces a 6-month cooldown for technical engineering roles.",
        "max_simultaneous_apps": 2,
        "recommendation": "Heavy emphasis on distributed systems, Apache Spark, and algorithmic precision.",
    },
    "atlassian": {
        "company_name": "Atlassian",
        "cooldown_days": 180,
        "policy_type": "strict_180d",
        "description": "Atlassian enforces a 6-month cooldown policy for interview loops across Jira, Confluence, and Cloud infra.",
        "max_simultaneous_apps": 3,
        "recommendation": "Review Atlassian's core values and collaborative interview rubric.",
    },
    "adobe": {
        "company_name": "Adobe",
        "cooldown_days": 180,
        "policy_type": "advisory_180d",
        "description": "Adobe recommends waiting 6 months between technical interview cycles.",
        "max_simultaneous_apps": 3,
        "recommendation": "Ensure portfolio or GitHub code samples reflect product-level polish.",
    },
}


def _normalize_company_key(name: str) -> str:
    """Strip spaces, punctuation, and corporate suffixes for robust matching."""
    cleaned = re.sub(r"\b(pvt|ltd|limited|llc|inc|corp|corporation|technologies|company|india|labs)\b", "", name, flags=re.I)
    return re.sub(r"[^a-zA-Z0-9]", "", cleaned).lower()


def get_company_cooldown_policy(company_name: str) -> Optional[dict]:
    """
    Looks up whether a company enforces an application cooldown or capping policy.
    Matches exact keys and substring/token variants.
    """
    if not company_name:
        return None

    norm = _normalize_company_key(company_name)

    # 1. Exact match in registry
    if norm in COMPANY_COOLDOWN_REGISTRY:
        return COMPANY_COOLDOWN_REGISTRY[norm]

    # 2. Check if known key is in normalized name or vice-versa
    for key, data in COMPANY_COOLDOWN_REGISTRY.items():
        if key in norm or norm in key:
            return data

    return None


def check_user_cooldown_status(user_id: str, company_name: str) -> dict:
    """
    Cross-checks the candidate's application history in the database against
    the company's cooldown policy to determine whether the user is currently
    within a restricted re-application window.
    """
    policy = get_company_cooldown_policy(company_name)
    if not policy:
        return {
            "has_policy": False,
            "is_in_cooldown": False,
            "company_name": company_name,
            "policy": None,
        }

    cooldown_days = policy["cooldown_days"]

    # Query user's applications for this company
    try:
        res = (
            supabase.table("applications")
            .select("id, status, created_at, updated_at, company, role_title, jobs(company, role_title)")
            .eq("user_id", user_id)
            .execute()
        )
        apps = res.data or []
    except Exception:
        apps = []

    norm_target = _normalize_company_key(company_name)
    matching_apps = []

    for a in apps:
        app_company = a.get("company") or (a.get("jobs") or {}).get("company") or ""
        if _normalize_company_key(app_company) == norm_target or norm_target in _normalize_company_key(app_company):
            # Only count actual applications (applied, interview, offer, rejected) - not saved
            status = (a.get("status") or "").lower()
            if status in ["applied", "interview", "offer", "rejected"]:
                matching_apps.append(a)

    if not matching_apps:
        return {
            "has_policy": True,
            "is_in_cooldown": False,
            "company_name": policy["company_name"],
            "policy": policy,
            "last_applied_date": None,
            "days_since_applied": None,
            "days_remaining": 0,
            "eligible_date": None,
            "message": f"{policy['company_name']} enforces a {cooldown_days}-day re-application policy. No prior applications found.",
        }

    # Sort to find the most recent application date
    def _get_app_time(a):
        date_str = a.get("created_at") or a.get("updated_at")
        if not date_str:
            return datetime.min.replace(tzinfo=timezone.utc)
        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        except Exception:
            return datetime.min.replace(tzinfo=timezone.utc)

    matching_apps.sort(key=_get_app_time, reverse=True)
    latest_app = matching_apps[0]
    latest_time = _get_app_time(latest_app)

    now = datetime.now(timezone.utc)
    delta_days = (now - latest_time).days
    is_in_cooldown = delta_days < cooldown_days
    days_remaining = max(0, cooldown_days - delta_days)
    eligible_date = (latest_time + timedelta(days=cooldown_days)).strftime("%b %d, %Y")

    role_applied = latest_app.get("role_title") or (latest_app.get("jobs") or {}).get("role_title") or "Previous Role"

    return {
        "has_policy": True,
        "is_in_cooldown": is_in_cooldown,
        "company_name": policy["company_name"],
        "policy": policy,
        "last_applied_date": latest_time.strftime("%b %d, %Y"),
        "role_applied": role_applied,
        "days_since_applied": delta_days,
        "days_remaining": days_remaining,
        "eligible_date": eligible_date,
        "message": (
            f"⚠️ Application Cooldown Active: You applied to {policy['company_name']} {delta_days} days ago ({role_applied}). "
            f"Per their {cooldown_days}-day capping policy, you are eligible to re-apply on {eligible_date} ({days_remaining} days remaining)."
            if is_in_cooldown
            else f"Eligible to apply: {delta_days} days have passed since your last application to {policy['company_name']} (cooldown was {cooldown_days} days)."
        ),
    }
