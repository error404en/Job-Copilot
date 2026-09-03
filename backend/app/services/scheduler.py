import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.db.supabase_client import supabase
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs
from app.api.jobs import ParseRequest, parse_and_score_job

scheduler = AsyncIOScheduler()

def fetch_latest_jobs_task():
    """
    Background task to auto-fetch new jobs from saved companies.
    """
    print("[Scheduler] Running scheduled job fetcher...")
    try:
        # Get unique combinations of company and source
        res = supabase.table("jobs").select("company, source").execute()
        if not res.data:
            print("No jobs found in DB to determine saved companies.")
            return

        # Deduplicate
        saved_companies = set()
        for row in res.data:
            if row.get("source") in ["greenhouse", "lever"]: # Currently only these support bulk fetch
                saved_companies.add((row["company"], row["source"]))

        print(f"Found {len(saved_companies)} unique companies to auto-scrape.")
        
        # Get all existing URLs so we don't re-parse duplicates
        url_res = supabase.table("jobs").select("url").execute()
        existing_urls = {row["url"] for row in url_res.data if row.get("url")}

        for company, source in saved_companies:
            jobs_to_process = []
            print(f"Fetching {source} for {company}...")
            if source == "greenhouse":
                jobs_to_process.extend(fetch_greenhouse_jobs(company))
            elif source == "lever":
                jobs_to_process.extend(fetch_lever_jobs(company))
            
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
                    parse_and_score_job(p_req)
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
