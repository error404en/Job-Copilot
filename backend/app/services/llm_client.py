import json
import os
from pydantic import BaseModel
from typing import Type, TypeVar
from app.config.settings import GEMINI_API_KEY, GROQ_API_KEY

T = TypeVar('T', bound=BaseModel)

groq_client = None
gemini_client = None

GROQ_MODEL = "openai/gpt-oss-120b"
GEMINI_MODEL = "gemini-2.5-flash"

if GROQ_API_KEY:
    from groq import Groq
    groq_client = Groq(api_key=GROQ_API_KEY)

if GEMINI_API_KEY:
    from google import genai
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

def _call_gemini_text(prompt: str) -> str:
    from google.genai import types
    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
    )
    return response.text

def _call_groq_text(prompt: str) -> str:
    response = groq_client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model=GROQ_MODEL,
        temperature=0.7
    )
    return response.choices[0].message.content

def _call_gemini_json(prompt: str) -> str:
    from google.genai import types
    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )
    return response.text

def _call_groq_json(prompt: str) -> str:
    response = groq_client.chat.completions.create(
        messages=[
            {"role": "system", "content": "You are a precise data extraction assistant that outputs only valid JSON."},
            {"role": "user", "content": prompt}
        ],
        model=GROQ_MODEL,
        response_format={"type": "json_object"},
        temperature=0.0
    )
    return response.choices[0].message.content

def get_completion(prompt: str, use_groq=False) -> str:
    if use_groq and groq_client:
        try:
            return _call_groq_text(prompt)
        except Exception as e:
            print(f"Groq failed: {e}. Falling back to Gemini.")
            if gemini_client:
                return _call_gemini_text(prompt)
            raise e
    elif gemini_client:
        try:
            return _call_gemini_text(prompt)
        except Exception as e:
            print(f"Gemini failed: {e}. Falling back to Groq.")
            if groq_client:
                return _call_groq_text(prompt)
            raise e
    else:
        raise ValueError("No LLM API keys configured.")

def generate_structured(prompt: str, schema_class: Type[T], use_groq=False) -> T:
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{schema_class.model_json_schema()}"
    )

    raw_json = None
    if use_groq and groq_client:
        try:
            raw_json = _call_groq_json(full_prompt)
        except Exception as e:
            print(f"Groq structured failed: {e}. Falling back to Gemini.")
            if gemini_client:
                raw_json = _call_gemini_json(full_prompt)
            else:
                raise e
    elif gemini_client:
        try:
            raw_json = _call_gemini_json(full_prompt)
        except Exception as e:
            print(f"Gemini structured failed: {e}. Falling back to Groq.")
            if groq_client:
                raw_json = _call_groq_json(full_prompt)
            else:
                raise e
    else:
        raise ValueError("No LLM API keys configured.")

    try:
        if raw_json.startswith("```json"):
            raw_json = raw_json[7:-3]
        elif raw_json.startswith("```"):
            raw_json = raw_json[3:-3]

        data = json.loads(raw_json.strip())
        return schema_class(**data)
    except Exception as e:
        print(f"Error parsing JSON from LLM.\nRaw Output:\n{raw_json}")
        raise e

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

def extract_text_from_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """
    Uses Gemini to extract text from a screenshot of a job description.
    """
    if not gemini_client:
        raise ValueError("Gemini API key is required for image extraction.")

    from google.genai import types
    prompt = "Please extract all text from this image. This is a screenshot of a job posting. Transcribe all text accurately, preserving the structure, bullet points, and headers as much as possible. Do not hallucinate or add any commentary. Return only the extracted text."

    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            prompt,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        ]
    )
    return response.text
