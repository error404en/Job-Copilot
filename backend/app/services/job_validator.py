import re
from urllib.parse import urlparse

# Explicitly blocked domains that should NEVER be accepted as job postings
BLOCKED_DOMAINS = {
    # Encyclopedias & Reference
    "wikipedia.org", "wikimedia.org", "wikidata.org",
    # Streaming, Video, Media & Entertainment
    "netflix.com", "sohu.com", "youtube.com", "vimeo.com", "tiktok.com", 
    "bilibili.com", "youku.com", "iqiyi.com", "spotify.com",
    # Q&A, Forums, Social Networks
    "zhihu.com", "baidu.com", "facebook.com", "twitter.com", "x.com", 
    "instagram.com", "reddit.com", "quora.com", "threads.net", "pinterest.com",
    # Document sharing & File storage
    "scribd.com", "slideshare.net", "docs.google.com", "drive.google.com", 
    "dropbox.com", "box.com", "notion.so", "pastebin.com",
    # Business Directories & Aggregator Company Overviews (Not individual jobs)
    "dnb.com", "ambitionbox.com", "6figr.com", "signalhire.com", 
    "zoominfo.com", "crunchbase.com", "pitchbook.com",
    # News, Blogs & Media (Must NEVER be parsed as jobs)
    "indiatoday.in", "digit.in", "timesofindia.indiatimes.com", "thehindu.com", "ndtv.com",
    "hindustantimes.com", "livemint.com", "moneycontrol.com", "business-standard.com",
    "economictimes.indiatimes.com", "indianexpress.com", "news18.com", "firstpost.com",
    "scroll.in", "thewire.in", "inc42.com", "yourstory.com", "entrackr.com", "fortune.com",
    "forbes.com", "wsj.com", "bloomberg.com", "reuters.com", "cnbc.com", "bbc.com", "cnn.com",
    "yahoo.com", "msn.com", "storyboard18.com", "igotanoffer.com", "medium.com", "substack.com", 
    "techcrunch.com", "theverge.com",
    # Low-Quality Aggregators, Exam Portals & SEO Spam
    "foundit.in", "ownyourcareer.in", "freshersworld.com", "fresherslive.com", "freshersnow.com",
    "sarkariresult.com", "placementindia.com", "shine.com", "jobseeker.com", "shiksha.com",
    "collegedunia.com", "way2fresher.com", "offcampusjobs4u.com", "tprassociation.org",
    # Government & Parks / Public Services
    "nps.gov",
    # Unverified research brochures / PDF hosts
    "jmkresearch.com", "iconic2022.nitsri.ac.in",
}

BLOCKED_ROLE_TITLES = {
    "not specified", "unspecified role", "unknown role", "unknown", "job role",
    "park", "find a park", "entry-level role", "various roles", "junior associate",
    "senior & lead", "plastics product manufacturing", "netflix help center",
    "netflix media center", "salaries", "salary", "company profile", "overview",
    "current openings", "careers", "career", "all jobs", "home", "search",
    "find a job", "login", "sign up", "signup", "about us", "contact us",
    "leadership", "products", "services", "terms of use", "privacy policy"
}

KNOWN_JOB_PORTALS = {
    "greenhouse.io", "lever.co", "ashbyhq.com", "workdayjobs.com", "myworkdayjobs.com",
    "smartrecruiters.com", "icims.com", "breezy.hr", "workable.com", "recruitee.com",
    "rippling-ats.com", "jobvite.com", "pinpointhq.com", "keka.com", "oraclecloud.com",
    "successfactors.com", "taleo.net", "eightfold.ai", "phenompeople.com",
    "wellfound.com", "instahyre.com"
}


