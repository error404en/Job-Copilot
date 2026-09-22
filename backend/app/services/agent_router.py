import json
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from fastapi import HTTPException
from app.services.llm_client import generate_structured
from app.utils.security import validate_safe_url
import traceback

class RouterDecision(BaseModel):
    requires_tool: bool = Field(description="Set to true if the user's message explicitly asks the coach to fetch a link, search the web, scrape a URL, extract job links from a page, or fetch jobs.")
    tool_name: Optional[str] = Field(description="The name of the tool to use: 'search_web', 'scrape_url', or 'extract_job_links'. Leave null if requires_tool is false.")
    tool_args: Optional[Dict[str, Any]] = Field(description="A dictionary of arguments for the tool. For 'search_web', provide {'query': '...'} . For 'scrape_url' or 'extract_job_links', provide {'url': '...'} .")

def perform_search_web(query: str) -> str:
    """Uses robust resilient search (DDGS + Gemini) to search the web and returns a summary of top results."""
    try:
        from app.services.search_manager import perform_resilient_search
        results = perform_resilient_search(query, max_results=3)
        formatted = []
        for r in results:
            formatted.append(f"Title: {r.get('title')}\nURL: {r.get('href')}\nSnippet: {r.get('body')}\n")
        
        if not formatted:
            return "No web search results found."
        return "Web Search Results:\n" + "\n".join(formatted)
    except ImportError:
        return "[Error: search modules not found.]"
    except Exception as e:
        return f"[Error performing search: {e}]"

def perform_scrape_url(url: str) -> str:
    """Fetches a URL and extracts readable text using BeautifulSoup."""
    try:
        validate_safe_url(url)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.extract()
            
        text = soup.get_text(separator="\n")
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        # Limit to 10k chars to prevent context overflow
        return text[:10000]
    except Exception as e:
        return f"[Error scraping URL: {str(e)}]"

def perform_extract_job_links(url: str) -> str:
    """Fetches an aggregator URL and extracts all hyperlink tags, filtering for job-like links."""
    try:
        from urllib.parse import urljoin
        validate_safe_url(url)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, "html.parser")
        links = soup.find_all('a')
        
        extracted_links = []
        for l in links:
            href = l.get('href')
            text = l.get_text(strip=True)
            # Basic heuristic: ignore empty links, anchor links, and common non-job nav items
            if href and text and not href.startswith('#') and len(text) > 3:
                ignore_keywords = ['login', 'sign in', 'register', 'contact', 'about', 'privacy', 'terms']
                if not any(k in text.lower() for k in ignore_keywords):
                    full_url = urljoin(url, href)
                    extracted_links.append(f"- {text}: {full_url}")
                    
        # Remove duplicates while preserving order
        unique_links = list(dict.fromkeys(extracted_links))
        
        if not unique_links:
            return "No job links found on this page."
            
        # Return up to 100 links to prevent context overflow
        result = "Found the following links on the page. Please present the most relevant ones to the user:\n"
        result += "\n".join(unique_links[:100])
        return result
    except Exception as e:
        return f"[Error extracting links from URL: {str(e)}]"

def process_agent_routing(user_message: str, chat_history: List[Dict[str, str]]) -> Optional[str]:
    """
    Evaluates the user's message to determine if an action needs to be taken.
    Returns the string result of the action, or None if no action is needed.
    """
    prompt = f"""
    You are an intelligent routing agent for a career coaching assistant. 
    Analyze the user's latest message. Determine if they are asking you to perform an external action.

    AVAILABLE TOOLS:
    1. 'search_web': Use this if the user asks you to find an apply link, search for a company's jobs, or look up information on the web.
       - Args: {{"query": "search terms here"}}
    2. 'scrape_url': Use this if the user explicitly pastes a URL (like a Google Sheet, Notion page, or job board link) and asks you to read or extract text from it.
       - Args: {{"url": "https://..."}}
    3. 'extract_job_links': Use this if the user explicitly pastes an aggregator URL (like thejobcompany.co.in) and asks you to find, scrape, or list the actual job links/openings from it.
       - Args: {{"url": "https://..."}}

    USER MESSAGE:
    "{user_message}"
    """

    try:
        decision = generate_structured(prompt, RouterDecision, use_groq=False)
        
        if not decision.requires_tool or not decision.tool_name:
            return None
            
        print(f"[Agent Router] Executing Tool: {decision.tool_name} with args: {decision.tool_args}")
        
        if decision.tool_name == "search_web":
            query = decision.tool_args.get("query", "")
            return f"[System Action: Searched the web for '{query}']\nResult:\n" + perform_search_web(query)
            
        elif decision.tool_name == "scrape_url":
            url = decision.tool_args.get("url", "")
            return f"[System Action: Scraped text content from URL '{url}']\nResult:\n" + perform_scrape_url(url)
            
        elif decision.tool_name == "extract_job_links":
            url = decision.tool_args.get("url", "")
            return f"[System Action: Extracted job links from aggregator URL '{url}']\nResult:\n" + perform_extract_job_links(url)
            
        return None
        
    except Exception as e:
        print(f"[Agent Router] Error: {e}")
        traceback.print_exc()
        return None
