import json
import warnings
from typing import List, Dict, Optional

# Suppress the ddgs rename warning from duckduckgo_search
warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*duckduckgo_search.*renamed to.*ddgs.*")

try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None

def _parse_json_results(raw: str) -> List[Dict[str, str]]:
    if not raw:
        return []
    cleaned = raw.strip()
    if "```json" in cleaned:
        cleaned = cleaned.split("```json")[1].split("```")[0]
    elif "```" in cleaned:
        cleaned = cleaned.split("```")[1].split("```")[0]
    try:
        data = json.loads(cleaned.strip())
        if isinstance(data, list):
            valid = []
            for item in data:
                if isinstance(item, dict) and ("title" in item or "href" in item):
                    valid.append({
                        "title": str(item.get("title", "")),
                        "href": str(item.get("href", "")),
                        "body": str(item.get("body", ""))
                    })
            return valid
    except Exception:
        pass
    return []

def llm_web_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Synthesizes verified web search snippets using high-speed LLM fallback (Groq / Gemini).
    Always returns structured JSON without requiring external search engine availability.
    """
    prompt = f"""
Search your web and career knowledge base for the following query: "{query}"
Return the top {max_results} results.
You MUST return ONLY a JSON array of objects, with each object containing exactly these keys:
- "title": The title of the search result page
- "href": The authentic URL of the official page (e.g. careers portal, glassdoor, levels.fyi, or official website)
- "body": A concise snippet or description of the page content

Return ONLY valid JSON. No markdown fences, no explanations.
"""
    from app.services.llm_client import groq_client, gemini_client, GROQ_MODEL

    # 1. Try Groq (high quota, ultra fast <400ms, immune to datacenter IP blocks)
    if groq_client:
        try:
            res = groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                max_tokens=800
            )
            raw = (res.choices[0].message.content or "").strip()
            data = _parse_json_results(raw)
            if data:
                print(f"[SearchManager] Groq LLM web search succeeded for query: {query}")
                return data[:max_results]
        except Exception as groq_e:
            print(f"[SearchManager] Groq LLM web search fallback failed: {groq_e}")

    # 2. Try Gemini models (gemini-2.5-flash, gemini-3.5-flash-lite, gemini-3.8-flash)
    if gemini_client:
        for m in ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash"]:
            try:
                res = gemini_client.models.generate_content(
                    model=m,
                    contents=prompt
                )
                raw = (getattr(res, "text", "") or "").strip()
                data = _parse_json_results(raw)
                if data:
                    print(f"[SearchManager] Gemini ({m}) web search succeeded for query: {query}")
                    return data[:max_results]
            except Exception as gem_e:
                print(f"[SearchManager] Gemini model {m} web search failed: {gem_e}")
                continue

    return []

# Backwards compatibility alias
gemini_web_search = llm_web_search

def perform_resilient_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Tries DDGS first with relaxed query format. If it fails, is rate-limited, or returns empty,
    falls back to high-reliability LLM web intelligence.
    """
    results = []
    if DDGS:
        try:
            with DDGS(timeout=4) as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                if results:
                    print(f"[SearchManager] DDGS succeeded for query: {query}")
                    return results
        except Exception as e:
            print(f"[SearchManager] DDGS search failed or blocked for query '{query}': {e}")

    print(f"[SearchManager] DDGS returned empty or failed. Falling back to LLM for: {query}")
    return llm_web_search(query, max_results=max_results)
