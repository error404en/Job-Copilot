from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import logging
import io
import re
import requests
from bs4 import BeautifulSoup
from app.utils.security import validate_safe_url, safe_read_file, validate_image_content
from app.middleware.rate_limit import limiter
from app.db.supabase_client import supabase
from app.services.jd_parser import parse_job_description
from app.services.match_scorer import score_match
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, fetch_generic_fallback, resolve_redirects_and_detect_promo
from app.services.application_prep import generate_cover_letter
from app.services.tailor import tailor_resume_bullets, generate_targeted_cover_letter, generate_tailored_resume_json
from app.services.docx_generator import generate_docx_from_structured_resume
from app.services.llm_client import extract_text_from_image
from app.services.company_researcher import research_company
from app.services.link_checker import check_resume_links
from app.middleware.auth import get_current_user
from app.api.profile import get_or_create_user_profile

router = APIRouter()
logger = logging.getLogger(__name__)

from app.services.job_pipeline import ParseRequest, process_and_store_job

class FetchAtsRequest(BaseModel):
    company_tokens: List[str]
    target_keywords: Optional[List[str]] = None
    system: str = "greenhouse" # greenhouse or lever
    use_groq: bool = False
    subscribe: bool = False

from app.models.job import ParsedJob

class QuickScoreRequest(BaseModel):
    company: str
    role_title: str
    location: Optional[str] = "India"
    url: Optional[str] = None
    raw_jd: Optional[str] = None
    seniority_required: Optional[str] = "0-2yr"
    experience_level: Optional[str] = None
    required_skills: Optional[List[str]] = None
    compensation_range: Optional[str] = None

class DraftRequest(BaseModel):
    resume_version_id: Optional[str] = None
    use_groq: bool = False

@router.get("")
def get_jobs(user_id: str = Depends(get_current_user)):
    # Fetch all jobs joined with their analyses
    response = supabase.table("jobs") \
        .select("*, job_analyses(*)") \
        .eq("user_id", user_id) \
        .order("fetched_at", desc=True) \
        .execute()
    return response.data

@router.get("/digest")
def get_digest(user_id: str = Depends(get_current_user)):
    """
    Placement Cell Daily Intelligence Digest:
    Returns top jobs matching user's eligibility criteria, seniority, and pay floor.
    Tries 24 hours first, gracefully expands to 7 days or top matches if fresh batch is small.
    Enriched with placement probability and recommended resume mapping.
    """
    from datetime import datetime, timedelta, timezone

    cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    cutoff_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # 1. Fetch jobs from last 24h joined with analyses and resume version titles
    response = supabase.table("jobs") \
        .select("*, job_analyses(*, resume_versions(title, target_type))") \
        .eq("user_id", user_id) \
        .gte("fetched_at", cutoff_24h) \
        .order("fetched_at", desc=True) \
        .execute()

    all_jobs = response.data or []
    window_description = "Past 24 Hours"
    is_expanded_window = False

    # 2. Graceful window expansion if 24h yield is small (< 4 jobs)
    if len(all_jobs) < 4:
        response_7d = supabase.table("jobs") \
            .select("*, job_analyses(*, resume_versions(title, target_type))") \
            .eq("user_id", user_id) \
            .gte("fetched_at", cutoff_7d) \
            .order("fetched_at", desc=True) \
            .limit(80) \
            .execute()
        if response_7d.data and len(response_7d.data) > len(all_jobs):
            all_jobs = response_7d.data
            window_description = "Past 7 Days"
            is_expanded_window = True

    # 3. If still empty, fall back to top scored jobs overall
    if not all_jobs:
        response_all = supabase.table("jobs") \
            .select("*, job_analyses(*, resume_versions(title, target_type))") \
            .eq("user_id", user_id) \
            .order("fetched_at", desc=True) \
            .limit(80) \
            .execute()
        if response_all.data:
            all_jobs = response_all.data
            window_description = "Top Pipeline Matches"
            is_expanded_window = True

    matched = []
    analysis_pending = []
    analysis_failed = []
    resume_usage_tally = {}

    for job in all_jobs:
        status = job.get("analysis_status", "complete")
        
        if status in ("pending", "running"):
            analysis_pending.append(job)
        elif status == "failed":
            analysis_failed.append(job)
        else:
            analyses = job.get("job_analyses") or []
            if not analyses:
                continue
            analysis = analyses[0]
            
            # Surface recommended resume title cleanly
            if analysis.get("resume_versions"):
                analysis["recommended_resume_title"] = analysis["resume_versions"].get("title")
                analysis["recommended_resume_target_type"] = analysis["resume_versions"].get("target_type")
                r_title = analysis["resume_versions"].get("title")
                if r_title:
                    resume_usage_tally[r_title] = resume_usage_tally.get(r_title, 0) + 1

            # Verdict must be apply or stretch, and pay floor must not be explicitly violated
            verdict = analysis.get("verdict")
            pay_pass = analysis.get("pay_floor_pass")
            score = analysis.get("match_score", 0)
            
            # Hard exclusion: exclude senior/staff/lead roles and disqualified domains from digest
            job_sen = (job.get("seniority_required") or "").lower()
            role_title_lower = (job.get("role_title") or "").lower()
            is_senior = (
                job_sen == "senior" or
                any(re.search(r'\b' + re.escape(w) + r'\b', role_title_lower) for w in [
                    "senior", "sr", "sr.", "staff", "principal", "lead", "architect", "manager", "director", "head of"
                ])
            )

            # Exclude tax/accounting domain from software digest
            raw_jd_lower = (job.get("raw_jd") or "").lower()
            is_tax_finance = any(re.search(r'\b' + re.escape(w) + r'\b', role_title_lower + " " + raw_jd_lower) for w in [
                "tax automation", "tax provision", "intercompany accounting", "corporate tax"
            ])

            if verdict in ("apply", "stretch") and pay_pass is not False and not is_senior and not is_tax_finance and score >= 50:
                # Add selection odds tier
                if score >= 80 and verdict == "apply":
                    job["selection_probability"] = "High Odds"
                elif score >= 65:
                    job["selection_probability"] = "Strong Target"
                else:
                    job["selection_probability"] = "Stretch Reach"
                matched.append(job)

    # Enforce company diversity balancing: cap at max 3 roles per company in general recommendations
    # This prevents any single company (e.g. Databricks, Barclays) from flooding the candidate's digest
    company_counts = {}
    balanced_matched = []
    for job in matched:
        c_name = (job.get("company") or "").lower().strip()
        count = company_counts.get(c_name, 0)
        if count >= 3:
            continue
        company_counts[c_name] = count + 1
        balanced_matched.append(job)
    matched = balanced_matched

    matched.sort(
        key=lambda j: (j.get("job_analyses") or [{}])[0].get("match_score", 0),
        reverse=True
    )
    
    # Placement cell briefing metrics
    user_prof = get_or_create_user_profile(user_id)
    dream_comps = user_prof.get("dream_companies") or []
    
    high_odds_count = sum(1 for j in matched if j.get("selection_probability") == "High Odds")
    strong_target_count = sum(1 for j in matched if j.get("selection_probability") == "Strong Target")
    
    top_resume = max(resume_usage_tally.items(), key=lambda x: x[1])[0] if resume_usage_tally else None
    
    readiness_score = min(100, int((high_odds_count * 20) + (len(matched) * 5) + (len(dream_comps) * 5)))
    if not matched:
        readiness_score = 40
        
    placement_briefing = {
        "readiness_score": readiness_score,
        "eligible_matches": len(matched),
        "high_odds_count": high_odds_count,
        "strong_target_count": strong_target_count,
        "dream_companies_tracked": len(dream_comps),
        "top_recommended_resume": top_resume or "Default Technical Resume",
        "officer_verdict": f"{high_odds_count} High-Probability Roles Ready to Submit" if high_odds_count > 0 else "Syncing additional ATS boards for high-odds matches"
    }
    
    return {
        "matched": matched,
        "analysis_pending": analysis_pending,
        "analysis_failed": analysis_failed,
        "is_expanded_window": is_expanded_window,
        "window_description": window_description,
        "placement_briefing": placement_briefing
    }

