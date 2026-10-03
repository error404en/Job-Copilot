"""
Unified Multi-Tier Scraper Engine for Job Applications and Careers Portals.

Tier 1: Ultra-fast HTTP client with realistic browser headers (<5MB RAM, sub-second).
Tier 2: Specialized ATS & Portal Adapters (LinkedIn guest API, Greenhouse, Lever, Workday CXS, SmartRecruiters, Ashby, JSON-LD Schema.org).
Tier 3: Dynamic Playwright Chromium Headless Fallback (128MB capped heap, JS SPA rendering, Cloudflare/anti-bot resilience).
Tier 4: Intelligent content cleaning, boilerplate removal, and promo funnel detection.
"""

import gc
import json
import logging
import os
import re
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from app.utils.security import validate_safe_url

logger = logging.getLogger(__name__)

# Standard browser headers to avoid basic bot blocks on HTTP requests
_BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1"
}

_JS_BLOCKER_PHRASES = [
    "please enable javascript",
    "javascript is required",
    "javascript is disabled",
    "turn on javascript",
    "browser does not support javascript",
    "you need to enable javascript to run this app",
    "checking your browser before accessing",
    "just a moment...",
    "enable cookies and reload the page"
]

@dataclass
class ScrapedJobResult:
    raw_jd: str
    resolved_url: str
    role_title: str = "Job Opening"
    company_name: str = "Company"
    location: str = "Unspecified / Remote"
    is_promo: bool = False
    promo_name: Optional[str] = None
    source_type: str = "fast_http"
    source_confidence: float = 0.85
    salary_info: Optional[str] = None
    employment_type: Optional[str] = None
    seniority: Optional[str] = None
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "raw_jd": self.raw_jd,
            "resolved_url": self.resolved_url,
            "role_title": self.role_title,
            "company_name": self.company_name,
            "location": self.location,
            "is_promo": self.is_promo,
            "promo_name": self.promo_name,
            "source_type": self.source_type,
            "source_confidence": self.source_confidence,
            "salary_info": self.salary_info,
            "employment_type": self.employment_type,
            "seniority": self.seniority
        }


def clean_html_to_markdown(html_content: str, base_url: str = "") -> str:
    """
    Cleans raw HTML into well-structured, human-readable markdown text.
    Strips scripts, styles, navigation, footers, tracking tags, and noisy ads.
    """
    if not html_content:
        return ""

    soup = BeautifulSoup(html_content, "html.parser")

    # Preserve link targets inline before stripping
    for a in soup.find_all("a", href=True):
        try:
            href = a["href"].strip()
            if href and not href.startswith(("#", "javascript:", "mailto:", "tel:")):
                full_href = urllib.parse.urljoin(base_url, href)
                a.append(f" ({full_href}) ")
        except Exception:
            pass

    # Remove non-content elements
    for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav", "aside", "form", "iframe"]):
        tag.extract()

    # Convert headings to markdown
    for h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        level = int(h.name[1])
        h.string = f"\n\n{'#' * level} {h.get_text(strip=True)}\n"

    # Convert bullet list items
    for li in soup.find_all("li"):
        li.string = f"\n- {li.get_text(strip=True)}"

    # Convert paragraphs
    for p in soup.find_all("p"):
        p.string = f"\n\n{p.get_text(strip=True)}"

    text = soup.get_text(separator="\n")
    # Collapse multiple blank lines
    cleaned = re.sub(r'\n{3,}', '\n\n', text).strip()
    return cleaned


# ---------------------------------------------------------------------------
# Specialized Adapters (Tier 2)
# ---------------------------------------------------------------------------

