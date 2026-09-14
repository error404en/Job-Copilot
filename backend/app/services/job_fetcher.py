import requests
from bs4 import BeautifulSoup
import html
from ddgs import DDGS

def clean_html(raw_html: str) -> str:
    if not raw_html:
        return ""
    # Unescape HTML entities
    decoded_html = html.unescape(raw_html)
    # Parse and extract text
    soup = BeautifulSoup(decoded_html, "lxml")
    # Get text with space separator
    text = soup.get_text(separator=" ", strip=True)
    return text

def fetch_greenhouse_jobs(board_token: str, target_keywords: list = None) -> list:
    """
    Fetches jobs from a Greenhouse board and returns a list of job dicts.
    """
    if not target_keywords:
        target_keywords = ["software", "engineer", "developer", "backend", "fullstack", "data"]
        
    url = f"https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Failed to fetch Greenhouse board {board_token}: {e}")
        return []

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "")
        # Filter by keyword if provided
        if target_keywords:
            if not any(kw.lower() in title.lower() for kw in target_keywords):
                continue
                
        raw_content = job.get("content", "")
        clean_content = clean_html(raw_content)
        
        jobs.append({
            "source": "greenhouse",
            "company": board_token,
            "role_title": title,
            "url": job.get("absolute_url"),
            "location": job.get("location", {}).get("name", ""),
            "raw_jd": f"{title}\nLocation: {job.get('location', {}).get('name', '')}\n\n{clean_content}"
        })
        
    return jobs

def fetch_lever_jobs(board_token: str, target_keywords: list = None) -> list:
    """
    Fetches jobs from a Lever board.
    """
    if not target_keywords:
        target_keywords = ["software", "engineer", "developer", "backend", "fullstack", "data"]
        
    url = f"https://api.lever.co/v0/postings/{board_token}?mode=json"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Failed to fetch Lever board {board_token}: {e}")
        return []

    jobs = []
    for job in data:
        title = job.get("text", "")
        if target_keywords:
            if not any(kw.lower() in title.lower() for kw in target_keywords):
                continue
                
        desc = job.get("descriptionPlain", "")
        lists = job.get("lists", [])
        lists_text = ""
        for lst in lists:
            lists_text += f"\n{lst.get('text', '')}\n"
            lists_text += "\n".join([f"- {item.get('content', '')}" for item in lst.get('content', [])])
            
        full_jd = f"{title}\nLocation: {job.get('categories', {}).get('location', '')}\n\n{desc}\n{clean_html(lists_text)}"
        
        jobs.append({
            "source": "lever",
            "company": board_token,
            "role_title": title,
            "url": job.get("hostedUrl"),
            "location": job.get("categories", {}).get("location", ""),
            "raw_jd": full_jd
        })
        
    return jobs

def fetch_ashby_jobs(board_token: str, target_keywords: list = None) -> list:
    if not target_keywords:
        target_keywords = ["software", "engineer", "developer", "backend", "fullstack", "data"]
    
    url = f"https://api.ashbyhq.com/posting-api/job-board/{board_token}"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Failed to fetch Ashby board {board_token}: {e}")
        return []

    jobs = []
    for job in data.get("jobs", []):
        title = job.get("title", "")
        if target_keywords and not any(kw.lower() in title.lower() for kw in target_keywords):
            continue
            
        desc = job.get("descriptionHtml", "")
        full_jd = f"{title}\nLocation: {job.get('location', '')}\n\n{clean_html(desc)}"
        
        jobs.append({
            "source": "ashby",
            "company": board_token,
            "role_title": title,
            "url": job.get("jobUrl"),
            "location": job.get("location", ""),
            "raw_jd": full_jd
        })
    return jobs

