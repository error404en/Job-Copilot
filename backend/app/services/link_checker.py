import re
import requests
import concurrent.futures

def extract_urls(text: str) -> list[str]:
    """Extracts all http/https URLs from a given string."""
    if not text:
        return []
    url_pattern = re.compile(r'https?://[^\s<>"\']+|(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:/[^\s<>"\']*)?')
    raw_matches = url_pattern.findall(text)
    
    urls = []
    for match in raw_matches:
        # Standardize links missing the protocol
        if not match.startswith('http'):
            # Ignore false positives that look like email domains or file extensions
            if '@' in match or match.endswith('.py') or match.endswith('.js') or match.endswith('.docx'):
                continue
            match = 'https://' + match
        
        # Clean trailing punctuation
        match = match.rstrip(".,;)")
        urls.append(match)
        
    # Deduplicate
    return list(set(urls))

def check_single_url(url: str) -> dict:
    """Tests a single URL. Returns dict with status and error message if any."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        res = requests.get(url, headers=headers, timeout=5, stream=True)
        if res.status_code >= 400:
            return {"url": url, "is_broken": True, "error": f"HTTP {res.status_code}"}
        return {"url": url, "is_broken": False, "error": None}
    except requests.exceptions.Timeout:
        return {"url": url, "is_broken": True, "error": "Timeout"}
    except requests.exceptions.RequestException as e:
        return {"url": url, "is_broken": True, "error": "Connection Failed"}

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
