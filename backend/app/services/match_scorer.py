from app.services.llm_client import generate_structured
from app.models.job import ParsedJob, FitReport

def score_match(parsed_job: ParsedJob, user_profile: dict, resume_summary: str, use_groq: bool = False) -> FitReport:
    """
    Evaluates the parsed job against the user's profile and resume summary.
    """
    
    # Pre-calculate hard caps before LLM to guide it (though LLM generates the final JSON)
    pay_floor = user_profile.get("pay_floor_ncr_remote", 600000)
    base_location = user_profile.get("base_location", "Delhi NCR")
    target_roles = user_profile.get("target_roles", [])
    
    prompt = f"""
    You are an expert technical recruiter acting as a personal assistant for a candidate.
    Evaluate the match between the Job Posting and the Candidate's Profile/Resume.

    CANDIDATE PROFILE:
    - Base Location: {base_location}
    - Remote OK: {user_profile.get("remote_ok", True)}
    - Pay Floor (NCR/Remote): ₹{pay_floor} INR
    - Target Roles: {target_roles}
    - Resume Summary: {resume_summary}

    JOB POSTING:
    - Role: {parsed_job.role_title} ({parsed_job.company})
    - Location: {parsed_job.location} | Remote Type: {parsed_job.remote_type}
    - Seniority: {parsed_job.seniority_required}
    - Pay: {parsed_job.pay_min} to {parsed_job.pay_max} {parsed_job.pay_currency} ({parsed_job.pay_confidence})
    - Required Skills: {parsed_job.required_skills}
    - Nice to Have: {parsed_job.nice_to_have_skills}

    SCORING RULES:
    1. Match Score (0-100): Based purely on skill overlap and seniority fit.
    2. Pay Floor: If the job's max pay (or estimated pay) is known and STRICTLY LESS than the Pay Floor, set pay_floor_pass to False. Otherwise True.
    3. Seniority Fit: Candidate is a fresher (graduating soon). If job explicitly requires 3+ years, it's 'underqualified' and Verdict MUST be 'skip'.
    4. Relocation: If job is 'onsite' and Location is not near Base Location, relocation_required is True.
    5. Verdict:
       - 'skip' if pay_floor_pass is False, or Seniority is 'underqualified', or Relocation is required but user doesn't want to.
       - 'stretch' if skills match < 50% or seniority is slightly high (1-2 yrs).
       - 'apply' if it's a solid match, meets pay floor, and appropriate seniority.
    6. Culture Assessment: Provide a Glassdoor-style 1-2 sentence rating/estimate of the company's work-life balance and culture based on your global knowledge of the company. If unknown, say 'Startup/Unknown culture'.
    
    Return the evaluation as a JSON object matching the provided schema.
    """
    
    fit_report = generate_structured(prompt, FitReport, use_groq=use_groq)
    
    # Hard overrides to guarantee success metrics mentioned in PRD
    if parsed_job.pay_max and parsed_job.pay_currency == 'INR' and parsed_job.pay_max < pay_floor:
        fit_report.pay_floor_pass = False
        fit_report.verdict = 'skip'
        
    if parsed_job.seniority_required in ['2-5yr', 'senior']:
        fit_report.seniority_fit = 'underqualified'
        fit_report.verdict = 'skip'
        
    return fit_report
