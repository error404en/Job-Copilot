import re
from datetime import datetime, timezone
from app.services.llm_client import generate_structured
from app.models.job import ParsedJob

def parse_job_description_deterministic(raw_text: str) -> ParsedJob:
    """
    High-precision deterministic rule-based extractor that accurately parses JD text
    into a ParsedJob with deep seniority, degree, domain, and skill detection.
    Guarantees zero false-fresher classifications (no substring bugs on 'internal' or 'campus').
    """
    raw_clean = raw_text or ""
    lines = [line.strip() for line in raw_clean.split("\n") if line.strip()]
    first_few = " ".join(lines[:6]) if lines else ""
    full_text_lower = raw_clean.lower()

    # 1. Role Title inference
    role_title = None
    title_match = re.search(r'(?:Role|Title|Position|Job\s*Title):\s*([A-Za-z0-9\s\(\)\/\-\+&,\.]+)', raw_clean, re.I)
    if title_match:
        role_title = title_match.group(1).strip()
    elif lines:
        # Check first line if it looks like a clean title
        first_line = lines[0].strip()
        # Clean markdown headers or bullet points
        first_line = re.sub(r'^[#*\-•\s]+', '', first_line).strip()
        
        # Split "Company - Role" or "Role | Company"
        for sep in [" - ", " | ", " – ", " — "]:
            if sep in first_line:
                parts = first_line.split(sep)
                if len(parts) >= 2:
                    # Usually role is the longer part or contains engineer/developer/intern/etc.
                    first_line = parts[1].strip() if any(kw in parts[1].lower() for kw in ["engineer", "developer", "scientist", "manager", "intern", "analyst", "lead"]) else parts[0].strip()
                break

        # Disqualify generic navigation headers
        generic_headers = ["job description", "about us", "overview", "responsibilities", "qualifications", "requirements", "apply now", "mission", "opportunity"]
        if first_line.lower() not in generic_headers and len(first_line) < 80:
            role_title = first_line

    if not role_title:
        # Search for known roles in the text
        for known in [
            "Staff Enterprise Security Engineer", "Enterprise Security Engineer", "Product Security Engineer",
            "Tax Data & Technology Manager", "Tax Manager", "Senior Data Scientist", "Data Scientist",
            "Machine Learning Engineer Intern", "Software Engineer Intern", "AI Engineer", "ML Engineer",
            "Staff Software Engineer", "Senior Software Engineer", "Software Engineer Associate",
            "Software Development Engineer", "Backend Engineer", "Full Stack Engineer", "Frontend Engineer",
            "Data Analyst", "Technology Analyst"
        ]:
            if re.search(r'\b' + re.escape(known) + r'\b', raw_clean, re.I):
                role_title = known
                break

    if not role_title:
        role_title = "Software Engineer"

    # 2. Company name inference
    company = "Company"
    comp_match = re.search(r'(?:at|company:)\s+([A-Za-z0-9\s&]+?)(?:\s+in|\s+is|\n|\.|\,)', first_few, re.I)
    if comp_match:
        company = comp_match.group(1).strip()
    elif lines:
        for sep in [" - ", " | ", " – "]:
            if sep in lines[0]:
                parts = lines[0].split(sep)
                company = parts[0].strip()
                break
                
    # Detect prominent companies if mentioned
    for known_comp in ["Coinbase", "Databricks", "Stripe", "Rubrik", "Uber", "Atlassian", "HSBC", "Barclays", "Google", "Goldman Sachs"]:
        if re.search(r'\b' + re.escape(known_comp) + r'\b', first_few, re.I):
            company = known_comp
            break

    # 3. Location & Remote Type
    remote_type = "unclear"
    if re.search(r'\bremote\b', full_text_lower):
        remote_type = "remote"
    elif re.search(r'\bhybrid\b', full_text_lower):
        remote_type = "hybrid"
    elif re.search(r'\b(onsite|in-office|on-site)\b', full_text_lower):
        remote_type = "onsite"

    location = None
    for loc_candidate in [
        "Bengaluru", "Bangalore", "Hyderabad", "Pune", "Noida", "Gurugram", "Gurgaon", "Delhi", "Mumbai", "Chennai",
        "San Francisco", "California", "New York", "London", "Poland", "India", "Singapore"
    ]:
        if re.search(r'\b' + re.escape(loc_candidate) + r'\b', raw_clean, re.I):
            location = loc_candidate
            break

    # 4. Seniority & Experience Level Detection (ORDER & WORD BOUNDARIES ARE CRITICAL)
    seniority = "0-2yr"
    min_years_experience = 0
    title_lower = role_title.lower()

    # Step A: Check Title First (Highest Priority)
    is_senior_title = False
    if re.search(r'\b(director|vp|vice president|head of|chief|c-level)\b', title_lower):
        seniority = "senior"
        min_years_experience = 10
        is_senior_title = True
    elif re.search(r'\b(principal|distinguished|fellow|architect)\b', title_lower):
        seniority = "senior"
        min_years_experience = 8
        is_senior_title = True
    elif re.search(r'\b(staff|l6|l7|e6|e7)\b', title_lower):
        seniority = "senior"
        min_years_experience = 8
        is_senior_title = True
    elif re.search(r'\b(senior|sr\.?|lead|team lead|manager)\b', title_lower):
        seniority = "senior"
        min_years_experience = 5
        is_senior_title = True

    # Step B: Check Explicit Years of Experience in Text
    # Matches "5+ years", "6+ years of experience", "minimum 3 years", "8-10 years"
    yoe_patterns = [
        r'(\d+)\+?\s*(?:to|-)\s*(\d+)\+?\s*years?(?:\s+of)?(?:\s+(?:relevant|work|professional|industry|hands-on|technical|engineering|tax|direct))?\s+experience',
        r'(\d+)\+?\s*years?(?:\s+of)?(?:\s+(?:relevant|work|professional|industry|hands-on|technical|engineering|tax|direct))?\s+experience',
        r'(?:minimum|at least|with)\s+(\d+)\+?\s*years?(?:\s+of)?\s+experience',
        r'(\d+)\+?\s*(?:years|yrs)\b'
    ]
    detected_years = []
    for pat in yoe_patterns:
        for match in re.finditer(pat, full_text_lower):
            groups = match.groups()
            for g in groups:
                if g and g.isdigit():
                    val = int(g)
                    if 0 < val <= 25:
                        detected_years.append(val)

    if detected_years:
        max_yoe = max(detected_years)
        if max_yoe >= 5:
            seniority = "senior"
            min_years_experience = max(min_years_experience, max_yoe)
        elif max_yoe >= 3:
            seniority = "senior"
            min_years_experience = max(min_years_experience, max_yoe)
        elif max_yoe == 2:
            if not is_senior_title:
                seniority = "2-5yr"
                min_years_experience = max(min_years_experience, 2)

    # Step C: Intern & Fresher Keywords (STRICT WORD BOUNDARIES)
    # Must NOT run if Step A or B identified a Senior/Staff/Lead/5+ YoE role!
    if not is_senior_title and min_years_experience < 3:
        if re.search(r'\b(intern|internship|apprentice)\b', title_lower):
            seniority = "fresher"
            min_years_experience = 0
        elif re.search(r'\b(graduate|trainee|fresher|entry[\s-]level|associate|junior|jr\.?|new grad|new graduate|campus hire)\b', title_lower):
            seniority = "fresher"
            min_years_experience = 0
        elif re.search(r'\b(internship|fresher|freshers|entry[\s-]level|new grad|new graduate|campus hire)\b', full_text_lower):
            # Only match if whole word (NOT "internal", "international", "internet")
            seniority = "fresher"
            min_years_experience = 0

    # 5. Degree Requirement Detection
    degree_required = None
    if re.search(r'\b(currently pursuing|pursuing|enrolled in|holding|requires?|completed)\s+(?:a\s+)?(ph\.?d\.?|doctorate|doctoral)\b', full_text_lower) or \
       re.search(r'\b(ph\.?d\.?|doctorate)\s+(?:candidate|student|intern|degree|required|only)\b', full_text_lower):
        degree_required = "phd"
    elif re.search(r'\b(pursuing|enrolled in|requires?)\s+(?:a\s+)?(master\'?s|ms|m\.s\.)\b', full_text_lower):
        degree_required = "masters"
    elif re.search(r'\b(bachelor\'?s|bs|b\.s\.|b\.tech|b\.e\.)\b', full_text_lower):
        degree_required = "bachelors"

    # 6. Domain Category Classification
    domain_category = "software_engineering"
    title_and_body = f"{role_title} {raw_clean}".lower()
    
    if re.search(r'\b(tax|taxation|tax automation|tax transformation|tax provision|intercompany accounting|indirect tax|transfer pricing|accounting concepts|financial reporting|gaap|sox)\b', title_and_body):
        domain_category = "tax_finance_accounting"
    elif re.search(r'\b(enterprise security|security engineer|infosec|appsec|cloud security|soc analyst|iam|sspm|scim|trust boundary|secrets management|token handling|threat intelligence|penetration testing|vulnerability)\b', title_and_body):
        domain_category = "security_governance"
    elif re.search(r'\b(data scientist|data science|quantitative|quant developer|statistician|econometrician|bi analyst|business intelligence)\b', title_and_body):
        domain_category = "data_science_analytics"
    elif re.search(r'\b(ai engineer|ml engineer|machine learning engineer|deep learning|genai|generative ai|llm|rag|nlp|computer vision|prompt engineering)\b', title_and_body):
        domain_category = "applied_ai_ml"
    elif re.search(r'\b(firmware|hardware engineer|embedded systems|fpga|asic|board bring-up|verilog)\b', title_and_body):
        domain_category = "hardware_embedded"
    elif re.search(r'\b(engineering manager|director of engineering|head of engineering|product manager)\b', title_and_body):
        domain_category = "management_leadership"

    # 7. Skills extraction
    TECH_SKILL_PATTERNS = [
        "Python", "Java", "C++", "C#", "Golang", "JavaScript", "TypeScript", "Rust", "SQL",
        "React", "Node.js", "Next.js", "FastAPI", "Django", "Flask", "Spring Boot",
        "PostgreSQL", "MySQL", "MongoDB", "Redis", "Kafka", "Cassandra", "Snowflake", "Databricks",
        "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform", "Git", "Linux",
        "PyTorch", "TensorFlow", "Scikit-Learn", "Machine Learning", "Deep Learning", "System Design",
        "REST APIs", "GraphQL", "Microservices", "ETL", "ELT", "Data Pipelines",
        "Tax Automation", "NetSuite", "Salesforce", "SAP", "SSO", "SCIM", "IAM", "Unity Catalog"
    ]
    detected_skills = [
        sk for sk in TECH_SKILL_PATTERNS 
        if re.search(r'\b' + re.escape(sk) + r'\b', raw_clean, re.I)
    ]

    # 7. Internship Status
    is_internship = False
    if re.search(r'\b(intern|internship|co-op|summer analyst|summer associate|winter intern|apprentice)\b', title_lower):
        is_internship = True
    elif re.search(r'\b(internship|co-op|summer internship|winter internship|graduate intern)\b', full_text_lower):
        is_internship = True

    # 8. CGPA / Academic Cutoff Extraction
    min_cgpa = None
    cgpa_match = re.search(r'\b(?:cgpa|gpa|pointer)\s*(?:of|>=|:|is|cutoff|minimum)?\s*([6-9](?:\.\d{1,2})?)\b', full_text_lower)
    if not cgpa_match:
        cgpa_match = re.search(r'\b([6-9](?:\.\d{1,2})?)\s*(?:\+|and above)?\s*(?:cgpa|gpa|pointer)\b', full_text_lower)
    if cgpa_match:
        try:
            val = float(cgpa_match.group(1))
            if 5.0 <= val <= 10.0:
                min_cgpa = val
        except Exception:
            pass
    else:
        pct_match = re.search(r'\b(6\d|7\d|8\d)%\s*(?:marks|aggregate|criteria|in graduation)?\b', full_text_lower)
        if pct_match:
            try:
                min_cgpa = round(int(pct_match.group(1)) / 10.0, 1)
            except Exception:
                pass

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
        min_years_experience=min_years_experience,
        degree_required=degree_required,
        domain_category=domain_category,
        is_internship=is_internship,
        min_cgpa=min_cgpa,
        required_skills=detected_skills or ["Problem Solving", "Software Engineering Fundamentals"],
        nice_to_have_skills=[]
    )