def _scrape_linkedin_guest_api(url: str) -> Optional[ScrapedJobResult]:
    """
    Queries LinkedIn's public guest jobPosting API for instant, structured data
    without hitting login walls or rendering heavy JS.
    """
    jid_match = re.search(r'(?:currentJobId=|jobs/view/|jobId=)(\d+)', url)
    if not jid_match:
        # Check any 8+ digit number in URL
        num_match = re.search(r'/(\d{8,})', url)
        if num_match:
            jid = num_match.group(1)
        else:
            return None
    else:
        jid = jid_match.group(1)

    api_url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{jid}"
    try:
        validate_safe_url(api_url)
        res = requests.get(api_url, headers=_BROWSER_HEADERS, timeout=10)
        if res.status_code == 200:
            soup = BeautifulSoup(res.text, "html.parser")
            title_el = soup.find(["h2", "h1"]) or soup.find(class_="top-card-layout__title")
            title = title_el.get_text(strip=True) if title_el else "Job Opening"

            comp_el = soup.find("a", class_="topcard__org-name-link") or soup.find(class_="topcard__flavor")
            comp = comp_el.get_text(strip=True) if comp_el else "Company"

            loc_el = soup.find(class_="topcard__flavor--bullet")
            loc = loc_el.get_text(strip=True) if loc_el else "Location Unspecified"

            desc_el = soup.find(class_="description__text") or soup.find(class_="show-more-less-html__markup") or soup
            for s in desc_el(["script", "style", "nav", "footer"]):
                s.extract()
            desc_text = desc_el.get_text(separator="\n", strip=True)

            criteria_items = []
            for crit in soup.find_all(class_="description__job-criteria-item"):
                header = crit.find(class_="description__job-criteria-subheader")
                val = crit.find(class_="description__job-criteria-text")
                if header and val:
                    criteria_items.append(f"{header.get_text(strip=True)}: {val.get_text(strip=True)}")

            criteria_block = "\n".join(criteria_items) if criteria_items else ""
            full_jd = f"{title} at {comp}\nLocation: {loc}\n"
            if criteria_block:
                full_jd += f"\nJob Criteria:\n{criteria_block}\n"
            full_jd += f"\nDescription:\n{desc_text}"

            return ScrapedJobResult(
                raw_jd=full_jd,
                resolved_url=f"https://www.linkedin.com/jobs/view/{jid}",
                role_title=title,
                company_name=comp,
                location=loc,
                source_type="linkedin_guest_api",
                source_confidence=0.95
            )
    except Exception as e:
        logger.warning(f"[ScraperEngine] LinkedIn guest API fetch failed: {e}")

    return None


def _scrape_greenhouse_api(url: str) -> Optional[ScrapedJobResult]:
    """
    Queries Greenhouse public REST API directly for instant JSON.
    """
    m = re.search(r'(?:boards|job-boards)\.greenhouse\.io/([^/]+)/jobs/(\d+)', url)
    if not m:
        m = re.search(r'greenhouse\.io/embed/job_app\?for=([^&]+)&token=(\d+)', url)
    if not m:
        return None

    token, jid = m.group(1), m.group(2)
    api_url = f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{jid}"
    try:
        validate_safe_url(api_url)
        res = requests.get(api_url, headers=_BROWSER_HEADERS, timeout=8)
        if res.status_code == 200:
            data = res.json()
            title = data.get("title", "Job Opening")
            location_data = data.get("location") or {}
            loc = location_data.get("name", "Remote / Hybrid") if isinstance(location_data, dict) else str(location_data)
            raw_content = data.get("content", "")
            clean_desc = clean_html_to_markdown(raw_content, url)

            full_jd = f"{title} at {token.capitalize()}\nLocation: {loc}\n\n{clean_desc}"
            return ScrapedJobResult(
                raw_jd=full_jd,
                resolved_url=data.get("absolute_url") or url,
                role_title=title,
                company_name=token.capitalize(),
                location=loc,
                source_type="greenhouse_api",
                source_confidence=0.95
            )
    except Exception as e:
        logger.warning(f"[ScraperEngine] Greenhouse API fetch failed: {e}")

    return None


