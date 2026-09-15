import os
import sys
import urllib.parse

# Ensure backend root is in PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.supabase_client import supabase

def fix_empty_urls():
    print("Fetching jobs with empty or null URLs...")
    res = supabase.table("jobs").select("id, company, role_title, url").execute()
    jobs = res.data
    
    fixed_count = 0
    for job in jobs:
        url = job.get("url")
        if not url or url.strip() == "":
            company = job.get("company", "Unknown")
            role = job.get("role_title", "")
            
            # Construct a fallback Google Search URL
            query = f"{company} careers {role}"
            encoded_query = urllib.parse.quote_plus(query)
            fallback_url = f"https://www.google.com/search?q={encoded_query}"
            
            print(f"Fixing job {job['id']} ({company} - {role}) -> {fallback_url}")
            supabase.table("jobs").update({"url": fallback_url}).eq("id", job["id"]).execute()
            fixed_count += 1
            
    print(f"Successfully fixed {fixed_count} jobs with missing links.")

if __name__ == "__main__":
    fix_empty_urls()