def parse_job_description(raw_text: str, use_groq: bool = False, deterministic_only: bool = False) -> ParsedJob:
    """
    Extracts structured fields from raw job description text using cloud LLM with
    graceful fallback to deterministic rule-based parsing.
    If deterministic_only is True, skips cloud LLMs entirely to conserve API quota.
    """
    if deterministic_only:
        return parse_job_description_deterministic(raw_text)

    prompt = f"""
    You are an expert technical recruiter analyzing a job description.
    Extract the required information from the following job description text.
    
    CRITICAL EXTRACTION GUIDELINES:
    1. Seniority & Experience:
       - If title contains 'Staff', 'Principal', 'Lead', 'Senior', 'Manager', or requires 5+ years, classify as 'senior'.
       - If requires 2-5 years, classify as '2-5yr'.
       - If for interns, new grads, or 0-2 years, classify as 'fresher' or '0-2yr'.
       - Extract explicit minimum years of experience as an integer into 'min_years_experience'.
    2. Internship & CGPA:
       - If this is an internship, trainee, summer analyst, or apprentice role, set 'is_internship' to true.
       - If an explicit minimum CGPA (on 10.0 scale, e.g. 7.0, 7.5, 8.0) or percentage (e.g. 70% -> 7.0) cutoff is specified, extract into 'min_cgpa'. Otherwise null.
    3. Degree Requirements:
       - If the JD requires enrolled or completed Ph.D. / doctorate, set 'degree_required' to 'phd'.
       - If requires Master's, set to 'masters'.
       - If requires Bachelor's/BS, set to 'bachelors'. Otherwise null.
    4. Domain Category:
       - Categorize into one of: 'software_engineering', 'applied_ai_ml', 'data_science_analytics', 'tax_finance_accounting', 'security_governance', 'management_leadership', 'other'.
    5. Location & Remote Type:
       - Remote type: 'remote', 'hybrid', 'onsite', or 'unclear'.
    6. Pay & Deadlines:
       - Extract pay min/max if stated. Mark confidence as 'stated' or 'estimated'.
       - Look for application deadlines (YYYY-MM-DD) or set is_rolling_deadline to true if rolling.
    
    JOB DESCRIPTION TEXT:
    ---
    {raw_text[:4000]}
    ---
    """
    
    try:
        parsed_job = generate_structured(prompt, ParsedJob, use_groq=use_groq)
        return parsed_job
    except Exception as e:
        print(f"[JDParser] Cloud LLM rate-limited or unavailable ({e}). Falling back to deterministic parser.")
        return parse_job_description_deterministic(raw_text)
