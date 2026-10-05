import re
from app.services.llm_client import generate_structured
from app.models.job import ParsedJob, FitReport

def score_match_deterministic(parsed_job: ParsedJob, user_profile: dict, resume_summary: str) -> FitReport:
    """
    High-precision deterministic rule-based match scorer.
    Enforces strict hard-disqualification gates (Seniority, Degree, Domain, Pay Floor)
    to guarantee zero false positives (e.g. Senior/Staff/Tax roles never get High Odds).
    """
    pay_floor = user_profile.get("pay_floor_ncr_remote", 600000)
    base_location = user_profile.get("base_location", "Delhi NCR")
    target_roles = [r.lower() for r in user_profile.get("target_roles", [])]
    resume_lower = (resume_summary or "").lower()
    role_title_lower = (parsed_job.role_title or "").lower()

    # -------------------------------------------------------------------------
    # HARD GATE 1: Seniority & Years of Experience Filter
    # -------------------------------------------------------------------------
    sen = (parsed_job.seniority_required or "0-2yr").lower()
    min_yoe = parsed_job.min_years_experience or 0

    is_senior_role = (
        sen == "senior" or
        min_yoe >= 3 or
        any(re.search(r'\b' + re.escape(w) + r'\b', role_title_lower) for w in [
            "senior", "sr", "sr.", "staff", "principal", "lead", "architect",
            "manager", "director", "head of", "vp", "chief", "l6", "l7"
        ])
    )

    if is_senior_role:
        yoe_str = f"{min_yoe}+ years" if min_yoe >= 3 else "5+ years"
        return FitReport(
            match_score=25,
            matched_keywords=[],
            missing_keywords=parsed_job.required_skills[:4] if parsed_job.required_skills else ["Senior Engineering Leadership"],
            pay_floor_pass=True,
            relocation_required=False,
            seniority_fit="underqualified",
            goal_alignment_note=f"Position requires senior leadership beyond entry-level target.",
            verdict="skip",
            disqualification_reason="seniority_mismatch",
            reasoning=(
                f"Seniority Mismatch: Position requires Senior/Staff/Lead level experience ({yoe_str}) "
                f"which exceeds an entry-level candidate profile. Prioritizing fresher, associate, and junior engineering openings."
            ),
            culture_assessment=f"Established engineering organization at {parsed_job.company}."
        )

    # -------------------------------------------------------------------------
    # HARD GATE 2: Academic Degree Requirement Filter
    # -------------------------------------------------------------------------
    if parsed_job.degree_required == "phd":
        return FitReport(
            match_score=30,
            matched_keywords=[],
            missing_keywords=["Ph.D. Enrollment / Doctoral Research"],
            pay_floor_pass=True,
            relocation_required=False,
            seniority_fit="underqualified",
            goal_alignment_note="Requires active Ph.D. academic candidacy.",
            verdict="skip",
            disqualification_reason="degree_mismatch",
            reasoning=(
                "Degree Requirement Mismatch: This opening explicitly mandates active enrollment in or completion of a Ph.D. program "
                "with published academic research. Undergraduate/Bachelor profiles do not fulfill the required degree threshold."
            ),
            culture_assessment=f"Specialized research and development division at {parsed_job.company}."
        )

    # -------------------------------------------------------------------------
    # HARD GATE 3: Domain Compatibility Filter
    # -------------------------------------------------------------------------
    domain = parsed_job.domain_category or "software_engineering"
    
    if domain == "tax_finance_accounting":
        return FitReport(
            match_score=20,
            matched_keywords=[],
            missing_keywords=["Tax Automation", "Corporate Tax Accounting", "Tax Provision"],
            pay_floor_pass=True,
            relocation_required=False,
            seniority_fit="underqualified",
            goal_alignment_note="Specialized corporate taxation field outside technical software target.",
            verdict="skip",
            disqualification_reason="domain_mismatch",
            reasoning=(
                "Domain Mismatch: Position requires specialized corporate Tax and Accounting domain expertise "
                "(tax automation, tax provision, intercompany accounting, NetSuite/SAP). General programming proficiency (SQL/Python) "
                "does not substitute for statutory finance domain responsibility."
            ),
            culture_assessment=f"Finance and tax technology division at {parsed_job.company}."
        )

    if domain == "security_governance":
        return FitReport(
            match_score=25,
            matched_keywords=[],
            missing_keywords=["Enterprise Security Architecture", "SSO/SCIM Governance", "SSPM Controls"],
            pay_floor_pass=True,
            relocation_required=False,
            seniority_fit="underqualified",
            goal_alignment_note="Enterprise security governance field outside general backend/AI target.",
            verdict="skip",
            disqualification_reason="domain_mismatch",
            reasoning=(
                "Domain Mismatch: Position requires deep enterprise security architecture, identity federation (SSO/SCIM/IAM), "
                "and trust boundary governance beyond the candidate's core Software Development / Applied AI focus."
            ),
            culture_assessment=f"Information Security and Governance division at {parsed_job.company}."
        )

    if domain in ("hardware_embedded", "management_leadership"):
        return FitReport(
            match_score=20,
            matched_keywords=[],
            missing_keywords=[f"{domain.replace('_', ' ').title()} Specialization"],
            pay_floor_pass=True,
            relocation_required=False,
            seniority_fit="underqualified",
            goal_alignment_note="Role family outside candidate's software focus.",
            verdict="skip",
            disqualification_reason="domain_mismatch",
            reasoning=f"Domain Mismatch: Position requires specialized {domain.replace('_', ' ')} expertise outside candidate target profile.",
            culture_assessment=f"Engineering group at {parsed_job.company}."
        )

    # -------------------------------------------------------------------------
    # HARD GATE 4: Pay Floor Check
    # -------------------------------------------------------------------------
    pay_floor_pass = True
    if parsed_job.pay_max and parsed_job.pay_currency == "INR" and parsed_job.pay_max < pay_floor:
        pay_floor_pass = False
        return FitReport(
            match_score=35,
            matched_keywords=[],
            missing_keywords=[],
            pay_floor_pass=False,
            relocation_required=False,
            seniority_fit="good_fit",
            goal_alignment_note="Below specified compensation baseline.",
            verdict="skip",
            disqualification_reason="pay_floor_failed",
            reasoning=f"Pay Floor Violation: Maximum compensation (₹{parsed_job.pay_max:,}) is below candidate's specified minimum baseline (₹{pay_floor:,}).",
            culture_assessment=f"Corporate environment at {parsed_job.company}."
        )

    # -------------------------------------------------------------------------
    # Scoring for Eligible Roles (0-2yr, Fresher, Intern in Software/AI)
    # -------------------------------------------------------------------------
    req_skills = parsed_job.required_skills or []
    if req_skills:
        matched = [s for s in req_skills if s.lower() in resume_lower]
        missing = [s for s in req_skills if s.lower() not in resume_lower]
        skill_ratio = len(matched) / len(req_skills)
    else:
        matched = ["Software Engineering Fundamentals", "Problem Solving"]
        missing = []
        skill_ratio = 0.70

    # Base score
    score = int(40 + (skill_ratio * 40))

    # Target role bonus (up to +15 pts)
    if any(tr in role_title_lower for tr in target_roles):
        score += 12
    elif any(kw in role_title_lower for kw in ["software", "developer", "engineer", "full stack", "backend", "ai", "machine learning"]):
        score += 8

    # Seniority calibration
    if sen in ["fresher", "intern"] or "intern" in role_title_lower:
        seniority_fit = "good_fit"
        score += 5
    elif sen == "0-2yr":
        seniority_fit = "good_fit"
        score += 3
    elif sen == "2-5yr":
        seniority_fit = "stretch"
        score -= 15

    # Startup & Freshness Preferences
    # Prefer < 200 people
    c_size = (parsed_job.company_size or "").lower()
    if c_size:
        # Penalize large companies/enterprises if inferred
        if any(x in c_size for x in ["500", "1000", "10,000", "5000"]):
            score -= 10
        elif any(x in c_size for x in ["1-10", "11-50", "51-200"]):
            score += 10
            
    # Prefer < 48 hours
    h_posted = parsed_job.hours_since_posted
    if h_posted is not None:
        if h_posted <= 48:
            score += 10
        elif h_posted > 168: # older than a week
            score -= 10


    # Relocation analysis
    from app.services.job_fetcher import check_role_location_and_relocation
    loc_lower = (parsed_job.location or "").lower()
    jd_lower = (parsed_job.raw_jd or parsed_job.description or "").lower()
    is_remote = parsed_job.remote_type == "remote" or "remote" in loc_lower or "anywhere" in loc_lower or "work from home" in loc_lower
    is_local = any(city in loc_lower for city in ["delhi", "ncr", "noida", "gurgaon", "gurugram"])
    is_india = any(city in loc_lower for city in ["india", "bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "chennai", "kolkata"])
    
    loc_eval = check_role_location_and_relocation(parsed_job.location or "", jd_lower)
    
    # HARD GATE: Overseas role without relocation or visa sponsorship
    if loc_eval["is_abroad"] and not loc_eval["covers_relocation"]:
        return FitReport(
            match_score=20,
            matched_keywords=[],
            missing_keywords=["Work Authorization / Visa Sponsorship"],
            pay_floor_pass=True,
            relocation_required=True,
            seniority_fit="underqualified",
            goal_alignment_note="Overseas role without relocation or visa sponsorship for Indian candidates.",
            verdict="skip",
            disqualification_reason="abroad_no_relocation",
            reasoning=(
                f"Location Disqualification: Position is based abroad ({parsed_job.location or 'Overseas'}) "
                "without verified international relocation assistance or visa sponsorship. "
                "Fresher pipeline prioritizes opportunities in India, Remote, or overseas roles covering full relocation."
            ),
            culture_assessment=f"Corporate environment at {parsed_job.company}."
        )

    # Non-India onsite/hybrid requires relocation/visa
    relocation_required = not (is_remote or is_local)
    if loc_eval["is_abroad"] and loc_eval["covers_relocation"]:
        score += 5  # Bonus for verified international relocation support
    elif not is_remote and not is_local and not is_india:
        score -= 10

    # Final verdict calculation
    if score >= 75:
        verdict = "apply"
    elif score >= 50:
        verdict = "stretch"
    else:
        verdict = "skip"

    final_score = max(20, min(score, 95))

    reasoning = (
        f"Executive Evaluation: Core technical skill match at {int(skill_ratio * 100)}% "
        f"({len(matched)} verified proficiencies: {', '.join(matched[:4]) if matched else 'core CS foundations'}). "
        f"Seniority alignment is {seniority_fit.replace('_', ' ')}. "
        f"{'Meets target compensation baseline.' if pay_floor_pass else 'Below specified compensation target.'}"
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
    Includes strict, unconditional hard-disqualification overrides to guarantee
    zero false-positives regardless of cloud LLM behavior.
    """
    # 1. First run deterministic gates to catch obvious disqualifications early
    gate_report = score_match_deterministic(parsed_job, user_profile, resume_summary)
    if gate_report.verdict == "skip" and gate_report.disqualification_reason:
        return gate_report

    pay_floor = user_profile.get("pay_floor_ncr_remote", 600000)
    base_location = user_profile.get("base_location", "Delhi NCR")
    target_roles = user_profile.get("target_roles", [])
    
    prompt = f"""
    You are an expert technical recruiter acting as a personal assistant for an entry-level candidate (graduating soon / 0-2 yrs).
    Evaluate the match between the Job Posting and the Candidate's Profile/Resume.

    CANDIDATE PROFILE:
    - Base Location: {base_location}
    - Remote OK: {user_profile.get("remote_ok", True)}
    - Pay Floor: ₹{pay_floor} INR
    - Target Roles: {target_roles}
    - Resume Summary: {resume_summary[:1500]}

    JOB POSTING:
    - Role: {parsed_job.role_title} ({parsed_job.company})
    - Location: {parsed_job.location} | Remote Type: {parsed_job.remote_type}
    - Seniority: {parsed_job.seniority_required} (Min YoE: {parsed_job.min_years_experience})
    - Required Degree: {parsed_job.degree_required}
    - Domain: {parsed_job.domain_category}
    - Pay: {parsed_job.pay_min} to {parsed_job.pay_max} {parsed_job.pay_currency} ({parsed_job.pay_confidence})
    - Required Skills: {parsed_job.required_skills[:12]}

    STRICT DISQUALIFICATION RULES:
    1. If the job requires 3+ years experience, Senior, Staff, Principal, or Manager, verdict MUST be 'skip' and match_score <= 35.
    2. If the job requires a Ph.D. and candidate does not have one, verdict MUST be 'skip' and match_score <= 30.
    3. If the job domain is corporate Tax, Accounting, or Enterprise Security Governance, verdict MUST be 'skip' and match_score <= 25.
    4. Only grant 'apply' with score >= 75 for genuine entry-level/fresher roles in Software, Backend, or AI engineering that match candidate skills.

    Return the evaluation as a JSON object matching the provided schema.
    """
    
    try:
        fit_report = generate_structured(prompt, FitReport, use_groq=use_groq)
    except Exception as e:
        print(f"[MatchScorer] Cloud LLM rate-limited or unavailable ({e}). Falling back to deterministic scorer.")
        return gate_report
    
    # Hard safety overrides against LLM hallucination
    role_title_lower = (parsed_job.role_title or "").lower()
    is_senior = (
        parsed_job.seniority_required == "senior" or
        (parsed_job.min_years_experience and parsed_job.min_years_experience >= 3) or
        any(kw in role_title_lower for kw in ["senior", "staff", "principal", "lead", "manager", "director", "head of"])
    )
    if is_senior:
        fit_report.verdict = "skip"
        fit_report.seniority_fit = "underqualified"
        fit_report.match_score = min(fit_report.match_score, 30)

    if parsed_job.degree_required == "phd":
        fit_report.verdict = "skip"
        fit_report.match_score = min(fit_report.match_score, 30)

    if parsed_job.domain_category in ("tax_finance_accounting", "security_governance"):
        fit_report.verdict = "skip"
        fit_report.match_score = min(fit_report.match_score, 25)

    if parsed_job.pay_max and parsed_job.pay_currency == 'INR' and parsed_job.pay_max < pay_floor:
        fit_report.pay_floor_pass = False
        fit_report.verdict = "skip"
        fit_report.match_score = min(fit_report.match_score, 35)

    return fit_report
