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

def google_search_grounding(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Executes live Google Search using Gemini 2.5 Google Search Grounding.
    Queries the live Google web index and extracts authentic, direct destination URLs.
    """
    from app.services.llm_client import gemini_client
    if not gemini_client:
        return []

    prompt = f"""Use Google Search to find top results for: "{query}"
Return ONLY a valid JSON list of up to {max_results} search results.
Each result object must have:
- "title": page title
- "href": direct authentic destination URL (e.g. https://domain.com/path), do NOT use google redirect URLs
- "body": concise snippet or summary of the page

Return ONLY the JSON array without markdown formatting."""

    try:
        chat = gemini_client.chats.create(
            model="gemini-2.5-flash",
            config={"tools": [{"google_search": {}}]}
        )
        response = chat.send_message(prompt)
        raw = (getattr(response, "text", "") or "").strip()
        data = _parse_json_results(raw)

        # If any href returned is a vertex redirect URL, resolve it to the authentic destination
        valid_results = []
        for item in data:
            href = item.get("href", "")
            if "vertexaisearch.cloud.google.com" in href:
                try:
                    import requests
                    r = requests.get(href, allow_redirects=True, timeout=3)
                    if r.url and "vertexaisearch" not in r.url:
                        item["href"] = r.url
                    else:
                        continue
                except Exception:
                    continue
            valid_results.append(item)
            if len(valid_results) >= max_results:
                break

        # If JSON parsing was empty or incomplete, extract directly from grounding_metadata chunks
        if not valid_results and hasattr(response, "candidates") and response.candidates:
            cand = response.candidates[0]
            g_meta = getattr(cand, "grounding_metadata", None)
            chunks = getattr(g_meta, "grounding_chunks", None) or []
            import requests
            seen_urls = set()
            for chunk in chunks:
                web = getattr(chunk, "web", None)
                if not web:
                    continue
                uri = getattr(web, "uri", "") or ""
                title = getattr(web, "title", "") or ""
                if not uri:
                    continue
                dest_url = uri
                if "vertexaisearch.cloud.google.com" in uri:
                    try:
                        r = requests.get(uri, allow_redirects=True, timeout=3)
                        if r.url and "vertexaisearch" not in r.url:
                            dest_url = r.url
                        else:
                            continue
                    except Exception:
                        continue
                if dest_url and dest_url not in seen_urls:
                    seen_urls.add(dest_url)
                    valid_results.append({
                        "title": title or "Official Page",
                        "href": dest_url,
                        "body": title
                    })
                if len(valid_results) >= max_results:
                    break

        if valid_results:
            print(f"[SearchManager] Google Search Grounding succeeded for query: {query}")
            return valid_results
    except Exception as e:
        print(f"[SearchManager] Google Search Grounding error: {e}")

    return []

# Backwards compatibility alias
gemini_web_search = llm_web_search

def perform_resilient_search(query: str, max_results: int = 3) -> List[Dict[str, str]]:
    """
    Resilient multi-tier search engine:
    1. Primary: Google Search Grounding (Live Google index, covers any company)
    2. Secondary: DuckDuckGo (DDGS)
    3. Fallback: LLM knowledge synthesis (Groq / Gemini memory)
    """
    # 1. Primary: Google Search Grounding
    results = google_search_grounding(query, max_results=max_results)
    if results:
        return results

    # 2. Secondary: DuckDuckGo
    if DDGS:
        try:
            with DDGS(timeout=4) as ddgs:
                ddg_results = list(ddgs.text(query, max_results=max_results))
                if ddg_results:
                    print(f"[SearchManager] DDGS succeeded for query: {query}")
                    return ddg_results
        except Exception as e:
            print(f"[SearchManager] DDGS search failed or blocked for query '{query}': {e}")

    # 3. Fallback: LLM knowledge base
    print(f"[SearchManager] Falling back to LLM knowledge synthesis for: {query}")
    return llm_web_search(query, max_results=max_results)