def validate_job_url(url: str, company_name: str = "") -> tuple[bool, str]:
    """
    Validates that a URL is a genuine job posting or careers page.
    Returns (is_valid, reason).
    """
    if not url or not isinstance(url, str):
        return False, "Missing or empty URL"

    url = url.strip()
    if url.strip() == "Screenshot Upload":
        return True, "Valid Manual Screenshot Upload"

    if not (url.startswith("http://") or url.startswith("https://")):
        return False, f"Invalid URL scheme: {url}"

    try:
        parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        path = parsed.path.lower()
    except Exception as e:
        return False, f"Malformed URL: {e}"

    if not netloc or "." not in netloc:
        return False, f"Invalid hostname: {netloc}"

    # Strip port if present
    netloc_clean = netloc.split(":")[0]

    # Check blocked domain blacklist
    for blocked in BLOCKED_DOMAINS:
        if netloc_clean == blocked or netloc_clean.endswith("." + blocked):
            return False, f"Blocked domain: {netloc_clean}"

    # Disallow direct links to documents/brochures (PDF, DOC)
    if path.endswith((".pdf", ".doc", ".docx", ".ppt", ".pptx", ".zip")):
        return False, f"Document download link instead of job portal: {path}"

    # Specific Aggregator validations
    if "linkedin.com" in netloc_clean:
        if any(bad in path for bad in ["/posts/", "/company/", "/feed/", "/learning/", "/pulse/", "/in/"]):
            return False, f"LinkedIn social/profile link instead of job posting: {path}"
        if path.strip("/") in ["jobs", "jobs/search"]:
            return False, "Generic LinkedIn jobs homepage"
        if path.endswith("-jobs") or "-jobs/" in path or "-jobs-" in path:
            return False, f"LinkedIn job search directory page: {path}"
        # A valid LinkedIn direct job URL typically contains /jobs/view/ or a numeric ID or query param
        if "/jobs/view/" not in path and not re.search(r'\d{7,}', path) and not ("currentjobid" in url.lower()):
            return False, f"Not a direct LinkedIn job posting: {path}"

    if "indeed." in netloc_clean:
        if path.startswith("/q-") or path.strip("/") == "" or "gnav-homepage" in url or "gnav-compui" in url:
            return False, "Generic Indeed search query or homepage"
        if "-jobs.html" in path or "-jobs" in path:
            return False, f"Indeed search results page: {path}"

    if "naukri.com" in netloc_clean:
        if "/maini-" in path or path.startswith("/jobs-in-") or "-jobs-in-" in path or path.endswith("-jobs"):
            return False, "Generic Naukri search directory page"
        if "/job-listings-" not in path and not re.search(r'\d{6,}', path):
            return False, f"Not a direct Naukri job posting: {path}"

    if "glassdoor." in netloc_clean:
        if not ("/job-listing/" in path or "/job/" in path or "/jobs/" in path):
            return False, "Non-job Glassdoor link (reviews/salary page)"

    return True, "Valid URL"


def validate_role_title(title: str, company_name: str = "") -> tuple[bool, str]:
    """
    Validates that a job role title is a real, meaningful job designation.
    Returns (is_valid, reason).
    """
    if not title or not isinstance(title, str):
        return False, "Missing or empty role title"

    clean_title = title.strip()
    title_lower = clean_title.lower()

    if len(clean_title) < 3:
        return False, f"Role title too short ({len(clean_title)} chars): '{clean_title}'"

    if len(clean_title) > 120:
        return False, f"Role title excessively long ({len(clean_title)} chars)"

    # Check blocked titles
    if title_lower in BLOCKED_ROLE_TITLES:
        return False, f"Blocked placeholder title: '{clean_title}'"

    # Block titles containing non-Latin CJK / East Asian characters for India/Global roles
    if re.search(r'[\u4e00-\u9fff\u3040-\u309f\uac00-\ud7af]', clean_title):
        return False, f"Foreign non-job title with non-Latin characters: '{clean_title}'"

    # Block titles that are identical to the company name
    if company_name:
        clean_company = company_name.strip().lower()
        if title_lower == clean_company or title_lower == f"{clean_company} ltd" or title_lower == f"{clean_company} limited":
            return False, "Title is identical to company name"

    # Block obvious navigational or web page labels
    suspicious_starts = ["welcome to", "about us", "contact us", "overview of", "privacy policy", "terms and", "http", "www."]
    if any(title_lower.startswith(s) for s in suspicious_starts):
        return False, f"Navigational title: '{clean_title}'"

    # Block JD body fragments parsed as titles (e.g. 'you will manage and grow the team...')
    if len(clean_title.split()) > 10:
        return False, f"Title contains excessive words ({len(clean_title.split())} words), likely JD paragraph snippet: '{clean_title}'"

    sentence_markers = ["you will", "we are looking", "responsible for", "the ideal candidate", "as a member of", "reporting to", "duties include", "role overview"]
    if any(marker in title_lower for marker in sentence_markers):
        return False, f"JD description snippet detected as title: '{clean_title}'"

    return True, "Valid Title"


def is_valid_job_posting(role_title: str, url: str, company_name: str = "", raw_jd: str = "", external_job_id: str = None) -> tuple[bool, str]:
    """
    Comprehensive validation for job postings before storing or displaying them.
    Returns (is_valid, reason).
    """
    ok_title, title_reason = validate_role_title(role_title, company_name)
    if not ok_title:
        return False, title_reason

    # If an external ATS job ID is provided, URL can be optional/empty
    if external_job_id and not url:
        pass
    else:
        ok_url, url_reason = validate_job_url(url, company_name)
        if not ok_url:
            return False, url_reason

    # If raw JD is provided, verify it's not a tiny error page or park snippet
    if raw_jd:
        jd_lower = raw_jd.lower()
        if "a park is an area of natural" in jd_lower or "halley park in bentleigh" in jd_lower:
            return False, "Wikipedia Park text in JD"
        if "netflix" in jd_lower and ("sign up" in jd_lower or "media center" in jd_lower) and "ultimate flexipack" in jd_lower:
            return False, "Irrelevant Netflix text in JD"

    return True, "Valid job posting"
