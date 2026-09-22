import json
from typing import List, Dict, Optional
from ddgs import DDGS
from app.services.llm_client import gemini_client, GEMINI_MODEL

def gemini_web_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Uses Gemini's Google Search tool to search the web and return structured results.
    Returns a list of dicts: {"title": "...", "href": "...", "body": "..."}
    """
    if not gemini_client:
        print("[SearchManager] Gemini client not initialized. Cannot perform Gemini web search.")
        return []

    from google.genai import types
    prompt = f"""
    Search the web for the following query: "{query}"
    Return the top {max_results} results.
    You MUST return ONLY a JSON array of objects, with each object containing exactly these keys:
    - "title": The title of the search result page
    - "href": The URL of the search result page
    - "body": A short snippet or description of the result

    Return ONLY valid JSON. No markdown fences, no explanations.
    """

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[{"google_search": {}}],
                temperature=0.0
            )
        )
        raw = response.text.strip()
        if raw.startswith("```json"):
            raw = raw[7:]
            raw = raw[:raw.rfind("```")]
        elif raw.startswith("```"):
            raw = raw[3:]
            raw = raw[:raw.rfind("```")]
            
        data = json.loads(raw.strip())
        if isinstance(data, list):
            return data[:max_results]
        return []
    except Exception as e:
        print(f"[SearchManager] Gemini web search failed for query '{query}': {e}")
        return []

def perform_resilient_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Tries DDGS first. If it fails or returns empty, falls back to Gemini Google Search.
    """
    results = []
    try:
        with DDGS(timeout=5) as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            if results:
                print(f"[SearchManager] DDGS succeeded for query: {query}")
                return results
    except Exception as e:
        print(f"[SearchManager] DDGS search failed for query '{query}': {e}")

    print(f"[SearchManager] DDGS returned empty or failed. Falling back to Gemini for: {query}")
    results = gemini_web_search(query, max_results=max_results)
    return results
