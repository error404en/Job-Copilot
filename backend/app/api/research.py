import re
import urllib.parse
import concurrent.futures
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.services.search_manager import perform_resilient_search
from app.services.company_researcher import research_company, _get_startup_fallback_intelligence
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

def detect_ats_with_llm(company_name: str) -> Optional[CareersDiscoveryResult]:
    """
    High-speed LLM fallback (Groq / Gemini) to detect official careers portal & ATS token.
    Uses model's knowledge base in <400ms without spinning up headless browser or scraping.
    """
    import json
    from app.services.llm_client import groq_client, gemini_client, GROQ_MODEL
    prompt = f"""
For the company "{company_name}", identify:
1. The official career portal URL.
2. The Applicant Tracking System (ATS) used (e.g. greenhouse, lever, ashby, workday, smartrecruiters, or custom).
3. If there is a direct ATS board token (e.g. greenhouse token or ashby company token like 'ramp', 'linear', etc.), provide it.

Respond in JSON only with keys: "careers_url", "ats_system", "ats_token"
"""
    raw_json = None
    if groq_client:
        try:
            comp = groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=300
            )
            raw_json = comp.choices[0].message.content
        except Exception:
            pass

    if not raw_json and gemini_client:
        try:
            res = gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            raw_json = res.text
        except Exception:
            pass

    if raw_json:
        try:
            cleaned = raw_json.strip()
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0]
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0]
            data = json.loads(cleaned.strip())
            careers_url = data.get("careers_url")
            ats_sys = (data.get("ats_system") or "").lower().strip()
            ats_tok = data.get("ats_token")
            
            ats_info = None
            for known_sys in [ATSSystem.GREENHOUSE, ATSSystem.LEVER, ATSSystem.ASHBY, ATSSystem.SMARTRECRUITERS, ATSSystem.WORKDAY]:
                if known_sys.value in ats_sys and ats_tok:
                    ats_info = ATSInfo(system=known_sys, token=ats_tok)
                    break
                
            if careers_url or ats_info:
                return CareersDiscoveryResult(careers_url=careers_url, ats_info=ats_info)
        except Exception as parse_e:
            print(f"[DeepDive] LLM ATS parsing failed: {parse_e}")

    return None

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
            # Fallback for startups whose root domain was returned (e.g. https://aggroso.com)
            if not careers_url and results:
                for r in results:
                    href = r.get("href", "")
                    if href and not any(bad in href for bad in ["linkedin.", "facebook.", "twitter.", "wikipedia.", "instagram.", "crunchbase.", "glassdoor."]):
                        p = urllib.parse.urlparse(href)
                        if p.netloc:
                            careers_url = f"{p.scheme}://{p.netloc}/careers"
                            break
        except Exception as e:
            print(f"Careers URL discovery failed: {e}")
        
    url = careers_url
    
    # Check Greenhouse
    if url:
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

    # Try LLM ATS detection if no known ATS was parsed from URL
    llm_disc = detect_ats_with_llm(company_name)
    if llm_disc:
        return CareersDiscoveryResult(
            careers_url=url or llm_disc.careers_url,
            ats_info=llm_disc.ats_info
        )

    if not url:
        return CareersDiscoveryResult()
        
    return CareersDiscoveryResult(careers_url=url)

