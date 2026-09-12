import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from ddgs import DDGS
from app.services.company_researcher import research_company
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, scrape_careers_page
from app.middleware.auth import get_current_user

router = APIRouter()

class ResearchRequest(BaseModel):
    company_name: str
    target_keywords: Optional[str] = None

def discover_ats(company_name: str):
    """
    Search DDG to find if the company uses Greenhouse, Lever, Ashby, or SmartRecruiters.
    """
    query = f"site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:jobs.smartrecruiters.com {company_name} careers"
    
    try:
        with DDGS() as ddgs:
            results = ddgs.text(query, max_results=5)
            for r in results:
                url = r.get("href", "")
                
                # Check Greenhouse
                gh_match = re.search(r"boards\.greenhouse\.io/([^/]+)", url)
                if gh_match:
                    return {"system": "greenhouse", "token": gh_match.group(1)}
                    
                # Check Lever
                lever_match = re.search(r"jobs\.lever\.co/([^/]+)", url)
                if lever_match:
                    return {"system": "lever", "token": lever_match.group(1)}
                    
                # Check Ashby
                ashby_match = re.search(r"jobs\.ashbyhq\.com/([^/]+)", url)
                if ashby_match:
                    return {"system": "ashby", "token": ashby_match.group(1)}
                    
                # Check SmartRecruiters
                sr_match = re.search(r"jobs\.smartrecruiters\.com/([^/]+)", url)
                if sr_match:
                    return {"system": "smartrecruiters", "token": sr_match.group(1)}
                    
    except Exception as e:
        print(f"ATS Discovery failed: {e}")
        
    return None

@router.post("/company")
def deep_dive_company(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    # 1. Company Intelligence (runs in parallel conceptually, both fast)
    company_info = research_company(req.company_name)
    
    # 2. ATS Discovery & Fetch (Tier 1 + 2: known ATS APIs)
    ats_info = discover_ats(req.company_name)
    discovered_jobs = []
    careers_url = None
    
    keywords = [k.strip() for k in req.target_keywords.split(",")] if req.target_keywords else None
    
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
        except Exception as e:
            print(f"Failed to fetch jobs from discovered ATS {system} for {token}: {e}")
    else:
        # Tier 3: No known ATS — scrape the company's careers page directly
        print(f"[DeepDive] No ATS found for {req.company_name}, falling back to careers page scrape")
        result = scrape_careers_page(req.company_name, keywords)
        discovered_jobs = result.get("jobs", [])
        careers_url = result.get("careers_url")
            
    return {
        "company_info": company_info,
        "ats_info": ats_info,
        "careers_url": careers_url,  # Non-null when tier-3 scrape was used
        "jobs": discovered_jobs
    }

