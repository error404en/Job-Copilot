from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import logging
import io
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
    Returns jobs from the last 24 hours where:
    - verdict is 'apply' or 'stretch'
    - pay_floor_pass is true
    Sorted by match_score descending.
    """
    from datetime import datetime, timedelta, timezone
    from app.services.jd_parser import parse_job_description
    from app.services.match_scorer import score_match
    from app.services.company_researcher import research_company

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    # Fetch jobs from last 24h with their analyses
    response = supabase.table("jobs") \
        .select("*, job_analyses(*)") \
        .eq("user_id", user_id) \
        .gte("fetched_at", cutoff) \
        .order("fetched_at", desc=True) \
        .execute()

    all_jobs = response.data or []

    matched = []
    analysis_pending = []
    analysis_failed = []

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
            if analysis.get("verdict") in ("apply", "stretch") and analysis.get("pay_floor_pass") is True:
                matched.append(job)

    matched.sort(
        key=lambda j: (j.get("job_analyses") or [{}])[0].get("match_score", 0),
        reverse=True
    )
    
    return {
        "matched": matched,
        "analysis_pending": analysis_pending,
        "analysis_failed": analysis_failed
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

    # 3. Parse seniority & skills
    raw_seniority = (req.seniority_required or "0-2yr").lower()
    if "senior" in raw_seniority or "lead" in raw_seniority:
        clean_seniority = "senior"
    elif "2-5" in raw_seniority or "mid" in raw_seniority:
        clean_seniority = "2-5yr"
    elif "fresher" in raw_seniority or "entry" in raw_seniority or "0-1" in raw_seniority:
        clean_seniority = "fresher"
    else:
        clean_seniority = "0-2yr"

    skills = req.required_skills or ["Python", "Java", "Web Development", "SQL", "APIs", "Data Structures"]

    parsed_job = ParsedJob(
        company=req.company,
        role_title=req.role_title,
        location=req.location or "India",
        remote_type="unclear",
        pay_min=None,
        pay_max=None,
        pay_currency="INR",
        pay_confidence="estimated",
        seniority_required=clean_seniority,
        required_skills=skills,
        nice_to_have_skills=["Cloud", "Docker", "Git", "Testing"],
        apply_link=req.url
    )

    # 4. Score match
    fit_report = score_match(parsed_job, user_profile, resume_summaries)

    # 5. Insert backing job and analysis into DB
    job_id = None
    try:
        job_insert = {
            "source": "deep_dive_role",
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
            supabase.table("job_analyses").insert(analysis_insert).execute()
    except Exception as e:
        print(f"[quick_score_job] DB save error: {e}")

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
    Scraper with automatic link unshortener and promotional funnel detection.
    Unshortens lnkd.in, tinyurl, bit.ly, etc., and flags bootcamp/creator promotional funnels.
    """
    url_info = resolve_redirects_and_detect_promo(url)
    resolved_url = url_info.get("resolved_url") or url
    is_promo = url_info.get("is_promo", False)
    promo_name = url_info.get("promo_name")

    if is_promo:
        return {
            "raw_jd": f"[âš ï¸ Creator Promotional / Affiliate Link Detected]\n"
                      f"This link redirected to: {resolved_url} ({promo_name}).\n"
                      f"This is an influencer promotional/bootcamp page, not an official company job posting.",
            "resolved_url": resolved_url,
            "is_promo": True,
            "promo_name": promo_name
        }

    try:
        validate_safe_url(resolved_url)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
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
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scrape URL {resolved_url}. It may be blocking bots. Error: {str(e)}")

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

@router.get("/subscriptions/list")
def get_subscriptions(user_id: str = Depends(get_current_user)):
    res = supabase.table("ats_subscriptions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return res.data

@router.delete("/subscriptions/{sub_id}")
def delete_subscription(sub_id: str, user_id: str = Depends(get_current_user)):
    res = supabase.table("ats_subscriptions").delete().eq("id", sub_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"status": "deleted"}

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
            except Exception:
                logger.exception("Bulk ATS fetch failed for system '%s', token '%s'", req.system, token)
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
    bullets = tailor_resume_bullets(
        resume_summary=resume_summary,
        jd_text=job_data["raw_jd"],
        missing_keywords=missing_keywords
    )
    
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
    letter = generate_targeted_cover_letter(
        resume_summary=resume_summary,
        jd_text=job_data["raw_jd"],
        role_title=job_data.get("role_title", "Position"),
        company=job_data.get("company", "Company")
    )
    
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