@router.post("/quick-score")
def quick_score_job(req: QuickScoreRequest, user_id: str = Depends(get_current_user)):
    """
    Instantly scores a discovered role or company opening against the user's active resume.
    Returns the Match Score, Verdict ('apply' | 'skip' | 'stretch'), Seniority Fit,
    and saves to DB so it can be tracked and viewed on Dashboard.
    """
    # 1. Check if user already scored this exact job
    try:
        existing = supabase.table("jobs") \
            .select("id, url, location, job_analyses(*)") \
            .eq("company", req.company) \
            .eq("role_title", req.role_title) \
            .eq("user_id", user_id) \
            .limit(1) \
            .execute()
        
        if existing.data and existing.data[0].get("job_analyses") and len(existing.data[0]["job_analyses"]) > 0:
            job_record = existing.data[0]
            analysis = job_record["job_analyses"][0]
            return {
                "job_id": job_record["id"],
                "company": req.company,
                "role_title": req.role_title,
                "location": job_record.get("location") or req.location,
                "url": job_record.get("url") or req.url,
                "match_score": analysis.get("match_score", 85),
                "verdict": analysis.get("verdict", "apply"),
                "seniority_fit": analysis.get("seniority_fit", "good_fit"),
                "experience_level": req.experience_level or "0-2 Yrs (Freshers & Analyst)",
                "matched_keywords": analysis.get("matched_keywords") or [],
                "missing_keywords": analysis.get("missing_keywords") or [],
                "reasoning": analysis.get("reasoning", ""),
                "culture_assessment": analysis.get("company_info") or ""
            }
    except Exception as e:
        print(f"[quick_score_job] Cache lookup error: {e}")

    # 2. Get user profile and resume
    user_profile = get_or_create_user_profile(user_id)
    resumes_resp = supabase.table("resume_versions").select("*").eq("user_id", user_id).execute()
    if resumes_resp.data:
        resume_summaries = "\n".join([f"[{r['target_type']}]: {r['skills_summary']}" for r in resumes_resp.data])
    else:
        resume_summaries = "Software Engineering Candidate. Experience with Python, JavaScript/React, SQL, REST APIs, Git, and Web Development."

    # 3. Parse job with full fidelity from raw_jd or title metadata
    # If raw_jd is short/stub, try fetching the real JD from URL
    if (not req.raw_jd or len(req.raw_jd.strip()) < 350 or "[Extracted via" in req.raw_jd) and req.url and req.url.startswith("http"):
        try:
            scraped = scrape_job_url(req.url, user_id=user_id)
            if scraped and scraped.get("raw_jd") and len(scraped["raw_jd"]) > len(req.raw_jd or ""):
                req.raw_jd = scraped["raw_jd"]
        except Exception as se:
            print(f"[quick_score_job] Could not auto-fetch full JD: {se}")

    raw_text = req.raw_jd or f"{req.role_title} at {req.company}\nLocation: {req.location}\nExperience: {req.experience_level or req.seniority_required or '0-2yr'}"
    parsed_job = parse_job_description(raw_text)
    
    # Ensure explicit request parameters override defaults
    if req.company:
        parsed_job.company = req.company
    if req.role_title:
        parsed_job.role_title = req.role_title
    if req.location and not parsed_job.location:
        parsed_job.location = req.location
    if req.url:
        parsed_job.apply_link = req.url
    if req.required_skills:
        parsed_job.required_skills = req.required_skills

    # 4. Score match
    try:
        fit_report = score_match(parsed_job, user_profile, resume_summaries)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM Analysis Failed: {str(e)}")

    # 5. Insert backing job and analysis into DB (with bulletproof duplicate recovery)
    job_id = None
    try:
        job_insert = {
            "source": "deep_dive_role",
            "source_type": "deep_dive",
            "url": req.url,
            "company": req.company,
            "role_title": req.role_title,
            "raw_jd": req.raw_jd or f"{req.role_title} at {req.company}\nLocation: {req.location}\nExperience: {req.experience_level or clean_seniority}",
            "location": req.location or "India",
            "remote_type": "unclear",
            "seniority_required": clean_seniority,
            "required_skills": skills,
            "user_id": user_id
        }
        job_res = supabase.table("jobs").insert(job_insert).execute()
        if job_res.data:
            job_id = job_res.data[0]["id"]
    except Exception as e:
        print(f"[quick_score_job] DB save error: {e}")
        # Recover existing job ID so job_id is NEVER None
        try:
            if req.url:
                ex = supabase.table("jobs").select("id").eq("user_id", user_id).eq("url", req.url).limit(1).execute()
                if ex.data:
                    job_id = ex.data[0]["id"]
            if not job_id and req.company and req.role_title:
                ex = supabase.table("jobs").select("id").eq("user_id", user_id).eq("company", req.company).eq("role_title", req.role_title).limit(1).execute()
                if ex.data:
                    job_id = ex.data[0]["id"]
        except Exception as fe:
            print(f"[quick_score_job] Failed to recover existing job_id: {fe}")

    if job_id:
        try:
            analysis_insert = {
                "job_id": job_id,
                "match_score": fit_report.match_score,
                "verdict": fit_report.verdict,
                "seniority_fit": fit_report.seniority_fit,
                "pay_floor_pass": fit_report.pay_floor_pass,
                "relocation_required": fit_report.relocation_required,
                "matched_keywords": fit_report.matched_keywords,
                "missing_keywords": fit_report.missing_keywords,
                "reasoning": fit_report.reasoning,
                "company_info": fit_report.culture_assessment,
                "user_id": user_id
            }
            # Upsert into job_analyses
            supabase.table("job_analyses").upsert(analysis_insert, on_conflict="job_id").execute()
        except Exception as ae:
            print(f"[quick_score_job] Analysis save error: {ae}")

    return {
        "job_id": job_id,
        "company": req.company,
        "role_title": req.role_title,
        "location": req.location or "India",
        "url": req.url,
        "match_score": fit_report.match_score,
        "verdict": fit_report.verdict,
        "seniority_fit": fit_report.seniority_fit,
        "experience_level": req.experience_level or ("0-2 Yrs (Freshers & Entry)" if fit_report.seniority_fit in ("good_fit", "ideal") else "Higher Seniority Required"),
        "matched_keywords": fit_report.matched_keywords,
        "missing_keywords": fit_report.missing_keywords,
        "reasoning": fit_report.reasoning,
        "culture_assessment": fit_report.culture_assessment
    }

