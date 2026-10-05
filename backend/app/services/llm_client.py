import json
import os
from pydantic import BaseModel
from typing import Type, TypeVar, Optional
from app.config.settings import GEMINI_API_KEY, GROQ_API_KEY, GEMINI_MODEL, GEMINI_VISION_MODEL, GROQ_MODEL, GROQ_TAILORING_MODEL

T = TypeVar('T', bound=BaseModel)

groq_client = None
gemini_client = None

if GROQ_API_KEY:
    from groq import Groq
    groq_client = Groq(api_key=GROQ_API_KEY)

if GEMINI_API_KEY:
    from google import genai
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# ---------------------------------------------------------------------------
# Fallback model chains — tried left to right until one succeeds.
# Primary model is always first (from settings). Others activate automatically
# on any error (rate limit, 404, network, etc).
# ---------------------------------------------------------------------------

import hashlib
import time
from collections import OrderedDict

# ---------------------------------------------------------------------------
# In-memory prompt cache: SHA256(prompt) -> (timestamp, response_str)
# Caches identical analyses for 2 hours, saving 100% of tokens on re-runs.
# ---------------------------------------------------------------------------
_LLM_CACHE: OrderedDict[str, tuple] = OrderedDict()
_LLM_CACHE_TTL = 7200  # 2 hours
_LLM_CACHE_MAX_SIZE = 500

def _get_from_cache(prompt: str) -> Optional[str]:
    key = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    if key in _LLM_CACHE:
        ts, val = _LLM_CACHE[key]
        if time.time() - ts < _LLM_CACHE_TTL:
            _LLM_CACHE.move_to_end(key)
            return val
        else:
            del _LLM_CACHE[key]
    return None

def _put_in_cache(prompt: str, val: str):
    if not val:
        return
    key = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
    if len(_LLM_CACHE) >= _LLM_CACHE_MAX_SIZE:
        _LLM_CACHE.popitem(last=False)
    _LLM_CACHE[key] = (time.time(), val)

# Circuit breakers: pause calls to exhausted providers instead of cascading failures
_gemini_exhausted_until = 0.0
_groq_exhausted_until = 0.0

def _is_rate_limit_error(e: Exception) -> bool:
    msg = str(e).lower()
    return any(term in msg for term in [
        "429", "resource_exhausted", "quota", "rate limit", 
        "tokens per day", "tpd", "too many requests"
    ])

# ---------------------------------------------------------------------------
# Fallback model chains — High-quota production tier
# ---------------------------------------------------------------------------

GEMINI_TEXT_MODELS = [
    GEMINI_MODEL,              # gemini-2.5-flash
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
]

GEMINI_JSON_MODELS = [
    GEMINI_MODEL,              # gemini-2.5-flash
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
]

GEMINI_VISION_MODELS = [
    GEMINI_VISION_MODEL,       # gemini-2.5-flash
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
]

GROQ_MODELS = [
    GROQ_MODEL,                # qwen/qwen3.8-27b
    "openai/gpt-oss-20b",      # fast, high quota
    "allam-2-7b",
    "openai/gpt-oss-120b",      # 120b fallback (200k TPD)
]


# Local open source fallback (Ollama) to guarantee NO rate limits
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
try:
    ollama_client = Groq(api_key="ollama", base_url=OLLAMA_BASE_URL)
except:
    ollama_client = None

# ---------------------------------------------------------------------------
# Low-level single-model callers
# ---------------------------------------------------------------------------

def _gemini_text(model: str, prompt: str) -> str:
    response = gemini_client.models.generate_content(model=model, contents=prompt)
    return response.text

def _gemini_json(model: str, prompt: str) -> str:
    from google.genai import types
    response = gemini_client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )
    return response.text

def _groq_text(model: str, prompt: str) -> str:
    response = groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        temperature=0.7,
    )
    return response.choices[0].message.content

def _groq_json(model: str, prompt: str) -> str:
    response = groq_client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are a precise data extraction assistant that outputs only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        model=model,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    return response.choices[0].message.content

def _ollama_text(prompt: str) -> str:
    response = ollama_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=OLLAMA_MODEL,
        temperature=0.7,
    )
    return response.choices[0].message.content

def _ollama_json(prompt: str) -> str:
    response = ollama_client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are a precise data extraction assistant that outputs only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        model=OLLAMA_MODEL,
        response_format={"type": "json_object"},
        temperature=0.0,
    )
    return response.choices[0].message.content

