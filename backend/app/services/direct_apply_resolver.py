"""
Direct Apply Resolver & Careers Portal Explorer
Solves the problem where job links lead to generic career landing pages (/careers, homepage)
instead of the exact direct requisition apply page.

Capabilities:
1. Deterministic detection of generic vs. direct requisition URLs.
2. Intelligent resolution to exact direct ATS / job posting URLs (Lever, Greenhouse, Ashby, Workday, Keka, etc.).
3. Live HTML link extraction on careers pages to locate the exact requisition.
4. Targeted portal search URL generator with pre-filled role keywords and experience level filters.
"""

import logging
import re
import urllib.parse
from typing import Dict, List, Optional, Tuple
import requests
from bs4 import BeautifulSoup

from app.services.careers_resolver import _host, brand_tokens, company_slug, is_ats_host
from app.services.job_fetcher import (
    fetch_greenhouse_jobs,
    fetch_lever_jobs,
    fetch_ashby_jobs,
    fetch_smartrecruiters_jobs,
    fetch_workday_jobs,
)

logger = logging.getLogger(__name__)

_REQ_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Regex to identify URLs that are generic career landing pages rather than exact job requisitions
_GENERIC_CAREER_PATH_RE = re.compile(
    r"^/(?:careers?|jobs?|openings?|opportunities|work-with-us|join-us|join|career-opportunities|current-openings)/*$",
    re.I,
)

_GENERIC_COUNTRY_CAREER_PATH_RE = re.compile(
    r"^/(?:careers?|jobs?)/(?:india|us|uk|global|in|en|en-us|emea|apac)/*$",
    re.I,
)

