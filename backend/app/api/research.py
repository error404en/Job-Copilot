import re
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.services.search_manager import perform_resilient_search
from app.services.company_researcher import research_company
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, scrape_careers_page
from app.middleware.auth import get_current_user
from app.models.discovery import ATSInfo, ATSSystem, CareersDiscoveryResult

router = APIRouter()

class ResearchRequest(BaseModel):
    company_name: str
    target_keywords: Optional[str] = None

KNOWN_COMPANY_ATS = {
    "stripe": CareersDiscoveryResult(
        careers_url="https://stripe.com/jobs",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="stripe")
    ),
    "eternal": CareersDiscoveryResult(
        careers_url="https://www.zomato.com/careers",
        ats_info=ATSInfo(system=ATSSystem.SMARTRECRUITERS, token="Zomato1")
    ),
    "zomato": CareersDiscoveryResult(
        careers_url="https://www.zomato.com/careers",
        ats_info=ATSInfo(system=ATSSystem.SMARTRECRUITERS, token="Zomato1")
    ),
    "blinkit": CareersDiscoveryResult(
        careers_url="https://blinkit.com/careers",
        ats_info=ATSInfo(system=ATSSystem.SMARTRECRUITERS, token="Zomato1")
    ),
    "uber": CareersDiscoveryResult(
        careers_url="https://www.uber.com/us/en/careers/",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="uber")
    ),
    "rubrik": CareersDiscoveryResult(
        careers_url="https://www.rubrik.com/company/careers",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="rubrik")
    ),
    "databricks": CareersDiscoveryResult(
        careers_url="https://www.databricks.com/company/careers",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="databricks")
    ),
    "atlassian": CareersDiscoveryResult(
        careers_url="https://www.atlassian.com/company/careers",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="atlassian")
    ),
    "coinbase": CareersDiscoveryResult(
        careers_url="https://www.coinbase.com/careers",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="coinbase")
    ),
    "figma": CareersDiscoveryResult(
        careers_url="https://www.figma.com/careers",
        ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token="figma")
    ),
    "qualcomm": CareersDiscoveryResult(
        careers_url="https://careers.qualcomm.com/careers",
        ats_info=None
    ),
    "goldmansachs": CareersDiscoveryResult(
        careers_url="https://higher.gs.com/results?JOB_FUNCTION=Software%20Engineering",
        ats_info=None
    ),
    "google": CareersDiscoveryResult(
        careers_url="https://careers.google.com/jobs/results/?location=India",
        ats_info=None
    ),
    "microsoft": CareersDiscoveryResult(
        careers_url="https://jobs.careers.microsoft.com/global/en/search?lc=India",
        ats_info=None
    ),
    "amazon": CareersDiscoveryResult(
        careers_url="https://www.amazon.jobs/en/search?base_query=Software+Development+Engineer+I&loc_query=India",
        ats_info=None
    ),
    "barclays": CareersDiscoveryResult(
        careers_url="https://search.jobs.barclays/search-jobs/India?orgIds=13014&alp=1269750&alt=2",
        ats_info=None
    ),
    "hsbc": CareersDiscoveryResult(
        careers_url="https://mycareer.hsbc.com/en_GB/external/SearchJobs/?1051=%5B%221294%22%5D",
        ats_info=None
    ),
    "jpmorgan": CareersDiscoveryResult(
        careers_url="https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/requisitions?location=India",
        ats_info=None
    ),
    "hcltech": CareersDiscoveryResult(
        careers_url="https://www.hcltech.com/careers",
        ats_info=None
    ),
    "zsassociates": CareersDiscoveryResult(
        careers_url="https://jobs.zs.com/",
        ats_info=None
    )
}

def discover_careers_url_and_ats(company_name: str, careers_url: Optional[str] = None) -> CareersDiscoveryResult:
    """
    Company -> official domain -> official careers URL -> detect known ATS
    """
    norm = company_name.lower().replace(" ", "").replace(".", "").replace("-", "")
    
    # 0. Check curated high-priority registry first (instant 0ms resolution)
    if not careers_url:
        for k, res in KNOWN_COMPANY_ATS.items():
            if k in norm or norm in k:
                return res

    query = f"{company_name} official careers portal"
    
    if not careers_url:
        try:
            results = perform_resilient_search(query, max_results=3)
            for r in results:
                href = r.get("href", "")
                if any(kw in href.lower() for kw in ["career", "job", "join", "hiring", "work"]):
                    careers_url = href
                    break
        except Exception as e:
            print(f"Careers URL discovery failed: {e}")
        
    if not careers_url:
        return CareersDiscoveryResult()
        
    url = careers_url
    
    # Check Greenhouse
    gh_match = re.search(r"boards\.greenhouse\.io/([^/]+)", url)
    if gh_match:
        return CareersDiscoveryResult(careers_url=url, ats_info=ATSInfo(system=ATSSystem.GREENHOUSE, token=gh_match.group(1)))
        
    # Check Lever
    lever_match = re.search(r"jobs\.lever\.co/([^/]+)", url)
    if lever_match:
        return CareersDiscoveryResult(careers_url=url, ats_info=ATSInfo(system=ATSSystem.LEVER, token=lever_match.group(1)))
        
    # Check Ashby
    ashby_match = re.search(r"jobs\.ashbyhq\.com/([^/]+)", url)
    if ashby_match:
        return CareersDiscoveryResult(careers_url=url, ats_info=ATSInfo(system=ATSSystem.ASHBY, token=ashby_match.group(1)))
        
    # Check SmartRecruiters
    sr_match = re.search(r"jobs\.smartrecruiters\.com/([^/]+)", url)
    if sr_match:
        return CareersDiscoveryResult(careers_url=url, ats_info=ATSInfo(system=ATSSystem.SMARTRECRUITERS, token=sr_match.group(1)))
        
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
            
        return CareersDiscoveryResult(careers_url=url, ats_info=ATSInfo(system=ATSSystem.WORKDAY, token=f"{host_prefix}/{tenant}/{site}"))
        
    return CareersDiscoveryResult(careers_url=url)

