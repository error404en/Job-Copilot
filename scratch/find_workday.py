import asyncio
from duckduckgo_search import DDGS
from urllib.parse import urlparse

def find_workday(company):
    print(f"Searching for {company} workday careers...")
    results = DDGS().text(f"{company} workday careers OR {company} myworkdayjobs", max_results=5)
    for res in results:
        url = res.get("href", "")
        if "myworkdayjobs.com" in url:
            print(f"Found: {url}")
            return url
    print("Not found.")
    return None

def find_all():
    companies = ["Akamai", "GE HealthCare", "Mastercard", "AMD"]
    for c in companies:
        find_workday(c)

if __name__ == "__main__":
    find_all()