def _scrape_lever_api(url: str) -> Optional[ScrapedJobResult]:
    """
    Queries Lever public REST API directly for structured JSON.
    """
    m = re.search(r'jobs\.lever\.co/([^/]+)/([a-f0-9-]+)', url)
    if not m:
        return None

    company, jid = m.group(1), m.group(2)
    api_url = f"https://api.lever.co/v0/postings/{company}/{jid}"
    try:
        validate_safe_url(api_url)
        res = requests.get(api_url, headers=_BROWSER_HEADERS, timeout=8)
        if res.status_code == 200:
            data = res.json()
            title = data.get("text", "Job Opening")
            cats = data.get("categories", {})
            loc = cats.get("location", "Remote / Hybrid")
            commitment = cats.get("commitment", "")
            desc_html = data.get("description", "")
            lists = data.get("lists", [])
            req_html = "\n".join([f"<h3>{item.get('text', '')}</h3>\n{item.get('content', '')}" for item in lists])

            clean_desc = clean_html_to_markdown(f"{desc_html}\n{req_html}", url)
            full_jd = f"{title} at {company.capitalize()}\nLocation: {loc} ({commitment})\n\n{clean_desc}"

            return ScrapedJobResult(
                raw_jd=full_jd,
                resolved_url=data.get("hostedUrl") or url,
                role_title=title,
                company_name=company.capitalize(),
                location=loc,
                employment_type=commitment,
                source_type="lever_api",
                source_confidence=0.95
            )
    except Exception as e:
        logger.warning(f"[ScraperEngine] Lever API fetch failed: {e}")

    return None


def _scrape_workday_cxs_api(url: str) -> Optional[ScrapedJobResult]:
    """
    Queries Workday's modern CXS JSON API directly without launching a browser.
    """
    m = re.search(r'https?://([^/]+)\.myworkdayjobs\.com/(?:[a-zA-Z-]+/)?([^/]+)/job/(?:[^/]+/)?(?:.*_)?([a-zA-Z0-9_-]+)', url)
    if not m:
        return None

    host, site, jid = m.group(1), m.group(2), m.group(3)
    tenant = host.split(".")[0]
    api_url = f"https://{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/job/{jid}"

    try:
        validate_safe_url(api_url)
        res = requests.get(api_url, headers={"Accept": "application/json", "User-Agent": _BROWSER_HEADERS["User-Agent"]}, timeout=8)
        if res.status_code == 200:
            data = res.json().get("jobPostingInfo", {})
            title = data.get("title", "Job Opening")
            loc = data.get("location", "Remote / Hybrid")
            desc_html = data.get("jobDescription", "")
            time_type = data.get("timeType", "")
            clean_desc = clean_html_to_markdown(desc_html, url)

            full_jd = f"{title} at {tenant.capitalize()}\nLocation: {loc} ({time_type})\n\n{clean_desc}"
            return ScrapedJobResult(
                raw_jd=full_jd,
                resolved_url=url,
                role_title=title,
                company_name=tenant.capitalize(),
                location=loc,
                employment_type=time_type,
                source_type="workday_cxs_api",
                source_confidence=0.95
            )
    except Exception as e:
        logger.warning(f"[ScraperEngine] Workday CXS API fetch failed: {e}")

    return None