# IMPORTANT: This must come BEFORE the /{id} route so FastAPI doesn't
# treat "scrape-url" as a job ID.
@router.post("/scrape-url")
def scrape_job_url(url: str, user_id: str = Depends(get_current_user)):
    """
    Scraper with automatic link unshortener, promotional funnel detection,
    and high-precision LinkedIn guest API extraction.
    """
    if "google.com/search" in url:
        raise HTTPException(
            status_code=400,
            detail="The URL provided is a Google search result link, not a direct job posting. Please enter the direct company job posting or careers URL."
        )

    url_info = resolve_redirects_and_detect_promo(url)
    resolved_url = url_info.get("resolved_url") or url
    is_promo = url_info.get("is_promo", False)
    promo_name = url_info.get("promo_name")

    if is_promo:
        return {
            "raw_jd": f"[⚠️ Creator Promotional / Affiliate Link Detected]\n"
                      f"This link redirected to: {resolved_url} ({promo_name}).\n"
                      f"This is an influencer promotional/bootcamp page, not an official company job posting.",
            "resolved_url": resolved_url,
            "is_promo": True,
            "promo_name": promo_name
        }

    try:
        validate_safe_url(resolved_url)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }

        # Specialized LinkedIn handler (unrolls search result URLs and queries guest job API)
        if "linkedin.com" in resolved_url:
            import re
            jid_match = re.search(r'(?:currentJobId=|jobs/view/|jobId=)(\d+)', resolved_url)
            if jid_match:
                jid = jid_match.group(1)
                api_url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{jid}"
                try:
                    res = requests.get(api_url, headers=headers, timeout=12)
                    if res.status_code == 200:
                        soup = BeautifulSoup(res.text, 'html.parser')
                        title_el = soup.find('h2') or soup.find('h1')
                        title_text = title_el.get_text(strip=True) if title_el else "Job Opening"
                        comp_el = soup.find('a', class_='topcard__org-name-link') or soup.find('span', class_='topcard__flavor')
                        comp_text = comp_el.get_text(strip=True) if comp_el else "Company"
                        loc_el = soup.find('span', class_='topcard__flavor topcard__flavor--bullet')
                        loc_text = loc_el.get_text(strip=True) if loc_el else "Location Unspecified"

                        desc_el = soup.find('div', class_='description__text') or soup
                        for s in desc_el(["script", "style", "nav", "footer"]):
                            s.extract()
                        desc_text = desc_el.get_text(separator='\n', strip=True)
                        full_jd = f"{title_text} at {comp_text}\nLocation: {loc_text}\n\n{desc_text}"

                        return {
                            "raw_jd": full_jd,
                            "resolved_url": f"https://www.linkedin.com/jobs/view/{jid}",
                            "is_promo": False
                        }
                    elif res.status_code == 404:
                        raise HTTPException(
                            status_code=404,
                            detail=f"This LinkedIn job posting (Job ID {jid}) has expired or was removed by the employer."
                        )
                except HTTPException:
                    raise
                except Exception as li_err:
                    logger.warning("LinkedIn guest API fetch error: %s", li_err)

        res = requests.get(resolved_url, headers=headers, timeout=10)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.extract()
            
        text = soup.get_text(separator='\n')
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return {
            "raw_jd": text,
            "resolved_url": resolved_url,
            "is_promo": False
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scrape URL {resolved_url}. Error: {str(e)}")

@router.get("/{id}")
def get_job(id: str, user_id: str = Depends(get_current_user)):
    # Fetch job joined with analyses and drafts
    res = supabase.table("jobs").select("*, job_analyses(*, resume_versions(title)), application_drafts(*)").eq("id", id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = res.data[0]
    # Flatten the recommended resume title
    if job.get("job_analyses") and len(job["job_analyses"]) > 0:
        analysis = job["job_analyses"][0]
        if analysis.get("resume_versions"):
            analysis["recommended_resume_title"] = analysis["resume_versions"].get("title")
            del analysis["resume_versions"]
            
    # Sort drafts so newest is first
    if job.get("application_drafts"):
        job["application_drafts"].sort(key=lambda x: x.get("generated_at", ""), reverse=True)
            
    return job

@router.post("/parse")
@limiter.limit("60/minute")
def parse_and_score_job_route(request: Request, req: ParseRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    return process_and_store_job(req, user_id, background_tasks)


@router.post("/parse-image")
@limiter.limit("60/minute")
def parse_and_score_image(request: Request, background_tasks: BackgroundTasks, file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    """
    Accepts an uploaded image screenshot, extracts the text via Gemini Vision, and parses the job.
    """
    # 1. Read the image bytes safely (max 10MB)
    contents = safe_read_file(file, 10 * 1024 * 1024)
    validate_image_content(contents)
    mime_type = file.content_type or "image/jpeg"
    
    # 2. Extract text from image using Gemini Vision
    try:
        extracted_text = extract_text_from_image(contents, mime_type)
    except Exception as e:
        err_str = str(e)
        # Detect quota exhaustion and surface a friendly message
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
            raise HTTPException(
                status_code=429,
                detail="Gemini free-tier rate limit reached (20 image requests/day). Please wait a few minutes and try again, or upgrade your Gemini API plan."
            )
        raise HTTPException(status_code=400, detail=f"Failed to extract text from image: {err_str}")
        
    # 3. Detect and resolve any URLs (such as lnkd.in links in creator posts)
    import re
    detected_url = None
    url_matches = re.findall(r'https?://[^\s<>"\'\)]+|lnkd\.in/[^\s<>"\'\)]+', extracted_text)
    for raw_u in url_matches:
        full_u = raw_u if raw_u.startswith("http") else f"https://{raw_u}"
        try:
            u_info = resolve_redirects_and_detect_promo(full_u)
            if not u_info.get("is_promo"):
                detected_url = u_info.get("resolved_url")
                break
        except Exception:
            pass

    # 4. Use the existing parse_and_score_job logic
    req = ParseRequest(raw_jd=extracted_text, source="image", source_type="manual", url=detected_url)
    return process_and_store_job(req, user_id, background_tasks)

DEFAULT_ATS_SUBSCRIPTIONS = [
    {"company_token": "stripe", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "uber", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "rubrik", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "databricks", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "atlassian", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "coinbase", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "cloudflare", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "figma", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "notion", "ats_system": "lever", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "postman", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "razorpay", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "cred", "ats_system": "lever", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "swiggy", "ats_system": "lever", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "Zomato1", "ats_system": "smartrecruiters", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "meesho", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "phonepe", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "zepto", "ats_system": "lever", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "inmobi", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "sprinklr", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "browserstack", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "affirm", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
    {"company_token": "datadog", "ats_system": "greenhouse", "target_keywords": "software,engineer,developer,backend,fullstack,data,intern"},
]

def seed_default_subscriptions_if_empty(user_id: str):
    """Auto-seeds high-conviction tech subscriptions across top companies if missing for user."""
    try:
        existing_res = supabase.table("ats_subscriptions").select("company_token").eq("user_id", user_id).execute()
        existing_tokens = {row["company_token"].lower() for row in (existing_res.data or []) if row.get("company_token")}
        
        for sub in DEFAULT_ATS_SUBSCRIPTIONS:
            if sub["company_token"].lower() not in existing_tokens:
                try:
                    supabase.table("ats_subscriptions").insert({
                        "company_token": sub["company_token"],
                        "ats_system": sub["ats_system"],
                        "target_keywords": sub["target_keywords"],
                        "user_id": user_id
                    }).execute()
                    existing_tokens.add(sub["company_token"].lower())
                except Exception:
                    pass
    except Exception as e:
        logger.warning("Could not auto-seed subscriptions: %s", e)

@router.get("/subscriptions/list")
def get_subscriptions(user_id: str = Depends(get_current_user)):
    seed_default_subscriptions_if_empty(user_id)
    res = supabase.table("ats_subscriptions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return res.data

@router.delete("/subscriptions/{sub_id}")
def delete_subscription(sub_id: str, user_id: str = Depends(get_current_user)):
    res = supabase.table("ats_subscriptions").delete().eq("id", sub_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"status": "deleted"}

@router.post("/sync")
def sync_live_jobs(background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    """
    Automated Placement Cell 1-Click Live Jobs Sync:
    1. Loads candidate's profile (target roles, dream companies, seniority).
    2. Dynamically derives ATS search keywords from target roles and active resumes (e.g. GenAI, AI Engineer).
    3. Auto-discovers and syncs live ATS boards for all candidate Dream Companies (Stripe, Qualcomm, Goldman Sachs, etc.).
    4. Ingests curated verified roles for top tier enterprises.
    5. Queries subscribed ATS boards (Greenhouse, SmartRecruiters, Lever, Ashby, Workday).
    """
    seed_default_subscriptions_if_empty(user_id)
    user_prof = get_or_create_user_profile(user_id)
    dream_comps = user_prof.get("dream_companies") or []
    target_roles = user_prof.get("target_roles") or []

    # Derive candidate-specific keywords
    candidate_keywords = []
    for r in target_roles:
        cleaned = r.lower().replace("engineer", "").replace("developer", "").strip()
        if cleaned and len(cleaned) > 2 and cleaned not in candidate_keywords:
            candidate_keywords.append(cleaned)
        candidate_keywords.append(r.lower())

    # Fallback to general tech + AI terms if empty
    if not candidate_keywords:
        candidate_keywords = ["genai", "ai", "machine learning", "backend", "software", "fullstack", "data"]
    
    # 1. Ingest verified roles from enterprise companies (Qualcomm, Goldman Sachs, etc.)
    from app.services.job_fetcher import VERIFIED_COMPANY_ROLES, fetch_greenhouse_jobs, fetch_smartrecruiters_jobs, fetch_lever_jobs, fetch_ashby_jobs
    from app.api.research import discover_careers_url_and_ats
    
    curated_synced = 0
    for comp_key, comp_data in VERIFIED_COMPANY_ROLES.items():
        for role in comp_data.get("roles", []):
            try:
                p_req = ParseRequest(
                    raw_jd=role.get("raw_jd", ""),
                    source="verified_curated",
                    source_type="curated_official",
                    source_confidence=1.0,
                    url=role.get("url") or comp_data.get("careers_url"),
                    official_apply_url=role.get("url") or comp_data.get("careers_url"),
                    company_name=role.get("company", comp_key),
                    use_groq=False
                )
                res = process_and_store_job(p_req, user_id=user_id, background_tasks=background_tasks, skip_analysis=True)
                if not res.get("is_duplicate") and not res.get("is_rejected"):
                    curated_synced += 1
            except Exception as e:
                logger.warning("Curated role ingestion failed for %s: %s", comp_key, e)

    # 2. Ingest candidate's Dream Companies dynamically
    dream_synced = 0
    for dream_comp in dream_comps:
        try:
            discovery = discover_careers_url_and_ats(dream_comp)
            if discovery.ats_info:
                sys_name = discovery.ats_info.system.value
                token = discovery.ats_info.token
                
                # Check if subscription already exists
                existing_sub = supabase.table("ats_subscriptions").select("id").eq("user_id", user_id).eq("company_token", token).execute()
                if not existing_sub.data:
                    supabase.table("ats_subscriptions").insert({
                        "user_id": user_id,
                        "ats_system": sys_name,
                        "company_token": token,
                        "target_keywords": ",".join(candidate_keywords[:6])
                    }).execute()
                
                # Fetch live jobs from this dream company ATS
                jobs_found = []
                if sys_name == "greenhouse":
                    jobs_found = fetch_greenhouse_jobs(token, candidate_keywords)
                elif sys_name == "smartrecruiters":
                    jobs_found = fetch_smartrecruiters_jobs(token, candidate_keywords)
                elif sys_name == "lever":
                    jobs_found = fetch_lever_jobs(token, candidate_keywords)
                elif sys_name == "ashby":
                    jobs_found = fetch_ashby_jobs(token, candidate_keywords)
                    
                for job_data in jobs_found[:8]:
                    p_req = ParseRequest(
                        raw_jd=job_data.get("raw_jd", ""),
                        source="dream_company_sync",
                        source_type=job_data.get("source_type", sys_name),
                        source_confidence=1.0,
                        url=job_data.get("url"),
                        official_apply_url=job_data.get("official_apply_url"),
                        external_job_id=job_data.get("external_job_id"),
                        company_name=dream_comp,
                        use_groq=False
                    )
                    res = process_and_store_job(p_req, user_id=user_id, background_tasks=background_tasks, skip_analysis=True)
                    if not res.get("is_duplicate") and not res.get("is_rejected"):
                        dream_synced += 1
        except Exception as e:
            logger.warning("Dynamic dream company sync failed for %s: %s", dream_comp, e)

    # 3. Ingest all subscribed ATS boards
    subs_res = supabase.table("ats_subscriptions").select("*").eq("user_id", user_id).execute()
    subs = subs_res.data or []
    
    ats_synced = 0
    for sub in subs:
        source = sub.get("ats_system")
        token = sub.get("company_token")
        kw_str = sub.get("target_keywords", "")
        keywords = [k.strip() for k in kw_str.split(",")] if kw_str else candidate_keywords
        
        jobs_to_process = []
        try:
            if source == "greenhouse":
                jobs_to_process = fetch_greenhouse_jobs(token, keywords)
            elif source == "smartrecruiters":
                jobs_to_process = fetch_smartrecruiters_jobs(token, keywords)
            elif source == "lever":
                jobs_to_process = fetch_lever_jobs(token, keywords)
            elif source == "ashby":
                jobs_to_process = fetch_ashby_jobs(token, keywords)
        except Exception as e:
            logger.warning("Failed fetching ATS %s for %s: %s", source, token, e)
            continue
            
        for job_data in jobs_to_process[:3]: # Cap to top 3 per ATS company to maintain high company diversity
            try:
                p_req = ParseRequest(
                    raw_jd=job_data.get("raw_jd", ""),
                    source="ats_sync",
                    source_type=job_data.get("source_type", source),
                    source_confidence=1.0,
                    url=job_data.get("url"),
                    official_apply_url=job_data.get("official_apply_url"),
                    external_job_id=job_data.get("external_job_id"),
                    company_name=job_data.get("company") or token,
                    use_groq=False
                )
                res = process_and_store_job(p_req, user_id=user_id, background_tasks=background_tasks, skip_analysis=True)
                if not res.get("is_duplicate") and not res.get("is_rejected"):
                    ats_synced += 1
            except Exception as e:
                logger.warning("Job ingestion failed for %s: %s", job_data.get("url"), e)

    total_new = curated_synced + dream_synced + ats_synced
    return {
        "status": "success",
        "new_jobs_count": total_new,
        "curated_synced": curated_synced,
        "dream_synced": dream_synced,
        "ats_synced": ats_synced,
        "message": f"Placement Cell synced {total_new} verified openings across your Dream Companies & official ATS boards!"
    }

@router.post("/retry-analyses")
def retry_failed_analyses(background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    """
    Resets any failed job analyses back to 'pending' and immediately kicks off
    re-scoring in the background.
    """
    failed_res = supabase.table("jobs").select("id").eq("user_id", user_id).eq("analysis_status", "failed").execute()
    failed_jobs = failed_res.data or []
    if not failed_jobs:
        return {"status": "success", "retried_count": 0, "message": "No failed analyses found."}

    ids = [j["id"] for j in failed_jobs]
    for jid in ids:
        supabase.table("jobs").update({"analysis_status": "pending"}).eq("id", jid).eq("user_id", user_id).execute()

    from app.services.scheduler import process_pending_analyses_task
    background_tasks.add_task(process_pending_analyses_task)

    return {
        "status": "success",
        "retried_count": len(ids),
        "message": f"Queued {len(ids)} roles for automatic AI match re-scoring."
    }

@router.post("/fetch-ats")
def fetch_and_analyze_ats(req: FetchAtsRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    if req.subscribe:
        keywords_str = ",".join(req.target_keywords) if req.target_keywords else ""
        for token in req.company_tokens:
            try:
                supabase.table("ats_subscriptions").insert({
                    "company_token": token,
                    "ats_system": req.system,
                    "target_keywords": keywords_str,
                    "user_id": user_id
                }).execute()
            except Exception as e:
                print(f"Failed to subscribe {token}: {e}") # Likely a duplicate

    def process_jobs(user_id: str = user_id):
        for token in req.company_tokens:
            try:
                if req.system == "greenhouse":
                    jobs_to_process = fetch_greenhouse_jobs(token, req.target_keywords)
                elif req.system == "lever":
                    jobs_to_process = fetch_lever_jobs(token, req.target_keywords)
                elif req.system == "ashby":
                    jobs_to_process = fetch_ashby_jobs(token, req.target_keywords)
                elif req.system == "smartrecruiters":
                    jobs_to_process = fetch_smartrecruiters_jobs(token, req.target_keywords)
                elif req.system == "generic":
                    jobs_to_process = fetch_generic_fallback(token, req.target_keywords)
                else:
                    logger.error("Unsupported bulk ATS system '%s' for token '%s'", req.system, token)
                    continue
            except Exception as e:
                logger.exception("Bulk ATS fetch failed for system '%s', token '%s'", req.system, token)
                try:
                    supabase.table("jobs").insert({
                        "user_id": user_id,
                        "company": token,
                        "role_title": "Failed Fetch",
                        "url": token,
                        "analysis_status": "failed",
                        "raw_jd": f"Failed to fetch jobs from {token}: {str(e)}"
                    }).execute()
                except Exception as db_e:
                    logger.error("Failed to insert failed job record: %s", db_e)
                continue

            for job_data in jobs_to_process:
                try:
                    # V2 is the single persistence path for bulk discoveries. It
                    # records full source provenance and leaves the job pending for
                    # the scheduler's analysis worker.
                    p_req = ParseRequest(
                        raw_jd=job_data["raw_jd"],
                        source="ats_bulk",
                        source_type=job_data.get("source_type", req.system),
                        source_confidence=job_data.get("source_confidence", 1.0),
                        url=job_data.get("url"),
                        official_apply_url=job_data.get("official_apply_url"),
                        external_job_id=job_data.get("external_job_id"),
                        company_name=job_data.get("company") or token,
                        use_groq=req.use_groq,
                    )
                    result = process_and_store_job(p_req, user_id, skip_analysis=True)
                    logger.info(
                        "Bulk ATS V2 ingestion completed for user '%s': system=%s token=%s job_id=%s duplicate=%s",
                        user_id,
                        req.system,
                        token,
                        result.get("job_id"),
                        result.get("is_duplicate", False),
                    )
                except Exception:
                    # The V2 pipeline persists successful jobs as pending for the
                    # analysis worker. A failed ingestion has no safe job record to
                    # update, so retain the full traceback rather than swallowing it.
                    logger.exception(
                        "Bulk ATS V2 ingestion failed for user '%s': system=%s token=%s url=%s",
                        user_id,
                        req.system,
                        token,
                        job_data.get("url"),
                    )

    background_tasks.add_task(process_jobs)
    return {"message": f"Started processing jobs for {len(req.company_tokens)} companies in the background."}

@router.post("/{job_id}/application-draft")
@limiter.limit("60/minute")
def create_application_draft(request: Request, job_id: str, req: DraftRequest, user_id: str = Depends(get_current_user)):
    # 1. Fetch Job
    job_res = supabase.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job_data = job_res.data[0]
    
    # 2. Determine Resume Version
    resume_id = req.resume_version_id
    if not resume_id:
        # Fetch from job_analyses
        analysis_res = supabase.table("job_analyses").select("recommended_resume_version_id").eq("job_id", job_id).execute()
        if analysis_res.data and analysis_res.data[0].get("recommended_resume_version_id"):
            resume_id = analysis_res.data[0]["recommended_resume_version_id"]
        else:
            raise HTTPException(status_code=400, detail="No resume version specified and no recommendation found.")
            
    # 3. Fetch Resume Summary
    resume_res = supabase.table("resume_versions").select("skills_summary").eq("id", resume_id).eq("user_id", user_id).execute()
    if not resume_res.data:
        raise HTTPException(status_code=404, detail="Resume version not found")
    resume_summary = resume_res.data[0].get("skills_summary", "")
    
    # 4. Generate Draft
    draft_text = generate_cover_letter(
        raw_jd=job_data["raw_jd"],
        resume_summary=resume_summary,
        use_groq=req.use_groq
    )
    
    # 5. Save Draft
    draft_insert = {
        "job_id": job_id,
        "resume_version_id": resume_id,
        "cover_letter_text": draft_text
    }
    insert_res = supabase.table("application_drafts").insert(draft_insert).execute()
    
    return insert_res.data[0]

class TailorRequest(BaseModel):
    resume_version_id: Optional[str] = None
    one_page_only: Optional[bool] = False
    custom_instructions: Optional[str] = None

@router.post("/{job_id}/tailor/resume")
@limiter.limit("60/minute")
def generate_tailored_bullets_endpoint(request: Request, job_id: str, req: TailorRequest, user_id: str = Depends(get_current_user)):
    # 1. Fetch Job and Analysis
    job_res = supabase.table("jobs").select("*, job_analyses(*)").eq("id", job_id).eq("user_id", user_id).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job_data = job_res.data[0]
    
    analysis = None
    if job_data.get("job_analyses") and len(job_data["job_analyses"]) > 0:
        analysis = job_data["job_analyses"][0]
        
    missing_keywords = analysis.get("missing_keywords", []) if analysis else []
    
    # 2. Determine Resume Version
    resume_id = req.resume_version_id
    if not resume_id and analysis and analysis.get("recommended_resume_version_id"):
        resume_id = analysis["recommended_resume_version_id"]
        
    # 3. Fetch Resume Summary / Full Content
    resume_summary = "Software Engineer"
    if resume_id:
        resume_res = supabase.table("resume_versions").select("raw_content, skills_summary").eq("id", resume_id).eq("user_id", user_id).execute()
        if resume_res.data:
            rec = resume_res.data[0]
            resume_summary = rec.get("raw_content") or rec.get("skills_summary") or "Software Engineer"
    else:
        fallback_res = supabase.table("resume_versions").select("raw_content, skills_summary").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if fallback_res.data:
            rec = fallback_res.data[0]
            resume_summary = rec.get("raw_content") or rec.get("skills_summary") or "Software Engineer"
        
    # 4. Generate Bullets
    try:
        bullets = tailor_resume_bullets(
            resume_summary=resume_summary,
            jd_text=job_data["raw_jd"],
            missing_keywords=missing_keywords
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM Generation Failed: {str(e)}")
    
    # 5. Check Links
    broken_links = check_resume_links(resume_summary)
    
    return {"bullets": bullets, "broken_links": broken_links}

@router.post("/{job_id}/tailor/cover-letter")
@limiter.limit("60/minute")
def generate_tailored_cover_letter_endpoint(request: Request, job_id: str, req: TailorRequest, user_id: str = Depends(get_current_user)):
    # 1. Fetch Job and Analysis
    job_res = supabase.table("jobs").select("*, job_analyses(*)").eq("id", job_id).eq("user_id", user_id).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job_data = job_res.data[0]
    
    analysis = None
    if job_data.get("job_analyses") and len(job_data["job_analyses"]) > 0:
        analysis = job_data["job_analyses"][0]
        
    # 2. Determine Resume Version
    resume_id = req.resume_version_id
    if not resume_id and analysis and analysis.get("recommended_resume_version_id"):
        resume_id = analysis["recommended_resume_version_id"]
        
    # 3. Fetch Resume Summary / Full Content
    resume_summary = "Software Engineer"
    if resume_id:
        resume_res = supabase.table("resume_versions").select("raw_content, skills_summary").eq("id", resume_id).eq("user_id", user_id).execute()
        if resume_res.data:
            rec = resume_res.data[0]
            resume_summary = rec.get("raw_content") or rec.get("skills_summary") or "Software Engineer"
    else:
        fallback_res = supabase.table("resume_versions").select("raw_content, skills_summary").eq("user_id", user_id).order("created_at", desc=True).limit(1).execute()
        if fallback_res.data:
            rec = fallback_res.data[0]
            resume_summary = rec.get("raw_content") or rec.get("skills_summary") or "Software Engineer"
        
    # 4. Generate Letter
    try:
        letter = generate_targeted_cover_letter(
            resume_summary=resume_summary,
            jd_text=job_data["raw_jd"],
            role_title=job_data.get("role_title", "Position"),
            company=job_data.get("company", "Company")
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM Generation Failed: {str(e)}")
    
    return {"cover_letter": letter}


@router.post("/{job_id}/tailor/download-docx")
@limiter.limit("10/minute")
def download_tailored_docx(request: Request, job_id: str, req: TailorRequest, user_id: str = Depends(get_current_user)):
    """
    Generates a fully tailored .docx resume for this job and streams it back as a file download.
    
    Pipeline:
    1. Fetch job + missing keywords from DB
    2. Fetch the candidate's raw resume text (requires re-upload if raw_content is missing)
    3. Pass 1 (LLM): Parse raw text â†’ structured JSON schema
    4. Pass 2 (LLM): Tailor bullet points with anti-hallucination rules
    5. Generate .docx binary from the tailored JSON
    6. Stream .docx file to frontend as an attachment
    """
    # 1. Fetch Job and Analysis
    job_res = supabase.table("jobs").select("*, job_analyses(*)").eq("id", job_id).eq("user_id", user_id).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job_data = job_res.data[0]

    analysis = None
    if job_data.get("job_analyses") and len(job_data["job_analyses"]) > 0:
        analysis = job_data["job_analyses"][0]

    missing_keywords = analysis.get("missing_keywords", []) if analysis else []

    # 2. Determine Resume Version & fetch raw resume content
    resume_id = req.resume_version_id
    if not resume_id and analysis and analysis.get("recommended_resume_version_id"):
        resume_id = analysis["recommended_resume_version_id"]

    raw_content = None
    resume_title = "Resume"

    if resume_id:
        resume_res = supabase.table("resume_versions").select("id, raw_content, title").eq("id", resume_id).eq("user_id", user_id).execute()
        if resume_res.data and resume_res.data[0].get("raw_content"):
            raw_content = resume_res.data[0]["raw_content"]
            resume_title = resume_res.data[0].get("title", "Resume")

    # If no raw_content yet (e.g. recommended resume was old or empty), find candidate's latest resume with raw_content
    if not raw_content:
        all_user_resumes = supabase.table("resume_versions") \
            .select("id, raw_content, title, target_type") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
        
        valid_resumes = [r for r in (all_user_resumes.data or []) if (r.get("raw_content") or "").strip()]
        if valid_resumes:
            chosen = valid_resumes[0]
            resume_id = chosen["id"]
            raw_content = chosen["raw_content"]
            resume_title = chosen.get("title", "Resume")

            # Self-heal job_analyses record so future requests use this valid resume
            if analysis and analysis.get("id"):
                try:
                    if analysis.get("recommended_resume_version_id") != resume_id:
                        supabase.table("job_analyses").update({"recommended_resume_version_id": resume_id}).eq("id", analysis["id"]).eq("user_id", user_id).execute()
                except Exception as e:
                    pass

    if not raw_content:
        raise HTTPException(
            status_code=422,
            detail="No resume with full text found. Please upload your resume PDF to enable tailored .docx generation."
        )

    # 4 & 5. Run two-pass LLM tailoring pipeline
    try:
        tailored_json = generate_tailored_resume_json(
            raw_content=raw_content,
            jd_text=job_data.get("raw_jd", ""),
            missing_keywords=missing_keywords,
            one_page_only=req.one_page_only,
            custom_instructions=req.custom_instructions or ""
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        print(f"[download_tailored_docx] Tailoring pipeline failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate tailored resume. Please try again.")

    # 6. Generate .docx bytes
    try:
        docx_bytes = generate_docx_from_structured_resume(tailored_json)
    except Exception as e:
        print(f"[download_tailored_docx] DOCX generation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to build .docx file.")

    # 7. Stream file to frontend
    company_name = job_data.get("company", "Company").replace(" ", "_")
    role_name = job_data.get("role_title", "Role").replace(" ", "_")
    filename = f"Resume_{company_name}_{role_name}.docx"

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


class JobUpdateRequest(BaseModel):
    deadline: Optional[str] = None
    is_bookmarked: Optional[bool] = None
    url: Optional[str] = None

@router.patch("/{job_id}")
def update_job(job_id: str, req: JobUpdateRequest, user_id: str = Depends(get_current_user)):
    update_data = {}
    # Check explicitly if it was set in the request, allowing None for deadline to clear it
    if "deadline" in req.model_dump(exclude_unset=True):
        update_data["deadline"] = req.deadline
    if "is_bookmarked" in req.model_dump(exclude_unset=True):
        update_data["is_bookmarked"] = req.is_bookmarked
    if "url" in req.model_dump(exclude_unset=True):
        update_data["url"] = req.url
        
    if not update_data:
        return {"message": "No updates requested"}
        
    res = supabase.table("jobs").update(update_data).eq("id", job_id).eq("user_id", user_id).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return res.data[0]

@router.delete("/{job_id}")
def delete_job(job_id: str, user_id: str = Depends(get_current_user)):
    supabase.table("jobs").delete().eq("id", job_id).eq("user_id", user_id).execute()
    return {"status": "deleted", "job_id": job_id}

@router.post("/{job_id}/reanalyze")
@limiter.limit("20/minute")
def reanalyze_job(request: Request, job_id: str, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    from datetime import datetime, timezone
    job_res = supabase.table("jobs").select("*").eq("id", job_id).eq("user_id", user_id).limit(1).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    job = job_res.data[0]

    # Delete existing analyses
    supabase.table("job_analyses").delete().eq("job_id", job_id).eq("user_id", user_id).execute()

    # Reset fetched_at to current UTC
    now_utc = datetime.now(timezone.utc).isoformat()
    supabase.table("jobs").update({"fetched_at": now_utc}).eq("id", job_id).eq("user_id", user_id).execute()

    user_profile = get_or_create_user_profile(user_id)

    resumes_resp = supabase.table("resume_versions").select("*").eq("user_id", user_id).execute()
    if resumes_resp.data:
        resume_summaries = "\n".join([f"[{r['target_type']}]: {r['skills_summary']}" for r in resumes_resp.data])
    else:
        resume_summaries = "Software Engineering Candidate Profile. (No specific resume uploaded yet)."

    parsed_job = parse_job_description(job["raw_jd"])
    if job.get("company"):
        parsed_job.company = job["company"]

    def run_reanalysis():
        try:
            fit_report = score_match(parsed_job, user_profile, resume_summaries)
            best_resume_id = resumes_resp.data[0]["id"] if resumes_resp.data else None
            role_lower = parsed_job.role_title.lower()
            type_keywords = {
                "backend": ["backend", "server", "api", "microservice", "distributed"],
                "frontend": ["frontend", "front-end", "react", "angular", "vue", "ui"],
                "fullstack": ["fullstack", "full-stack", "full stack"],
                "genai": ["ai", "ml", "machine learning", "llm", "genai", "nlp", "data science"],
                "data": ["data engineer", "data analyst", "analytics", "etl", "pipeline"],
            }
            if resumes_resp.data:
                for resume_type, keywords in type_keywords.items():
                    if any(kw in role_lower for kw in keywords):
                        for r in resumes_resp.data:
                            if r["target_type"] == resume_type:
                                best_resume_id = r["id"]
                                break
                        break

            final_reasoning = fit_report.reasoning
            if fit_report.culture_assessment:
                final_reasoning += f"\n\nðŸ¢ Company Culture Estimate:\n{fit_report.culture_assessment}"

            company_info = research_company(parsed_job.company)

            analysis_insert = {
                "job_id": job_id,
                "match_score": fit_report.match_score,
                "matched_keywords": fit_report.matched_keywords,
                "missing_keywords": fit_report.missing_keywords,
                "pay_floor_pass": fit_report.pay_floor_pass,
                "relocation_required": fit_report.relocation_required,
                "seniority_fit": fit_report.seniority_fit,
                "goal_alignment_note": fit_report.goal_alignment_note,
                "verdict": fit_report.verdict,
                "reasoning": final_reasoning,
                "recommended_resume_version_id": best_resume_id,
                "company_info": company_info,
                "user_id": user_id
            }
            supabase.table("job_analyses").insert(analysis_insert).execute()
        except Exception as e:
            print(f"Re-analysis failed for job {job_id}: {e}")
            failed_analysis_insert = {
                "job_id": job_id,
                "match_score": 0,
                "verdict": "skip",
                "reasoning": f"AI Analysis Failed: {str(e)}",
                "user_id": user_id
            }
            supabase.table("job_analyses").insert(failed_analysis_insert).execute()

    if background_tasks:
        background_tasks.add_task(run_reanalysis)
    else:
        run_reanalysis()

    return {"job_id": job_id, "status": "reanalyzing"}


