from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
import requests
from bs4 import BeautifulSoup
from app.db.supabase_client import supabase
from app.services.jd_parser import parse_job_description
from app.services.match_scorer import score_match
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, fetch_generic_fallback
from app.services.application_prep import generate_cover_letter
from app.services.llm_client import extract_text_from_image
from app.services.company_researcher import research_company

router = APIRouter()

class ParseRequest(BaseModel):
    raw_jd: str
    source: str = "manual"
    url: Optional[str] = None
    company_name: Optional[str] = None
    use_groq: bool = False

class FetchAtsRequest(BaseModel):
    company_tokens: List[str]
    target_keywords: Optional[List[str]] = None
    system: str = "greenhouse" # greenhouse or lever
    use_groq: bool = False

class DraftRequest(BaseModel):
    resume_version_id: Optional[str] = None
    use_groq: bool = False

@router.get("/")
def get_jobs():
    # Fetch all jobs joined with their analyses
    response = supabase.table("jobs") \
        .select("*, job_analyses(*)") \
        .order("fetched_at", desc=True) \
        .execute()
    return response.data

# IMPORTANT: This must come BEFORE the /{id} route so FastAPI doesn't
# treat "scrape-url" as a job ID.
@router.post("/scrape-url")
def scrape_job_url(url: str):
    """
    Generic scraper for standard company job pages.
    Will not work on heavy SPA anti-bot sites like LinkedIn/Indeed.
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
        }
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()
        
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.extract()
            
        text = soup.get_text(separator='\n')
        # clean up empty lines
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return {"raw_jd": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scrape URL. It may be blocking bots. Error: {str(e)}")

@router.get("/{id}")
def get_job(id: str):
    # Fetch job joined with analyses and drafts
    res = supabase.table("jobs").select("*, job_analyses(*, resume_versions(title)), application_drafts(*)").eq("id", id).execute()
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
def parse_and_score_job(req: ParseRequest):
    # 1. Get user profile
    profile_resp = supabase.table("user_profile").select("*").limit(1).execute()
    if not profile_resp.data:
        raise HTTPException(status_code=500, detail="User profile not found in DB")
    user_profile = profile_resp.data[0]

    # 2. Get all resumes to find the best match
    resumes_resp = supabase.table("resume_versions").select("*").execute()
    if not resumes_resp.data:
        raise HTTPException(status_code=500, detail="No resume versions found in DB. Please upload a resume first at /resumes.")
        
    # Combine all resume summaries for the scorer
    resume_summaries = "\n".join([f"[{r['target_type']}]: {r['skills_summary']}" for r in resumes_resp.data])

    # 3. Parse JD
    parsed_job = parse_job_description(req.raw_jd, use_groq=req.use_groq)
    
    # Override company if explicitly provided
    if req.company_name:
        parsed_job.company = req.company_name

    # 4. Score Match
    fit_report = score_match(parsed_job, user_profile, resume_summaries, use_groq=req.use_groq)

    # 5. Determine which resume to recommend
    best_resume_id = resumes_resp.data[0]["id"]
    role_lower = parsed_job.role_title.lower()
    
    # Smart resume matching based on role keywords
    type_keywords = {
        "backend": ["backend", "server", "api", "microservice", "distributed"],
        "frontend": ["frontend", "front-end", "react", "angular", "vue", "ui"],
        "fullstack": ["fullstack", "full-stack", "full stack"],
        "genai": ["ai", "ml", "machine learning", "llm", "genai", "nlp", "data science"],
        "data": ["data engineer", "data analyst", "analytics", "etl", "pipeline"],
    }
    
    for resume_type, keywords in type_keywords.items():
        if any(kw in role_lower for kw in keywords):
            for r in resumes_resp.data:
                if r["target_type"] == resume_type:
                    best_resume_id = r["id"]
                    break
            break

    # 6. Save to DB
    job_insert = {
        "source": req.source,
        "url": req.url or parsed_job.apply_link,
        "company": parsed_job.company,
        "role_title": parsed_job.role_title,
        "raw_jd": req.raw_jd,
        "location": parsed_job.location,
        "remote_type": parsed_job.remote_type,
        "pay_min": parsed_job.pay_min,
        "pay_max": parsed_job.pay_max,
        "pay_currency": parsed_job.pay_currency,
        "pay_confidence": parsed_job.pay_confidence,
        "seniority_required": parsed_job.seniority_required,
        "required_skills": parsed_job.required_skills,
        "nice_to_have_skills": parsed_job.nice_to_have_skills
    }
    
    # Try inserting job
    try:
        job_resp = supabase.table("jobs").insert(job_insert).execute()
        job_id = job_resp.data[0]["id"]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to insert job. Might be a duplicate URL. {str(e)}")

    # Append Culture Assessment to reasoning so it appears in the UI without DB schema changes
    final_reasoning = fit_report.reasoning
    if fit_report.culture_assessment:
        final_reasoning += f"\n\n🏢 Company Culture Estimate:\n{fit_report.culture_assessment}"

    # 7. Add Analysis
    # Let's check if we already have company_info for this company to avoid re-researching
    existing_info_res = supabase.table("jobs").select("job_analyses(company_info)").eq("company", parsed_job.company).execute()
    company_info = None
    if existing_info_res.data:
        for row in existing_info_res.data:
            if row.get("job_analyses") and row["job_analyses"][0].get("company_info"):
                company_info = row["job_analyses"][0]["company_info"]
                break
                
    if not company_info:
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
        "company_info": company_info
    }
    
    supabase.table("job_analyses").insert(analysis_insert).execute()

    return {"job_id": job_id}

@router.post("/parse-image")
async def parse_and_score_image(file: UploadFile = File(...)):
    """
    Accepts an uploaded image screenshot, extracts the text via Gemini, and parses the job.
    """
    # 1. Read the image bytes
    contents = await file.read()
    mime_type = file.content_type or "image/jpeg"
    
    # 2. Extract text from image using Gemini Vision
    try:
        extracted_text = extract_text_from_image(contents, mime_type)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract text from image: {str(e)}")
        
    # 3. Use the existing parse_and_score_job logic
    req = ParseRequest(
        raw_jd=f"[Extracted from Screenshot]\n{extracted_text}",
        source="screenshot",
        url="Screenshot Upload",
        use_groq=False # Force Gemini since Groq lacks vision capabilities for the initial part anyway
    )
    
    return parse_and_score_job(req)

@router.post("/fetch-ats")
def fetch_and_analyze_ats(req: FetchAtsRequest, background_tasks: BackgroundTasks):
    def process_jobs():
        jobs_to_process = []
        for token in req.company_tokens:
            if req.system == "greenhouse":
                jobs_to_process.extend(fetch_greenhouse_jobs(token, req.target_keywords))
            elif req.system == "lever":
                jobs_to_process.extend(fetch_lever_jobs(token, req.target_keywords))
            elif req.system == "ashby":
                jobs_to_process.extend(fetch_ashby_jobs(token, req.target_keywords))
            elif req.system == "smartrecruiters":
                jobs_to_process.extend(fetch_smartrecruiters_jobs(token, req.target_keywords))
            elif req.system == "generic":
                jobs_to_process.extend(fetch_generic_fallback(token, req.target_keywords))
                
        # Send them to parse_and_score_job logic
        for job_data in jobs_to_process:
            try:
                p_req = ParseRequest(
                    raw_jd=job_data["raw_jd"],
                    source=job_data["source"],
                    url=job_data["url"],
                    use_groq=req.use_groq
                )
                parse_and_score_job(p_req)
            except Exception as e:
                print(f"Failed to process ATS job {job_data['url']}: {e}")

    background_tasks.add_task(process_jobs)
    return {"message": f"Started processing jobs for {len(req.company_tokens)} companies in the background."}

@router.post("/{job_id}/application-draft")
def create_application_draft(job_id: str, req: DraftRequest):
    # 1. Fetch Job
    job_res = supabase.table("jobs").select("*").eq("id", job_id).execute()
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
    resume_res = supabase.table("resume_versions").select("skills_summary").eq("id", resume_id).execute()
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

class JobUpdateRequest(BaseModel):
    deadline: Optional[str] = None
    is_bookmarked: Optional[bool] = None

@router.patch("/{job_id}")
def update_job(job_id: str, req: JobUpdateRequest):
    update_data = {}
    # Check explicitly if it was set in the request, allowing None for deadline to clear it
    if "deadline" in req.model_dump(exclude_unset=True):
        update_data["deadline"] = req.deadline
    if "is_bookmarked" in req.model_dump(exclude_unset=True):
        update_data["is_bookmarked"] = req.is_bookmarked
        
    if not update_data:
        return {"message": "No updates requested"}
        
    res = supabase.table("jobs").update(update_data).eq("id", job_id).execute()
    
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return res.data[0]
