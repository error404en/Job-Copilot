import re
import requests
import concurrent.futures
from fastapi import HTTPException
from app.utils.security import validate_safe_url

# Only well-known real TLDs — prevents false positives from degree abbreviations
# (B.Tech, M.Tech), tech terms (Node.js), and truncated PDF text
_REAL_TLDS = {
    "com", "org", "net", "io", "app", "dev", "co", "in", "gov", "edu",
    "ai", "tech", "me", "info", "us", "uk", "ca", "au", "de", "fr",
    "sg", "ng", "pk", "np", "lk", "xyz", "gg", "sh", "page", "site",
    "online", "cloud", "codes", "work", "jobs", "careers",
}

# Degree / academic abbreviations that look like URLs — explicit blocklist
_DEGREE_BLOCKLIST = {
    "b.tech", "m.tech", "b.e", "m.e", "b.sc", "m.sc", "ph.d", "b.com",
    "m.com", "b.ca", "m.ca", "mba", "b.arch",
}

def extract_urls(text: str) -> list[str]:
    """
    Extracts only explicit http/https URLs from a given string.
    Does NOT auto-promote bare hostnames — PDF text is full of false positives
    (degree abbreviations like B.Tech, technical terms like Node.js, truncated
    line-wrapped URLs like 'portfolio-demo.vercel' without the '.app' suffix).
    """
    if not text:
        return []

    # Only match URLs that have an explicit protocol — no guessing bare hostnames
    url_pattern = re.compile(
        r'https?://'                # requires explicit protocol
        r'[a-zA-Z0-9\-._~:/?#\[\]@!$&\'()*+,;=%]+'  # URL characters
    )
    raw_matches = url_pattern.findall(text)

    urls = []
    for match in raw_matches:
        # Strip trailing punctuation that often follows a URL in prose
        match = match.rstrip(".,;):\"'")

        # Skip empty, very short, or clearly invalid matches
        if len(match) < 10:
            continue

        # Extract hostname to validate TLD
        try:
            from urllib.parse import urlparse
            parsed = urlparse(match)
            hostname = parsed.hostname or ""
        except Exception:
            continue

        if not hostname or "." not in hostname:
            continue

        # Block degree abbreviations that somehow got an https:// prefix
        if hostname.lower() in _DEGREE_BLOCKLIST:
            continue

        # Require the TLD (last component) to be a real known TLD
        tld = hostname.rsplit(".", 1)[-1].lower()
        if tld not in _REAL_TLDS:
            continue

        # Filter known false-positive patterns from PDF extraction
        # e.g. 'https://B.Tech', 'https://Node.js', 'https://req.name'
        if len(hostname.split(".")[0]) <= 2 and hostname[0].isupper():
            # Single uppercase char before dot → likely an abbreviation (B.Tech, M.E)
            continue

        urls.append(match)

    # Deduplicate while preserving order
    seen = set()
    result = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            result.append(u)
    return result


def check_single_url(url: str) -> dict:
    """
    Tests a single URL. Returns dict with status and error message if broken.
    hostname resolution errors are treated as 'unverifiable' not 'broken',
    since they usually indicate a private/intranet link or PDF extraction artifact.
    """
    try:
        validate_safe_url(url)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*',
        }
        with requests.get(url, headers=headers, timeout=8, stream=True, allow_redirects=True) as res:
            if res.status_code >= 400:
                return {"url": url, "is_broken": True, "error": f"HTTP {res.status_code}"}
            return {"url": url, "is_broken": False, "error": None}
    except HTTPException as e:
        return {"url": url, "is_broken": True, "error": f"Blocked: {e.detail}"}
    except requests.exceptions.Timeout:
        return {"url": url, "is_broken": True, "error": "Timeout (>8s)"}
    except requests.exceptions.ConnectionError:
        # Could not connect — hostname may be invalid/truncated PDF artifact
        # Only flag as broken, not as a hard error that blocks the resume
        return {"url": url, "is_broken": True, "error": "Cannot connect (check URL is complete)"}
    except requests.exceptions.RequestException:
        return {"url": url, "is_broken": True, "error": "Connection failed"}


def check_resume_links(raw_text: str) -> list[dict]:
    """
    Extracts URLs from the resume text and checks them concurrently.
    Returns a list of dictionaries for broken links only.
    """
    urls = extract_urls(raw_text)
    if not urls:
        return []

    broken_links = []
    # Reduced max_workers to 3 to keep thread stack memory minimal on 512MB RAM
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = executor.map(check_single_url, urls)
        for result in results:
            if result["is_broken"]:
                broken_links.append(result)

    import gc
    gc.collect()
    return broken_links


_WRAPPER_AGGREGATOR_HOSTS = (
    "thejobcompany.co.in",
    "offcampusjobs4u.com",
    "freshersnow.com",
    "way2fresher.com",
    "fresherslive.com",
    "ownyourcareer.in",
)

_SOCIAL_OR_AD_LINKS = (
    "whatsapp.com",
    "t.me/",
    "telegram.",
    "instagram.com",
    "facebook.com",
    "twitter.com",
    "x.com/",
    "youtube.com",
    "linkedin.com/company",
    "atsresumebuilder.in",
    "thejobcompany.co.in",
)


