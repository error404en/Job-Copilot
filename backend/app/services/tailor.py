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
    Generates 3-5 highly targeted resume bullet points using the XYZ formula,
    incorporating missing JD keywords naturally.
    """
    keywords_str = ", ".join(missing_keywords) if missing_keywords else "None"
    
    prompt = f"""
    You are an elite, no-nonsense senior technical recruiter.
    Your task is to rewrite or create 3-5 resume bullet points for a candidate based on their base profile and the target Job Description.
    
    CRITICAL RULES:
    1. You must NEVER use any of the following words or phrases. If you use them, you fail:
       {BANNED_WORDS}
    2. Write bullets using ONLY the XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]."
    3. Do NOT use adjectives to describe the work (e.g., do not say "successfully led" or "expertly designed"). Let the metrics speak for themselves.
    4. If metrics are missing from the base profile, extrapolate realistic placeholders in brackets like [insert %] or [insert number].
    5. Weave the following missing keywords seamlessly into the narrative. Do NOT just list them.
       Missing Keywords: {keywords_str}
    
    Base Candidate Profile:
    {resume_summary}
    
    Target Job Description (for context):
    {jd_text[:3000]}
    
    Return exactly 3 to 5 highly polished bullet points.
    """
    
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{TailoredBullets.model_json_schema()}"
    )
    
    raw_response = generate_tailoring_text(full_prompt)
    
    # Manually parse the JSON from the text response
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
