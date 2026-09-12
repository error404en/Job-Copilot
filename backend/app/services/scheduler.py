import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.db.supabase_client import supabase
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs
from app.api.jobs import ParseRequest, _parse_and_score_job

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
        
        # Get all existing URLs so we don't re-parse duplicates
        url_res = supabase.table("jobs").select("url").execute()
        existing_urls = {row["url"] for row in url_res.data if row.get("url")}

        for sub in res.data:
            company = sub["company_token"]
            source = sub["ats_system"]
            keywords_str = sub.get("target_keywords", "")
            keywords = [k.strip() for k in keywords_str.split(",")] if keywords_str else None

            user_id = sub.get("user_id")

            jobs_to_process = []
            print(f"Fetching {source} for {company} (Keywords: {keywords})...")
            
            try:
                from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs
                if source == "greenhouse":
                    jobs_to_process.extend(fetch_greenhouse_jobs(company, keywords))
                elif source == "lever":
                    jobs_to_process.extend(fetch_lever_jobs(company, keywords))
                elif source == "ashby":
                    jobs_to_process.extend(fetch_ashby_jobs(company, keywords))
                elif source == "smartrecruiters":
                    jobs_to_process.extend(fetch_smartrecruiters_jobs(company, keywords))
            except Exception as e:
                print(f"Error fetching {source} for {company}: {e}")
                continue
            
            new_count = 0
            for job_data in jobs_to_process:
                if job_data["url"] in existing_urls:
                    continue
                
                new_count += 1
                try:
                    p_req = ParseRequest(
                        raw_jd=job_data["raw_jd"],
                        source=job_data["source"],
                        url=job_data["url"],
                        use_groq=False
                    )
                    _parse_and_score_job(p_req, user_id=user_id, background_tasks=None)
                except Exception as e:
                    print(f"Failed to auto-process job {job_data['url']}: {e}")
            
            print(f"Finished {company}: added {new_count} new roles.")
            
    except Exception as e:
        print(f"[Scheduler] Error in scheduled job fetcher: {e}")

def start_scheduler():
    # Run every 12 hours
    scheduler.add_job(fetch_latest_jobs_task, 'interval', hours=12)
    scheduler.start()
    print("[Scheduler] Background scheduler started!")