@router.post("/company")
def deep_dive_company(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    from app.services.job_fetcher import VERIFIED_COMPANY_ROLES, parse_experience_requirements

    norm = req.company_name.lower().replace(" ", "").replace(".", "").replace("-", "")
    keywords = [k.strip() for k in req.target_keywords.split(",")] if req.target_keywords else None

    # 1. Check if curated company — instant response
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
        # Attach known ATS info if available (e.g. Stripe -> Greenhouse, Eternal -> SmartRecruiters)
        known = discover_careers_url_and_ats(req.company_name)
        if known and known.ats_info:
            ats_info = known.ats_info
    else:
        # 1. Discover Official Careers URL and ATS
        discovery = discover_careers_url_and_ats(req.company_name)
        careers_url = discovery.careers_url
        ats_info = discovery.ats_info
        print(f"[DeepDive] Detected ATS: {ats_info.system.value if ats_info else None}, token: {ats_info.token if ats_info else None}")
        
        # If the careers_url itself isn't an ATS link, we might want to do a deeper check, but the user explicitly requested this exact flow.
        # Fallback: if discovery didn't find the direct ATS link because it's a vanity url, we can check a direct DDG search for the ATS just in case
        if not ats_info:
            try:
                norm_c = re.sub(r'[^a-zA-Z0-9]', '', req.company_name.lower())
                query = f"{req.company_name} greenhouse lever ashby smartrecruiters workday jobs"
                results = perform_resilient_search(query, max_results=5)
                for r in results:
                    u = r.get("href", "")
                    cand_disc = discover_careers_url_and_ats(req.company_name, u)
                    if cand_disc.ats_info:
                        cand_tok = re.sub(r'[^a-zA-Z0-9]', '', cand_disc.ats_info.token.lower())
                        # Token MUST match company name (prevents random hijack like upshop/altisource)
                        if norm_c in cand_tok or cand_tok in norm_c:
                            ats_info = cand_disc.ats_info
                            careers_url = u
                            print(f"[DeepDive] Validated ATS match: {ats_info.system.value} ({ats_info.token}) for {req.company_name}")
                            break
                        else:
                            print(f"[DeepDive] Rejected false ATS token '{cand_disc.ats_info.token}' for company '{req.company_name}'")
            except Exception as e:
                print(f"[DeepDive] Fallback ATS search failed: {e}")

        if ats_info:
            system = ats_info.system.value
            token = ats_info.token
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
                        exp_min = meta.get("experience_min_years", 0)
                        j["experience_level"] = "0-2 Yrs" if exp_min <= 2 else "2-5 Yrs" if exp_min < 5 else "5+ Yrs"
                        j["seniority_required"] = meta.get("seniority", "Unknown")
            except Exception as e:
                print(f"Failed to fetch jobs from discovered ATS {system} for {token}: {e}")

        # Tier 3: If no ATS found OR ATS returned 0 jobs -> Generic Playwright Fallback on careers URL
        if not discovered_jobs and careers_url:
            print(f"[DeepDive] No ATS or 0 ATS jobs found for {req.company_name}. Using Playwright fallback on {careers_url}")
            from app.services.job_fetcher import fetch_generic_fallback
            try:
                discovered_jobs = fetch_generic_fallback(careers_url, req.company_name, keywords)
            except Exception as pf_e:
                print(f"[DeepDive] Generic Playwright fallback failed: {pf_e}")
        elif not discovered_jobs and not careers_url:
            print(f"[DeepDive] Could not discover careers URL for {req.company_name}")
                
    # Filter out any invalid jobs or false links
    from app.services.job_validator import is_valid_job_posting
    valid_discovered = []
    for j in discovered_jobs:
        valid, _ = is_valid_job_posting(
            role_title=j.get("role_title", ""),
            url=j.get("url") or careers_url or "",
            company_name=req.company_name,
            raw_jd=j.get("raw_jd", "")
        )
        if valid:
            valid_discovered.append(j)
    discovered_jobs = valid_discovered

    # 2. Company Intelligence (runs fast with benchmark fallback, but searches might take time)
    # By running this AFTER job fetching, we prioritize the ATS extraction which is more important.
    company_info = research_company(req.company_name)
            
    return {
        "company_info": company_info,
        "ats_info": ats_info.model_dump() if ats_info else None,
        "careers_url": careers_url,
        "jobs": discovered_jobs
    }

@router.post("/discover-ats")
def discover_ats_endpoint(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    discovery = discover_careers_url_and_ats(req.company_name)
    return {
        "careers_url": discovery.careers_url,
        "ats_info": discovery.ats_info.model_dump() if discovery.ats_info else None
    }
