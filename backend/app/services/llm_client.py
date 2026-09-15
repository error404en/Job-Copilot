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

GEMINI_TEXT_MODELS = [
    GEMINI_MODEL,           # gemini-2.5-flash (default, from settings)
    "gemini-3.6-flash",     # next-gen stable
    "gemini-flash-latest",  # always latest active flash
    "gemini-2.5-flash-lite",# high quota lightweight fallback
]

GEMINI_JSON_MODELS = [
    GEMINI_MODEL,
    "gemini-3.6-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
]

GEMINI_VISION_MODELS = [
    GEMINI_VISION_MODEL,    # gemini-2.5-flash (default, from settings)
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image",
]

GROQ_MODELS = [
    GROQ_MODEL,             # Default from settings (compound-beta)
    "llama-3.3-70b-versatile",  # High quality, widely available
    "llama-3.1-70b-versatile",  # Stable fallback
    "mixtral-8x7b-32768",       # Reliable free-tier model
    "gemma2-9b-it",             # Lightweight fallback
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
    if not gemini_client:
        return None
    for model in GEMINI_TEXT_MODELS:
        try:
            result = _gemini_text(model, prompt)
            if model != GEMINI_TEXT_MODELS[0]:
                print(f"[LLM] Gemini text fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Gemini text {model} failed: {e}")
    return None

def _try_gemini_json(prompt: str) -> Optional[str]:
    if not gemini_client:
        return None
    for model in GEMINI_JSON_MODELS:
        try:
            result = _gemini_json(model, prompt)
            if model != GEMINI_JSON_MODELS[0]:
                print(f"[LLM] Gemini JSON fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Gemini JSON {model} failed: {e}")
    return None

def _try_groq_text(prompt: str) -> Optional[str]:
    if not groq_client:
        return None
    for model in GROQ_MODELS:
        try:
            result = _groq_text(model, prompt)
            if model != GROQ_MODELS[0]:
                print(f"[LLM] Groq text fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Groq text {model} failed: {e}")
    return None

def _try_groq_json(prompt: str) -> Optional[str]:
    if not groq_client:
        return None
    for model in GROQ_MODELS:
        try:
            result = _groq_json(model, prompt)
            if model != GROQ_MODELS[0]:
                print(f"[LLM] Groq JSON fallback used: {model}")
            return result
        except Exception as e:
            print(f"[LLM] Groq JSON {model} failed: {e}")
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
        return result
    raise RuntimeError(
        "All LLM providers exhausted (Gemini + Groq + Local Ollama). "
        "Check your API keys, rate limits, or ensure Ollama is running locally."
    )


def generate_tailoring_text(prompt: str) -> str:
    """
    Dedicated generator for high-nuance writing tasks (cover letters, bullet points).
    Strictly attempts to use the high-tier Groq model (Llama 3.3 70B) first.
    If it fails, it falls back to the standard text completion waterfall.
    """
    if groq_client:
        try:
            print(f"[LLM] Attempting tailored generation with {GROQ_TAILORING_MODEL}...")
            result = _groq_text(GROQ_TAILORING_MODEL, prompt)
            return result
        except Exception as e:
            print(f"[LLM] Tailoring model {GROQ_TAILORING_MODEL} failed: {e}. Falling back to standard waterfall.")
    
    # Fallback to standard waterfall, preferring Groq
    return get_completion(prompt, use_groq=True)

def generate_tailoring_text_stream(prompt: str):
    """
    Generator for streaming conversational coaching and writing tasks.
    Streams via Groq primary model, falls back to Groq secondary, then Gemini Flash streaming, and finally blocking waterfall.
    """
    # 1. Primary & Secondary Groq Streaming
    if groq_client:
        groq_stream_models = [GROQ_TAILORING_MODEL, "openai/gpt-oss-120b", "openai/gpt-oss-20b", "groq/compound"]
        seen_models = set()
        for m in groq_stream_models:
            if m in seen_models:
                continue
            seen_models.add(m)
            try:
                print(f"[LLM] Attempting tailored streaming generation with {m}...")
                response = groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
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

    # 2. Gemini Flash Streaming Fallback
    if gemini_client:
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

    # 3. Final blocking fallback
    print("[LLM] Streaming fallbacks exhausted, falling back to blocking waterfall.")
    fallback_text = get_completion(prompt, use_groq=True)
    yield fallback_text



def generate_structured(prompt: str, schema_class: Type[T], use_groq: bool = False) -> T:
    """
    Structured JSON completion with full waterfall including Local Ollama.
    """
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{schema_class.model_json_schema()}"
    )

    raw_json: Optional[str] = None

    if use_groq:
        raw_json = _try_groq_json(full_prompt)
        if raw_json is None:
            print("[LLM] All Groq JSON models failed, falling back to Gemini chain.")
            raw_json = _try_gemini_json(full_prompt)
    else:
        raw_json = _try_gemini_json(full_prompt)
        if raw_json is None:
            print("[LLM] All Gemini JSON models failed, falling back to Groq chain.")
            raw_json = _try_groq_json(full_prompt)

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

    # Fallback: Groq text mode (parse JSON manually from text response)
    if raw is None and groq_client:
        print(f"[LLM] Gemini failed for extract_jobs_from_page({company_name}), trying Groq text.")
        raw = _try_groq_text(prompt)

    if raw is None:
        print(f"[LLM] extract_jobs_from_page: all models failed for {company_name}")
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