def fetch_smartrecruiters_jobs(board_token: str, target_keywords: list = None) -> list:
    if not target_keywords:
        target_keywords = ["software", "engineer", "developer", "backend", "fullstack", "data"]
    
    url = f"https://api.smartrecruiters.com/v1/companies/{board_token}/postings"
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Failed to fetch SmartRecruiters board {board_token}: {e}")
        return []

    jobs = []
    for job in data.get("content", []):
        title = job.get("name", "")
        if target_keywords and not any(kw.lower() in title.lower() for kw in target_keywords):
            continue
        
        detail_url = f"https://api.smartrecruiters.com/v1/companies/{board_token}/postings/{job.get('id')}"
        try:
            d_res = requests.get(detail_url, timeout=5)
            d_data = d_res.json()
            job_desc = d_data.get("jobAd", {}).get("sections", {})
            full_jd = f"{title}\n"
            for section in job_desc.values():
                if section and section.get("text"):
                    full_jd += f"\n{clean_html(section['text'])}"
        except:
            full_jd = title
            
        jobs.append({
            "source": "smartrecruiters",
            "company": board_token,
            "role_title": title,
            "url": f"https://jobs.smartrecruiters.com/{board_token}/{job.get('id')}",
            "location": job.get("location", {}).get("city", ""),
            "raw_jd": full_jd
        })
    return jobs

def fetch_generic_fallback(url: str, target_keywords: list = None) -> list:
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        res = requests.get(url, headers=headers, timeout=10)
        res.raise_for_status()
        soup = BeautifulSoup(res.text, 'html.parser')
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.extract()
        text = soup.get_text(separator='\n')
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return [{
            "source": "generic_scraper",
            "company": "Unknown",
            "role_title": "Extracted from URL",
            "url": url,
            "location": "",
            "raw_jd": text
        }]
    except Exception as e:
        print(f"Failed generic fallback for {url}: {e}")
        return []