def _discover_company_jobs_and_ats(company_name: str, target_keywords: Optional[str]) -> tuple:
    """
    Subroutine for job and ATS discovery. Designed to run concurrently with company research.
    """
    from app.services.job_fetcher import VERIFIED_COMPANY_ROLES, parse_experience_requirements

    norm = company_name.lower().replace(" ", "").replace(".", "").replace("-", "")
    keywords = [k.strip() for k in target_keywords.split(",")] if target_keywords else None

    # 1. Check if curated company — instant response
    is_curated = any(key in norm or norm in key for key in VERIFIED_COMPANY_ROLES.keys())
    
    discovered_jobs = []
    careers_url = None
    ats_info = None

    if is_curated:
        print(f"[DeepDive] Curated enterprise company detected for {company_name}, skipping slow ATS search")
        result = scrape_careers_page(company_name, keywords)
        discovered_jobs = result.get("jobs", [])
        careers_url = result.get("careers_url")
        known = discover_careers_url_and_ats(company_name)
        if known and known.ats_info:
            ats_info = known.ats_info
    else:
        # 1. Discover Official Careers URL and ATS
        discovery = discover_careers_url_and_ats(company_name)
        careers_url = discovery.careers_url
        ats_info = discovery.ats_info
        print(f"[DeepDive] Detected ATS: {ats_info.system.value if ats_info else None}, token: {ats_info.token if ats_info else None}")
        
        if not ats_info:
            try:
                norm_c = re.sub(r'[^a-zA-Z0-9]', '', company_name.lower())
                query = f"{company_name} greenhouse lever ashby smartrecruiters workday jobs"
                results = perform_resilient_search(query, max_results=4)
                for r in results:
                    u = r.get("href", "")
                    cand_disc = discover_careers_url_and_ats(company_name, u)
                    if cand_disc.ats_info:
                        cand_tok = re.sub(r'[^a-zA-Z0-9]', '', cand_disc.ats_info.token.lower())
                        if norm_c in cand_tok or cand_tok in norm_c:
                            ats_info = cand_disc.ats_info
                            careers_url = u
                            print(f"[DeepDive] Validated ATS match: {ats_info.system.value} ({ats_info.token}) for {company_name}")
                            break
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
            except Exception as e:
                print(f"Failed to fetch jobs from discovered ATS {system} for {token}: {e}")

        # Tier 3: If no ATS found OR ATS returned 0 jobs -> Generic Fast Scraper Fallback on careers URL
        if not discovered_jobs and careers_url:
            print(f"[DeepDive] No ATS or 0 ATS jobs found for {company_name}. Using fast fallback on {careers_url}")
            from app.services.job_fetcher import fetch_generic_fallback
            try:
                discovered_jobs = fetch_generic_fallback(careers_url, company_name, keywords)
            except Exception as pf_e:
                print(f"[DeepDive] Generic fallback failed: {pf_e}")

        # Tier 4: Startup Job Board Search Fallback (Wellfound, Instahyre, etc.)
        if not discovered_jobs:
            try:
                startup_board_query = f'site:wellfound.com OR site:instahyre.com "{company_name}" ("Software" OR "Engineer" OR "Developer" OR "Intern")'
                board_results = perform_resilient_search(startup_board_query, max_results=3)
                for br in board_results:
                    b_title = br.get("title", "")
                    b_href = br.get("href", "")
                    b_body = br.get("body", "")
                    if b_href and b_title:
                        cleaned_title = b_title.split(" - ")[0].split(" | ")[0].split(" at ")[0].strip()
                        if len(cleaned_title) > 65:
                            cleaned_title = cleaned_title[:65]
                        discovered_jobs.append({
                            "source_type": "startup_board",
                            "source_confidence": 0.8,
                            "company": company_name,
                            "role_title": cleaned_title,
                            "url": b_href,
                            "official_apply_url": b_href,
                            "location": "India / Remote",
                            "seniority_required": "0-2 Yrs",
                            "raw_jd": f"{cleaned_title}\nCompany: {company_name}\nLocation: India / Remote\n{b_body}"
                        })
            except Exception as b_err:
                print(f"[DeepDive] Startup board search fallback failed: {b_err}")

    # Universal metadata enrichment across all tiers (ATS, generic fallback, startup boards)
    for j in discovered_jobs:
        if not j.get("experience_level") or not j.get("seniority_required"):
            meta = parse_experience_requirements(j.get("role_title", ""), j.get("raw_jd", ""))
            exp_min = meta.get("experience_min_years", 0)
            if not j.get("experience_level"):
                j["experience_level"] = "0-2 Yrs" if exp_min <= 2 else "2-5 Yrs" if exp_min < 5 else "5+ Yrs"
            if not j.get("seniority_required"):
                j["seniority_required"] = meta.get("seniority", "Unknown")

    # Filter out any invalid jobs or false links
    from app.services.job_validator import is_valid_job_posting
    valid_discovered = []
    for j in discovered_jobs:
        valid, _ = is_valid_job_posting(
            role_title=j.get("role_title", ""),
            url=j.get("url") or careers_url or "",
            company_name=company_name,
            raw_jd=j.get("raw_jd", "")
        )
        if valid:
            valid_discovered.append(j)

    return valid_discovered, careers_url, ats_info


@router.post("/company")
def deep_dive_company(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    """
    Executes ATS/job discovery and company intelligence in parallel with safe timeouts.
    Never fails or throws 500 on small startups.
    Guarantees garbage collection to keep container RAM <250MB.
    """
    import gc
    discovered_jobs = []
    careers_url = None
    ats_info = None
    company_info = None

    try:
        # Execute ATS/Jobs Discovery and Company Intelligence concurrently
        # This prevents Vercel 10-15s proxy timeout by cutting latency in half!
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_jobs = executor.submit(_discover_company_jobs_and_ats, req.company_name, req.target_keywords)
            future_info = executor.submit(research_company, req.company_name)

            try:
                discovered_jobs, careers_url, ats_info = future_jobs.result(timeout=14)
            except Exception as e:
                print(f"[DeepDive] Job discovery failed or timed out for {req.company_name}: {e}")
                discovered_jobs, careers_url, ats_info = [], None, None

            try:
                company_info = future_info.result(timeout=14)
            except Exception as e:
                print(f"[DeepDive] Company intelligence failed or timed out for {req.company_name}: {e}")
                company_info = _get_startup_fallback_intelligence(req.company_name)

        if not company_info:
            company_info = _get_startup_fallback_intelligence(req.company_name)

        norm_c = req.company_name.lower().replace(" ", "").replace(".", "").replace("-", "")
        return {
            "company_info": company_info,
            "ats_info": ats_info.model_dump() if ats_info else None,
            "careers_url": careers_url or f"https://www.{norm_c}.com",
            "jobs": discovered_jobs or []
        }
    finally:
        gc.collect()

@router.post("/discover-ats")
def discover_ats_endpoint(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    discovery = discover_careers_url_and_ats(req.company_name)
    return {
        "careers_url": discovery.careers_url,
        "ats_info": discovery.ats_info.model_dump() if discovery.ats_info else None
    }
