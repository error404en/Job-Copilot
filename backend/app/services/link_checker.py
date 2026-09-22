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
    line-wrapped URLs like 'shreyansh-37.vercel' without the '.app' suffix).
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
        res = requests.get(url, headers=headers, timeout=8, stream=True, allow_redirects=True)
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
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(check_single_url, urls)
        for result in results:
            if result["is_broken"]:
                broken_links.append(result)

    return broken_links


def resolve_redirects_and_detect_promo(url: str) -> dict:
    """
    Resolves shortened links/redirects to find the final destination URL.
    Detects if the link is likely a promotional/third-party funnel.
    """
    if not url:
        return {"final_url": None, "is_promo": False}
        
    try:
        validate_safe_url(url)
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        res = requests.head(url, headers=headers, allow_redirects=True, timeout=5)
        
        final_url = res.url
        
        # Check for promo funnels
        promo_domains = ['linktr.ee', 'bit.ly', 'tinyurl.com', 'forms.gle', 'click.']
        is_promo = any(d in final_url for d in promo_domains)
        
        return {"final_url": final_url, "is_promo": is_promo}
    except Exception as e:
        return {"final_url": url, "is_promo": False}
