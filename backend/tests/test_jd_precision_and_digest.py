import pytest
from app.services.jd_parser import parse_job_description_deterministic
from app.services.match_scorer import score_match_deterministic

PROFILE = {
    "base_location": "Noida, Delhi NCR",
    "remote_ok": True,
    "pay_floor_ncr_remote": 600000,
    "target_roles": ["Backend Engineer", "Generative AI Engineer", "AI Engineer", "Software Development Engineer", "Full Stack Engineer"]
}

RESUME = """
Shreyansh Bhadani - Software Development Engineer (SDE) - Backend & Applied AI.
Hands-on experience with Python, FastAPI, React, Next.js, SQL, REST APIs, Git, Docker, System Design, Applied AI, LangChain, RAG.
"""

def test_senior_data_scientist_disqualified():
    jd = """
    Senior Data Scientist at Coinbase
    BA/BS in a quantitative field (Math, Stats, Physics, CS, or similar) with 5+ years of relevant experience, or a PhD with 3+ years of relevant experience
    Proven track record of delivering impactful data science work in ambiguous problem spaces
    Practical expertise applying advanced modeling frameworks to real business problems
    Professional proficiency in SQL and Python
    """
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required == "senior"
    assert pj.min_years_experience >= 3
    
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict == "skip"
    assert fit.match_score <= 35
    assert fit.seniority_fit == "underqualified"
    assert "Seniority Mismatch" in fit.reasoning

def test_tax_manager_domain_disqualified():
    jd = """
    Tax Data & Technology Manager at Databricks
    6+ years of experience in tax automation, transformation, or data engineering, with at least 2 years in a tax or tax adjacent field
    Experience in SQL and Python for data pipeline development; Databricks is a strong plus
    Hands-on experience building and maintaining ELT/ETL pipelines connecting tax source systems (Netsuite, Salesforce, Stripe, SAP)
    Understanding of core tax and accounting concepts including close processes, tax provision, intercompany accounting
    """
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required == "senior"
    assert pj.domain_category == "tax_finance_accounting"
    
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict == "skip"
    assert fit.match_score <= 30
    assert fit.seniority_fit == "underqualified"

def test_staff_enterprise_security_disqualified():
    jd = """
    Staff Enterprise Security Engineer at Databricks
    Remote - California
    Requirements:
    8+ years of experience in security engineering, enterprise security, application security, cloud security.
    Strong understanding of authentication, authorization, SSO, federation, SCIM, API security, token handling, secrets management.
    """
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required == "senior"
    assert pj.min_years_experience >= 8
    assert pj.domain_category == "security_governance"
    
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict == "skip"
    assert fit.match_score <= 30

def test_mle_intern_phd_disqualified():
    jd = """
    Machine Learning Engineer Intern at Coinbase
    This is a 12-week internship during summer 2027.
    Required Skills and Experience:
    Currently pursuing a Ph.D. with published or in-progress research in machine learning, deep learning, or a closely related field
    Demonstrated proficiency building and training models using ML frameworks such as PyTorch or TensorFlow
    """
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required == "fresher"
    assert pj.degree_required == "phd"
    
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict == "skip"
    assert fit.match_score <= 35
    assert "Ph.D." in fit.reasoning

def test_genuine_fresher_associate_matches_high_odds():
    jd = """
    Software Engineer Associate at HSBC
    Location: Bengaluru / Pune / Remote
    Requires 0-2 years experience with Python, FastAPI, React, Next.js, and SQL.
    Developing wealth and commercial banking customer-facing web applications.
    """
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required in ("fresher", "0-2yr")
    assert pj.domain_category == "software_engineering"
    
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict == "apply"
    assert fit.match_score >= 75
    assert fit.seniority_fit == "good_fit"

def test_abroad_without_relocation_disqualified():
    from app.services.jd_parser import parse_job_description_deterministic
    from app.services.match_scorer import score_match_deterministic
    jd = """
    Junior Software Engineer at TechCorp
    Location: San Francisco, CA (Onsite)
    Must be legally authorized to work in the United States. No visa sponsorship provided.
    Requirements: 0-1 years experience with Python and React.
    """
    pj = parse_job_description_deterministic(jd)
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict == "skip"
    assert fit.disqualification_reason == "abroad_no_relocation"
    assert "Location Disqualification" in fit.reasoning

def test_abroad_with_relocation_allowed():
    from app.services.jd_parser import parse_job_description_deterministic
    from app.services.match_scorer import score_match_deterministic
    jd = """
    Junior Backend Engineer at GlobalAI
    Location: London, UK
    Comprehensive relocation assistance provided and visa sponsorship available for international candidates.
    Requirements: 0-2 years experience with Python, FastAPI, SQL, REST APIs.
    """
    pj = parse_job_description_deterministic(jd)
    fit = score_match_deterministic(pj, PROFILE, RESUME)
    assert fit.verdict in ("apply", "stretch")
    assert fit.relocation_required is True
    assert fit.disqualification_reason != "abroad_no_relocation"

def test_business_technology_solutions_btsa_match():
    profile_with_btsa = {
        "base_location": "Noida, Delhi NCR",
        "remote_ok": True,
        "pay_floor_ncr_remote": 600000,
        "target_roles": ["Backend Engineer", "Generative AI Engineer", "Business Technology Solutions Associate (BTSA)", "Technical Business Analyst"]
    }
    jd = """
    Business Technology Solutions Associate (BTSA) at ZS Associates
    Location: Pune / New Delhi / Gurugram
    Requirements: Open to fresh college graduates and early-career professionals (0-2 years).
    Skills: SQL, Python, Problem Solving, Data Analytics, Tech Enablement.
    """
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required in ("0-2yr", "fresher")
    assert pj.min_years_experience == 0
    assert pj.domain_category == "business_technology_consulting"
    
    fit = score_match_deterministic(pj, profile_with_btsa, RESUME)
    assert fit.verdict == "apply"
    assert fit.match_score >= 80
    assert fit.seniority_fit == "good_fit"
    assert fit.disqualification_reason is None

def test_0_to_2_years_range_parsing():
    jd = "Junior Tech Analyst. Requirements: 0-2 years of relevant experience or recent graduate. Skills: SQL, Python."
    pj = parse_job_description_deterministic(jd)
    assert pj.seniority_required == "0-2yr"
    assert pj.min_years_experience == 0

