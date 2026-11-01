import re
import urllib.parse
import concurrent.futures
import requests
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from app.services.search_manager import perform_resilient_search
from app.services.company_researcher import research_company, _get_startup_fallback_intelligence
from app.services.job_fetcher import fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, scrape_careers_page
from app.middleware.auth import get_current_user
from app.models.discovery import ATSInfo, ATSSystem, CareersDiscoveryResult
from app.services.careers_resolver import (
    classify_careers_url,
    company_slug,
    find_official_careers_url,
    match_registry_key,
    token_matches_company,
    trust_urls,
    verify_ats_token,
    verify_careers_url,
)
from app.utils.security import validate_safe_url

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
    ),
    "americanexpress": CareersDiscoveryResult(
        careers_url="https://careers.americanexpress.com/en/sites/CX_1",
        ats_info=None
    )
}

# Hand-curated portals are trusted for their own company (e.g. search.jobs.barclays, higher.gs.com)
trust_urls({k: v.careers_url for k, v in KNOWN_COMPANY_ATS.items() if v.careers_url})
try:
    from app.services.job_fetcher import VERIFIED_COMPANY_ROLES as _VCR
    trust_urls({k: v["careers_url"] for k, v in _VCR.items() if v.get("careers_url")})
except Exception as _e:  # pragma: no cover
    print(f"[Research] Could not register curated careers hosts: {_e}")

