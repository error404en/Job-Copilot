import re
from datetime import datetime, timezone
from app.services.llm_client import generate_structured
from app.models.job import ParsedJob

def parse_job_description_deterministic(raw_text: str) -> ParsedJob:
    """
    Fast rule-based extractor that parses JD text into a ParsedJob
    without relying on external LLM calls. Used when APIs return 429.
    """
    lines = [line.strip() for line in (raw_text or "").split("\n") if line.strip()]
    first_few = " ".join(lines[:5]) if lines else ""
    full_text_lower = (raw_text or "").lower()

    # 1. Company name inference
    company = "Company"
    comp_match = re.search(r'(?:at|company:)\s+([A-Za-z0-9\s&]+?)(?:\s+in|\s+is|\n|\.|\,)', first_few, re.I)
    if comp_match:
        company = comp_match.group(1).strip()
    elif lines:
        # Check first line
        parts = lines[0].split(" - ")
        if len(parts) >= 2:
            company = parts[0].strip()

    # 2. Role Title inference
    role_title = lines[0] if lines else "Software Engineer"
    title_match = re.search(r'(?:Role|Title|Position|Job):\s*([A-Za-z0-9\s\(\)\/\-\+]+)', raw_text, re.I)
    if title_match:
        role_title = title_match.group(1).strip()
    elif len(role_title) > 60:
        # First line is a paragraph; look for common role titles
        for known in ["Software Engineer", "Software Developer", "Full Stack Engineer", "Backend Engineer", 
                      "Frontend Engineer", "Data Scientist", "Data Analyst", "AI Engineer", "ML Engineer", "Technology Analyst"]:
            if known.lower() in full_text_lower:
                role_title = known
                break

    # 3. Location & Remote Type
    remote_type = "unclear"
    if "remote" in full_text_lower:
        remote_type = "remote"
    elif "hybrid" in full_text_lower:
        remote_type = "hybrid"
    elif "onsite" in full_text_lower or "in-office" in full_text_lower:
        remote_type = "onsite"

    location = None
    for city in ["Bengaluru", "Bangalore", "Hyderabad", "Pune", "Noida", "Gurugram", "Gurgaon", "Delhi", "Mumbai", "Chennai"]:
        if city.lower() in full_text_lower:
            location = city
            break

    # 4. Seniority
    seniority = "0-2yr"
    if any(k in full_text_lower for k in ["fresher", "graduating", "campus", "entry level", "intern", "trainee"]):
        seniority = "fresher"
    elif any(k in full_text_lower for k in ["senior", "lead", "staff", "principal", "5+ years", "6+ years", "7+ years"]):
        seniority = "senior"
    elif any(k in full_text_lower for k in ["2-5 years", "3-5 years", "2+ years", "3+ years", "4+ years"]):
        seniority = "2-5yr"

    # 5. Skills extraction
    COMMON_SKILLS = [
        "Python", "Java", "C++", "C#", "Golang", "JavaScript", "TypeScript",
        "React", "Node.js", "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis",
        "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Kafka", "REST APIs",
        "FastAPI", "Spring Boot", "Git", "Linux", "Machine Learning", "System Design"
    ]
    detected_skills = [sk for sk in COMMON_SKILLS if re.search(r'\b' + re.escape(sk) + r'\b', raw_text, re.I)]

    return ParsedJob(
        company=company,
        role_title=role_title,
        location=location or ("Remote" if remote_type == "remote" else "India"),
        remote_type=remote_type,
        pay_min=None,
        pay_max=None,
        pay_currency="INR",
        pay_confidence="unknown",
        posting_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        seniority_required=seniority,
        required_skills=detected_skills or ["Problem Solving", "Software Engineering Fundamentals"],
        nice_to_have_skills=[]
    )


def parse_job_description(raw_text: str, use_groq: bool = False) -> ParsedJob:
    """
    Extracts structured fields from raw job description text.
    Falls back gracefully to deterministic rule-based parsing if cloud LLMs are rate-limited.
    """
    prompt = f"""
    You are an expert technical recruiter analyzing a job description.
    Extract the required information from the following job description text.
    If a field like pay or location is not explicitly stated, try to infer it if there are strong clues,
    but mark pay_confidence as 'estimated' or 'unknown'. 
    For remote_type, choose from 'remote', 'hybrid', 'onsite', or 'unclear'.
    For seniority, classify it as 'fresher' (0-1 yrs), '0-2yr', '2-5yr', 'senior' (5+), or 'unclear'.
    Look closely for application deadlines (deadline_date) and format as YYYY-MM-DD. If they mention "rolling basis" or "apply ASAP", set is_rolling_deadline to true.
    Look for the job posting date (posting_date) and format as YYYY-MM-DD.
    If the JD lists different salary ranges for different regions or locations, extract this into region_wise_salary as a descriptive string.
    Return the information in the required JSON structure.
    
    JOB DESCRIPTION TEXT:
    ---
    {raw_text}
    ---
    """
    
    try:
        parsed_job = generate_structured(prompt, ParsedJob, use_groq=use_groq)
        return parsed_job
    except Exception as e:
        print(f"[JDParser] Cloud LLM rate-limited or unavailable ({e}). Falling back to deterministic parser.")
        return parse_job_description_deterministic(raw_text)
