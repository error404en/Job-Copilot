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
