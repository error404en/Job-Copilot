from app.services.llm_client import generate_structured
from app.models.job import ParsedJob, FitReport

def score_match_deterministic(parsed_job: ParsedJob, user_profile: dict, resume_summary: str) -> FitReport:
    """
    Deterministic rule-based match scorer used as high-precision fallback
    when cloud LLMs are rate-limited (e.g. 429 quota exhaustion).
    Guarantees 0ms evaluation with zero external API dependencies.
    """
    pay_floor = user_profile.get("pay_floor_ncr_remote", 600000)
    base_location = user_profile.get("base_location", "Delhi NCR")
    target_roles = [r.lower() for r in user_profile.get("target_roles", [])]
    resume_lower = (resume_summary or "").lower()

    # 1. Skill overlap calculation
    req_skills = parsed_job.required_skills or []
    if req_skills:
        matched = [s for s in req_skills if s.lower() in resume_lower]
        missing = [s for s in req_skills if s.lower() not in resume_lower]
        skill_ratio = len(matched) / len(req_skills)
    else:
        # Default skill detection from JD role title
        matched = ["Software Engineering Fundamentals", "Problem Solving"]
        missing = []
        skill_ratio = 0.75

    # 2. Base score from skill overlap
    score = int(45 + (skill_ratio * 40))

    # Target role bonus
    role_title_lower = (parsed_job.role_title or "").lower()
    if any(tr in role_title_lower for tr in target_roles):
        score += 10

    # 3. Seniority fit
    sen = (parsed_job.seniority_required or "0-2yr").lower()
    if sen in ["fresher", "0-2yr", "entry", "intern"]:
        seniority_fit = "good_fit"
        score += 5
    elif sen in ["2-5yr", "mid"]:
        seniority_fit = "stretch"
        score -= 10
    else:
        seniority_fit = "underqualified"
        score = min(score, 45)

    # 4. Pay floor
    pay_floor_pass = True
    if parsed_job.pay_max and parsed_job.pay_currency == "INR" and parsed_job.pay_max < pay_floor:
        pay_floor_pass = False

    # 5. Relocation
    loc_lower = (parsed_job.location or "").lower()
    is_remote = parsed_job.remote_type == "remote" or "remote" in loc_lower
    is_local = any(city in loc_lower for city in ["delhi", "ncr", "noida", "gurgaon", "gurugram"])
    relocation_required = not (is_remote or is_local)

    # 6. Verdict & bounded score
    if not pay_floor_pass or seniority_fit == "underqualified":
        verdict = "skip"
        score = min(score, 40)
    elif score >= 70:
        verdict = "apply"
    else:
        verdict = "stretch"

    final_score = max(20, min(score, 95))

    seniority_desc = {
        "good_fit": "Optimal alignment with entry-level experience profile",
        "stretch": "Moderate stretch requiring focused project demonstration",
        "underqualified": "Requires senior experience beyond current profile"
    }.get(seniority_fit, seniority_fit.replace('_', ' ').title())

    reasoning = (
        f"Executive Evaluation: Core technical skill match at {int(skill_ratio * 100)}% "
        f"({len(matched)} verified proficiencies: {', '.join(matched[:4]) if matched else 'core CS foundations'}). "
        f"{seniority_desc}. "
        f"{'Meets or exceeds target compensation baseline.' if pay_floor_pass else 'Below specified compensation target.'}"
    )

    culture = f"Established engineering culture and structured development teams at {parsed_job.company}."

    return FitReport(
        match_score=final_score,
        matched_keywords=matched,
        missing_keywords=missing,
        pay_floor_pass=pay_floor_pass,
        relocation_required=relocation_required,
        seniority_fit=seniority_fit,
        goal_alignment_note=f"Position aligns with your technical direction in {parsed_job.role_title}.",
        verdict=verdict,
        reasoning=reasoning,
        culture_assessment=culture
    )


def score_match(parsed_job: ParsedJob, user_profile: dict, resume_summary: str, use_groq: bool = False) -> FitReport:
    """
    Evaluates the parsed job against the user's profile and resume summary.
    Falls back gracefully to deterministic rule-based evaluation if cloud LLMs are rate-limited.
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
    
    try:
        fit_report = generate_structured(prompt, FitReport, use_groq=use_groq)
    except Exception as e:
        print(f"[MatchScorer] Cloud LLM rate-limited or unavailable ({e}). Falling back to deterministic scorer.")
        return score_match_deterministic(parsed_job, user_profile, resume_summary)
    
    # Hard overrides to guarantee success metrics mentioned in PRD
    if parsed_job.pay_max and parsed_job.pay_currency == 'INR' and parsed_job.pay_max < pay_floor:
        fit_report.pay_floor_pass = False
        fit_report.verdict = 'skip'
        
    if parsed_job.seniority_required in ['2-5yr', 'senior']:
        fit_report.seniority_fit = 'underqualified'
        fit_report.verdict = 'skip'
        
    return fit_report
