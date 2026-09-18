import asyncio
import os
import requests
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.db.supabase_client import supabase
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs
from app.services.job_pipeline import ParseRequest, process_and_store_job

scheduler = AsyncIOScheduler()

def fetch_latest_jobs_task():
    """
    Background task to auto-fetch new jobs from saved subscriptions.
    """
    print("[Scheduler] Running scheduled ATS subscription fetcher...")
    try:
        # Get active subscriptions
        res = supabase.table("ats_subscriptions").select("*").execute()
        if not res.data:
            print("No ATS subscriptions found.")
            return

        print(f"Found {len(res.data)} subscriptions to auto-scrape.")
        
        # We will fetch existing URLs per user during the loop

        for sub in res.data:
            company = sub["company_token"]
            source = sub["ats_system"]
            keywords_str = sub.get("target_keywords", "")
            keywords = [k.strip() for k in keywords_str.split(",")] if keywords_str else None

            user_id = sub.get("user_id")

            # Get existing URLs scoped to this specific user to avoid global deduplication dropping jobs
            url_res = supabase.table("jobs").select("url").eq("user_id", user_id).execute()
            existing_urls = {row["url"] for row in url_res.data if row.get("url")}

            jobs_to_process = []
            print(f"Fetching {source} for {company} (Keywords: {keywords})...")
            
            try:
                from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, fetch_workday_jobs
                if source == "greenhouse":
                    jobs_to_process.extend(fetch_greenhouse_jobs(company, keywords))
                elif source == "lever":
                    jobs_to_process.extend(fetch_lever_jobs(company, keywords))
                elif source == "ashby":
                    jobs_to_process.extend(fetch_ashby_jobs(company, keywords))
                elif source == "smartrecruiters":
                    jobs_to_process.extend(fetch_smartrecruiters_jobs(company, keywords))
                elif source == "workday":
                    jobs_to_process.extend(fetch_workday_jobs(company, keywords))
            except Exception as e:
                print(f"Error fetching {source} for {company}: {e}")
                continue
            
            new_count = 0
            for job_data in jobs_to_process:
                try:
                    p_req = ParseRequest(
                        raw_jd=job_data["raw_jd"],
                        source="ats_subscription",
                        source_type=job_data["source_type"],
                        source_confidence=job_data.get("source_confidence", 1.0),
                        url=job_data["url"],
                        official_apply_url=job_data.get("official_apply_url"),
                        external_job_id=job_data.get("external_job_id"),
                        company_name=company,
                        use_groq=False
                    )
                    res = process_and_store_job(p_req, user_id=user_id, background_tasks=None, skip_analysis=True)
                    if not res.get("is_duplicate"):
                        new_count += 1
                except Exception as e:
                    print(f"Failed to auto-process job {job_data['url']}: {e}")
            
            print(f"Finished {company}: added {new_count} new roles.")
            
    except Exception as e:
        print(f"[Scheduler] Error in scheduled job fetcher: {e}")

def fetch_dream_company_jobs_task():
    """
    Background task to auto-fetch jobs for users' dream companies.
    """
    print("[Scheduler] Running scheduled Dream Company fetcher...")
    try:
        res = supabase.table("user_profile").select("*").execute()
        if not res.data:
            print("No user profiles found.")
            return

        from app.services.job_fetcher import scrape_careers_page

        for profile in res.data:
            user_id = profile.get("user_id")
            dream_companies = profile.get("dream_companies", [])
            target_roles = profile.get("target_roles", [])
            
            if not dream_companies:
                continue
                
            # Scope existing_urls to this user
            url_res = supabase.table("jobs").select("url").eq("user_id", user_id).execute()
            existing_urls = {row["url"] for row in url_res.data if row.get("url")}
                
            print(f"Fetching dream companies for user {user_id}: {dream_companies}")
            
            for company in dream_companies:
                try:
                    result = scrape_careers_page(company, target_roles)
                    jobs_to_process = result.get("jobs", [])
                    
                    new_count = 0
                    for job_data in jobs_to_process:
                        try:
                            p_req = ParseRequest(
                                raw_jd=job_data["raw_jd"],
                                source="dream_company",
                                source_type=job_data["source_type"],
                                source_confidence=job_data.get("source_confidence", 0.8),
                                url=job_data["url"],
                                official_apply_url=job_data.get("official_apply_url"),
                                external_job_id=job_data.get("external_job_id"),
                                company_name=company,
                                use_groq=False
                            )
                            res = process_and_store_job(p_req, user_id=user_id, background_tasks=None, skip_analysis=True)
                            if not res.get("is_duplicate"):
                                new_count += 1
                        except Exception as e:
                            print(f"Failed to auto-process dream job {job_data['url']}: {e}")
                            
                    print(f"Finished {company} for {user_id}: added {new_count} new roles.")
                except Exception as e:
                    print(f"Error fetching dream company {company}: {e}")

    except Exception as e:
        print(f"[Scheduler] Error in dream company fetcher: {e}")

