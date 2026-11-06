from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import json
import re
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import limiter
from app.api.profile import get_or_create_user_profile, extract_identity_from_resume_text
from app.services.llm_client import _try_groq_json, get_completion, generate_tailoring_text

router = APIRouter()


class QuestionItem(BaseModel):
    id: str
    label: str
    placeholder: Optional[str] = None
    field_type: Optional[str] = "text"
    options: Optional[List[str]] = None
    max_length: Optional[int] = None


class SolveQuestionsRequest(BaseModel):
    url: Optional[str] = ""
    company: Optional[str] = ""
    role_title: Optional[str] = ""
    job_id: Optional[str] = None
    questions: List[QuestionItem]


def extract_candidate_extended_meta(raw_content: str, profile: dict) -> dict:
    """
    Extracts deep ATS candidate metadata (Education, Experience, Compensation,
    Work Auth, and EEO defaults) from profile settings and parsed resume text.
    """
    meta = {
        "school": "Jaypee Institute of Information Technology (JIIT), Noida",
        "degree": "Bachelor of Technology (B.Tech)",
        "major": "Computer Science & Engineering",
        "grad_year": "2027",
        "gpa": "8.5",
        "current_company": "Jaypee Institute of Information Technology",
        "current_title": "Software Development Engineer (Backend & Applied AI)",
        "years_of_experience": "1",
        "notice_period": "Immediate / 15 Days",
        "expected_salary": str(profile.get("pay_floor_ncr_remote") or "12,00,000"),
        "current_salary": "0",
        "currency": "INR (₹)",
        "authorized_to_work": "Yes",
        "requires_sponsorship": "No",
        "is_adult_18": "Yes",
        "willing_to_relocate": "Yes",
        "previously_employed_here": "No",
        "gender": "Male",
        "race_ethnicity": "Asian",
        "veteran_status": "Not a veteran",
        "disability_status": "No disability",
        "source": "LinkedIn"
    }

    if profile.get("graduation_date"):
        meta["grad_year"] = str(profile.get("graduation_date"))[:4]

    if not raw_content:
        return meta

    # 1. School / University
    for line in raw_content.splitlines():
        line_str = line.strip()
        if any(k in line_str.lower() for k in ["university", "institute", "college"]):
            cleaned = re.sub(r'[\d–\-\s]+20\d\d.*$', '', line_str).strip(' ,-\t|•')
            if len(cleaned) > 5 and not any(skip in cleaned.lower() for skip in ["b.tech", "degree", "education", "courses", "skills", "event"]):
                meta["school"] = cleaned
                break

    # 2. Degree
    deg_match = re.search(r'\b(B\.?Tech|B\.?E\.?|B\.?S\.?|Bachelor(?:\'s)?(?:\s+of\s+[\w\s]+)?|M\.?Tech|Master(?:\'s)?)\b', raw_content, re.IGNORECASE)
    if deg_match:
        meta["degree"] = deg_match.group(0).strip()

    # 3. Major
    maj_match = re.search(r'(?:Computer Science(?:\s+and\s+Engineering|\s+specialization)?|Information Technology|Data Science|Electronics(?:\s+&\s+Communication)?)', raw_content, re.IGNORECASE)
    if maj_match:
        meta["major"] = maj_match.group(0).strip()

    # 4. Grad year
    if not profile.get("graduation_date"):
        year_match = re.search(r'\b(202[4-9])\b', raw_content)
        if year_match:
            meta["grad_year"] = year_match.group(0).strip()

    # 5. Headline / Current Title
    for line in raw_content.splitlines()[:5]:
        line_str = line.strip()
        if any(t in line_str.lower() for t in ["engineer", "developer", "scientist", "analyst"]):
            parts = [p.strip() for p in line_str.split('|') if any(t in p.lower() for t in ["engineer", "developer", "scientist", "analyst"])]
            if parts:
                meta["current_title"] = parts[0]
                break

    return meta


