from fastapi import APIRouter, HTTPException, Depends, Request
from typing import Optional
import json
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import limiter
from app.api.profile import get_or_create_user_profile

router = APIRouter()


def _generate_universal_autofill_js(payload: dict) -> str:
    """
    Generates a self-contained browser JS snippet that fills Greenhouse, Lever, Ashby,
    Workday, SmartRecruiters, Keka, Yello, MyNextHire, Superset, and standard HTML5 inputs
    using React/Vue-compatible native value setters.
    """
    safe_json = json.dumps({
        "first_name": payload.get("first_name") or "",
        "last_name": payload.get("last_name") or "",
        "full_name": payload.get("full_name") or "",
        "email": payload.get("email") or "",
        "phone": payload.get("phone") or "",
        "location": payload.get("location") or "",
        "linkedin_url": payload.get("linkedin_url") or "",
        "github_url": payload.get("github_url") or "",
        "portfolio_url": payload.get("portfolio_url") or "",
        "cover_letter": payload.get("cover_letter") or "",
        "why_company_pitch": payload.get("why_company_pitch") or "",
    })
    return f"""(function(){{
  const d = {safe_json};
  const setVal = (el, val) => {{
    if (!el || !val) return false;
    try {{
      const proto = Object.getPrototypeOf(el);
      const setter = (Object.getOwnPropertyDescriptor(proto, 'value') || Object.getOwnPropertyDescriptor(el, 'value'))?.set;
      if (setter) setter.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', {{ bubbles: true }}));
      el.dispatchEvent(new Event('change', {{ bubbles: true }}));
      el.dispatchEvent(new Event('blur', {{ bubbles: true }}));
      el.style.outline = '2px solid #10b981';
      el.style.backgroundColor = 'rgba(16, 185, 129, 0.08)';
      return true;
    }} catch (e) {{ return false; }}
  }};
  let count = 0;
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea'));
  for (const el of inputs) {{
    if (el.value && el.value.trim().length > 0) continue;
    const labelEl = el.id ? document.querySelector(`label[for="${{CSS.escape(el.id)}}"]`) : el.closest('label');
    const hint = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.getAttribute('autocomplete'), el.getAttribute('data-automation-id'), labelEl?.innerText].filter(Boolean).join(' ').toLowerCase();
    if (el.tagName === 'TEXTAREA') {{
      if (/cover|letter|additional|comment|note|summary/i.test(hint) && d.cover_letter) {{ if (setVal(el, d.cover_letter)) count++; }}
      else if (/why|interest|motivat|fit/i.test(hint) && d.why_company_pitch) {{ if (setVal(el, d.why_company_pitch)) count++; }}
      continue;
    }}
    if (/first.*name|given.*name|fname|legalnametablesection.*first/i.test(hint)) {{ if (setVal(el, d.first_name)) count++; }}
    else if (/last.*name|family.*name|surname|lname|legalnametablesection.*last/i.test(hint)) {{ if (setVal(el, d.last_name)) count++; }}
    else if ((/\\bname\\b|full.*name|candidate.*name/i.test(hint)) && !/company|school|university|refer|employer/i.test(hint)) {{ if (setVal(el, d.full_name)) count++; }}
    else if (el.type === 'email' || /email|e-mail/i.test(hint)) {{ if (setVal(el, d.email)) count++; }}
    else if (el.type === 'tel' || /phone|mobile|contact.*number|cell/i.test(hint)) {{ if (setVal(el, d.phone)) count++; }}
    else if (/linkedin/i.test(hint)) {{ if (setVal(el, d.linkedin_url)) count++; }}
    else if (/github|git/i.test(hint)) {{ if (setVal(el, d.github_url)) count++; }}
    else if (/portfolio|website|personal.*url|blog/i.test(hint)) {{ if (setVal(el, d.portfolio_url || d.github_url)) count++; }}
    else if (/city|current.*location|address/i.test(hint)) {{ if (setVal(el, d.location)) count++; }}
  }}
  const toast = document.createElement('div');
  toast.innerText = `⚡ JobCopilot Auto-Filled ${{count}} field(s)! Review & click Submit when ready.`;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#09090b;color:#34d399;border:1px solid #10b981;padding:12px 18px;border-radius:12px;font-family:system-ui,sans-serif;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.45);';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}})();"""


