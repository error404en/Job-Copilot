import os
import sys
import urllib.parse

# Ensure backend root is in PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.supabase_client import supabase

KNOWN_PORTALS = {
    "barclays": "https://search.jobs.barclays/",
    "hsbc": "https://www.hsbc.com/careers/students-and-graduates",
    "goldmansachs": "https://www.goldmansachs.com/careers/students/programs-and-internships/india/new-analyst-program",
    "google": "https://careers.google.com/jobs/results/?location=India",
    "coinbase": "https://www.coinbase.com/careers/positions",
    "databricks": "https://www.databricks.com/company/careers",
    "stripe": "https://stripe.com/careers",
    "rubrik": "https://www.rubrik.com/company/careers",
    "uber": "https://www.uber.com/us/en/careers/",
}

def fix_empty_urls():
    print("Fetching jobs with empty, null, or Google search URLs...")
    res = supabase.table("jobs").select("id, company, role_title, url").execute()
    jobs = res.data or []
    
    fixed_count = 0
    for job in jobs:
        url = (job.get("url") or "").strip()
        company = (job.get("company") or "").strip()
        comp_key = company.lower().replace(" ", "")
        
        # If URL is missing, or is a broken google.com/search URL
        if not url or "google.com/search" in url:
            portal = KNOWN_PORTALS.get(comp_key)
            if portal:
                print(f"Fixing job {job['id']} ({company}) -> {portal}")
                supabase.table("jobs").update({"url": portal}).eq("id", job["id"]).execute()
                fixed_count += 1
            else:
                # If unknown company, don't invent a search link
                print(f"Clearing broken search URL for job {job['id']} ({company})")
                supabase.table("jobs").update({"url": None}).eq("id", job["id"]).execute()
                fixed_count += 1
            
    print(f"Successfully cleaned {fixed_count} jobs with missing or search links.")

if __name__ == "__main__":
    fix_empty_urls()