def _generate_universal_autofill_js(payload: dict) -> str:
    """
    Generates an intelligent self-contained browser JS snippet that reads any ATS page
    and automatically populates inputs, textareas, selects, radio groups, and checkboxes
    using native React/Vue/Angular property setters.
    """
    safe_json = json.dumps({
        "first_name": payload.get("first_name") or "",
        "last_name": payload.get("last_name") or "",
        "full_name": payload.get("full_name") or "",
        "email": payload.get("email") or "",
        "phone": payload.get("phone") or "",
        "location": payload.get("location") or "",
        "city": payload.get("city") or "",
        "state": payload.get("state") or "",
        "country": payload.get("country") or "India",
        "postal_code": payload.get("postal_code") or "201301",
        "linkedin_url": payload.get("linkedin_url") or "",
        "github_url": payload.get("github_url") or "",
        "portfolio_url": payload.get("portfolio_url") or "",
        "school": payload.get("school") or "",
        "degree": payload.get("degree") or "",
        "major": payload.get("major") or "",
        "grad_year": payload.get("grad_year") or "2027",
        "gpa": payload.get("gpa") or "8.5",
        "current_company": payload.get("current_company") or "",
        "current_title": payload.get("current_title") or "",
        "years_of_experience": payload.get("years_of_experience") or "1",
        "notice_period": payload.get("notice_period") or "Immediate / 15 Days",
        "expected_salary": payload.get("expected_salary") or "12,00,000",
        "currency": payload.get("currency") or "INR",
        "cover_letter": payload.get("cover_letter") or "",
        "why_company_pitch": payload.get("why_company_pitch") or "",
    })

    return f"""(function(){{
  const d = {safe_json};
  const setVal = (el, val) => {{
    if (!el || val === undefined || val === null || val === '') return false;
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

  const getHint = (el) => {{
    const labelEl = el.id ? document.querySelector(`label[for="${{CSS.escape(el.id)}}"]`) : el.closest('label');
    const container = el.closest('.field, .form-group, fieldset, [data-automation-id], .application-question');
    const containerText = container ? container.innerText.slice(0, 200) : '';
    return [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute('aria-label'),
      el.getAttribute('aria-labelledby'),
      el.getAttribute('autocomplete'),
      el.getAttribute('data-automation-id'),
      labelEl ? labelEl.innerText : '',
      containerText
    ].filter(Boolean).join(' ').toLowerCase();
  }};

  let count = 0;

  // 1. Inputs & Textareas
  const textInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]), textarea'));
  for (const el of textInputs) {{
    if (el.value && el.value.trim().length > 0) continue;
    const hint = getHint(el);

    if (el.tagName === 'TEXTAREA') {{
      if (/cover|letter|additional|comment|note|summary/i.test(hint) && d.cover_letter) {{ if (setVal(el, d.cover_letter)) count++; }}
      else if (/why|interest|motivat|fit|value/i.test(hint) && (d.why_company_pitch || d.cover_letter)) {{ if (setVal(el, d.why_company_pitch || d.cover_letter)) count++; }}
      continue;
    }}

    // Identity
    if (/first.*name|given.*name|fname|legalnametablesection.*first/i.test(hint)) {{ if (setVal(el, d.first_name)) count++; }}
    else if (/last.*name|family.*name|surname|lname|legalnametablesection.*last/i.test(hint)) {{ if (setVal(el, d.last_name)) count++; }}
    else if (/\\bname\\b|full.*name|candidate.*name/i.test(hint) && !/company|school|university|refer|employer|friend/i.test(hint)) {{ if (setVal(el, d.full_name)) count++; }}
    else if (el.type === 'email' || /email|e-mail/i.test(hint)) {{ if (setVal(el, d.email)) count++; }}
    else if (el.type === 'tel' || /phone|mobile|contact.*number|cell/i.test(hint)) {{ if (setVal(el, d.phone)) count++; }}
    
    // Links
    else if (/linkedin/i.test(hint)) {{ if (setVal(el, d.linkedin_url)) count++; }}
    else if (/github|git/i.test(hint)) {{ if (setVal(el, d.github_url)) count++; }}
    else if (/portfolio|personal.*url|website|blog/i.test(hint)) {{ if (setVal(el, d.portfolio_url || d.github_url)) count++; }}

    // Location
    else if (/city|current.*location/i.test(hint)) {{ if (setVal(el, d.city || d.location)) count++; }}
    else if (/state|province|region/i.test(hint)) {{ if (setVal(el, d.state)) count++; }}
    else if (/postal|zip|pincode/i.test(hint)) {{ if (setVal(el, d.postal_code)) count++; }}
    else if (/address/i.test(hint) && !/email/i.test(hint)) {{ if (setVal(el, d.location)) count++; }}

    // Education
    else if (/school|university|college|institution/i.test(hint)) {{ if (setVal(el, d.school)) count++; }}
    else if (/degree|qualification/i.test(hint)) {{ if (setVal(el, d.degree)) count++; }}
    else if (/major|discipline|field.*study/i.test(hint)) {{ if (setVal(el, d.major)) count++; }}
    else if (/grad.*year|end.*date|completion.*year/i.test(hint)) {{ if (setVal(el, d.grad_year)) count++; }}
    else if (/gpa|cgpa|grade|percentage/i.test(hint)) {{ if (setVal(el, d.gpa)) count++; }}

    // Experience & Comp
    else if (/current.*company|recent.*company|employer/i.test(hint)) {{ if (setVal(el, d.current_company)) count++; }}
    else if (/current.*title|job.*title|designation/i.test(hint)) {{ if (setVal(el, d.current_title)) count++; }}
    else if (/years.*exp|total.*exp/i.test(hint)) {{ if (setVal(el, d.years_of_experience)) count++; }}
    else if (/notice.*period|availability/i.test(hint)) {{ if (setVal(el, d.notice_period)) count++; }}
    else if (/expected.*salary|expected.*ctc|salary.*expectation/i.test(hint)) {{ if (setVal(el, d.expected_salary)) count++; }}
  }}

  // 2. Select Dropdowns
  const selects = Array.from(document.querySelectorAll('select'));
  for (const sel of selects) {{
    const hint = getHint(sel);
    const options = Array.from(sel.options);
    let matchedIndex = -1;

    if (/country/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /india/i.test(o.text || o.value));
    }} else if (/authoriz|right.*to.*work|eligible.*work/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /^yes\\b|authorized/i.test(o.text || o.value));
    }} else if (/sponsor|visa/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /^no\\b|not.*require|will.*not/i.test(o.text || o.value));
    }} else if (/gender|sex/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /male|man/i.test(o.text || o.value)) || options.findIndex(o => /decline|prefer.*not/i.test(o.text || o.value));
    }} else if (/veteran/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /not.*veteran|i am not/i.test(o.text || o.value)) || options.findIndex(o => /decline/i.test(o.text || o.value));
    }} else if (/disability/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /no.*disability|do not have/i.test(o.text || o.value)) || options.findIndex(o => /decline/i.test(o.text || o.value));
    }} else if (/hear.*about|source/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /linkedin|job.*board|company.*site/i.test(o.text || o.value));
    }} else if (/notice.*period/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /immediate|<.*30|15.*days|1.*month/i.test(o.text || o.value));
    }} else if (/degree|education/i.test(hint)) {{
      matchedIndex = options.findIndex(o => /bachelor|undergraduate|b\\.tech/i.test(o.text || o.value));
    }}

    if (matchedIndex > 0) {{
      sel.selectedIndex = matchedIndex;
      sel.dispatchEvent(new Event('change', {{ bubbles: true }}));
      sel.style.outline = '2px solid #10b981';
      count++;
    }}
  }}

  // 3. Radio Buttons (Work Auth, Sponsorship, Relocation, 18+)
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  const radioGroups = {{}};
  for (const r of radios) {{
    const key = r.name || r.id;
    if (!radioGroups[key]) radioGroups[key] = [];
    radioGroups[key].push(r);
  }}

  for (const key in radioGroups) {{
    const group = radioGroups[key];
    const groupHint = group.map(r => getHint(r)).join(' ');
    let targetPattern = null;

    if (/authoriz|right.*to.*work|18.*years|relocate|hybrid|consent/i.test(groupHint)) {{
      targetPattern = /^yes\\b|authorized|agree/i;
    }} else if (/sponsor|visa|previously.*worked|convicted/i.test(groupHint)) {{
      targetPattern = /^no\\b|not.*require|never/i;
    }}

    if (targetPattern) {{
      for (const r of group) {{
        const rHint = getHint(r);
        if (targetPattern.test(rHint) || targetPattern.test(r.value)) {{
          if (!r.checked) {{
            r.checked = true;
            r.dispatchEvent(new Event('change', {{ bubbles: true }}));
            r.dispatchEvent(new Event('click', {{ bubbles: true }}));
            count++;
          }}
          break;
        }}
      }}
    }}
  }}

  // 4. Consent / Terms Checkboxes
  const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
  for (const cb of checkboxes) {{
    const hint = getHint(cb);
    if (/terms|privacy|consent|agree|acknowledge|certify/i.test(hint) && !cb.checked) {{
      cb.checked = true;
      cb.dispatchEvent(new Event('change', {{ bubbles: true }}));
      count++;
    }}
  }}

  const toast = document.createElement('div');
  toast.innerText = `⚡ JobCopilot Smart Auto-Filled ${{count}} fields across inputs, selects & radios! Review & Submit when ready.`;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#09090b;color:#34d399;border:1px solid #10b981;padding:12px 18px;border-radius:12px;font-family:system-ui,sans-serif;font-size:13px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.45);';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}})();"""