# ---------------------------------------------------------------------------
# Waterfall helpers — iterate through model list, return None if all fail
# ---------------------------------------------------------------------------

def _try_gemini_text(prompt: str) -> Optional[str]:
    global _gemini_exhausted_until
    if not gemini_client:
        return None
    if time.time() < _gemini_exhausted_until:
        return None
    for model in GEMINI_TEXT_MODELS:
        try:
            result = _gemini_text(model, prompt)
            if model != GEMINI_TEXT_MODELS[0]:
                print(f"[LLM] Gemini text fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Gemini text {model} failed: {e}")
            if _is_rate_limit_error(e):
                _gemini_exhausted_until = time.time() + 300  # 5m backoff
                print("[LLM] Gemini quota reached. Circuit breaker engaged for 5m.")
                break
    return None

def _try_gemini_json(prompt: str) -> Optional[str]:
    global _gemini_exhausted_until
    if not gemini_client:
        return None
    if time.time() < _gemini_exhausted_until:
        return None
    for model in GEMINI_JSON_MODELS:
        try:
            result = _gemini_json(model, prompt)
            if model != GEMINI_JSON_MODELS[0]:
                print(f"[LLM] Gemini JSON fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Gemini JSON {model} failed: {e}")
            if _is_rate_limit_error(e):
                _gemini_exhausted_until = time.time() + 300  # 5m backoff
                print("[LLM] Gemini quota reached. Circuit breaker engaged for 5m.")
                break
    return None

AVAILABLE_GROQ_MODELS = None

def _groq_model_priority(model_id: str) -> int:
    id_lower = model_id.lower()
    if "qwen3.8-27b" in id_lower:
        return 0  # Highest priority: smart, fast, generous quota
    if "gpt-oss-20b" in id_lower and "safeguard" not in id_lower:
        return 1  # Second: 20b efficient model
    if "allam" in id_lower:
        return 2
    if "gpt-oss-120b" in id_lower:
        return 3  # Lower priority because 200k daily token limit exhausts quickly
    return 4

def _get_groq_models():
    global AVAILABLE_GROQ_MODELS
    if AVAILABLE_GROQ_MODELS is None:
        try:
            res = groq_client.models.list()
            valid_models = []
            for m in res.data:
                id = m.id.lower()
                # Exclude audio, vision, guardrails
                if any(x in id for x in ["whisper", "guard", "vision", "canopy"]):
                    continue
                # Include only known high-quality LLM families
                if any(x in id for x in ["qwen", "gpt-oss", "allam", "llama"]):
                    valid_models.append(m.id)
            # Sort by priority so qwen and 20b come before 120b
            valid_models.sort(key=_groq_model_priority)
            AVAILABLE_GROQ_MODELS = valid_models
        except Exception as e:
            print(f"[LLM] Failed to fetch dynamic Groq models: {e}")
            AVAILABLE_GROQ_MODELS = GROQ_MODELS
    return AVAILABLE_GROQ_MODELS

def _try_groq_text(prompt: str) -> Optional[str]:
    global _groq_exhausted_until
    if not groq_client:
        return None
    if time.time() < _groq_exhausted_until:
        return None
        
    safe_prompt = prompt if len(prompt) <= 12000 else prompt[:12000] + "\n[Content truncated for token safety]"
        
    models_to_try = [GROQ_MODEL] + _get_groq_models()
    seen = set()
    models = []
    for m in models_to_try:
        if m not in seen:
            seen.add(m)
            models.append(m)
            
    for model in models[:4]:
        try:
            result = _groq_text(model, safe_prompt)
            if model != GROQ_MODEL:
                print(f"[LLM] Groq text fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Groq text {model} failed: {e}")
            if "tokens per day" in str(e).lower() or "tpd" in str(e).lower():
                _groq_exhausted_until = time.time() + 600
                print("[LLM] Groq daily token limit reached. Circuit breaker engaged for 10m.")
                break
    return None

