import re
import os

filepath = 'backend/app/api/jobs.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. We'll rename parse_and_score_job to _parse_and_score_job and add background_tasks as optional
old_parse_func = """@router.post("/parse")
def parse_and_score_job(req: ParseRequest, user_id: str = Depends(get_current_user)):"""

new_parse_func = """def _parse_and_score_job(req: ParseRequest, user_id: str, background_tasks: BackgroundTasks = None):"""

content = content.replace(old_parse_func, new_parse_func)

# 2. We need to refactor the inside of _parse_and_score_job to run analysis in background
old_scoring_block = """    # 4. Score Match
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
    resolved_url = target_url or parsed_job.apply_link
    job_insert = {
        "source": req.source,
        "url": resolved_url,
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
        "nice_to_have_skills": parsed_job.nice_to_have_skills,
        "user_id": user_id
    }
    
    # Try inserting job
    try:
        job_resp = supabase.table("jobs").insert(job_insert).execute()
        job_id = job_resp.data[0]["id"]
    except Exception as e:
        # If it's a duplicate URL collision, gracefully fetch existing job
        if resolved_url:
            existing_match = supabase.table("jobs").select("id").eq("url", resolved_url).eq("user_id", user_id).limit(1).execute()
            if existing_match.data:
                return {"job_id": existing_match.data[0]["id"], "is_duplicate": True}
        raise HTTPException(status_code=400, detail=f"Failed to insert job: {str(e)}")

    # Append Culture Assessment to reasoning so it appears in the UI without DB schema changes
    final_reasoning = fit_report.reasoning
    if fit_report.culture_assessment:
        final_reasoning += f"\\n\\n🏢 Company Culture Estimate:\\n{fit_report.culture_assessment}"

    # 7. Add Analysis
    # Let's check if we already have company_info for this company to avoid re-researching
    existing_info_res = supabase.table("jobs").select("job_analyses(company_info)").eq("company", parsed_job.company).eq("user_id", user_id).execute()
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
        "company_info": company_info,
        "user_id": user_id
    }
    
    supabase.table("job_analyses").insert(analysis_insert).execute()

    return {"job_id": job_id}"""

new_scoring_block = """    # 6. Save to DB First (Fast)
    resolved_url = target_url or parsed_job.apply_link
    job_insert = {
        "source": req.source,
        "url": resolved_url,
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
        "nice_to_have_skills": parsed_job.nice_to_have_skills,
        "user_id": user_id
    }
    
    try:
        job_resp = supabase.table("jobs").insert(job_insert).execute()
        job_id = job_resp.data[0]["id"]
    except Exception as e:
        if resolved_url:
            existing_match = supabase.table("jobs").select("id").eq("url", resolved_url).eq("user_id", user_id).limit(1).execute()
            if existing_match.data:
                return {"job_id": existing_match.data[0]["id"], "is_duplicate": True}
        raise HTTPException(status_code=400, detail=f"Failed to insert job: {str(e)}")

    def run_analysis():
        try:
            # 4. Score Match
            fit_report = score_match(parsed_job, user_profile, resume_summaries, use_groq=req.use_groq)

            # 5. Determine which resume to recommend
            best_resume_id = resumes_resp.data[0]["id"]
            role_lower = parsed_job.role_title.lower()
            
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

            final_reasoning = fit_report.reasoning
            if fit_report.culture_assessment:
                final_reasoning += f"\\n\\n🏢 Company Culture Estimate:\\n{fit_report.culture_assessment}"

            # 7. Add Analysis
            existing_info_res = supabase.table("jobs").select("job_analyses(company_info)").eq("company", parsed_job.company).eq("user_id", user_id).execute()
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
                "company_info": company_info,
                "user_id": user_id
            }
            
            supabase.table("job_analyses").insert(analysis_insert).execute()
        except Exception as e:
            print(f"Background analysis failed for job {job_id}: {e}")
            failed_analysis_insert = {
                "job_id": job_id,
                "match_score": 0,
                "verdict": "skip",
                "reasoning": f"AI Analysis Failed: {str(e)}\\n\\nThis was likely caused by a timeout or model error.",
                "user_id": user_id
            }
            supabase.table("job_analyses").insert(failed_analysis_insert).execute()

    if background_tasks:
        background_tasks.add_task(run_analysis)
    else:
        run_analysis()

    return {"job_id": job_id}

@router.post("/parse")
def parse_and_score_job_route(req: ParseRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    return _parse_and_score_job(req, user_id, background_tasks)
"""

if old_scoring_block not in content:
    print("Error: old_scoring_block not found")
else:
    content = content.replace(old_scoring_block, new_scoring_block)


# 3. Update parse-image
old_parse_image = """@router.post("/parse-image")
async def parse_and_score_image(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):"""
new_parse_image = """@router.post("/parse-image")
async def parse_and_score_image(background_tasks: BackgroundTasks, file: UploadFile = File(...), user_id: str = Depends(get_current_user)):"""

if old_parse_image in content:
    content = content.replace(old_parse_image, new_parse_image)
else:
    content = re.sub(r'async def parse_and_score_image\(file: UploadFile = File\(\.\.\.\), user_id: str = Depends\(get_current_user\)\):', r'async def parse_and_score_image(background_tasks: BackgroundTasks, file: UploadFile = File(...), user_id: str = Depends(get_current_user)):', content)

# Replace the return in parse-image
content = content.replace("return parse_and_score_job(req, user_id)", "return _parse_and_score_job(req, user_id, background_tasks)")


# 4. Update fetch-ats
content = content.replace("parse_and_score_job(p_req)", "_parse_and_score_job(p_req, user_id, None)")


with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully refactored jobs.py")
