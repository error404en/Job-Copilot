import sys
import io
import re

# Set UTF-8 encoding for console output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from app.db.supabase_client import supabase
from app.services.job_fetcher import check_role_location_and_relocation
from app.services.job_validator import validate_role_title, is_valid_job_posting

def fetch_all_jobs():
    all_jobs = []
    page_size = 1000
    start = 0
    while True:
        end = start + page_size - 1
        res = supabase.table('jobs').select('id, company, role_title, location, seniority_required, raw_jd, url, official_apply_url').range(start, end).execute()
        rows = res.data or []
        all_jobs.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    return all_jobs

def audit_jobs(dry_run: bool = True):
    print(f"=== AUDIT ALL JOBS IN DATABASE (Dry Run = {dry_run}) ===")
    
    # Fetch all jobs with pagination
    jobs = fetch_all_jobs()
    print(f"Total jobs retrieved across all pages: {len(jobs)}")
    
    to_keep = []
    to_remove = []
    
    for j in jobs:
        jid = j["id"]
        company = j.get("company") or "Unknown"
        title = j.get("role_title") or ""
        loc = j.get("location") or ""
        raw_jd = j.get("raw_jd") or ""
        url = j.get("official_apply_url") or j.get("url") or ""
        title_lower = title.lower()
        sen_lower = (j.get("seniority_required") or "").lower()
        
        # 0. Check company name validity
        if company.lower() in ["candidate experience site", "careers", "unknown role", "job search", "unknown", "company"]:
            to_remove.append((j, f"Invalid company placeholder: '{company}'"))
            continue

        # 1. Comprehensive Job & URL Posting Gate
        valid_posting, post_reason = is_valid_job_posting(title, url, company, raw_jd)
        if not valid_posting:
            to_remove.append((j, f"Invalid posting: {post_reason} (URL: {url[:60]}...)"))
            continue
            
        # 2. Seniority Gate (User is a Fresher)
        # Block Senior, Lead, Staff, Principal, Manager, Director, Architect, SDE III/IV, or 5+ yrs
        is_senior = (
            sen_lower == "senior" or
            any(re.search(r'\b' + re.escape(w) + r'\b', title_lower) for w in [
                "senior", "sr", "sr.", "staff", "principal", "lead", "architect",
                "manager", "director", "head of", "vp", "chief", "l5", "l6", "l7",
                "sde iv", "sde iii", "sde 4", "sde 3", "sde-4", "sde-3", "sde-iv", "sde-iii"
            ]) or
            bool(re.search(r'\b(4\+|5\+|6\+|7\+|8\+|9\+|10\+|15\+)\s*(?:years?|yrs?|yoa)\b', raw_jd.lower()))
        )
        if is_senior:
            to_remove.append((j, f"Senior role not suitable for fresher: '{title}' (sen={sen_lower})"))
            continue
            
        # 3. Location Gate (Must be India, Remote, or abroad WITH relocation)
        title_overseas = re.search(r'[-–(]\s*(sweden|stockholm|london|netherlands|sao paulo|uk|japan|tokyo|germany|berlin|poland|warsaw|france|paris|australia|sydney|singapore|spain|madrid|amer|latam|emea|taiwan|taipei)\b', title_lower)
        jd_loc_match = re.search(r'Location:\s*([^\n\r]+)', raw_jd, re.IGNORECASE)
        
        if title_overseas and not any(k in title_lower for k in ["india", "bengaluru", "bangalore", "delhi", "pune", "hyderabad", "mumbai"]):
            effective_loc = title_overseas.group(1).strip()
        elif jd_loc_match and not any(k in jd_loc_match.group(1).lower() for k in ["india", "bengaluru", "bangalore", "delhi", "pune", "hyderabad", "mumbai", "noida", "gurgaon", "remote"]):
            effective_loc = jd_loc_match.group(1).strip()
        else:
            effective_loc = loc
            
        loc_eval = check_role_location_and_relocation(effective_loc, raw_jd)
        if loc_eval["is_abroad"] and not loc_eval["covers_relocation"]:
            to_remove.append((j, f"Abroad without relocation: '{effective_loc}' (title='{title}')"))
            continue
            
        # 4. Domain & Relevance Gate
        # Filter pure non-tech, cold sales, banking ops, and non-tech compliance roles
        non_tech = [
            "tax", "accounting", "contact center", "qa analyst", "sales executive", 
            "recruiter", "talent acquisition", "tm analyst",
            "sales engineer", "financial data analyst", "banking operations", "economic crime"
        ]
        if any(nt in title_lower for nt in non_tech):
            to_remove.append((j, f"Non-tech / domain mismatch: '{title}'"))
            continue

        to_keep.append(j)

    print(f"\nAudit Results:")
    print(f" - Jobs to KEEP (Fresher in India/Remote or abroad with relocation): {len(to_keep)}")
    print(f" - Jobs to REMOVE (Senior / Overseas without relocation / Domain mismatch / Invalid): {len(to_remove)}")
    
    print("\nSample Jobs to KEEP (Top 5):")
    for j in to_keep[:5]:
        print(f"  [KEEP] {j['company']} | {j['role_title']} | Loc: {j.get('location')} | Sen: {j.get('seniority_required')}")
        
    print("\nSample Jobs to REMOVE (Top 10):")
    for j, reason in to_remove[:10]:
        print(f"  [REMOVE] {j['company']} | {j['role_title']} | Loc: {j.get('location')} --> Reason: {reason}")

    if not dry_run and to_remove:
        print(f"\nDeleting {len(to_remove)} jobs from Supabase in batches...")
        remove_ids = [j["id"] for j, _ in to_remove]
        
        # Batch delete in chunks of 50
        chunk_size = 50
        deleted_count = 0
        for i in range(0, len(remove_ids), chunk_size):
            chunk = remove_ids[i:i + chunk_size]
            try:
                supabase.table('jobs').delete().in_('id', chunk).execute()
                deleted_count += len(chunk)
                if (i // chunk_size + 1) % 5 == 0 or (i + chunk_size) >= len(remove_ids):
                    print(f"  Deleted up to batch {i // chunk_size + 1} ({deleted_count}/{len(remove_ids)} jobs)...")
            except Exception as e:
                print(f"  Error deleting batch: {e}")
                
        print(f"\nSuccessfully purged {deleted_count} non-compliant jobs from DB!")

if __name__ == "__main__":
    dry_run = "--execute" not in sys.argv
    audit_jobs(dry_run=dry_run)
