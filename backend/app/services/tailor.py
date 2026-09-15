import json
from app.services.llm_client import generate_tailoring_text
from pydantic import BaseModel
from typing import List

class TailoredBullets(BaseModel):
    bullets: List[str]

BANNED_WORDS = (
    "delve, dive, navigate, landscape, tapestry, thrilled, excited, passionate, honored, "
    "robust, dynamic, seamless, cutting-edge, unparalleled, testament to, pivotal, transformative, "
    "In today's fast-paced, Spearheaded, Synergized"
)

def tailor_resume_bullets(resume_summary: str, jd_text: str, missing_keywords: List[str]) -> List[str]:
    """
    Generates 3-5 resume bullet points by reframing REAL achievements in JD-aligned language.
    Strictly forbidden from inventing tech stacks, metrics, or any claims not in the source resume.
    """
    keywords_str = ", ".join(missing_keywords) if missing_keywords else "None"
    
    prompt = f"""
    You are an elite technical resume writer. Your task is to rewrite 3-5 resume bullet points for a candidate.
    
    ABSOLUTE RULES — violating any of these means you have failed:
    1. You MUST NOT invent, fabricate, or extrapolate ANY of the following:
       - Technologies (e.g., do NOT add Redis, C++, Kafka, or any tool not explicitly mentioned in the candidate's profile below)
       - Metrics (e.g., do NOT invent "40% throughput improvement" or "25% cost reduction" unless the number already appears in the profile)
       - Architecture patterns (e.g., do NOT claim "microservice redesign" unless the profile says so)
       - Migrations (e.g., "migrated PostgreSQL to X" — only if the profile explicitly describes this)
       If a claimed achievement cannot be directly traced back to the candidate's profile text, do NOT include it.
    
    2. Your ONLY job is to take what is ALREADY in the candidate's profile and reframe it using the vocabulary and priorities of the JD.
       - "Scalability", "latency", "reliability", "trade-offs", "throughput" are language choices, not new claims.
       - Reword real metrics in JD-relevant framing.
    
    3. If a missing keyword from the JD has NO real counterpart in the candidate's profile, do NOT force it in.
       Instead, write the bullet without it. A true, strong bullet beats a fabricated one every time.
    
    4. Write using the XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]."
       Only use metrics that already exist verbatim in the profile (e.g., "sub-50ms latency", "35K embeddings", "18-25 FPS").
    
    5. Never use: {BANNED_WORDS}
    
    Candidate's Actual Profile (source of truth — do not invent beyond this):
    {resume_summary}
    
    Target Job Description (use only for vocabulary and framing):
    {jd_text[:3000]}
    
    JD Keywords to weave in IF a real counterpart exists in the profile: {keywords_str}
    
    Return exactly 3 to 5 bullet points.
    """
    
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{TailoredBullets.model_json_schema()}"
    )
    
    raw_response = generate_tailoring_text(full_prompt)
    
    try:
        raw_response = raw_response.strip()
        if raw_response.startswith("```json"):
            raw_response = raw_response[7:]
            raw_response = raw_response[:raw_response.rfind("```")]
        elif raw_response.startswith("```"):
            raw_response = raw_response[3:]
            raw_response = raw_response[:raw_response.rfind("```")]
            
        data = json.loads(raw_response.strip())
        return data.get("bullets", [])
    except Exception as e:
        print(f"[Tailor] Failed to parse tailored bullets JSON: {e}")
        return ["Failed to generate tailored bullets. Please try again."]



def generate_targeted_cover_letter(resume_summary: str, jd_text: str, role_title: str, company: str) -> str:
    """
    Generates a highly personalized, structurally unique cover letter using Llama 3.3 70B.
    """
    prompt = f"""
    You are writing a cover letter for a candidate applying for the '{role_title}' role at '{company}'.
    
    CRITICAL RULES:
    1. You must NEVER use any of the following words or phrases. If you use them, you fail:
       {BANNED_WORDS}
    2. Do NOT use the standard cover letter structure.
       - Do NOT start with "I am writing to express my interest in..." or "I am thrilled to apply for..."
       - Do NOT end with "In conclusion" or "I look forward to hearing from you."
    3. Start immediately with a strong, factual hook about a relevant technical achievement from the candidate's profile that perfectly matches the JD.
    4. Vary your sentence lengths. Keep it under 250 words.
    5. Be direct, professional, understated, and factual.
    
    Base Candidate Profile:
    {resume_summary}
    
    Target Job Description:
    {jd_text[:3000]}
    
    Return ONLY the body of the cover letter. Do not include subject lines, addresses, or placeholder names at the top/bottom.
    """
    
    response = generate_tailoring_text(prompt)
    return response.strip()