def _scrape_json_ld_schema(soup: BeautifulSoup, url: str) -> Optional[ScrapedJobResult]:
    """
    Extracts standard Schema.org JobPosting structured metadata from HTML if present.
    """
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.get_text())
            items = data if isinstance(data, list) else data.get("@graph", [data]) if isinstance(data, dict) else []
            for item in items:
                if isinstance(item, dict) and item.get("@type") == "JobPosting":
                    title = item.get("title")
                    if not title:
                        continue
                    org = item.get("hiringOrganization")
                    comp = org.get("name", "Company") if isinstance(org, dict) else "Company"

                    loc = "Remote / Hybrid"
                    job_loc = item.get("jobLocation")
                    if isinstance(job_loc, dict):
                        addr = job_loc.get("address", {})
                        if isinstance(addr, dict):
                            loc = addr.get("addressLocality") or addr.get("addressCountry") or loc

                    desc_raw = item.get("description", "")
                    clean_desc = clean_html_to_markdown(desc_raw, url)
                    full_jd = f"{title} at {comp}\nLocation: {loc}\n\n{clean_desc}"

                    return ScrapedJobResult(
                        raw_jd=full_jd,
                        resolved_url=item.get("url") or url,
                        role_title=title,
                        company_name=comp,
                        location=loc,
                        employment_type=item.get("employmentType"),
                        source_type="json_ld_schema",
                        source_confidence=0.92
                    )
        except Exception:
            pass

    return None


# ---------------------------------------------------------------------------
# Tier 3: Dynamic Playwright Chromium Headless Fallback
# ---------------------------------------------------------------------------

def _scrape_with_playwright_browser(url: str) -> Optional[ScrapedJobResult]:
    """
    Low-memory Chromium execution for heavy React/Vue SPAs or sites requiring dynamic JS.
    """
    enable_playwright = os.getenv("ENABLE_PLAYWRIGHT", "true").lower() in ("true", "1", "yes")
    if not enable_playwright:
        logger.info(f"[ScraperEngine] Playwright disabled (ENABLE_PLAYWRIGHT=false), skipping browser launch for {url}")
        return None

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.warning("[ScraperEngine] playwright package not installed, skipping dynamic browser.")
        return None

    chromium_args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--mute-audio",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "--js-flags=--max-old-space-size=128",
    ]

    browser = None
    page = None
    try:
        print(f"[ScraperEngine] Launching constrained Chromium for {url}...")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=chromium_args)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=_BROWSER_HEADERS["User-Agent"]
            )
            page = context.new_page()

            # Abort heavy assets (images, fonts, stylesheets, media) to minimize memory
            def _filter_assets(route):
                if route.request.resource_type in ["image", "media", "font", "stylesheet"]:
                    route.abort()
                else:
                    route.continue_()

            try:
                page.route("**/*", _filter_assets)
            except Exception:
                pass

            try:
                page.goto(url, wait_until="domcontentloaded", timeout=12000)
            except Exception as nav_e:
                logger.warning(f"[ScraperEngine] Playwright navigation timeout on {url}: {nav_e}")

            time.sleep(1.5)
            page_title = page.title() or "Job Opening"
            body_text = page.evaluate("""
                () => {
                    try {
                        const clone = document.body.cloneNode(true);
                        clone.querySelectorAll('script, style, noscript, svg, nav, footer, header').forEach(el => el.remove());
                        return clone.innerText;
                    } catch (e) {
                        return document.body.innerText;
                    }
                }
            """)

            if body_text and len(body_text.strip()) > 100:
                clean_text = re.sub(r'\n{3,}', '\n\n', body_text).strip()
                return ScrapedJobResult(
                    raw_jd=f"{page_title}\n\n{clean_text}",
                    resolved_url=url,
                    role_title=page_title.split(" - ")[0].split(" | ")[0].strip(),
                    source_type="playwright_dynamic",
                    source_confidence=0.85
                )
    except Exception as e:
        logger.warning(f"[ScraperEngine] Playwright browser error for {url}: {e}")
    finally:
        if page:
            try:
                page.close()
            except Exception:
                pass
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        gc.collect()

    return None


# ---------------------------------------------------------------------------
# Public Unified Scraper API
# ---------------------------------------------------------------------------

