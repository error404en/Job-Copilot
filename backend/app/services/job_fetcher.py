import requests
from bs4 import BeautifulSoup
import html

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
