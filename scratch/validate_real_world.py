import os
import sys
import time
sys.path.append(os.path.abspath('backend'))
from app.services.job_fetcher import fetch_workday_jobs, parse_experience_requirements

def validate():
    tenants = {
        "Mastercard": "mastercard.wd1/mastercard/CorporateCareers",
        "GE HealthCare": "gehc.wd5/gehc/GEHC_ExternalSite",
        "Akamai": "akamai.wd1/akamai/Akamai_Careers"
    }
    
    for company, token in tenants.items():
        print(f"\n--- Validating {company} ---")
        start_time = time.time()
        try:
            # We use 'engineer' to limit the total jobs and prevent massive sequential JD fetching
            jobs = fetch_workday_jobs(token, ["engineer"])
            print(f"Total jobs fetched: {len(jobs)}")
            fresher_jobs = 0
            for j in jobs:
                exp_meta = parse_experience_requirements(j["role_title"], j["raw_jd"])
                if exp_meta.get("fresher_eligibility"):
                    fresher_jobs += 1
            print(f"Fresher-compatible jobs found: {fresher_jobs}")
            if jobs:
                print(f"Example URL: {jobs[0]['url']}")
                print(f"Pagination completed (if len < 200)")
        except Exception as e:
            print(f"Failed: {e}")
        end_time = time.time()
        print(f"Time taken: {end_time - start_time:.2f} seconds")

if __name__ == "__main__":
    validate()