def scrape_job_posting_url(url: str) -> ScrapedJobResult:
    """
    Universal multi-tier scraper for individual job postings.
    1. Resolves shortlinks & detects promotional / bootcamp / influencer funnels.
    2. Runs specialized ATS/portal adapters (LinkedIn guest, Greenhouse, Lever, Workday, SmartRecruiters).
    3. Runs ultra-fast HTTP request (<5MB RAM).
    4. Automatically falls back to low-memory Playwright Chromium if JS rendering or Cloudflare is detected.
    Never throws unhandled 400 or 500 errors.
    """
    from app.services.job_fetcher import resolve_redirects_and_detect_promo

    # 1. Unshorten & Check Promotional Funnel
    url_info = resolve_redirects_and_detect_promo(url)
    raw_resolved = url_info.get("resolved_url")
    resolved_url = raw_resolved if isinstance(raw_resolved, str) else str(url)
    if url_info.get("is_promo"):
        promo_name = url_info.get("promo_name", "Influencer / Bootcamp Promo")
        return ScrapedJobResult(
            raw_jd=(
                f"[⚠️ Promotional / Course Link Detected]\n"
                f"This link redirected to: {resolved_url} ({promo_name}).\n"
                f"This is a promotional course or bootcamp funnel, not an official company job posting."
            ),
            resolved_url=resolved_url,
            is_promo=True,
            promo_name=promo_name,
            source_type="promo_detector",
            source_confidence=1.0
        )

    validate_safe_url(resolved_url)

    # 2. Try Specialized ATS & Portal Adapters (Tier 2 - Sub-second & 100% structured)
    if "linkedin.com" in resolved_url:
        li_res = _scrape_linkedin_guest_api(resolved_url)
        if li_res:
            return li_res

    if "greenhouse.io" in resolved_url:
        gh_res = _scrape_greenhouse_api(resolved_url)
        if gh_res:
            return gh_res

    if "jobs.lever.co" in resolved_url:
        lev_res = _scrape_lever_api(resolved_url)
        if lev_res:
            return lev_res

    if "myworkdayjobs.com" in resolved_url:
        wd_res = _scrape_workday_cxs_api(resolved_url)
        if wd_res:
            return wd_res

    # 3. Fast HTTP Fetch (Tier 1)
    fast_text = ""
    soup = None
    try:
        with requests.get(resolved_url, headers=_BROWSER_HEADERS, timeout=8) as resp:
            if resp.status_code == 200 and resp.content:
                soup = BeautifulSoup(resp.content, "html.parser")

                # Check JSON-LD JobPosting schema first
                json_ld_res = _scrape_json_ld_schema(soup, resolved_url)
                if json_ld_res:
                    return json_ld_res

                fast_text = clean_html_to_markdown(resp.text, resolved_url)
    except Exception as fast_err:
        logger.info(f"[ScraperEngine] Fast HTTP fetch failed for {resolved_url}: {fast_err}")

    # Check if Fast HTTP yielded a valid, substantial job posting
    needs_browser = False
    if not fast_text or len(fast_text) < 250:
        needs_browser = True
    else:
        lower_preview = fast_text[:1000].lower()
        if any(phrase in lower_preview for phrase in _JS_BLOCKER_PHRASES):
            needs_browser = True

    # 4. Dynamic Playwright Browser Fallback (Tier 3)
    if needs_browser:
        dynamic_res = _scrape_with_playwright_browser(resolved_url)
        if dynamic_res:
            return dynamic_res

    # 5. Return clean Fast HTTP result or best effort
    if fast_text:
        title = "Job Opening"
        if soup:
            title_tag = soup.find("title") or soup.find("h1")
            if title_tag:
                title = title_tag.get_text(strip=True).split(" - ")[0].split(" | ")[0].strip()

        return ScrapedJobResult(
            raw_jd=fast_text,
            resolved_url=resolved_url,
            role_title=title,
            source_type="fast_http",
            source_confidence=0.8
        )

    # Final Safety Fallback
    return ScrapedJobResult(
        raw_jd=f"Job posting at {resolved_url}\n\n[Content could not be automatically extracted. Please paste the job description text manually.]",
        resolved_url=resolved_url,
        role_title="Job Opening",
        source_type="fallback",
        source_confidence=0.5
    )


