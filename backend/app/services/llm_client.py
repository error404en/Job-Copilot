import json
import os
from pydantic import BaseModel
from typing import Type, TypeVar, List
from app.config.settings import GEMINI_API_KEY, GROQ_API_KEY

T = TypeVar('T', bound=BaseModel)

groq_client = None
gemini_client = None

if GROQ_API_KEY:
    from groq import Groq
    groq_client = Groq(api_key=GROQ_API_KEY)

if GEMINI_API_KEY:
    from google import genai
    from google.genai import types
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

def get_completion(prompt: str, use_groq=False) -> str:
    if use_groq and groq_client:
        response = groq_client.chat.completions.create(
            messages=[
                {"role": "user", "content": prompt}
            ],
            model="llama3-70b-8192",
            temperature=0.7
        )
        return response.choices[0].message.content
    elif gemini_client:
        response = gemini_client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
        )
        return response.text
    else:
        raise ValueError("No LLM API keys configured.")

def generate_structured(prompt: str, schema_class: Type[T], use_groq=False) -> T:
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{schema_class.model_json_schema()}"
    )

    if use_groq and groq_client:
        response = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a precise data extraction assistant that outputs only valid JSON."},
                {"role": "user", "content": full_prompt}
            ],
            model="llama3-70b-8192",
            response_format={"type": "json_object"},
            temperature=0.0
        )
        raw_json = response.choices[0].message.content
    elif gemini_client:
        response = gemini_client.models.generate_content(
            model='gemini-3.6-flash',
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.0,
            ),
        )
        raw_json = response.text
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
    Uses Gemini 1.5 Flash to extract text from a screenshot of a job description.
    """
    if not gemini_client:
        raise ValueError("Gemini API key is required for image extraction.")
        
    prompt = "Please extract all text from this image. This is a screenshot of a job posting. Transcribe all text accurately, preserving the structure, bullet points, and headers as much as possible. Do not hallucinate or add any commentary. Return only the extracted text."
    
    response = gemini_client.models.generate_content(
        model='gemini-1.5-flash',
        contents=[
            prompt,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        ]
    )
    return response.text