# Known direct requisition URL indicators
_DIRECT_JOB_PATTERNS = [
    # Lever: /company/{uuid}
    re.compile(r"jobs\.lever\.co/[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I),
    # Greenhouse: /jobs/{id} or token={id} or gh_jid={id}
    re.compile(r"boards\.greenhouse\.io/[^/]+/jobs/\d+", re.I),
    re.compile(r"job-boards\.greenhouse\.io/[^/]+/jobs/\d+", re.I),
    re.compile(r"[?&]token=\d+", re.I),
    re.compile(r"[?&]gh_jid=\d+", re.I),
    # Ashby: /{company}/{uuid} or /job/{uuid}
    re.compile(r"jobs\.ashbyhq\.com/[^/]+/[0-9a-fA-F-]+", re.I),
    # Workday: /job/{location}/{title}_{id} or similar
    re.compile(r"myworkdayjobs\.com/.+/job/", re.I),
    # SmartRecruiters: /{company}/{id}
    re.compile(r"smartrecruiters\.com/[^/]+/\d+", re.I),
    # Keka: /careers/jobdetails/{id}
    re.compile(r"keka\.com/careers/jobdetails/\d+", re.I),
    # HackerRank: /careers/job?id={id}
    re.compile(r"hackerrank\.com/careers/job\?id=\d+", re.I),
    # Goldman Sachs: /roles/{id}
    re.compile(r"higher\.gs\.com/roles/\d+", re.I),
    # Oracle Cloud: /requisitions/{id} or /job/{id}
    re.compile(r"oraclecloud\.com/.+/(?:job|requisitions?)/\d+", re.I),
    # Qualcomm: /careers/job/{id}
    re.compile(r"careers\.qualcomm\.com/careers/job/\d+", re.I),
    # Stripe: /careers/listing/{slug}/{id}
    re.compile(r"stripe\.com/careers/listing/.+/\d+", re.I),
    # BlackRock: /job/{loc}/{slug}/{id}
    re.compile(r"careers\.blackrock\.com/job/.+/\d+", re.I),
    # EA / GE Aerospace: /JobDetail/ or /job/
    re.compile(r"jobs\.ea\.com/.+/JobDetail/", re.I),
    re.compile(r"careers\.geaerospace\.com/.+/job/", re.I),
    re.compile(r"careers\.idfcfirst\.bank\.in/.+/job/", re.I),
    # Query string with explicit numeric job/requisition id
    re.compile(r"[?&](?:job_id|jobId|req_id|requisitionId|id)=\d+", re.I),
    # Standard requisition paths with IDs: /job/{id}, /jobs/{id}, /careers/{id}, /role/{id}
    re.compile(r"/(?:job|jobs|careers|role|roles|position|positions)/[A-Za-z0-9-_]*\d+[A-Za-z0-9-_]*", re.I),
    # LinkedIn direct job posting
    re.compile(r"linkedin\.com/jobs/view/\d+", re.I),
    re.compile(r"linkedin\.com/jobs/search-results/\?currentJobId=\d+", re.I),
]


def normalize_requisition_url(url: Optional[str]) -> Optional[str]:
    """
    Normalizes URLs that contain embedded job IDs into clean direct apply links.
    e.g. LinkedIn search results with currentJobId=4438275427 -> https://www.linkedin.com/jobs/view/4438275427
    """
    if not url or not url.strip():
        return url

    clean_url = url.strip()

    # 1. LinkedIn currentJobId normalization (strip search filters and point directly to job)
    if "linkedin.com" in clean_url:
        m = re.search(r"[?&]currentJobId=(\d+)", clean_url)
        if m:
            return f"https://www.linkedin.com/jobs/view/{m.group(1)}"

    # 2. Databricks Greenhouse gh_jid normalization
    if "gh_jid=" in clean_url and "databricks" in clean_url.lower():
        m = re.search(r"[?&]gh_jid=(\d+)", clean_url)
        if m:
            return f"https://boards.greenhouse.io/databricks/jobs/{m.group(1)}"

    return clean_url


def is_generic_careers_url(url: Optional[str]) -> bool:
    """
    Returns True if the URL points to a generic careers landing page or home page
    where the candidate must manually search for the role.
    Returns False if it appears to be a direct requisition posting.
    """
    if not url or not url.strip():
        return True

    clean_url = normalize_requisition_url(url) or url.strip()
    try:
        parsed = urllib.parse.urlparse(clean_url)
    except Exception:
        return True

    path = parsed.path.rstrip("/")
    query = parsed.query

    # Root domain with empty or "/" path is generic
    if not path or path == "/":
        return True

    # Check against known direct patterns
    for pat in _DIRECT_JOB_PATTERNS:
        if pat.search(clean_url):
            return False

    # Check for generic path patterns
    if _GENERIC_CAREER_PATH_RE.match(path):
        return True

    if _GENERIC_COUNTRY_CAREER_PATH_RE.match(path):
        return True

    # Generic search endpoints without an individual job id
    if any(s in path.lower() for s in ["/search", "/results", "/jobsearch", "/all-jobs", "/browse-jobs"]):
        return True

    # Lever root board (e.g. https://jobs.lever.co/company or https://jobs.lever.co/company?keyword=...)
    if "jobs.lever.co" in parsed.netloc:
        parts = [p for p in path.split("/") if p]
        if len(parts) <= 1:
            return True

    # Greenhouse root board
    if "greenhouse.io" in parsed.netloc:
        parts = [p for p in path.split("/") if p]
        if len(parts) <= 1 and not ("token=" in query):
            return True

    # Workday tenant root
    if "myworkdayjobs.com" in parsed.netloc and "/job/" not in path:
        return True

    # If the path is short or ends with a generic career keyword, likely a section landing page
    path_segments = [p for p in path.split("/") if p]
    last_seg = path_segments[-1].lower() if path_segments else ""
    if last_seg in [
        "careers", "jobs", "join-us", "work-with-us", "openings", "career", "job", "opportunities", "current-openings"
    ]:
        return True
    if len(path_segments) == 1 and path_segments[0].lower() in [
        "careers", "jobs", "join-us", "work-with-us", "openings", "career", "job"
    ]:
        return True

    return False


def _clean_role_tokens(role_title: str) -> List[str]:
    """Clean and tokenize role title into search terms, removing generic stop words."""
    cleaned = re.sub(r"\b(job|posting|requisition|at|in|full-time|part-time|remote|hybrid)\b", "", role_title, flags=re.I)
    cleaned = re.sub(r"https?://\S+", "", cleaned)
    tokens = re.findall(r"[A-Za-z0-9]+", cleaned)
    stop = {"the", "a", "an", "for", "and", "or", "of", "to", "with", "is"}
    return [t for t in tokens if t.lower() not in stop and len(t) > 1]


def _match_score(title_a: str, title_b: str) -> float:
    """Calculate token overlap similarity score between two role titles."""
    toks_a = set(t.lower() for t in _clean_role_tokens(title_a))
    toks_b = set(t.lower() for t in _clean_role_tokens(title_b))
    if not toks_a or not toks_b:
        return 0.0
    intersection = toks_a & toks_b
    union = toks_a | toks_b
    return len(intersection) / len(union)


def build_targeted_portal_search_url(
    company: str,
    role_title: str,
    current_url: Optional[str] = None,
    experience_level: Optional[str] = None,
    location: Optional[str] = None,
) -> str:
    """
    Constructs a targeted search URL for a company's careers portal pre-filled
    with the exact role title, experience level, and location so the candidate
    lands directly on filtered results rather than an empty home page.
    """
    keywords = " ".join(_clean_role_tokens(role_title)[:5]) or role_title
    if experience_level:
        keywords = f"{keywords} {experience_level}"

    enc_q = urllib.parse.quote_plus(keywords)
    enc_loc = urllib.parse.quote_plus(location or "")

    comp_lower = company.lower().strip()
    host = _host(current_url or "")

    # 1. Known special careers portals
    if "google" in comp_lower or "google.com" in host:
        loc_param = f"&location={enc_loc}" if location else ""
        return f"https://www.google.com/about/careers/applications/jobs/results/?q={enc_q}{loc_param}"

    if "amazon" in comp_lower or "amazon.jobs" in host:
        loc_param = f"&loc_query={enc_loc}" if location else ""
        return f"https://www.amazon.jobs/en/search?base_query={enc_q}{loc_param}"

    if "microsoft" in comp_lower or "careers.microsoft.com" in host:
        loc_param = "&lc=India" if (not location or "india" in location.lower()) else ""
        return f"https://jobs.careers.microsoft.com/global/en/search?q={enc_q}{loc_param}"

    if "apple" in comp_lower or "apple.com" in host:
        return f"https://jobs.apple.com/en-us/search?search={enc_q}"

    if "higher.gs.com" in host or "goldman" in comp_lower:
        loc_str = "Bengaluru|Hyderabad|Mumbai" if not location else urllib.parse.quote_plus(location)
        return f"https://higher.gs.com/results?search={enc_q}&LOCATION={loc_str}&page=1&sort=RELEVANCE"

    if "openai" in comp_lower or "openai.com" in host:
        return f"https://openai.com/careers/search?q={enc_q}"

    if "stripe" in comp_lower or "stripe.com" in host:
        return f"https://stripe.com/jobs/search?query={enc_q}"

    if "zs" in comp_lower or "zs.com" in host:
        return f"https://jobs.zs.com/jobs?keywords={enc_q}&location={enc_loc or 'India'}"

    if "swiggy" in comp_lower or "swiggy.com" in host:
        return f"https://careers.swiggy.com/#careers?query={enc_q}"

    if "qualcomm" in comp_lower or "qualcomm.com" in host:
        return f"https://careers.qualcomm.com/careers?query={enc_q}&location=India"

    if "barclays" in comp_lower or "barclays" in host:
        return f"https://search.jobs.barclays/search-jobs/{enc_q}/India/13014/1/2/1269750/20/77/50/2"

    if "hsbc" in comp_lower or "hsbc.com" in host:
        return f"https://mycareer.hsbc.com/en_GB/external/SearchJobs/{enc_q}"

    if "netflix" in comp_lower or "netflix.com" in host:
        return f"https://jobs.netflix.com/search?q={enc_q}"

    if "uber" in comp_lower or "uber.com" in host:
        return f"https://www.uber.com/global/en/careers/list/?query={enc_q}"

    if "meta" in comp_lower or "metacareers.com" in host:
        return f"https://www.metacareers.com/jobs/?q={enc_q}"

    # 2. ATS boards with known query parameters
    if "jobs.lever.co" in host:
        # e.g. https://jobs.lever.co/company?keyword=...
        base = current_url.split("?")[0] if current_url else f"https://jobs.lever.co/{company_slug(company)}"
        return f"{base}?keyword={enc_q}"

    if "greenhouse.io" in host:
        base = current_url.split("?")[0] if current_url else f"https://boards.greenhouse.io/{company_slug(company)}"
        return f"{base}?query={enc_q}"

    if "myworkdayjobs.com" in host:
        base = current_url.split("?")[0]
        return f"{base}?q={enc_q}"

    if "ashbyhq.com" in host:
        base = current_url.split("?")[0]
        return f"{base}?search={enc_q}"

    # 3. If we have a careers URL with an existing search path on a recognized portal
    if current_url and host and any(s in current_url.lower() for s in ["/search", "/jobs", "/results", "/openings"]):
        base = current_url.split("?")[0].rstrip("/")
        return f"{base}?q={enc_q}"

    # 4. Fallback for static/unsearchable marketing domains (e.g. mu-sigma.com, salescode.ai, greyb.com):
    # Construct a Google Jobs Direct Search link that leads straight to the exact requisition listing!
    clean_company = re.sub(r"\(.*?\)", "", company).strip()
    google_search_q = f"{clean_company} {role_title} careers apply job"
    return f"https://www.google.com/search?q={urllib.parse.quote_plus(google_search_q)}"


def generate_careers_portal_filters(
    company: str,
    role_title: str,
    current_url: Optional[str] = None,
    location: Optional[str] = None,
) -> Dict[str, str]:
    """
    Generates ready-to-click URLs for filtering the company's careers site
    by role keywords, experience tiers, and location.
    """
    clean_company = re.sub(r"\(.*?\)", "", company).strip()
    host = _host(current_url or "")
    google_apply_q = f"{clean_company} {role_title} apply"
    site_search_q = f"site:{host} {role_title}" if host else ""
    return {
        "exact_role": build_targeted_portal_search_url(company, role_title, current_url, location=location),
        "fresher_intern": build_targeted_portal_search_url(company, f"Intern Fresher {role_title}", current_url, location=location),
        "entry_level": build_targeted_portal_search_url(company, f"Associate Junior {role_title}", current_url, location=location),
        "mid_level": build_targeted_portal_search_url(company, f"{role_title} 2-5 years", current_url, location=location),
        "senior_lead": build_targeted_portal_search_url(company, f"Senior Lead {role_title}", current_url, location=location),
        "remote": build_targeted_portal_search_url(company, f"Remote {role_title}", current_url, location="Remote"),
        "google_direct": f"https://www.google.com/search?q={urllib.parse.quote_plus(google_apply_q)}",
        "site_search": f"https://www.google.com/search?q={urllib.parse.quote_plus(site_search_q)}" if site_search_q else "",
    }


def _extract_direct_links_from_html(
    html: str,
    base_url: str,
    target_role: str,
) -> Optional[str]:
    """
    Parses HTML of a careers page to discover direct requisition links.
    Returns the URL of the highest-matching role link, or None.
    """
    soup = BeautifulSoup(html, "html.parser")
    candidates: List[Tuple[float, str]] = []

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript:") or href.startswith("mailto:"):
            continue

        full_url = urllib.parse.urljoin(base_url, href)
        link_text = a.get_text(" ", strip=True)

        # Check if URL matches known direct patterns
        is_direct = any(pat.search(full_url) for pat in _DIRECT_JOB_PATTERNS)

        # If the link text is short or generic ("Apply", "View Job", etc.), search parent container text
        context_text = link_text
        if len(link_text.split()) <= 3 or link_text.lower() in {"apply", "view", "apply now", "view job", "details", "learn more", "read more", "apply here"}:
            curr = a
            for _ in range(4):
                curr = curr.parent
                if curr and hasattr(curr, "get_text"):
                    ct = curr.get_text(" ", strip=True)
                    if len(ct) > len(context_text) and len(ct) < 500:
                        context_text = ct
                        break

        # Compute text and URL relevance
        score = _match_score(context_text, target_role)
        if score > 0.2:
            # Match in text or context
            score += 0.4 if is_direct else 0.1
            candidates.append((score, full_url))
        elif is_direct:
            # Direct pattern; check if URL slug contains role tokens
            slug_toks = _clean_role_tokens(full_url.split("/")[-1])
            role_toks = _clean_role_tokens(target_role)
            overlap = set(t.lower() for t in slug_toks) & set(t.lower() for t in role_toks)
            if overlap:
                candidates.append((0.5 + 0.1 * len(overlap), full_url))
            else:
                # Direct ATS link found on page even without title match, still better than generic root
                candidates.append((0.35, full_url))

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_url = candidates[0]
        if best_score >= 0.4:
            return best_url

    return None


def resolve_direct_requisition_url(
    company: str,
    role_title: str,
    current_url: Optional[str] = None,
    location: Optional[str] = None,
) -> dict:
    """
    Main resolution engine:
    1. If current_url is already an exact direct job requisition, returns it.
    2. Checks known ATS boards (Lever, Greenhouse, Ashby, SmartRecruiters, Keka)
       to locate the exact direct requisition.
    3. Scrapes the careers page HTML for direct link tags.
    4. Generates targeted portal search URLs with pre-filled parameters.
    """
    # 1. Check if existing URL is already direct
    if current_url and not is_generic_careers_url(current_url):
        filters = generate_careers_portal_filters(company, role_title, current_url, location)
        return {
            "is_direct": True,
            "resolved_url": current_url,
            "source": "verified_direct_url",
            "portal_search_url": filters["exact_role"],
            "experience_filters": filters,
            "message": "Direct requisition URL verified."
        }

    filters = generate_careers_portal_filters(company, role_title, current_url, location)
    portal_search_url = filters["exact_role"]

    # 2. Try ATS Board APIs if ATS token/slug can be identified
    ats_candidates = [
        company_slug(company),
        company.lower().replace(" ", "").replace("-", ""),
        company.lower().replace(" ", "-"),
    ]

    # Try Greenhouse
    for token in ats_candidates:
        try:
            gh_jobs = fetch_greenhouse_jobs(token, allow_all_locations=True)
            if gh_jobs:
                # Find best matching job
                best_match = None
                best_score = 0.0
                for j in gh_jobs:
                    s = _match_score(j.get("role_title", ""), role_title)
                    if s > best_score:
                        best_score = s
                        best_match = j
                if best_match and best_score >= 0.35:
                    resolved = best_match.get("official_apply_url") or best_match.get("url")
                    if resolved:
                        logger.info("Direct apply resolved via Greenhouse: %s (%s)", resolved, best_score)
                        return {
                            "is_direct": True,
                            "resolved_url": resolved,
                            "source": "ats_greenhouse_resolved",
                            "portal_search_url": portal_search_url,
                            "experience_filters": filters,
                            "message": f"Exact direct requisition matched on Greenhouse ({best_match.get('role_title')})."
                        }
        except Exception:
            pass

    # Try Lever
    for token in ats_candidates:
        try:
            lever_jobs = fetch_lever_jobs(token, allow_all_locations=True)
            if lever_jobs:
                best_match = None
                best_score = 0.0
                for j in lever_jobs:
                    s = _match_score(j.get("role_title", ""), role_title)
                    if s > best_score:
                        best_score = s
                        best_match = j
                if best_match and best_score >= 0.35:
                    resolved = best_match.get("official_apply_url") or best_match.get("url")
                    if resolved:
                        logger.info("Direct apply resolved via Lever: %s (%s)", resolved, best_score)
                        return {
                            "is_direct": True,
                            "resolved_url": resolved,
                            "source": "ats_lever_resolved",
                            "portal_search_url": portal_search_url,
                            "experience_filters": filters,
                            "message": f"Exact direct requisition matched on Lever ({best_match.get('role_title')})."
                        }
        except Exception:
            pass

    # 3. Live link extraction on current_url if provided
    if current_url and current_url.startswith("http"):
        try:
            resp = requests.get(current_url, headers=_REQ_HEADERS, timeout=6, allow_redirects=True)
            if resp.status_code == 200 and resp.text:
                extracted = _extract_direct_links_from_html(resp.text, resp.url, role_title)
                if extracted and not is_generic_careers_url(extracted):
                    logger.info("Direct apply resolved via HTML link extraction: %s", extracted)
                    return {
                        "is_direct": True,
                        "resolved_url": extracted,
                        "source": "html_link_extracted",
                        "portal_search_url": portal_search_url,
                        "experience_filters": filters,
                        "message": "Exact direct requisition link discovered on company careers page."
                    }
        except Exception as e:
            logger.debug("Failed to scrape current_url %s: %s", current_url, e)

    # 4. If exact direct link couldn't be statically resolved, fallback to pre-filled portal search
    return {
        "is_direct": False,
        "resolved_url": portal_search_url,
        "source": "portal_search_generated",
        "portal_search_url": portal_search_url,
        "experience_filters": filters,
        "message": "Generic careers landing page detected. Pre-filled targeted portal search generated."
    }


def extract_work_mode(remote_type: Optional[str] = None, location: Optional[str] = "", raw_jd: Optional[str] = "") -> str:
    """
    Returns normalized work mode: 'remote' | 'hybrid' | 'onsite'
    """
    rt = (remote_type or "").lower().strip()
    if rt in ("remote", "hybrid", "onsite"):
        return rt
    combined = f"{location or ''} {raw_jd or ''}".lower()
    if re.search(r'\b(remote|work from home|wfh|telecommute|anywhere in india|virtual)\b', combined):
        return "remote"
    if re.search(r'\b(hybrid|flexible work|[23]\s*days?\s*office)\b', combined):
        return "hybrid"
    if re.search(r'\b(on-site|onsite|in-office|office|work from office)\b', combined):
        return "onsite"
    if any(city in (location or "").lower() for city in ["bengaluru", "bangalore", "delhi", "noida", "gurgaon", "gurugram", "pune", "mumbai", "hyderabad", "chennai"]):
        return "onsite"
    return "onsite"


def format_job_compensation(pay_min: Optional[int] = None, pay_max: Optional[int] = None, is_intern: bool = False, raw_jd: str = "") -> dict:
    """
    Formats compensation with ₹600,000 INR treated strictly as a lower threshold baseline.
    """
    if pay_min and pay_max:
        min_l = pay_min / 100000
        max_l = pay_max / 100000
        min_str = f"{min_l:.1f}".rstrip('0').rstrip('.')
        max_str = f"{max_l:.1f}".rstrip('0').rstrip('.')
        display = f"₹{min_str}L–₹{max_str}L"
        status = "above_floor" if pay_min >= 1200000 else ("meets_floor" if pay_min >= 600000 else "below_floor")
        note = "Above ₹6L Floor" if status == "above_floor" else ("Meets ₹6L Base" if status == "meets_floor" else "Below ₹6L Base")
        return {"display": display, "status": status, "note": note}
    
    if pay_min:
        min_l = pay_min / 100000
        min_str = f"{min_l:.1f}".rstrip('0').rstrip('.')
        display = f"₹{min_str}L+ Base"
        status = "above_floor" if pay_min >= 1200000 else ("meets_floor" if pay_min >= 600000 else "below_floor")
        note = "Above ₹6L Floor" if status == "above_floor" else "Meets ₹6L Base"
        return {"display": display, "status": status, "note": note}

    if pay_max:
        max_l = pay_max / 100000
        max_str = f"{max_l:.1f}".rstrip('0').rstrip('.')
        display = f"Up to ₹{max_str}L"
        status = "meets_floor" if pay_max >= 600000 else "below_floor"
        note = "Meets ₹6L Base" if status == "meets_floor" else "Below ₹6L Base"
        return {"display": display, "status": status, "note": note}

    if is_intern:
        return {"display": "₹25k–₹50k/mo (Est. Stipend)", "status": "stipend", "note": "Internship Stipend"}

    return {"display": "₹6.0L+ Base Floor (Market Est.)", "status": "baseline", "note": "Satisfies Base Threshold"}


def compute_job_release_recency(posting_date: Optional[str] = None, first_seen_at: Optional[str] = None, fetched_at: Optional[str] = None) -> dict:
    """
    Computes release recency & apply factor timing.
    Fresh listings (<48h) drastically boost response rates.
    """
    from datetime import datetime, timezone
    
    raw_date = posting_date or first_seen_at or fetched_at
    if not raw_date:
        return {
            "label": "Recently Active",
            "short_label": "Active",
            "is_fresh": False,
            "apply_factor": "Active Requisition",
            "freshness_level": "active",
            "hours_ago": 72
        }
    
    try:
        # Handle ISO strings or YYYY-MM-DD
        if "T" in str(raw_date):
            clean_str = str(raw_date).replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
        else:
            dt = datetime.strptime(str(raw_date)[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            
        now = datetime.now(timezone.utc)
        diff_sec = (now - dt).total_seconds()
        hours_ago = max(0, int(diff_sec // 3600))
        days_ago = max(0, int(diff_sec // 86400))
        
        if hours_ago < 1:
            label = "Released Just Now"
            short_label = "Just now"
            is_fresh = True
            apply_factor = "🔥 Prime 24h Window (4x Response)"
            freshness_level = "today"
        elif hours_ago < 24:
            label = f"Released {hours_ago}h ago"
            short_label = f"{hours_ago}h ago"
            is_fresh = True
            apply_factor = "⚡ Fresh Release (High Callback Odds)"
            freshness_level = "today"
        elif days_ago == 1:
            label = "Released Yesterday"
            short_label = "Yesterday"
            is_fresh = True
            apply_factor = "⚡ Early Window (Apply Today)"
            freshness_level = "recent"
        elif days_ago <= 2:
            label = f"Released {days_ago}d ago"
            short_label = f"{days_ago}d ago"
            is_fresh = True
            apply_factor = "⚡ Early Window (Apply Today)"
            freshness_level = "recent"
        elif days_ago <= 7:
            label = f"Released {days_ago}d ago"
            short_label = f"{days_ago}d ago"
            is_fresh = False
            apply_factor = "📅 Active Opening"
            freshness_level = "week"
        elif days_ago <= 30:
            weeks = max(1, days_ago // 7)
            label = f"Released {weeks}w ago ({dt.strftime('%b %d')})"
            short_label = f"{weeks}w ago"
            is_fresh = False
            apply_factor = "Rolling Requisition"
            freshness_level = "older"
        else:
            label = f"Released {dt.strftime('%b %d')}"
            short_label = dt.strftime('%b %d')
            is_fresh = False
            apply_factor = "Active Posting"
            freshness_level = "archive"
            
        return {
            "label": label,
            "short_label": short_label,
            "is_fresh": is_fresh,
            "apply_factor": apply_factor,
            "freshness_level": freshness_level,
            "hours_ago": hours_ago
        }
    except Exception:
        return {
            "label": "Recently Active",
            "short_label": "Active",
            "is_fresh": False,
            "apply_factor": "Active Requisition",
            "freshness_level": "active",
            "hours_ago": 72
        }


def enrich_job_vital_factors(j: dict) -> dict:
    """
    Enriches a job dictionary with upfront location mode, compensation, and release recency.
    """
    role_title = (j.get("role_title") or "").lower()
    is_intern = "intern" in role_title or "trainee" in role_title or j.get("is_internship", False)
    
    j["work_mode"] = extract_work_mode(
        remote_type=j.get("remote_type"),
        location=j.get("location"),
        raw_jd=j.get("raw_jd")
    )
    j["compensation_info"] = format_job_compensation(
        pay_min=j.get("pay_min"),
        pay_max=j.get("pay_max"),
        is_intern=is_intern,
        raw_jd=j.get("raw_jd") or ""
    )
    j["release_info"] = compute_job_release_recency(
        posting_date=j.get("posting_date"),
        first_seen_at=j.get("first_seen_at"),
        fetched_at=j.get("fetched_at")
    )
    return j