def resolve_redirects_and_detect_promo(url: str) -> dict:
    """
    Follows redirects for shortened links (lnkd.in, tinyurl, bit.ly),
    detects LinkedIn interstitial redirects, and classifies whether the
    destination is an influencer/course/bootcamp funnel (e.g. ProPeers)
    or a genuine job application portal.
    """
    if not url:
        return {"original_url": url, "resolved_url": url, "is_promo": False, "promo_name": None}

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    current_url = url.strip()
    visited = set()

    try:
        # Special handling for lnkd.in interstitial redirect page
        if "lnkd.in" in current_url:
            res = requests.get(current_url, headers=headers, timeout=8)
            soup = BeautifulSoup(res.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "linkedin.com/help" not in href and href.startswith("http"):
                    current_url = href
                    break

        # Follow any remaining redirects (e.g. tinyurl, bit.ly)
        for _ in range(5):
            if current_url in visited:
                break
            visited.add(current_url)
            r = requests.get(current_url, headers=headers, allow_redirects=True, timeout=8)
            if r.url and r.url != current_url:
                current_url = r.url
            break
    except Exception as e:
        print(f"[resolve_redirects] Warning: could not fully resolve {url}: {e}")

    # Detect promotional / influencer funnels
    PROMO_INDICATORS = {
        "propeers.in": "ProPeers Bootcamp / Course",
        "topmate.io": "Topmate Mentorship / Paid Session",
        "telegram.me": "Telegram Group",
        "t.me": "Telegram Channel",
        "chat.whatsapp.com": "WhatsApp Community",
        "wa.me": "WhatsApp Chat",
        "linktr.ee": "Linktree Landing Page",
        "forms.gle": "Google Form",
        "docs.google.com/forms": "Google Form",
        "gumroad.com": "Gumroad Digital Product",
        "tagmango.com": "Tagmango Community",
    }

    is_promo = False
    promo_name = None
    lower_url = current_url.lower()

    for domain, label in PROMO_INDICATORS.items():
        if domain in lower_url:
            is_promo = True
            promo_name = label
            break

    return {
        "original_url": url,
        "resolved_url": current_url,
        "is_promo": is_promo,
        "promo_name": promo_name
    }


def scrape_careers_page(company_name: str, target_keywords: list = None) -> dict:
    """
    Tier-3 fallback for Company Deep Dive when no known ATS (Greenhouse/Lever/Ashby/SmartRecruiters)
    is detected.
    Supports enterprise portals (Barclays, HSBC, Google, HCLTech, etc.) via official careers page
    scraping + live web search fallback when client-side SPAs return empty HTML.
    """
    from app.services.llm_client import extract_jobs_from_page

    ATS_DOMAINS = ["greenhouse.io", "lever.co", "ashbyhq.com", "smartrecruiters.com"]
    careers_url = None

    # Step 1: Find the careers page URL via DDG
    try:
        slug = company_name.lower().replace(" ", "")
        queries = [
            f'"{company_name}" careers jobs site:{slug}.com',
            f"{company_name} official careers portal jobs openings",
            f"{company_name} jobs India careers"
        ]
        with DDGS() as ddgs:
            for q in queries:
                results = ddgs.text(q, max_results=8)
                for r in results:
                    url = r.get("href", "")
                    if any(d in url for d in ATS_DOMAINS):
                        continue
                    if any(kw in url.lower() for kw in ["career", "jobs", "join", "hiring", "work"]):
                        careers_url = url
                        break
                if careers_url:
                    break
    except Exception as e:
        print(f"[scrape_careers_page] DDG search failed for {company_name}: {e}")

    # Step 2: Attempt to scrape the careers page text
    raw_text = ""
    if careers_url:
        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            res = requests.get(careers_url, headers=headers, timeout=10)
            res.raise_for_status()
            soup = BeautifulSoup(res.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.extract()
            lines = (line.strip() for line in soup.get_text(separator="\n").splitlines())
            raw_text = "\n".join(line for line in lines if line)
        except Exception as e:
            print(f"[scrape_careers_page] Scrape warning for {careers_url}: {e}")

    # Step 3: LLM extraction if we have content
    jobs = []
    if len(raw_text.strip()) > 200:
        extracted = extract_jobs_from_page(raw_text, company_name, target_keywords)
        for item in extracted:
            role_title = item.get("role_title", "").strip()
            if not role_title:
                continue
            jobs.append({
                "source": "careers_page",
                "company": company_name,
                "role_title": role_title,
                "url": item.get("url") or careers_url,
                "location": item.get("location", ""),
                "raw_jd": f"{role_title}\nCompany: {company_name}\nLocation: {item.get('location', '')}"
            })

    # Step 4: Enterprise Fallback — if no jobs were extracted because the site is a JavaScript SPA
    # (e.g. Barclays Taleo/Workday, HSBC, Google Careers, HCLTech), perform targeted search for live roles!
    if not jobs:
        print(f"[scrape_careers_page] No jobs extracted from HTML for {company_name}. Using live search fallback.")
        kw_str = " ".join(target_keywords[:3]) if target_keywords else "Software Engineer Analyst Associate"
        search_queries = [
            f'"{company_name}" hiring ("Software Engineer" OR "Analyst" OR "Associate" OR "Developer") India jobs',
            f'site:linkedin.com/jobs/view "{company_name}" {kw_str}',
            f'site:myworkdayjobs.com OR site:taleo.net OR site:oraclecloud.com "{company_name}" {kw_str}'
        ]
        try:
            with DDGS() as ddgs:
                for sq in search_queries:
                    results = ddgs.text(sq, max_results=6)
                    for r in results:
                        title = r.get("title", "")
                        href = r.get("href", "")
                        body = r.get("body", "")
                        # Clean up title
                        cleaned_title = title.split(" - ")[0].split(" | ")[0].split(" at ")[0]
                        if len(cleaned_title) > 60:
                            cleaned_title = cleaned_title[:60]
                        # Infer location
                        loc = "India"
                        for city in ["Bengaluru", "Bangalore", "Mumbai", "Pune", "Hyderabad", "Delhi", "Gurugram", "Noida", "Chennai"]:
                            if city.lower() in (title + body).lower():
                                loc = city
                                break
                        
                        jobs.append({
                            "source": "live_search",
                            "company": company_name,
                            "role_title": cleaned_title,
                            "url": href or careers_url,
                            "location": loc,
                            "raw_jd": f"{cleaned_title}\nCompany: {company_name}\nLocation: {loc}\n\n{body}"
                        })
                    if len(jobs) >= 4:
                        break
        except Exception as e:
            print(f"[scrape_careers_page] Live search fallback failed for {company_name}: {e}")

    print(f"[scrape_careers_page] Returning {len(jobs)} jobs for {company_name}")
    return {"careers_url": careers_url, "jobs": jobs}