_ATS_BOARD_URL = {
    ATSSystem.GREENHOUSE: "https://boards.greenhouse.io/{t}",
    ATSSystem.LEVER: "https://jobs.lever.co/{t}",
    ATSSystem.ASHBY: "https://jobs.ashbyhq.com/{t}",
    ATSSystem.SMARTRECRUITERS: "https://jobs.smartrecruiters.com/{t}",
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
            
            # Clean and sanitize ats_tok if it's a full URL or has trailing slashes/params
            if ats_tok and isinstance(ats_tok, str):
                ats_tok = ats_tok.strip().split("?")[0].strip("/")
                if "lever.co/" in ats_tok:
                    m = re.search(r"lever\.co/([^/?#]+)", ats_tok)
                    if m:
                        ats_tok = m.group(1)
                elif "greenhouse.io/" in ats_tok:
                    m = re.search(r"greenhouse\.io/([^/?#]+)", ats_tok)
                    if m:
                        ats_tok = m.group(1)
                elif "ashbyhq.com/" in ats_tok:
                    m = re.search(r"ashbyhq\.com/([^/?#]+)", ats_tok)
                    if m:
                        ats_tok = m.group(1)
                elif "smartrecruiters.com/" in ats_tok:
                    m = re.search(r"smartrecruiters\.com/([^/?#]+)", ats_tok)
                    if m:
                        ats_tok = m.group(1)
                elif "/" in ats_tok and "workday" not in ats_sys:
                    ats_tok = ats_tok.split("/")[-1]
            
            ats_info = None
            for known_sys in [ATSSystem.GREENHOUSE, ATSSystem.LEVER, ATSSystem.ASHBY, ATSSystem.SMARTRECRUITERS, ATSSystem.WORKDAY]:
                if known_sys.value in ats_sys and ats_tok:
                    ats_info = ATSInfo(system=known_sys, token=ats_tok)
                    break

            # LLM output is a HINT, never a fact: verify before trusting.
            if ats_info and ats_info.system != ATSSystem.WORKDAY:
                if not token_matches_company(ats_info.token, company_name) or not verify_ats_token(ats_info.system, ats_info.token):
                    print(f"[DeepDive] Discarded unverified LLM ATS guess {ats_info.system.value}:{ats_info.token} for {company_name}")
                    ats_info = None
            if ats_info and ats_info.system == ATSSystem.WORKDAY:
                ats_info = None  # Workday tokens can't be guessed; only trusted when parsed from a real URL

            careers_url = verify_careers_url(careers_url, company_name)
            if not careers_url and ats_info:
                careers_url = _ATS_BOARD_URL.get(ats_info.system, "").format(t=ats_info.token) or None

            if careers_url or ats_info:
                return CareersDiscoveryResult(careers_url=careers_url, ats_info=ats_info)
        except Exception as parse_e:
            print(f"[DeepDive] LLM ATS parsing failed: {parse_e}")

    return None

def discover_careers_url_and_ats(company_name: str, careers_url: Optional[str] = None) -> CareersDiscoveryResult:
    """
    Company -> official domain -> official careers URL -> detect known ATS
    """
    c_raw = (company_name or "").strip()
    c_lower = c_raw.lower()

    # 0a. Check if company_name itself is an ATS URL or domain URL
    if not careers_url and any(ats_domain in c_lower for ats_domain in ["jobs.lever.co", "boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.ashbyhq.com", "jobs.smartrecruiters.com", "myworkdayjobs.com"]):
        careers_url = c_raw if c_raw.startswith("http") else f"https://{c_raw}"

    supplied = bool(careers_url)

    # 0b. Check curated high-priority registry first (instant 0ms resolution).
    # Strict matching: 'Google India' -> google, but 'Stripes Foods' does NOT match 'stripe'.
    if not careers_url:
        key = match_registry_key(company_name, KNOWN_COMPANY_ATS.keys())
        if key:
            return KNOWN_COMPANY_ATS[key]

    # 0c. Search the web, but accept ONLY a verified official-domain / ATS careers URL.
    # Aggregators (Indeed/Naukri/LinkedIn/...), promo/blog/pricing pages and LLM-invented
    # links are rejected inside find_official_careers_url.
    if not careers_url:
        try:
            careers_url = find_official_careers_url(company_name, search_fn=perform_resilient_search)
        except Exception as e:
            print(f"Careers URL discovery failed: {e}")

    url = careers_url
    ats_found = None
    
    # Check Greenhouse
    if url:
        gh_match = re.search(r"(?:job-)?boards\.greenhouse\.io/([^/?#]+)", url)
        if gh_match:
            ats_found = ATSInfo(system=ATSSystem.GREENHOUSE, token=gh_match.group(1))
            
        # Check Lever
        if not ats_found:
            lever_match = re.search(r"jobs\.lever\.co/([^/?#]+)", url)
            if lever_match:
                ats_found = ATSInfo(system=ATSSystem.LEVER, token=lever_match.group(1))
            
        # Check Ashby
        if not ats_found:
            ashby_match = re.search(r"jobs\.ashbyhq\.com/([^/?#]+)", url)
            if ashby_match:
                ats_found = ATSInfo(system=ATSSystem.ASHBY, token=ashby_match.group(1))
            
        # Check SmartRecruiters
        if not ats_found:
            sr_match = re.search(r"jobs\.smartrecruiters\.com/([^/?#]+)", url)
            if sr_match:
                ats_found = ATSInfo(system=ATSSystem.SMARTRECRUITERS, token=sr_match.group(1))
            
        # Check Workday
        if not ats_found:
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
                    
                ats_found = ATSInfo(system=ATSSystem.WORKDAY, token=f"{host_prefix}/{tenant}/{site}")

    if ats_found:
        return CareersDiscoveryResult(careers_url=url, ats_info=ats_found)

    # A non-ATS URL is only ever surfaced if it is on the company's own domain and not promotional.
    official_ok, url_kind = classify_careers_url(url, company_name) if url else (False, "")
    if url and not official_ok:
        print(f"[DeepDive] Ignoring non-official/promotional URL for {company_name}: {url}")
        url = None

    # If careers_url is a custom (official) domain (not already a known ATS host), inspect page HTML for embedded Lever / Greenhouse / Ashby / SmartRecruiters links
    if url and url_kind != "ats":
        try:
            validate_safe_url(url)
            resp = requests.get(url, timeout=4, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            if resp.status_code == 200:
                html_chunk = resp.text[:100000]
                for sys_enum, pattern in (
                    (ATSSystem.LEVER, r"https?://jobs\.lever\.co/([a-zA-Z0-9_\-]+)"),
                    (ATSSystem.GREENHOUSE, r"https?://(?:job-)?boards\.greenhouse\.io/([a-zA-Z0-9_\-]+)"),
                    (ATSSystem.ASHBY, r"https?://jobs\.ashbyhq\.com/([a-zA-Z0-9_\-]+)"),
                    (ATSSystem.SMARTRECRUITERS, r"https?://jobs\.smartrecruiters\.com/([a-zA-Z0-9_\-]+)"),
                ):
                    m = re.search(pattern, html_chunk)
                    if m and verify_ats_token(sys_enum, m.group(1)):
                        return CareersDiscoveryResult(careers_url=url, ats_info=ATSInfo(system=sys_enum, token=m.group(1)))
        except Exception as html_e:
            print(f"[DeepDive] Career page HTML inspection skipped: {html_e}")

    # Try LLM ATS detection (verified inside) only when WE are discovering. For caller-supplied
    # URLs (e.g. social leads) an LLM guess must never 'verify' an unrelated third-party link.
    if not supplied:
        llm_disc = detect_ats_with_llm(company_name)
        if llm_disc:
            return CareersDiscoveryResult(
                careers_url=url or llm_disc.careers_url,
                ats_info=llm_disc.ats_info
            )

    if not url:
        return CareersDiscoveryResult()

    return CareersDiscoveryResult(careers_url=url)

def _discover_company_jobs_and_ats(company_name: str, target_keywords: Optional[str], progress: Optional[dict] = None) -> tuple:
    """
    Subroutine for job and ATS discovery. Designed to run concurrently with company research.
    """
    from app.services.job_fetcher import VERIFIED_COMPANY_ROLES, parse_experience_requirements

    keywords = [k.strip() for k in target_keywords.split(",")] if target_keywords else None

    # 1. Check if curated company — instant response (strict match, no loose substrings)
    is_curated = match_registry_key(company_name, VERIFIED_COMPANY_ROLES.keys()) is not None
    
    discovered_jobs = []
    careers_url = None
    ats_info = None

    if is_curated:
        print(f"[DeepDive] Curated enterprise company detected for {company_name}, skipping slow ATS search")
        result = scrape_careers_page(company_name, keywords)
        discovered_jobs = result.get("jobs", [])
        careers_url = result.get("careers_url")
        known_key = match_registry_key(company_name, KNOWN_COMPANY_ATS.keys())
        known = KNOWN_COMPANY_ATS.get(known_key) if known_key else None
        if known and known.ats_info:
            ats_info = known.ats_info
        if not careers_url and known:
            careers_url = known.careers_url
        if progress is not None:
            progress["careers_url"], progress["ats_info"] = careers_url, ats_info
    else:
        # 1. Discover Official Careers URL and ATS
        discovery = discover_careers_url_and_ats(company_name)
        careers_url = discovery.careers_url
        ats_info = discovery.ats_info
        # Publish partial results immediately so a timeout never throws away what we already verified
        if progress is not None:
            progress["careers_url"], progress["ats_info"] = careers_url, ats_info
        print(f"[DeepDive] Detected ATS: {ats_info.system.value if ats_info else None}, token: {ats_info.token if ats_info else None}")
        
        if not ats_info:
            try:
                query = f"{company_name} greenhouse lever ashby smartrecruiters workday jobs"
                results = perform_resilient_search(query, max_results=4)
                for r in results:
                    u = r.get("href", "")
                    if not any(ats_d in u.lower() for ats_d in ("greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com", "myworkdayjobs.com", "workdayjobs.com")):
                        continue
                    cand_disc = discover_careers_url_and_ats(company_name, u)
                    if cand_disc.ats_info:
                        if token_matches_company(cand_disc.ats_info.token, company_name) and verify_ats_token(cand_disc.ats_info.system, cand_disc.ats_info.token):
                            ats_info = cand_disc.ats_info
                            careers_url = u
                            if progress is not None:
                                progress["careers_url"], progress["ats_info"] = careers_url, ats_info
                            print(f"[DeepDive] Validated ATS match: {ats_info.system.value} ({ats_info.token}) for {company_name}")
                            break
            except Exception as e:
                print(f"[DeepDive] Fallback ATS search failed: {e}")

        if ats_info:
            system = ats_info.system.value
            token = ats_info.token
            try:
                if system == "greenhouse":
                    discovered_jobs = fetch_greenhouse_jobs(token, keywords, allow_all_locations=True)
                elif system == "lever":
                    discovered_jobs = fetch_lever_jobs(token, keywords, allow_all_locations=True)
                elif system == "ashby":
                    discovered_jobs = fetch_ashby_jobs(token, keywords, allow_all_locations=True)
                elif system == "smartrecruiters":
                    discovered_jobs = fetch_smartrecruiters_jobs(token, keywords, allow_all_locations=True)
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
        # Only real postings that are actually about this company are kept - no generic
        # directory/company-overview pages and no unrelated promotional results.
        if not discovered_jobs:
            try:
                startup_board_query = f'site:wellfound.com OR site:instahyre.com "{company_name}" ("Software" OR "Engineer" OR "Developer" OR "Intern")'
                board_results = perform_resilient_search(startup_board_query, max_results=3)
                brand_toks = [t for t in re.findall(r"[a-z0-9]+", company_name.lower()) if len(t) >= 3]
                for br in board_results:
                    b_title = br.get("title", "")
                    b_href = br.get("href", "")
                    b_body = br.get("body", "")
                    b_host = (urllib.parse.urlparse(b_href).hostname or "").lower()
                    if not any(b_host == d or b_host.endswith("." + d) for d in ("wellfound.com", "instahyre.com")):
                        print(f"[DeepDive] Discarded non-board result for {company_name}: {b_href}")
                        continue
                    if brand_toks and not any(t in f"{b_title} {b_body} {b_href}".lower() for t in brand_toks):
                        print(f"[DeepDive] Discarded off-topic board result for {company_name}: {b_href}")
                        continue
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
    from app.services.job_fetcher import check_role_location_and_relocation
    for j in discovered_jobs:
        loc_info = check_role_location_and_relocation(j.get("location", ""), j.get("raw_jd", ""))
        j["is_india_or_remote"] = loc_info["is_india_or_remote"]
        j["is_abroad"] = loc_info["is_abroad"]
        j["covers_relocation"] = loc_info["covers_relocation"]
        j["is_eligible_for_indian_fresher"] = loc_info["is_eligible_for_indian_fresher"]

        if not j.get("experience_level") or not j.get("seniority_required"):
            meta = parse_experience_requirements(j.get("role_title", ""), j.get("raw_jd", ""))
            exp_min = meta.get("experience_min_years", 0)
            if not j.get("experience_level"):
                j["experience_level"] = "0-2 Yrs" if exp_min <= 2 else "2-5 Yrs" if exp_min < 5 else "5+ Yrs"
            if not j.get("seniority_required"):
                j["seniority_required"] = meta.get("seniority", "Unknown")

        title_lower = (j.get("role_title") or "").lower()
        sen_lower = (j.get("seniority_required") or "").lower()
        exp_lower = (j.get("experience_level") or "").lower()
        is_senior = any(re.search(r'\b' + re.escape(w) + r'\b', title_lower) for w in ["senior", "sr", "lead", "principal", "staff", "architect", "director", "manager", "head"]) or "5+" in exp_lower
        j["is_fresher_role"] = not is_senior and ("0-2" in exp_lower or "fresher" in sen_lower or "entry" in sen_lower or "intern" in title_lower or "associate" in title_lower or "analyst" in title_lower or "graduate" in title_lower or "trainee" in title_lower)

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

    # Smart Fresher-First Sorting: India/Remote fresher roles & abroad roles with relocation appear first
    def _fresher_loc_priority(job):
        is_fresher = job.get("is_fresher_role", False)
        is_eligible_loc = job.get("is_eligible_for_indian_fresher", False)
        has_reloc = job.get("covers_relocation", False)
        if is_fresher and is_eligible_loc:
            return 0  # 1st Priority: India/Remote Fresher or Relocation-covered Fresher
        if is_eligible_loc:
            return 1  # 2nd Priority: Other India/Remote openings
        if has_reloc:
            return 2  # 3rd Priority: Abroad with verified relocation
        if is_fresher:
            return 3  # 4th Priority: Fresher abroad
        return 4      # Lowest Priority: Senior abroad without relocation

    valid_discovered.sort(key=_fresher_loc_priority)
    return valid_discovered, careers_url, ats_info


@router.post("/company")
def deep_dive_company(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    """
    Executes ATS/job discovery and company intelligence in parallel with safe timeouts.
    Never fails or throws 500 on small startups.
    Guarantees garbage collection to keep container RAM <250MB.
    """
    import gc
    import time
    discovered_jobs = []
    careers_url = None
    ats_info = None
    company_info = None
    progress: dict = {}  # filled by the worker as soon as it has verified something

    # NOTE: no `with ThreadPoolExecutor` - its __exit__ blocks until the threads finish, which
    # defeated the timeout. We shut down without waiting so the response returns on time.
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    try:
        # Execute ATS/Jobs Discovery and Company Intelligence concurrently
        # This prevents Vercel 10-15s proxy timeout by cutting latency in half!
        started = time.time()
        future_jobs = executor.submit(_discover_company_jobs_and_ats, req.company_name, req.target_keywords, progress)
        future_info = executor.submit(research_company, req.company_name)

        try:
            discovered_jobs, careers_url, ats_info = future_jobs.result(timeout=14)
        except Exception as e:
            err_detail = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            print(f"[DeepDive] Job discovery failed or timed out for {req.company_name}: {err_detail}")
            # Keep whatever was already verified instead of discarding it
            discovered_jobs = progress.get("jobs", [])
            careers_url = progress.get("careers_url")
            ats_info = progress.get("ats_info")

        try:
            company_info = future_info.result(timeout=max(1.0, 14 - (time.time() - started)))
        except Exception as e:
            err_detail = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            print(f"[DeepDive] Company intelligence failed or timed out for {req.company_name}: {err_detail}")
            company_info = _get_startup_fallback_intelligence(req.company_name)

        if not company_info:
            company_info = _get_startup_fallback_intelligence(req.company_name)

        # Never surface an unverified / promotional / aggregator URL as the "official" careers page.
        # We no longer fabricate https://www.<name>.com - if nothing is verified, return None.
        if careers_url and not classify_careers_url(careers_url, req.company_name)[0]:
            print(f"[DeepDive] Dropping non-official careers_url for {req.company_name}: {careers_url}")
            careers_url = None

        return {
            "company_info": company_info,
            "ats_info": ats_info.model_dump() if ats_info else None,
            "careers_url": careers_url,
            "careers_url_verified": bool(careers_url),
            "jobs": discovered_jobs or []
        }
    finally:
        executor.shutdown(wait=False)
        gc.collect()

@router.post("/discover-ats")
def discover_ats_endpoint(req: ResearchRequest, user_id: str = Depends(get_current_user)):
    discovery = discover_careers_url_and_ats(req.company_name)
    return {
        "careers_url": discovery.careers_url,
        "ats_info": discovery.ats_info.model_dump() if discovery.ats_info else None
    }
