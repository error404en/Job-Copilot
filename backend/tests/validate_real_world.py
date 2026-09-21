import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api.research import deep_dive_company, ResearchRequest
from app.models.discovery import ATSInfo, ATSSystem, CareersDiscoveryResult
from unittest.mock import patch

def validate_company(name: str, known_url: str = None):
    print(f"\n{'='*50}\nValidating: {name}\n{'='*50}")
    
    # Bypass research_company to avoid DDG rate limits and speed up tests
    with patch('app.api.research.research_company') as mock_research, \
         patch('app.api.research.discover_careers_url_and_ats') as mock_discover:
        
        mock_research.return_value = {"name": name, "description": "Mock description"}
        
        if name == "Akamai":
            mock_discover.return_value = CareersDiscoveryResult(careers_url=known_url, ats_info=ATSInfo(system=ATSSystem.WORKDAY, token="akamai.wd1/akamai/Akamai_External_Career_Site"))
        elif name == "GE HealthCare":
            mock_discover.return_value = CareersDiscoveryResult(careers_url=known_url, ats_info=ATSInfo(system=ATSSystem.WORKDAY, token="gehc.wd5/gehc/GEHC_ExternalSite"))
        elif name == "Mastercard":
            mock_discover.return_value = CareersDiscoveryResult(careers_url=known_url, ats_info=ATSInfo(system=ATSSystem.WORKDAY, token="mastercard.wd1/mastercard/CorporateCareers"))
        elif name == "AMD":
            # AMD doesn't have a known ATS token, so ats_info is None. Fallback will trigger Playwright.
            mock_discover.return_value = CareersDiscoveryResult(careers_url=known_url)
            
        req = ResearchRequest(company_name=name, target_keywords="software, engineer, developer, data, analyst")
        res = deep_dive_company(req, user_id="test_user")
    
    careers_url = res.get("careers_url")
    ats = res.get("ats_info", {})
    jobs = res.get("jobs", [])
    
    print(f"Official Careers URL: {careers_url}")
    if ats:
        print(f"Detected ATS: {ats.get('system')} (Token: {ats.get('token')})")
    else:
        print("No known ATS detected. Used generic fallback.")
        
    print(f"\nTotal Jobs Fetched: {len(jobs)}")
    
    fresher_jobs = []
    relevant_jobs = []
    
    for j in jobs:
        meta = j.get("experience_level", "")
        # Fresher compatible if experience is 0-2 yrs or similar
        if "0" in str(meta) or "1" in str(meta):
            fresher_jobs.append(j)
        relevant_jobs.append(j) # We already pre-filtered for relevance
        
    print(f"Fresher Compatible Jobs: {len(fresher_jobs)}")
    print(f"Profile Relevant Jobs (Keyword Matches): {len(relevant_jobs)}")
    
    if jobs:
        print("\nSample Job:")
        sample = jobs[0]
        print(f"  Title: {sample.get('role_title')}")
        print(f"  Apply URL: {sample.get('official_apply_url')}")
        print(f"  Location: {sample.get('location')}")
        print(f"  External ID: {sample.get('external_job_id')}")

def run_validation():
    companies = {
        "Akamai": "https://akamai.wd1.myworkdayjobs.com/Akamai_External_Career_Site",
        "GE HealthCare": "https://gehc.wd5.myworkdayjobs.com/GEHC_ExternalSite",
        "Mastercard": "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers",
        "AMD": "https://careers.amd.com/careers-home"
    }
    for c, url in companies.items():
        try:
            validate_company(c, known_url=url)
        except Exception as e:
            print(f"Error validating {c}: {e}")

if __name__ == "__main__":
    run_validation()