def _try_groq_json(prompt: str) -> Optional[str]:
    global _groq_exhausted_until
    if not groq_client:
        return None
    if time.time() < _groq_exhausted_until:
        return None
        
    safe_prompt = prompt if len(prompt) <= 12000 else prompt[:12000] + "\n[Content truncated for token safety]"
        
    models_to_try = [GROQ_MODEL] + _get_groq_models()
    seen = set()
    models = []
    for m in models_to_try:
        if m not in seen:
            seen.add(m)
            models.append(m)
            
    for model in models[:4]:
        try:
            result = _groq_json(model, safe_prompt)
            if model != GROQ_MODEL:
                print(f"[LLM] Groq JSON fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Groq JSON {model} failed: {e}")
            if "tokens per day" in str(e).lower() or "tpd" in str(e).lower():
                _groq_exhausted_until = time.time() + 600
                print("[LLM] Groq daily token limit reached. Circuit breaker engaged for 10m.")
                break
    return None

def _try_ollama_text(prompt: str) -> Optional[str]:
    if not ollama_client:
        return None
    try:
        result = _ollama_text(prompt)
        print(f"[LLM] Local Ollama text fallback used: {OLLAMA_MODEL}")
        return result
    except Exception as e:
        print(f"[LLM] Local Ollama text fallback failed (is Ollama running?): {e}")
        return None

def _try_ollama_json(prompt: str) -> Optional[str]:
    if not ollama_client:
        return None
    try:
        result = _ollama_json(prompt)
        print(f"[LLM] Local Ollama JSON fallback used: {OLLAMA_MODEL}")
        return result
    except Exception as e:
        print(f"[LLM] Local Ollama JSON fallback failed (is Ollama running?): {e}")
        return None

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_completion(prompt: str, use_groq: bool = False) -> str:
    """
    Free-text completion with full 7-model waterfall.
    Default: Gemini chain -> Groq chain -> Local Ollama.
    use_groq=True: Groq chain -> Gemini chain -> Local Ollama.
    """
    cached = _get_from_cache(prompt)
    if cached is not None:
        return cached

    result = None
    if use_groq:
        result = _try_groq_text(prompt)
        if result is None:
            print("[LLM] All Groq text models failed, falling back to Gemini chain.")
            result = _try_gemini_text(prompt)
    else:
        result = _try_gemini_text(prompt)
        if result is None:
            print("[LLM] All Gemini text models failed, falling back to Groq chain.")
            result = _try_groq_text(prompt)

    if result is None:
        print("[LLM] All cloud LLMs failed, falling back to Local Ollama.")
        result = _try_ollama_text(prompt)

    if result is not None:
        _put_in_cache(prompt, result)
        return result
    raise RuntimeError(
        "All LLM providers exhausted (Gemini + Groq + Local Ollama). "
        "Check your API keys, rate limits, or ensure Ollama is running locally."
    )


def generate_tailoring_text(prompt: str) -> str:
    """
    Dedicated generator for high-nuance writing tasks (cover letters, bullet points).
    Used for complex reasoning tasks like cover letter generation or bullet point tailoring.
    Prioritizes the best available Groq open-source model for efficiency and quality.
    """
    global _groq_exhausted_until
    if groq_client and time.time() >= _groq_exhausted_until:
        models = _get_groq_models()
        target_model = GROQ_TAILORING_MODEL if GROQ_TAILORING_MODEL in models else (models[0] if models else "llama-3.3-70b-versatile")
        
        try:
            print(f"[LLM] Attempting tailored generation with {target_model}...")
            safe_prompt = prompt if len(prompt) <= 12000 else prompt[:12000] + "\n[Content truncated for token safety]"
            result = _groq_text(target_model, safe_prompt)
            return result
        except Exception as e:
            print(f"[LLM] Tailoring model {target_model} failed: {e}. Falling back to standard waterfall.")
            if "tokens per day" in str(e).lower() or "tpd" in str(e).lower():
                _groq_exhausted_until = time.time() + 600
            
    # 2. Fallback: Standard Waterfall (Gemini -> Groq fallback -> Ollama)
    return _try_gemini_text(prompt) or _try_groq_text(prompt) or _try_ollama_text(prompt) or ""