def keep_alive_task():
    """
    Pings the application's external URL to keep it awake on Render's free tier.
    """
    url = os.environ.get("RENDER_EXTERNAL_URL", "http://localhost:8000/health")
    print(f"[Scheduler] Running keep-alive ping to {url}")
    try:
        response = requests.get(url, timeout=10)
        print(f"[Scheduler] Keep-alive status: {response.status_code}")
    except Exception as e:
        print(f"[Scheduler] Keep-alive failed: {e}")

def process_pending_analyses_task():
    """
    Background worker that fetches 'pending' jobs and scores them atomically.
    Transitions state from pending -> running -> complete/failed.
    """
    print("[Scheduler] Running pending analyses processor...")
    try:
        # Fetch up to 10 pending jobs
        res = supabase.table("jobs").select("*").eq("analysis_status", "pending").limit(10).execute()
        pending_jobs = res.data or []
        
        if not pending_jobs:
            return

        from app.services.jd_parser import parse_job_description
        from app.services.match_scorer import score_match
        from app.api.profile import get_or_create_user_profile

        for job in pending_jobs:
            job_id = job["id"]
            user_id = job["user_id"]
            
            # Optimistic atomic lock: set to 'running' ONLY if it's still 'pending'
            lock_res = supabase.table("jobs").update({"analysis_status": "running"}).eq("id", job_id).eq("analysis_status", "pending").execute()
            if not lock_res.data:
                # Someone else took it
                continue
                
            try:
                user_profile = get_or_create_user_profile(user_id)
                resumes_resp = supabase.table("resume_versions").select("*").eq("user_id", user_id).execute()
                if resumes_resp.data:
                    resume_summaries = "\n".join([f"[{r['target_type']}]: {r['skills_summary']}" for r in resumes_resp.data])
                else:
                    resume_summaries = "Software Engineering Candidate Profile. (No specific resume uploaded yet)."

                parsed_job = parse_job_description(job["raw_jd"], use_groq=True)
                if not parsed_job.company:
                    parsed_job.company = job["company"]

                fit_report = score_match(parsed_job, user_profile, resume_summaries, use_groq=True)
                
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
                    for r_type, kws in type_keywords.items():
                        if any(kw in role_lower for kw in kws):
                            for r in resumes_resp.data:
                                if r["target_type"] == r_type:
                                    best_resume_id = r["id"]
                                    break
                            break

                final_reasoning = fit_report.reasoning
                if fit_report.culture_assessment:
                    final_reasoning += f"\n\n🏢 Company Culture Estimate:\n{fit_report.culture_assessment}"

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
                    "user_id": user_id
                }
                
                supabase.table("job_analyses").insert(analysis_insert).execute()
                supabase.table("jobs").update({"analysis_status": "complete"}).eq("id", job_id).execute()
            except Exception as e:
                print(f"[Scheduler] Analysis failed for job {job_id}: {e}")
                supabase.table("jobs").update({"analysis_status": "failed"}).eq("id", job_id).execute()

    except Exception as e:
        print(f"[Scheduler] Error processing pending analyses: {e}")

def start_scheduler():
    # Run every 12 hours
    scheduler.add_job(fetch_latest_jobs_task, 'interval', hours=12)
    scheduler.add_job(fetch_dream_company_jobs_task, 'interval', hours=12)
    # Run every 5 minutes
    scheduler.add_job(process_pending_analyses_task, 'interval', minutes=5)
    scheduler.add_job(keep_alive_task, 'interval', minutes=5)
    scheduler.start()
    print("[Scheduler] Background scheduler started!")
