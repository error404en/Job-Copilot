import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from duckduckgo_search import DDGS
from app.services.company_researcher import research_company
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, scrape_careers_page
from app.middleware.auth import get_current_user

router = APIRouter()

class ResearchRequest(BaseModel):
    company_name: str
    target_keywords: Optional[str] = None

def discover_careers_url_and_ats(company_name: str) -> dict:
    """
    Company -> official domain -> official careers URL -> detect known ATS
    """
    query = f"{company_name} official careers portal"
    careers_url = None
    
    try:
        with DDGS(timeout=5) as ddgs:
            results = list(ddgs.text(query, max_results=3))
            for r in results:
                href = r.get("href", "")
                if any(kw in href.lower() for kw in ["career", "job", "join", "hiring", "work"]):
                    careers_url = href
                    break
    except Exception as e:
        print(f"Careers URL discovery failed: {e}")
        
    if not careers_url:
        return {"careers_url": None, "ats_info": None}
        
    url = careers_url
    
    # Check Greenhouse
    gh_match = re.search(r"boards\.greenhouse\.io/([^/]+)", url)
    if gh_match:
        return {"careers_url": url, "ats_info": {"system": "greenhouse", "token": gh_match.group(1)}}
        
    # Check Lever
    lever_match = re.search(r"jobs\.lever\.co/([^/]+)", url)
    if lever_match:
        return {"careers_url": url, "ats_info": {"system": "lever", "token": lever_match.group(1)}}
        
    # Check Ashby
    ashby_match = re.search(r"jobs\.ashbyhq\.com/([^/]+)", url)
    if ashby_match:
        return {"careers_url": url, "ats_info": {"system": "ashby", "token": ashby_match.group(1)}}
        
    # Check SmartRecruiters
    sr_match = re.search(r"jobs\.smartrecruiters\.com/([^/]+)", url)
    if sr_match:
        return {"careers_url": url, "ats_info": {"system": "smartrecruiters", "token": sr_match.group(1)}}
        
    # Check Workday
    wd_match = re.search(r"https?://([^/]+)\.myworkdayjobs\.com/([^/]+)(?:/([^/]+))?", url)
    if wd_match:
        host_prefix = wd_match.group(1)
        part1 = wd_match.group(2)
        part2 = wd_match.group(3)
        
        if part2 and (part1.lower() == "en-us" or len(part1) == 2):
            site = part2
            tenant = host_prefix.split(".")[0]
        elif part1 == "wday":
            path_parts = url.split("wday/cxs/")
            if len(path_parts) > 1:
                sub_parts = path_parts[1].split("/")
                if len(sub_parts) >= 2:
                    tenant = sub_parts[0]
                    site = sub_parts[1]
                else:
                    tenant = host_prefix.split(".")[0]
                    site = part2 if part2 else part1
            else:
                tenant = host_prefix.split(".")[0]
                site = part2 if part2 else part1
        else:
            tenant = host_prefix.split(".")[0]
            site = part1
            
        return {"careers_url": url, "ats_info": {"system": "workday", "token": f"{host_prefix}/{tenant}/{site}"}}
        
    return {"careers_url": url, "ats_info": None}

@router.post("/company")
def deep_dive_company(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    from app.services.job_fetcher import VERIFIED_COMPANY_ROLES, parse_experience_requirements

    norm = req.company_name.lower().replace(" ", "").replace(".", "").replace("-", "")
    keywords = [k.strip() for k in req.target_keywords.split(",")] if req.target_keywords else None

    # 1. Company Intelligence (runs fast with benchmark fallback)
    company_info = research_company(req.company_name)

    # 2. Check if curated company — instant response
    is_curated = any(key in norm or norm in key for key in VERIFIED_COMPANY_ROLES.keys())
    
    discovered_jobs = []
    careers_url = None
    ats_info = None

    if is_curated:
        print(f"[DeepDive] Curated enterprise company detected for {req.company_name}, skipping slow ATS search")
        from app.services.job_fetcher import scrape_careers_page
        result = scrape_careers_page(req.company_name, keywords)
        discovered_jobs = result.get("jobs", [])
        careers_url = result.get("careers_url")
    else:
        # 1. Discover Official Careers URL and ATS
        discovery = discover_careers_url_and_ats(req.company_name)
        careers_url = discovery.get("careers_url")
        ats_info = discovery.get("ats_info")
        
        # If the careers_url itself isn't an ATS link, we might want to do a deeper check, but the user explicitly requested this exact flow.
        # Fallback: if discovery didn't find the direct ATS link because it's a vanity url, we can check a direct DDG search for the ATS just in case
        if not ats_info:
            try:
                query = f"site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:jobs.smartrecruiters.com OR site:myworkdayjobs.com {req.company_name} careers"
                with DDGS(timeout=5) as ddgs:
                    results = list(ddgs.text(query, max_results=3))
                    for r in results:
                        u = r.get("href", "")
                        if "myworkdayjobs.com" in u or "greenhouse.io" in u or "lever.co" in u or "ashbyhq.com" in u or "smartrecruiters.com" in u:
                            # Re-run detection on this specific URL
                            ats_info = discover_careers_url_and_ats(u).get("ats_info")
                            if ats_info:
                                break
            except Exception:
                pass

        if ats_info:
            system = ats_info["system"]
            token = ats_info["token"]
            try:
                if system == "greenhouse":
                    discovered_jobs = fetch_greenhouse_jobs(token, keywords)
                elif system == "lever":
                    discovered_jobs = fetch_lever_jobs(token, keywords)
                elif system == "ashby":
                    discovered_jobs = fetch_ashby_jobs(token, keywords)
                elif system == "smartrecruiters":
                    discovered_jobs = fetch_smartrecruiters_jobs(token, keywords)
                elif system == "workday":
                    from app.services.job_fetcher import fetch_workday_jobs
                    discovered_jobs = fetch_workday_jobs(token, keywords)

                # Two-Stage Relevance happens in `scheduler.py` via `pending` state, but for older fetchers we still infer experience metadata here if missing.
                for j in discovered_jobs:
                    if "experience_level" not in j:
                        meta = parse_experience_requirements(j.get("role_title", ""), j.get("raw_jd", ""))
                        # Map hybrid fields to old fields to avoid breaking downstream
                        exp_min = meta.get("experience_min_years", 0)
                        j["experience_level"] = "0-2 Yrs" if exp_min <= 2 else "2-5 Yrs" if exp_min < 5 else "5+ Yrs"
                        j["seniority_required"] = meta.get("seniority", "Unknown")
            except Exception as e:
                print(f"Failed to fetch jobs from discovered ATS {system} for {token}: {e}")
        else:
            # Tier 3: Unknown / Custom ATS -> Generic Official Careers Fallback via Playwright
            if careers_url:
                print(f"[DeepDive] No known ATS found for {req.company_name}. Using generic Playwright fallback on {careers_url}")
                from app.services.job_fetcher import fetch_generic_fallback
                discovered_jobs = fetch_generic_fallback(careers_url, req.company_name, keywords)
            else:
                print(f"[DeepDive] Could not discover careers URL for {req.company_name}")
            
    return {
        "company_info": company_info,
        "ats_info": ats_info,
        "careers_url": careers_url,
        "jobs": discovered_jobs
    }