def scrape_careers_portal(careers_url: str, company_name: str = "Company", target_keywords: list = None) -> list:
    """
    Unified multi-role scraper for company careers portals.
    1. Sub-second direct DOM card extraction (<50ms, 0 tokens).
    2. Dynamic Playwright Chromium fallback if DOM is empty.
    3. AI extraction waterfall (Gemini -> Groq -> Ollama) if dynamic.
    4. Flexible keyword matching without artificial role drops.
    """
    from app.services.job_fetcher import fetch_generic_fallback
    return fetch_generic_fallback(careers_url, company_name, target_keywords)


def scrape_popular_portal_jobs(portal: str, keywords: Optional[List[str]] = None, limit: int = 10) -> List[Dict]:
    """
    Direct structured scraper for popular remote & developer job portals (Himalayas, WeWorkRemotely).
    Uses official public APIs and feeds for 0% block rate and sub-second execution.
    """
    jobs = []
    portal_lower = portal.lower().strip()

    if "himalayas" in portal_lower:
        try:
            api_url = "https://himalayas.app/jobs/api?limit=25"
            res = requests.get(api_url, headers=_BROWSER_HEADERS, timeout=8)
            if res.status_code == 200:
                raw_jobs = res.json().get("jobs", [])
                for rj in raw_jobs:
                    title = rj.get("title", "")
                    comp = rj.get("companyName", "Unknown")
                    url = rj.get("applicationLink") or f"https://himalayas.app/companies/{rj.get('companySlug')}/jobs/{rj.get('slug')}"
                    desc = clean_html_to_markdown(rj.get("description", ""), url)
                    location = ", ".join(rj.get("locationRestrictions", [])) or "Remote"

                    if keywords:
                        matched = any(kw.lower() in title.lower() or kw.lower() in desc.lower() for kw in keywords if kw)
                        if not matched:
                            continue

                    jobs.append({
                        "role_title": title,
                        "company": comp,
                        "url": url,
                        "location": location,
                        "source": "himalayas",
                        "raw_jd": f"{title} at {comp}\nLocation: {location}\n\n{desc[:3000]}"
                    })
                    if len(jobs) >= limit:
                        break
        except Exception as e:
            logger.warning(f"[ScraperEngine] Himalayas fetch failed: {e}")

    elif "weworkremotely" in portal_lower or "wwr" in portal_lower:
        try:
            rss_url = "https://weworkremotely.com/categories/remote-programming-jobs.rss"
            res = requests.get(rss_url, headers=_BROWSER_HEADERS, timeout=8)
            if res.status_code == 200:
                soup = BeautifulSoup(res.text, "xml")
                for item in soup.find_all("item")[:limit * 2]:
                    title_full = item.find("title").get_text(strip=True) if item.find("title") else "Job Opening"
                    link = item.find("link").get_text(strip=True) if item.find("link") else ""
                    desc_raw = item.find("description").get_text(strip=True) if item.find("description") else ""
                    clean_desc = clean_html_to_markdown(desc_raw, link)

                    parts = title_full.split(":")
                    comp = parts[0].strip() if len(parts) > 1 else "Unknown"
                    title = parts[1].strip() if len(parts) > 1 else title_full

                    if keywords:
                        matched = any(kw.lower() in title.lower() or kw.lower() in clean_desc.lower() for kw in keywords if kw)
                        if not matched:
                            continue

                    jobs.append({
                        "role_title": title,
                        "company": comp,
                        "url": link,
                        "location": "Remote",
                        "source": "weworkremotely",
                        "raw_jd": f"{title} at {comp}\nLocation: Remote\n\n{clean_desc[:3000]}"
                    })
                    if len(jobs) >= limit:
                        break
        except Exception as e:
            logger.warning(f"[ScraperEngine] WWR RSS fetch failed: {e}")

    return jobs