def generate_tailoring_text_stream(prompt: str):
    """
    Generator for streaming conversational coaching and writing tasks.
    Streams via Groq primary model, falls back to Groq secondary, then Gemini Flash streaming, and finally blocking waterfall.
    """
    global _groq_exhausted_until, _gemini_exhausted_until
    # 1. Primary & Secondary Groq Streaming
    if groq_client and time.time() >= _groq_exhausted_until:
        safe_prompt = prompt if len(prompt) <= 12000 else prompt[:12000] + "\n[Content truncated for token safety]"
        groq_stream_models = [GROQ_TAILORING_MODEL] + _get_groq_models()[:3]
        seen_models = set()
        for m in groq_stream_models:
            if m in seen_models:
                continue
            seen_models.add(m)
            try:
                print(f"[LLM] Attempting tailored streaming generation with {m}...")
                response = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": safe_prompt}],
                    model=m,
                    temperature=0.7,
                    stream=True
                )
                yielded_anything = False
                for chunk in response:
                    if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                        yielded_anything = True
                        yield chunk.choices[0].delta.content
                if yielded_anything:
                    return
            except Exception as e:
                print(f"[LLM] Groq streaming with {m} failed: {e}")
                if "tokens per day" in str(e).lower() or "tpd" in str(e).lower():
                    _groq_exhausted_until = time.time() + 600
                    break

    # 2. Gemini Flash Streaming Fallback
    if gemini_client and time.time() >= _gemini_exhausted_until:
        for gm in GEMINI_TEXT_MODELS:
            try:
                print(f"[LLM] Attempting Gemini streaming generation with {gm}...")
                response = gemini_client.models.generate_content_stream(
                    model=gm,
                    contents=prompt
                )
                yielded_anything = False
                for chunk in response:
                    if hasattr(chunk, 'text') and chunk.text:
                        yielded_anything = True
                        yield chunk.text
                if yielded_anything:
                    return
            except Exception as e:
                print(f"[LLM] Gemini streaming with {gm} failed: {e}")
                if _is_rate_limit_error(e):
                    _gemini_exhausted_until = time.time() + 300
                    break

    # 3. Final blocking fallback
    print("[LLM] Streaming fallbacks exhausted, falling back to blocking waterfall.")
    fallback_text = get_completion(prompt, use_groq=True)
    yield fallback_text



def generate_structured(prompt: str, schema_class: Type[T], use_groq: bool = False) -> T:
    """
    Structured JSON completion with full waterfall including Local Ollama.
    Default (use_groq=False): Gemini -> Groq fallback -> Local Ollama.
    use_groq=True: Groq -> Gemini fallback -> Local Ollama.
    """
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{schema_class.model_json_schema()}"
    )

    cached_json = _get_from_cache(full_prompt)
    if cached_json is not None:
        try:
            data = json.loads(cached_json.strip())
            return schema_class(**data)
        except Exception:
            pass

    raw_json: Optional[str] = None

    # If explicitly requested, try Groq first
    if use_groq and groq_client:
        raw_json = _try_groq_json(full_prompt)

    # Primary default: Gemini (high quota, 1M+ TPM, fast structured outputs)
    if raw_json is None:
        raw_json = _try_gemini_json(full_prompt)

    # Secondary fallback: Groq (if Gemini fails or was skipped)
    if raw_json is None and groq_client:
        print("[LLM] All Gemini JSON models failed, falling back to Groq chain.")
        raw_json = _try_groq_json(full_prompt)

    # Tertiary fallback: Local Ollama
    if raw_json is None:
        print("[LLM] All cloud LLMs failed, falling back to Local Ollama.")
        raw_json = _try_ollama_json(full_prompt)

    if raw_json is None:
        raise RuntimeError(
            "All LLM providers exhausted (Gemini + Groq + Local Ollama). "
            "Check your API keys, rate limits, or ensure Ollama is running locally."
        )

    # Strip markdown fences defensively
    raw_json = raw_json.strip()
    if raw_json.startswith("```json"):
        raw_json = raw_json[7:]
        raw_json = raw_json[:raw_json.rfind("```")]
    elif raw_json.startswith("```"):
        raw_json = raw_json[3:]
        raw_json = raw_json[:raw_json.rfind("```")]

    try:
        data = json.loads(raw_json.strip())
        _put_in_cache(full_prompt, raw_json)
        return schema_class(**data)
    except Exception as e:
        print(f"[LLM] JSON parse error.\nRaw output:\n{raw_json}")
        raise e



# ---------------------------------------------------------------------------
# Resume parsing
# ---------------------------------------------------------------------------

class ResumeExtraction(BaseModel):
    title: str
    target_type: str
    skills_summary: str

