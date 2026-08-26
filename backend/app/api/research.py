import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from duckduckgo_search import DDGS
from app.services.company_researcher import research_company
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs

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
def deep_dive_company(req: ResearchRequest):
    # 1. Company Intelligence
    company_info = research_company(req.company_name)
    
    # 2. ATS Discovery & Fetch
    ats_info = discover_ats(req.company_name)
    discovered_jobs = []
    
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
            
    return {
        "company_info": company_info,
        "ats_info": ats_info,
        "jobs": discovered_jobs
    }
