import os
import sys
import re

# Ensure backend root is in PYTHONPATH
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.supabase_client import supabase
from app.services.jd_parser import parse_job_description_deterministic
from app.services.match_scorer import score_match_deterministic
from app.api.profile import get_or_create_user_profile

def rescore_all_jobs():
    print("[Rescore] Starting full pipeline re-scoring with precision engine...")
    
    # 1. Fetch distinct user profiles
    prof_res = supabase.table("user_profile").select("user_id").execute()
    users = [p["user_id"] for p in (prof_res.data or []) if p.get("user_id")]
    if not users:
        users = ["user_3JAc1CetYlxL6He1C2hgocU9p76"]
        
    total_updated = 0
    total_jobs = 0

    for user_id in users:
        print(f"\n[Rescore] Processing user: {user_id}")
        user_profile = get_or_create_user_profile(user_id)
        resumes_resp = supabase.table("resume_versions").select("*").eq("user_id", user_id).execute()
        
        if resumes_resp.data:
            resume_summaries = "\n".join([f"[{r.get('target_type', 'general')}]: {r.get('skills_summary', '')}" for r in resumes_resp.data])
        else:
            resume_summaries = "Software Engineering Candidate. Experience with Python, FastAPI, React, SQL, Applied AI."
            
        jobs_res = supabase.table("jobs").select("id, company, role_title, raw_jd, job_analyses(*)").eq("user_id", user_id).execute()
        user_jobs = jobs_res.data or []
        print(f"  Found {len(user_jobs)} jobs for user {user_id}")
        total_jobs += len(user_jobs)
        
        for job in user_jobs:
            raw_jd = job.get("raw_jd") or f"{job.get('role_title')} at {job.get('company')}"
            pj = parse_job_description_deterministic(raw_jd)
            
            # Preserve existing clean company/role title if parsed one is generic
            if job.get("company") and pj.company in ("Company", "Unknown Company", "Unknown"):
                pj.company = job["company"]
            if job.get("role_title"):
                pj.role_title = job["role_title"]
                
            fit = score_match_deterministic(pj, user_profile, resume_summaries)
            
            # Update jobs table
            try:
                supabase.table("jobs").update({
                    "seniority_required": pj.seniority_required,
                    "required_skills": pj.required_skills,
                    "analysis_status": "complete"
                }).eq("id", job["id"]).execute()
            except Exception as e:
                print(f"  Failed to update job {job['id']}: {e}")
                
            # Update or insert analysis
            analyses = job.get("job_analyses") or []
            if analyses:
                analysis_id = analyses[0]["id"]
                try:
                    supabase.table("job_analyses").update({
                        "match_score": fit.match_score,
                        "verdict": fit.verdict,
                        "seniority_fit": fit.seniority_fit,
                        "reasoning": fit.reasoning,
                        "matched_keywords": fit.matched_keywords,
                        "missing_keywords": fit.missing_keywords,
                        "pay_floor_pass": fit.pay_floor_pass
                    }).eq("id", analysis_id).execute()
                    total_updated += 1
                except Exception as e:
                    print(f"  Failed to update analysis {analysis_id}: {e}")
            else:
                try:
                    supabase.table("job_analyses").insert({
                        "job_id": job["id"],
                        "match_score": fit.match_score,
                        "verdict": fit.verdict,
                        "seniority_fit": fit.seniority_fit,
                        "reasoning": fit.reasoning,
                        "matched_keywords": fit.matched_keywords,
                        "missing_keywords": fit.missing_keywords,
                        "pay_floor_pass": fit.pay_floor_pass,
                        "relocation_required": fit.relocation_required,
                        "user_id": user_id
                    }).execute()
                    total_updated += 1
                except Exception as e:
                    print(f"  Failed to insert analysis for {job['id']}: {e}")

    print(f"\n[Rescore] Done! Re-scored {total_updated} analyses across {total_jobs} total jobs.")

if __name__ == "__main__":
    rescore_all_jobs()