def build_autofill_packet(user_id: str, url: Optional[str] = None, job_id: Optional[str] = None) -> dict:
    """
    Synthesizes the complete Copilot Auto-Fill kit for a user and target job:
    1. Enriches candidate profile with identity and extended metadata (Education, Experience,
       Work Auth, Compensation) from uploaded resumes.
    2. Resolves target job, recommended resume version, and matched technical keywords.
    3. Retrieves or generates a role-specific Cover Letter & 'Why This Company' pitch.
    4. Builds a universal 1-click Auto-Fill JS snippet and Bookmarklet.
    """
    profile = get_or_create_user_profile(user_id)

    # Fetch user's resumes for identity fallback, skills & recommended resume lookup
    resumes_res = supabase.table("resume_versions").select("id, title, target_type, skills_summary, raw_content").eq("user_id", user_id).order("created_at", desc=True).execute()
    resumes = resumes_res.data or []
    primary_resume = resumes[0] if resumes else {}
    raw_resume_text = primary_resume.get("raw_content") or ""

    # Identity fields with resume fallback
    extracted_ident = extract_identity_from_resume_text(raw_resume_text) if raw_resume_text else {}

    first_name = (profile.get("first_name") or extracted_ident.get("first_name") or "").strip()
    last_name = (profile.get("last_name") or extracted_ident.get("last_name") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    email = (profile.get("email") or extracted_ident.get("email") or "").strip()
    phone = (profile.get("phone") or extracted_ident.get("phone") or "").strip()
    location = (profile.get("base_location") or "Noida, Delhi NCR, India").strip()
    linkedin_url = (profile.get("linkedin_url") or extracted_ident.get("linkedin_url") or "").strip()
    github_url = (profile.get("github_url") or extracted_ident.get("github_url") or "").strip()
    portfolio_url = (profile.get("portfolio_url") or extracted_ident.get("portfolio_url") or "").strip()

    # Extended ATS candidate metadata
    extended_meta = extract_candidate_extended_meta(raw_resume_text, profile)

    default_resume_title = primary_resume.get("title") or "Primary Software Engineering Resume"
    default_resume_id = primary_resume.get("id")

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
        matched_skills = ["Python", "SQL", "Software Engineering", "FastAPI", "React", "APIs"]

    # Check for saved cover letter draft
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
        "phone_country_code": "+91",
        "location": location,
        "city": location.split(",")[0].strip() if location else "Noida",
        "state": location.split(",")[1].strip() if "," in location else "Uttar Pradesh",
        "country": "India",
        "postal_code": "201301",
        "linkedin_url": linkedin_url,
        "github_url": github_url,
        "portfolio_url": portfolio_url,
        "school": extended_meta["school"],
        "degree": extended_meta["degree"],
        "major": extended_meta["major"],
        "grad_year": extended_meta["grad_year"],
        "gpa": extended_meta["gpa"],
        "current_company": extended_meta["current_company"],
        "current_title": extended_meta["current_title"],
        "years_of_experience": extended_meta["years_of_experience"],
        "notice_period": extended_meta["notice_period"],
        "expected_salary": extended_meta["expected_salary"],
        "currency": extended_meta["currency"],
        "authorized_to_work": extended_meta["authorized_to_work"],
        "requires_sponsorship": extended_meta["requires_sponsorship"],
        "is_adult_18": extended_meta["is_adult_18"],
        "willing_to_relocate": extended_meta["willing_to_relocate"],
        "previously_employed_here": extended_meta["previously_employed_here"],
        "gender": extended_meta["gender"],
        "race_ethnicity": extended_meta["race_ethnicity"],
        "veteran_status": extended_meta["veteran_status"],
        "disability_status": extended_meta["disability_status"],
        "source": extended_meta["source"],
        "recommended_resume_id": recommended_resume_id,
        "recommended_resume_title": recommended_resume_title,
        "matched_skills": matched_skills[:8],
        "cover_letter": cover_letter,
        "why_company_pitch": why_company_pitch,
    }

    js_code = _generate_universal_autofill_js(base_payload)
    base_payload["autofill_script"] = js_code
    compact_js = " ".join(line.strip() for line in js_code.splitlines() if line.strip())
    base_payload["bookmarklet_url"] = f"javascript:{compact_js}"

    return base_payload