def _extract_clean_wrapper_jd(html_text: str) -> str:
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            tag.decompose()
        lines = [ln.strip() for ln in soup.get_text("\n").splitlines() if ln.strip()]
        filtered = [
            ln for ln in lines
            if ln.upper() not in ("ALERT ON WHATSAPP", "ALERT ON TELEGRAM", "APPLY NOW")
            and not ln.lower().startswith("follow us on")
        ]
        full_text = "\n".join(filtered)
        # If 'Job Description' marker exists, keep from header + Job Description section
        if "Job Description" in full_text:
            idx = full_text.find("Job Description")
            header_part = "\n".join(filtered[:16])
            jd_part = full_text[idx:idx + 4500]
            # Cut off related jobs footer if present
            for cutoff in ("\nSimilar Jobs", "\nRecent Jobs", "\nTrending Jobs", "\nQuick Links"):
                if cutoff in jd_part:
                    jd_part = jd_part.split(cutoff)[0]
            return f"{header_part}\n\n{jd_part}".strip()
        return full_text[:4000].strip()
    except Exception:
        return ""


def _unwrap_community_wrapper(url: str, headers: dict) -> dict:
    """
    Unwraps 2-step community job aggregator pages (e.g., thejobcompany.co.in/frontend/job_details?job_id=6562)
    to extract the underlying official ATS / employer application URL and the full JD text.
    """
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin

    extracted_jd = ""
    unwrapped_url = None

    # Fast path for thejobcompany.co.in which uses apply_page.php?job_id=<id>
    if "thejobcompany.co.in" in url.lower():
        m = re.search(r"job_id=(\d+)", url)
        if m:
            job_id = m.group(1)
            apply_page_url = f"https://thejobcompany.co.in/frontend/apply_page.php?job_id={job_id}"
            details_url = f"https://thejobcompany.co.in/frontend/job_details?job_id={job_id}"
            try:
                r_apply = requests.get(apply_page_url, headers=headers, timeout=5)
                if r_apply.status_code == 200 and r_apply.text:
                    soup = BeautifulSoup(r_apply.text, "html.parser")
                    btn = soup.find(id="applyButton") or soup.find("a", class_="apply-btn")
                    if btn and btn.get("href") and btn.get("href").startswith("http"):
                        unwrapped_url = btn.get("href").strip()
                    else:
                        for a in soup.find_all("a", href=True):
                            href = a["href"].strip()
                            if href.startswith("http") and not any(s in href.lower() for s in _SOCIAL_OR_AD_LINKS):
                                unwrapped_url = href
                                break
            except Exception:
                pass

            try:
                r_det = requests.get(details_url, headers=headers, timeout=5)
                if r_det.status_code == 200 and r_det.text:
                    extracted_jd = _extract_clean_wrapper_jd(r_det.text)
            except Exception:
                pass

            if unwrapped_url:
                return {"final_url": unwrapped_url, "extracted_jd": extracted_jd}

    # Generic 1-or-2 hop wrapper extraction for community job blogs
    try:
        r = requests.get(url, headers=headers, allow_redirects=True, timeout=5)
        if r.status_code == 200 and r.text:
            extracted_jd = _extract_clean_wrapper_jd(r.text)
            soup = BeautifulSoup(r.text, "html.parser")
            btn = soup.find(id="applyButton") or soup.find("a", class_="apply-btn")
            if btn and btn.get("href"):
                cand = urljoin(r.url, btn.get("href").strip())
                if cand.startswith("http") and not any(s in cand.lower() for s in _SOCIAL_OR_AD_LINKS):
                    return {"final_url": cand, "extracted_jd": extracted_jd}

            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                txt = (a.get_text() or "").strip().lower()
                if "apply_page.php" in href or re.search(r"^\s*(apply(\s+now|\s+here|\s+online|\s+link)?|click\s+here(\s+to\s+apply)?)\s*$", txt):
                    cand = urljoin(r.url, href)
                    if "apply_page.php" in cand:
                        r2 = requests.get(cand, headers=headers, timeout=5)
                        if r2.status_code == 200:
                            s2 = BeautifulSoup(r2.text, "html.parser")
                            b2 = s2.find(id="applyButton") or s2.find("a", class_="apply-btn")
                            if b2 and b2.get("href") and b2.get("href").startswith("http"):
                                return {"final_url": b2.get("href").strip(), "extracted_jd": extracted_jd}
                    elif cand.startswith("http") and not any(s in cand.lower() for s in _SOCIAL_OR_AD_LINKS):
                        return {"final_url": cand, "extracted_jd": extracted_jd}
    except Exception:
        pass

    return {"final_url": url, "extracted_jd": extracted_jd}


def resolve_redirects_and_detect_promo(url: str) -> dict:
    """
    Resolves shortened links/redirects and 2-step community job wrappers
    to find the final destination URL and detect promotional funnels.
    """
    if not url:
        return {"final_url": None, "is_promo": False, "extracted_jd": None}
        
    try:
        validate_safe_url(url)
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

        promo_domains = ['linktr.ee', 'bit.ly', 'tinyurl.com', 'forms.gle', 'click.', 'atsresumebuilder.in']
        if any(d in url.lower() for d in ('atsresumebuilder.in', 'linktr.ee')):
            return {"final_url": url, "is_promo": True, "extracted_jd": None}

        if any(w in url.lower() for w in _WRAPPER_AGGREGATOR_HOSTS):
            unwrapped = _unwrap_community_wrapper(url, headers)
            final_url = unwrapped.get("final_url") or url
            extracted_jd = unwrapped.get("extracted_jd") or None
            is_promo = any(d in final_url.lower() for d in promo_domains)
            return {"final_url": final_url, "is_promo": is_promo, "extracted_jd": extracted_jd}

        res = requests.head(url, headers=headers, allow_redirects=True, timeout=5)
        final_url = res.url
        is_promo = any(d in final_url.lower() for d in promo_domains)
        
        return {"final_url": final_url, "is_promo": is_promo, "extracted_jd": None}
    except Exception as e:
        return {"final_url": url, "is_promo": False, "extracted_jd": None}
