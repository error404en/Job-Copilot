import json
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
import requests
from bs4 import BeautifulSoup
from app.services.llm_client import generate_structured
import traceback

class RouterDecision(BaseModel):
    requires_tool: bool = Field(description="Set to true if the user's message explicitly asks the coach to fetch a link, search the web, scrape a URL, or fetch jobs.")
    tool_name: Optional[str] = Field(description="The name of the tool to use: 'search_web' or 'scrape_url'. Leave null if requires_tool is false.")
    tool_args: Optional[Dict[str, Any]] = Field(description="A dictionary of arguments for the tool. For 'search_web', provide {'query': '...'} . For 'scrape_url', provide {'url': '...'} .")

def perform_search_web(query: str) -> str:
    """Uses DuckDuckGo to search the web and returns a summary of top results."""
    try:
        from duckduckgo_search import DDGS
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=3):
                results.append(f"Title: {r['title']}\nURL: {r['href']}\nSnippet: {r['body']}\n")
        
        if not results:
            return "No web search results found."
        return "Web Search Results:\n" + "\n".join(results)
    except ImportError:
        return "[Error: duckduckgo_search package not installed. Try: pip install duckduckgo-search]"
    except Exception as e:
        return f"[Error performing search: {e}]"

def perform_scrape_url(url: str) -> str:
    """Fetches a URL and extracts readable text using BeautifulSoup."""
    try:
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
    2. 'scrape_url': Use this if the user explicitly pastes a URL (like a Google Sheet, Notion page, or job board link) and asks you to read or extract jobs from it.
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
            return f"[System Action: Scraped content from URL '{url}']\nResult:\n" + perform_scrape_url(url)
            
        return None
        
    except Exception as e:
        print(f"[Agent Router] Error: {e}")
        traceback.print_exc()
        return None
