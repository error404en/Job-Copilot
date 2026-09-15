from app.services.llm_client import generate_structured
from app.models.job import ParsedJob

def parse_job_description(raw_text: str, use_groq: bool = False) -> ParsedJob:
    """
    Extracts structured fields from raw job description text.
    """
    prompt = f"""
    You are an expert technical recruiter analyzing a job description.
    Extract the required information from the following job description text.
    If a field like pay or location is not explicitly stated, try to infer it if there are strong clues,
    but mark pay_confidence as 'estimated' or 'unknown'. 
    For remote_type, choose from 'remote', 'hybrid', 'onsite', or 'unclear'.
    For seniority, classify it as 'fresher' (0-1 yrs), '0-2yr', '2-5yr', 'senior' (5+), or 'unclear'.
    Look closely for application deadlines (deadline_date) and format as YYYY-MM-DD. If they mention "rolling basis" or "apply ASAP", set is_rolling_deadline to true.
    Return the information in the required JSON structure.
    
    JOB DESCRIPTION TEXT:
    ---
    {raw_text}
    ---
    """
    
    parsed_job = generate_structured(prompt, ParsedJob, use_groq=use_groq)
    return parsed_job