def build_autofill_packet(user_id: str, url: Optional[str] = None, job_id: Optional[str] = None) -> dict:
    """
    Synthesizes the complete Copilot Auto-Fill kit for a user and target job:
    1. Enriches candidate profile with identity extracted from uploaded resumes if any fields are blank.
    2. Resolves target job, recommended resume version, and matched technical keywords.
    3. Retrieves or generates a role-specific Cover Letter & 'Why This Company' pitch.
    4. Builds a universal 1-click Auto-Fill JS snippet and Bookmarklet.
    """
    profile = get_or_create_user_profile(user_id)

    first_name = (profile.get("first_name") or "").strip()
    last_name = (profile.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    email = (profile.get("email") or "").strip()
    phone = (profile.get("phone") or "").strip()
    location = (profile.get("base_location") or "Bengaluru, India").strip()
    linkedin_url = (profile.get("linkedin_url") or "").strip()
    github_url = (profile.get("github_url") or "").strip()
    portfolio_url = (profile.get("portfolio_url") or "").strip()

    # Fetch user's resumes for fallback skills & recommended resume lookup
    resumes_res = supabase.table("resume_versions").select("id, title, target_type, skills_summary").eq("user_id", user_id).order("created_at", desc=True).execute()
    resumes = resumes_res.data or []
    default_resume_title = resumes[0]["title"] if resumes else "Primary Software Engineering Resume"
    default_resume_id = resumes[0]["id"] if resumes else None

    # Resolve target job by job_id or URL
    job_row = None
    if job_id and job_id != "unknown":
        j_res = supabase.table("jobs").select("*, job_analyses(*)").eq("id", job_id).eq("user_id", user_id).limit(1).execute()
        if j_res.data:
            job_row = j_res.data[0]

    if not job_row and url:
        clean_url = url.split("?")[0]
        j_res = supabase.table("jobs").select("*, job_analyses(*)").eq("user_id", user_id).ilike("url", f"%{clean_url}%").limit(1).execute()
        if j_res.data:
            job_row = j_res.data[0]

    company = (job_row.get("company") if job_row else None) or "the organization"
    role_title = (job_row.get("role_title") if job_row else None) or "Software Engineer"
    apply_url = (job_row.get("official_apply_url") or job_row.get("url") if job_row else None) or url or ""
    resolved_job_id = job_row.get("id") if job_row else job_id

    recommended_resume_title = default_resume_title
    recommended_resume_id = default_resume_id
    matched_skills = []

    if job_row and job_row.get("job_analyses"):
        analysis = job_row["job_analyses"][0]
        matched_skills = analysis.get("matched_keywords") or []
        rec_id = analysis.get("recommended_resume_version_id")
        if rec_id:
            recommended_resume_id = rec_id
            for r in resumes:
                if r["id"] == rec_id:
                    recommended_resume_title = r["title"]
                    break

    if not matched_skills and job_row and job_row.get("required_skills"):
        matched_skills = job_row["required_skills"][:6]
    if not matched_skills:
        matched_skills = ["Python", "SQL", "Software Engineering", "APIs", "Cloud"]

    # Check if there is a saved cover letter draft for this job
    cover_letter = ""
    if resolved_job_id and resolved_job_id != "unknown":
        try:
            draft_res = supabase.table("application_drafts").select("cover_letter_text").eq("job_id", resolved_job_id).eq("user_id", user_id).order("generated_at", desc=True).limit(1).execute()
            if draft_res.data and draft_res.data[0].get("cover_letter_text"):
                cover_letter = draft_res.data[0]["cover_letter_text"]
        except Exception:
            pass

    skills_str = ", ".join(matched_skills[:5])
    candidate_signoff = full_name or "Candidate"

    if not cover_letter:
        cover_letter = (
            f"Dear Hiring Team at {company},\n\n"
            f"I am excited to apply for the {role_title} position at {company}. "
            f"With hands-on experience building production systems using {skills_str}, "
            f"I have consistently delivered clean, scalable solutions aligned with modern engineering standards.\n\n"
            f"What draws me to {company} is the opportunity to contribute directly to high-impact products while collaborating with a strong technical team. "
            f"I have attached my resume ({recommended_resume_title}) and would welcome the opportunity to discuss how my background aligns with your current needs.\n\n"
            f"Best regards,\n{candidate_signoff}"
            + (f"\n{email}" if email else "")
            + (f" | {phone}" if phone else "")
        )

    why_company_pitch = (
        f"I am strongly interested in the {role_title} role at {company} because my technical foundation in {skills_str} "
        f"aligns directly with the core responsibilities of this team. I thrive in fast-paced engineering environments and am eager to make an immediate impact."
    )

    base_payload = {
        "enabled": True,
        "job_id": resolved_job_id,
        "company": company,
        "role_title": role_title,
        "apply_url": apply_url,
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "location": location,
        "linkedin_url": linkedin_url,
        "github_url": github_url,
        "portfolio_url": portfolio_url,
        "recommended_resume_id": recommended_resume_id,
        "recommended_resume_title": recommended_resume_title,
        "matched_skills": matched_skills[:8],
        "cover_letter": cover_letter,
        "why_company_pitch": why_company_pitch,
    }

    js_code = _generate_universal_autofill_js(base_payload)
    base_payload["autofill_script"] = js_code
    # Single-line bookmarklet URL
    compact_js = " ".join(line.strip() for line in js_code.splitlines() if line.strip())
    base_payload["bookmarklet_url"] = f"javascript:{compact_js}"

    return base_payload


@router.get("/data")
@limiter.limit("60/minute")
def get_auto_apply_data(request: Request, url: str = "", job_id: Optional[str] = None, user_id: str = Depends(get_current_user)):
    """
    Fetches the user profile, resume-enriched identity tokens, recommended resume version,
    tailored cover letter, and universal auto-fill script for any job URL or job ID.
    Used by both the Chrome Extension and the Web App Auto-Fill Launchpad.
    """
    return build_autofill_packet(user_id=user_id, url=url, job_id=job_id)