@router.get("/data")
@limiter.limit("240/minute")
def get_auto_apply_data(request: Request, url: str = "", job_id: Optional[str] = None, user_id: str = Depends(get_current_user)):
    """
    Fetches the user profile, resume-enriched identity tokens, recommended resume version,
    tailored cover letter, and universal auto-fill script for any job URL or job ID.
    Used by both the Chrome Extension and the Web App Auto-Fill Launchpad.
    """
    return build_autofill_packet(user_id=user_id, url=url, job_id=job_id)


@router.post("/solve-questions")
@limiter.limit("30/minute")
def solve_application_questions(request: Request, req: SolveQuestionsRequest, user_id: str = Depends(get_current_user)):
    """
    Intelligently analyzes custom, open-ended, and screening questions extracted directly
    from an ATS application page. Uses candidate's full verified resume context and AI to
    synthesize authentic, concise, first-person answers.
    """
    if not req.questions:
        return {"success": True, "answers": {}}

    # 1. Fetch candidate's profile and primary resume
    profile = get_or_create_user_profile(user_id)
    res_resp = supabase.table("resume_versions").select("title, skills_summary, raw_content").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
    primary_resume = res_resp.data[0] if res_resp.data else {}

    candidate_name = f"{profile.get('first_name', '')} {profile.get('last_name', '')}".strip() or "Candidate"
    skills_summary = primary_resume.get("skills_summary") or "Python, FastAPI, Next.js, SQL, Machine Learning, Distributed Systems"
    raw_content = primary_resume.get("raw_content") or ""
    resume_context = raw_content[:3500] if raw_content else skills_summary

    company = req.company or "Target Company"
    role_title = req.role_title or "Software Engineer"

    # Filter up to 10 questions to solve
    target_questions = req.questions[:10]
    questions_payload = []
    for q in target_questions:
        questions_payload.append({
            "id": q.id,
            "question": q.label,
            "type": q.field_type or "textarea",
            "options": q.options or []
        })

    prompt = f"""You are JobCopilot AI Assistant generating authentic, professional job application answers for candidate {candidate_name}.
Target Company: {company}
Target Role: {role_title}

Candidate Resume Context:
{resume_context}

APPLICATION QUESTIONS TO SOLVE:
{json.dumps(questions_payload, indent=2)}

GUIDELINES:
1. Write in clear, authentic first-person ("I").
2. For textareas / open questions (e.g. "Why do you want to join?", "Tell us about a project", "What is your experience with X?"):
   - Be concise, direct, and impactful (2-4 sentences or structured bullets).
   - Reference real technical tools, architecture choices, and tangible outcomes from the candidate's background.
   - Strictly avoid cliches, hype words, and buzzwords (e.g. "thrilled", "passionate", "tapestry", "delve", "testament").
3. For multiple-choice / dropdown options:
   - Select the most accurate and advantageous option from the provided options list.
4. Return ONLY a valid JSON dictionary mapping each question "id" to the final answer string:
{{
  "<id>": "<answer string>"
}}"""

    answers: Dict[str, str] = {}

    try:
        # Try fast Groq structured JSON
        raw_json = _try_groq_json(prompt)
        if raw_json and isinstance(raw_json, dict):
            for q in target_questions:
                if q.id in raw_json and str(raw_json[q.id]).strip():
                    answers[q.id] = str(raw_json[q.id]).strip()
        elif raw_json and isinstance(raw_json, str):
            clean = raw_json.strip()
            if clean.startswith("```json"):
                clean = clean[7:-3]
            elif clean.startswith("```"):
                clean = clean[3:-3]
            parsed = json.loads(clean)
            if isinstance(parsed, dict):
                for q in target_questions:
                    if q.id in parsed and str(parsed[q.id]).strip():
                        answers[q.id] = str(parsed[q.id]).strip()
    except Exception as e:
        print(f"[solve_questions] LLM JSON generation error: {e}")

    # Fallback for any questions missing from LLM response
    for q in target_questions:
        if q.id not in answers or not answers[q.id]:
            q_lower = q.label.lower()
            if any(w in q_lower for w in ["why", "interest", "motivat", "excite"]):
                answers[q.id] = (
                    f"I am eager to join {company} as a {role_title} because the team's engineering mission aligns with my background "
                    f"in high-performance backend systems and applied AI. I look forward to contributing clean, tested architectures from day one."
                )
            elif any(w in q_lower for w in ["project", "achievement", "proud", "challenge"]):
                answers[q.id] = (
                    f"Recently, I architected an end-to-end distributed system using Python, FastAPI, and PostgreSQL with asynchronous worker queues, "
                    f"achieving sub-100ms API response latency and 99.9% uptime during stress tests."
                )
            elif any(w in q_lower for w in ["experience", "background", "tell us", "about you"]):
                answers[q.id] = (
                    f"I am a Software Development Engineer with a strong foundation in CS fundamentals (DSA, OOP, System Design) and hands-on "
                    f"production experience across Python, Next.js, REST APIs, and cloud services."
                )
            elif any(w in q_lower for w in ["notice", "start", "soon", "availability"]):
                answers[q.id] = "Immediate / within 15-30 days."
            elif any(w in q_lower for w in ["salary", "compensation", "ctc", "expect"]):
                answers[q.id] = f"{profile.get('pay_floor_ncr_remote') or '12,00,000'} INR (Flexible based on role and equity)."
            else:
                answers[q.id] = f"Experienced Software Engineer with proficiency in {skills_summary[:80]}."

    return {
        "success": True,
        "company": company,
        "role_title": role_title,
        "answers": answers
    }