def parse_resume_with_llm(raw_text: str) -> ResumeExtraction:
    prompt = f"""
    You are an expert recruiter and technical resume parser.
    Please read the following raw text extracted from a PDF resume.

    1. 'title': Create a short, professional title based on the candidate's name and primary role (e.g., "John Doe - Backend Engineer").
    2. 'target_type': Classify the primary job family this resume is targeting. Pick one of: "genai", "backend", "frontend", "fullstack", "data", "product", "design", "other".
    3. 'skills_summary': Create a dense, highly compressed paragraph listing their key skills, technologies, and core competencies. This summary will be used by an AI match scorer to evaluate them against job descriptions, so include all tools (e.g. Python, React, AWS, Postgres) and domain skills (e.g. System Design, Agile).

    Raw Resume Text:
    {raw_text}
    """
    return generate_structured(prompt, ResumeExtraction)


# ---------------------------------------------------------------------------
# Image extraction — Gemini Vision only (Groq has no vision capability)
# ---------------------------------------------------------------------------

def extract_text_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """
    Extracts text from a job posting screenshot using Gemini Vision.
    Tries each vision model in GEMINI_VISION_MODELS order.
    Raises on complete failure so the caller can return a clean HTTP 429/400.
    """
    if not gemini_client:
        raise ValueError("Gemini API key is required for image extraction.")

    from google.genai import types
    prompt = (
        "Please extract all text from this image. This is a screenshot of a job posting. "
        "Transcribe all text accurately, preserving the structure, bullet points, and headers. "
        "Do not hallucinate or add commentary. Return only the extracted text."
    )

    last_error = None
    for model in GEMINI_VISION_MODELS:
        try:
            response = gemini_client.models.generate_content(
                model=model,
                contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime_type)],
            )
            if model != GEMINI_VISION_MODELS[0]:
                print(f"[LLM] Gemini vision fallback used: {model}")
            return response.text
        except Exception as e:
            print(f"[LLM] Gemini vision {model} failed: {e}")
            last_error = e

    raise last_error  # Caller handles this with a friendly HTTP error


# ---------------------------------------------------------------------------
# Careers page job extraction
# ---------------------------------------------------------------------------

def extract_jobs_from_page(page_text: str, company_name: str, keywords: list = None) -> list:
    """
    Extracts structured job listings from raw careers page text.
    Returns [{role_title, url, location}] — empty list on any failure, never raises.
    Fallback chain: Gemini JSON (3 models) -> Groq text (3 models).
    Note: Groq's json_object mode doesn't support array root, so Groq uses text mode.
    """
    keyword_clause = f" Filter to only roles matching these keywords: {keywords}." if keywords else ""
    prompt = f"""
    You are parsing a company careers page for '{company_name}'.
    From the raw text below, extract a list of individual job postings.{keyword_clause}

    For each job, extract:
    - role_title: The job title (string)
    - url: The direct apply URL if it appears in the text, otherwise null
    - location: City/country if mentioned, otherwise ""

    Return ONLY a valid JSON array of objects. If no jobs are found, return [].
    Do not include commentary or markdown fences.

    RAW CAREERS PAGE TEXT:
    ---
    {page_text[:8000]}
    ---
    """

    # Primary: Gemini with native JSON mode (supports array root)
    raw: Optional[str] = _try_gemini_json(prompt)

    # Fallback 1: Groq text mode (parse JSON manually from text response)
    if raw is None and groq_client:
        print(f"[LLM] Gemini failed for extract_jobs_from_page({company_name}), trying Groq text.")
        raw = _try_groq_text(prompt)

    # Fallback 2: Local Ollama text mode
    if raw is None and ollama_client:
        print(f"[LLM] Groq failed for extract_jobs_from_page({company_name}), trying Ollama text.")
        raw = _try_ollama_text(prompt)

    if raw is None:
        print(f"[LLM] All LLM models failed to extract jobs for {company_name}. Returning empty list.")
        return []

    try:
        raw = raw.strip()
        if raw.startswith("```json"):
            raw = raw[7:]
            raw = raw[:raw.rfind("```")]
        elif raw.startswith("```"):
            raw = raw[3:]
            raw = raw[:raw.rfind("```")]
        result = json.loads(raw.strip())
        if isinstance(result, list):
            return result
        # Some models wrap the array: {"jobs": [...]}
        if isinstance(result, dict):
            for val in result.values():
                if isinstance(val, list):
                    return val
        return []
    except Exception as e:
        print(f"[LLM] extract_jobs_from_page parse failed for {company_name}: {e}")
        return []

