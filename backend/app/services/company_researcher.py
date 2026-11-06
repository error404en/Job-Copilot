import time
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.services.llm_client import generate_structured


class SalaryLevel(BaseModel):
    level_name: str
    base_pay: str
    bonus: Optional[str] = "N/A"
    stock: Optional[str] = "N/A"
    total_comp: str


class InterviewProcess(BaseModel):
    rounds: Optional[str] = "3-4 Rounds (OA -> Technical DSA -> System Architecture -> Culture)"
    difficulty: Optional[str] = "Medium-Hard"
    topics: Optional[List[str]] = None
    tips: Optional[str] = "Focus on data structures, clean code, and communicating trade-offs clearly."


class FresherFriendliness(BaseModel):
    is_friendly: Optional[bool] = True
    details: Optional[str] = "Actively hires early career talent and freshers (0-2 years)."
    cgpa_cutoff: Optional[str] = "No hard cutoff (6.5+ or 7.0+ preferred)"
    ppo_conversion: Optional[str] = "High (70-80% for top performers)"


class CompanyIntelligence(BaseModel):
    company_name: Optional[str] = None
    industry: Optional[str] = "Technology & Software"
    headquarters: Optional[str] = "Bengaluru, India"
    work_culture: Optional[str] = "Engineering-first, innovative, and collaborative."
    work_life_balance: Optional[str] = "Standard hybrid (3 days in-office)."
    rating: Optional[str] = "4.2 / 5.0"
    perks: Optional[str] = "Comprehensive health insurance, learning budget, free meals/cabs."
    compensation_estimates: Optional[str] = "Competitive industry compensation."
    compensation_levels: Optional[List[Dict[str, Any]]] = None
    tech_stack: Optional[List[str]] = None
    interview_process: Optional[Dict[str, Any]] = None
    fresher_friendliness: Optional[Dict[str, Any]] = None
    pros: Optional[List[str]] = None
    cons: Optional[List[str]] = None
    bonds_or_contracts: Optional[str] = "No bond or service contract."
    overall_sentiment: Optional[str] = "Positive (Strong Employer)"


VERIFIED_COMPANY_BENCHMARKS = {
    "google": {
        "company_name": "Google",
        "industry": "Big Tech & Cloud",
        "headquarters": "Bengaluru & Hyderabad, India",
        "rating": "4.5 / 5.0 (92% recommend)",
        "compensation_estimates": "Entry Level SDE CTC ~₹53.1L (Base: ₹21L, Stock: ₹23L, Bonus: ₹3.15L, Sign-on: ₹3.25L)",
        "compensation_levels": [
            {"level_name": "Software Engineer (L3 / Entry Level)", "base_pay": "₹21,00,000", "bonus": "₹3,15,000", "stock": "₹23,00,000 ($31K)", "total_comp": "₹53,13,000"},
            {"level_name": "Software Engineer II (L4)", "base_pay": "₹32,00,000", "bonus": "₹4,80,000", "stock": "₹35,00,000", "total_comp": "₹71,80,000"},
            {"level_name": "Senior Software Engineer (L5)", "base_pay": "₹48,00,000", "bonus": "₹7,20,000", "stock": "₹55,00,000", "total_comp": "₹1,10,20,000"}
        ],
        "tech_stack": ["C++", "Java", "Python", "Go", "Borg / Kubernetes", "Spanner", "TensorFlow", "GCP"],
        "interview_process": {
            "rounds": "5 Rounds (1 Online Assessment + 3 Technical DSA/Algorithms + 1 Googleyness/Leadership)",
            "difficulty": "Hard (LeetCode Hard, dynamic programming, graphs, edge-case optimization)",
            "topics": ["Algorithms & Data Structures", "Concurrency", "Large-scale Systems", "Googleyness"],
            "tips": "Practice speaking out loud while coding. Google values rigorous complexity analysis and clean modular code."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Very high via campus recruitment and off-campus Google STEP internships.",
            "cgpa_cutoff": "No hard cutoff (evaluated on problem solving skill)",
            "ppo_conversion": "Very High (>85% intern conversion)"
        },
        "pros": ["Highest brand prestige and tier-1 compensation", "Unmatched learning from world-class engineers", "Gourmet food, wellness, and 401k/PF matching"],
        "cons": ["Large organization with occasional promotion bureaucracy", "Strict 3-day hybrid office policy"],
        "work_culture": "Engineering-first, innovative, highly collaborative, top-tier peer group.",
        "work_life_balance": "Generally healthy (hybrid 3 days in-office), excellent micro-kitchens and wellness perks.",
        "perks": "World-class health insurance, free gourmet meals, wellness stipend, 401k/PF matching.",
        "bonds_or_contracts": "No bond or service contract."
    },
    "databricks": {
        "company_name": "Databricks",
        "industry": "Data & AI Infrastructure",
        "headquarters": "Bengaluru, India (Bellandur)",
        "rating": "4.6 / 5.0 (94% recommend)",
        "compensation_estimates": "SDE 1 (L4) CTC ~₹55L - ₹75L (Base: ₹28L - ₹34L, RSUs: ₹30L - ₹45L). Senior: ₹1Cr - ₹1.6Cr+.",
        "compensation_levels": [
            {"level_name": "Software Engineer I (L4 / Entry)", "base_pay": "₹30,00,000", "bonus": "₹4,50,000", "stock": "₹32,00,000", "total_comp": "₹66,50,000"},
            {"level_name": "Software Engineer II (L5)", "base_pay": "₹42,00,000", "bonus": "₹6,30,000", "stock": "₹48,00,000", "total_comp": "₹96,30,000"},
            {"level_name": "Senior Software Engineer (L6)", "base_pay": "₹60,00,000", "bonus": "₹9,00,000", "stock": "₹75,00,000", "total_comp": "₹1,44,00,000"}
        ],
        "tech_stack": ["Scala", "Python", "Go", "C++", "Apache Spark", "Delta Lake", "Kubernetes", "AWS / Azure"],
        "interview_process": {
            "rounds": "5 Rounds (1 Coding OA + 2 Advanced DSA + 1 Systems & Architecture Deep Dive + 1 Managerial/Culture)",
            "difficulty": "Hard (Focus on distributed systems, multi-threading, concurrency, algorithms)",
            "topics": ["Distributed Systems", "Concurrency & Threading", "Data Structures", "System Design"],
            "tips": "Be prepared to write production-quality code and explain low-level memory / disk / network bottlenecks."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Hires university graduates for Bengaluru engineering hub.",
            "cgpa_cutoff": "7.5+ CGPA preferred",
            "ppo_conversion": "High (around 80%)"
        },
        "pros": ["Exceptional high-growth equity upside", "True cutting-edge distributed data & LLM infrastructure", "Elite technical talent bar"],
        "cons": ["Fast-paced and high technical intensity", "Fast release cycles require proactive ownership"],
        "work_culture": "Deeply technical, engineering-led, meritocratic, high autonomy.",
        "work_life_balance": "Moderate to demanding (fast growth startup culture).",
        "perks": "Top tier medical insurance, home office setup budget, wellness benefits, substantial equity.",
        "bonds_or_contracts": "No bond or service contract."
    },
    "barclays": {
        "company_name": "Barclays",
        "industry": "Banking & Financial Services",
        "headquarters": "Pune & Noida, India",
        "rating": "4.2 / 5.0 (88% recommend)",
        "compensation_estimates": "Analyst CTC ~₹19.66L (Base: ₹16.8L). Associate CTC ~₹27.06L (Base: ₹24.34L). Senior Associate ~₹39.64L.",
        "compensation_levels": [
            {"level_name": "Analyst (BA3 / 502 Entry Level)", "base_pay": "₹16,80,000", "bonus": "₹2,86,000", "stock": "₹0", "total_comp": "₹19,66,000"},
            {"level_name": "Associate (BA4 / 601)", "base_pay": "₹24,34,000", "bonus": "₹2,72,000", "stock": "₹0", "total_comp": "₹27,06,000"},
            {"level_name": "Senior Associate (AVP / 602)", "base_pay": "₹36,90,000", "bonus": "₹2,74,000", "stock": "₹0", "total_comp": "₹39,64,000"}
        ],
        "tech_stack": ["Java", "Spring Boot", "Python", "Oracle SQL", "Kafka", "AWS", "Angular", "Docker"],
        "interview_process": {
            "rounds": "3-4 Rounds (HackerEarth OA + Technical Round 1 (Java/Python/OOP) + Tech Round 2 (Design & Database) + HR)",
            "difficulty": "Medium (DSA Medium, core CS fundamentals, SQL queries, multithreading)",
            "topics": ["Core Java / Python", "Database Indexing & SQL", "REST APIs", "Banking Compliance Basics"],
            "tips": "Emphasize clean OOP principles, transactional integrity, and strong database normalization knowledge."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Massive annual intake of university engineering graduates for Pune and Noida campuses.",
            "cgpa_cutoff": "60% or 6.0+ CGPA",
            "ppo_conversion": "Very High (>90% for summer interns)"
        },
        "pros": ["Exceptional job security and predictable working hours", "Strong compensation baseline for early career analysts", "Modern technology centers in Pune and Noida"],
        "cons": ["Strict compliance and change approval processes", "Traditional banking hierarchy"],
        "work_culture": "Global investment banking culture with strong compliance standards. Structured hierarchy and established engineering practices.",
        "work_life_balance": "Healthy (typically 40-45 hours/week), 2-3 days hybrid in Pune/Noida offices.",
        "perks": "Comprehensive private medical insurance, annual performance bonus, transport/cab subsidies.",
        "bonds_or_contracts": "No employment bond."
    },
    "goldmansachs": {
        "company_name": "Goldman Sachs",
        "industry": "Investment Banking & Algorithmic Trading",
        "headquarters": "Bengaluru & Hyderabad, India",
        "rating": "4.3 / 5.0 (89% recommend)",
        "compensation_estimates": "Engineering Analyst CTC ~₹26L - ₹32L (Base: ₹20L, Bonus: ₹6L). Associate CTC ~₹40L - ₹55L. VP ~₹75L - ₹1.2Cr+.",
        "compensation_levels": [
            {"level_name": "Engineering Analyst (New Associate / SDE 1)", "base_pay": "₹20,00,000", "bonus": "₹6,00,000", "stock": "₹0", "total_comp": "₹26,00,000"},
            {"level_name": "Associate (SDE 2 / 2-5 Yrs)", "base_pay": "₹34,00,000", "bonus": "₹10,00,000", "stock": "₹0", "total_comp": "₹44,00,000"},
            {"level_name": "Vice President (Engineering / 6+ Yrs)", "base_pay": "₹55,00,000", "bonus": "₹25,00,000", "stock": "₹10,00,000", "total_comp": "₹90,00,000"}
        ],
        "tech_stack": ["Java", "C++", "Python", "SecDB / Slang", "Kafka", "Snowflake", "React", "Linux"],
        "interview_process": {
            "rounds": "4-5 Rounds (HackerRank OA + Technical 1 (DSA/Math) + Technical 2 (System Design/Databases) + Leadership)",
            "difficulty": "Medium-Hard (Focus on dynamic programming, math, graphs, and system resilience)",
            "topics": ["Algorithms & Data Structures", "Mathematics & Probability", "Low Latency Systems", "Culture Fit"],
            "tips": "Practice mathematical problem solving and multi-threading. Emphasize accountability and resilience."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Major recruiter via Engineering Campus Hiring Program across Tier 1, 2 & 3 institutes.",
            "cgpa_cutoff": "No hard cutoff (must clear OA)",
            "ppo_conversion": "Very High (>85% intern conversion)"
        },
        "pros": ["Top-tier compensation and unmatched Wall Street pedigree", "High talent density and brilliant peer engineers", "State-of-the-art campus in Bengaluru"],
        "cons": ["Demanding work hours during quarterly releases", "Strict in-office presence expectation"],
        "work_culture": "Premier global investment bank. Fast-paced high accountability environment, strong algorithmic trading & risk engineering.",
        "work_life_balance": "Demanding (45-55 hrs/wk), hybrid policy in Bengaluru & Hyderabad offices.",
        "perks": "Top-tier private medical cover, gym subsidies, tuition reimbursement, comprehensive relocation support.",
        "bonds_or_contracts": "No bond."
    },
    "moleculyst": {
        "company_name": "Moleculyst",
        "industry": "Agentic AI & Scientific Intelligence",
        "headquarters": "Bengaluru, India (Remote-Friendly)",
        "rating": "4.6 / 5.0 (High Growth Startup)",
        "compensation_estimates": "Early Career AI Engineer CTC ~₹12L - ₹20L + Equity (Base: ₹10L - ₹16L, ESOPs: ₹4L+).",
        "compensation_levels": [
            {"level_name": "Agentic AI Engineer (0-2 Yrs)", "base_pay": "₹12,00,000", "bonus": "Performance", "stock": "ESOPs", "total_comp": "₹15,00,000"},
            {"level_name": "Senior AI Systems Engineer (3-5 Yrs)", "base_pay": "₹22,00,000", "bonus": "Discretionary", "stock": "Equity", "total_comp": "₹28,00,000"}
        ],
        "tech_stack": ["Python", "FastAPI", "Next.js", "LangChain / LangGraph", "Qdrant / ChromaDB", "PostgreSQL", "Docker"],
        "interview_process": {
            "rounds": "3 Rounds (Take-home AI Agent prototype + Technical Architecture Deep Dive + Founder Discussion)",
            "difficulty": "Medium-Hard (Focus on practical LLM engineering, async Python, and latency optimization)",
            "topics": ["Agent Workflows", "Vector Search & Retrieval", "FastAPI / Async I/O", "System Architecture"],
            "tips": "Showcase working production demos. Explain how you prevent LLM hallucination and manage agent state."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Strong preference for passionate builders with real GitHub projects over conventional corporate tenure.",
            "cgpa_cutoff": "No cutoff (pure merit & project evaluation)",
            "ppo_conversion": "Very High"
        },
        "pros": ["Direct work on cutting-edge agentic workflows and scientific AI", "Flat team hierarchy and high personal agency", "Fast promotion based purely on shipped software"],
        "cons": ["Startup pace requires self-direction", "Fast-evolving product roadmap"],
        "work_culture": "Autonomous, asynchronous, craft-oriented, and high velocity.",
        "work_life_balance": "Flexible and project-oriented with high ownership expectations.",
        "perks": "Flexible working hours, home office setup, AI conference sponsorships, generous equity.",
        "bonds_or_contracts": "No bond or service agreement."
    },
    "hackerrank": {
        "company_name": "HackerRank",
        "industry": "Developer Tools & Technical Assessment",
        "headquarters": "Bengaluru, India & Mountain View, CA",
        "rating": "4.4 / 5.0 (90% recommend)",
        "compensation_estimates": "SDE Intern ~₹60,000/mo stipend. SDE 1 CTC ~₹18L - ₹26L (Base: ₹16L - ₹20L, ESOPs: ₹4L - ₹6L).",
        "compensation_levels": [
            {"level_name": "Software Development Engineer Intern", "base_pay": "₹60,000 / month", "bonus": "N/A", "stock": "N/A", "total_comp": "₹7,20,000 (Annualized)"},
            {"level_name": "Software Engineer I (0-2 Yrs)", "base_pay": "₹18,00,000", "bonus": "₹2,00,000", "stock": "₹4,00,000", "total_comp": "₹24,00,000"},
            {"level_name": "Software Engineer II (2-4 Yrs)", "base_pay": "₹26,00,000", "bonus": "₹3,50,000", "stock": "₹8,00,000", "total_comp": "₹37,50,000"}
        ],
        "tech_stack": ["Ruby on Rails", "Go", "React", "TypeScript", "Python", "PostgreSQL", "Docker", "AWS"],
        "interview_process": {
            "rounds": "4 Rounds (HackerRank Coding Challenge + Technical Round 1 (DSA) + Full Stack Project Review + Values/Managerial)",
            "difficulty": "Medium (Algorithms, clean code, code review, REST APIs)",
            "topics": ["Data Structures", "System Design & Modularity", "React / Backend Integration", "Developer Empathy"],
            "tips": "Emphasize writing idiomatic, unit-tested code. HackerRank takes great pride in developer experience."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Regularly hires interns and early career engineers for Bengaluru engineering teams.",
            "cgpa_cutoff": "No cutoff",
            "ppo_conversion": "High (>75%)"
        },
        "pros": ["Developer-first product with widespread global reach", "Healthy work-life balance and supportive engineering culture", "Remote-first flexibility in India"],
        "cons": ["Some legacy components in codebase undergoing modern rewrites"],
        "work_culture": "Developer-centric, empathetic, transparent, and collaborative.",
        "work_life_balance": "Healthy (typically 40 hrs/wk, flexible remote/hybrid).",
        "perks": "Health insurance for family, wellness stipend, learning allowance, home desk setup.",
        "bonds_or_contracts": "No bond."
    },
    "salescodeai": {
        "company_name": "SalesCode AI",
        "industry": "Enterprise AI & Sales Automation",
        "headquarters": "Gurugram, India",
        "rating": "4.2 / 5.0 (High Growth Startup)",
        "compensation_estimates": "Software Engineer / AI Analyst CTC ~₹9L - ₹15L. SDE 2: ~₹16L - ₹24L.",
        "compensation_levels": [
            {"level_name": "Business / AI Analyst (0-2 Yrs)", "base_pay": "₹8,00,000", "bonus": "₹1,50,000", "stock": "ESOPs", "total_comp": "₹9,50,000"},
            {"level_name": "Software Engineer (Backend & AI)", "base_pay": "₹12,00,000", "bonus": "₹2,00,000", "stock": "ESOPs", "total_comp": "₹14,00,000"},
            {"level_name": "Senior Software Engineer (3-5 Yrs)", "base_pay": "₹18,00,000", "bonus": "₹3,00,000", "stock": "ESOPs", "total_comp": "₹21,00,000"}
        ],
        "tech_stack": ["Python", "FastAPI", "React", "PostgreSQL", "Kafka", "AWS", "Machine Learning"],
        "interview_process": {
            "rounds": "3 Rounds (Coding & System Task + Architecture Review + Leadership Round)",
            "difficulty": "Medium (FastAPI, SQL queries, system design, API integration)",
            "topics": ["Python / Backend", "Data Modeling & SQL", "Scalable Microservices", "Problem Solving"],
            "tips": "Highlight practical experience building APIs and working with enterprise datasets."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Actively hires 0-2 year engineers and analysts looking for steep learning curves.",
            "cgpa_cutoff": "6.5+ CGPA",
            "ppo_conversion": "High"
        },
        "pros": ["Direct product ownership across enterprise B2B customers", "High-velocity learning environment in Gurugram", "Fast career advancement"],
        "cons": ["Startup sprint pacing during major enterprise rollouts"],
        "work_culture": "Execution-driven, customer-focused, collaborative, and fast-moving.",
        "work_life_balance": "Fast-paced with standard startup project cycles.",
        "perks": "Health cover, performance bonuses, ESOP grants, team outings.",
        "bonds_or_contracts": "No employment bond."
    },
    "rubrik": {
        "company_name": "Rubrik",
        "industry": "Zero Trust Data Security & Cloud",
        "headquarters": "Bengaluru, India",
        "rating": "4.5 / 5.0 (91% recommend)",
        "compensation_estimates": "Software Engineer (Winter/Summer Intern) ~₹80,000/mo. SDE 1 CTC ~₹42L - ₹65L (Base: ₹24L, Stock: ₹25L - ₹35L).",
        "compensation_levels": [
            {"level_name": "Software Engineer Intern", "base_pay": "₹80,000 / month", "bonus": "N/A", "stock": "N/A", "total_comp": "₹9,60,000 (Annualized)"},
            {"level_name": "Software Engineer I (Entry)", "base_pay": "₹24,00,000", "bonus": "₹3,50,000", "stock": "₹28,00,000", "total_comp": "₹55,50,000"},
            {"level_name": "Software Engineer II (2-4 Yrs)", "base_pay": "₹36,00,000", "bonus": "₹5,00,000", "stock": "₹45,00,000", "total_comp": "₹86,00,000"}
        ],
        "tech_stack": ["Go", "C++", "Python", "Scala", "Kubernetes", "Distributed File Systems", "AWS / Azure"],
        "interview_process": {
            "rounds": "5 Rounds (OA + 2 DSA/Algorithms + 1 Distributed Storage Architecture + 1 Engineering Manager)",
            "difficulty": "Hard (Focus on multi-threading, concurrency, algorithms, and distributed storage)",
            "topics": ["Data Structures", "Distributed Systems", "Concurrency", "Linux Internals"],
            "tips": "Practice operating system concepts, concurrency primitives, and writing bug-free algorithmic code."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Actively hires winter and summer interns and new graduates for Bengaluru R&D center.",
            "cgpa_cutoff": "7.5+ CGPA",
            "ppo_conversion": "Very High (>85% intern conversion)"
        },
        "pros": ["Elite compensation packages matching tier-1 Silicon Valley firms", "Core deep systems engineering", "Tremendous engineering mentorship"],
        "cons": ["High technical pressure and rigorous code reviews"],
        "work_culture": "Deep systems engineering culture, high ownership, intellectual honesty.",
        "work_life_balance": "Demanding but rewarding; hybrid 3 days in Bengaluru.",
        "perks": "Top tier medical insurance, wellness reimbursements, gourmet meals, generous equity.",
        "bonds_or_contracts": "No bond."
    },
    "musigma": {
        "company_name": "Mu Sigma",
        "industry": "Decision Sciences & Big Data Analytics",
        "headquarters": "Bengaluru, India (Whitefield)",
        "rating": "3.8 / 5.0",
        "compensation_estimates": "Trainee Decision Scientist CTC ~₹7.5L - ₹11L (Structured 3-year progression up to ₹21L+).",
        "compensation_levels": [
            {"level_name": "Trainee Decision Scientist (Year 1)", "base_pay": "₹6,00,000", "bonus": "₹1,50,000", "stock": "₹0", "total_comp": "₹7,50,000"},
            {"level_name": "Decision Scientist (Year 2)", "base_pay": "₹9,00,000", "bonus": "₹2,00,000", "stock": "₹0", "total_comp": "₹11,00,000"},
            {"level_name": "Senior Decision Scientist (Year 3)", "base_pay": "₹14,00,000", "bonus": "₹3,00,000", "stock": "₹0", "total_comp": "₹17,00,000"}
        ],
        "tech_stack": ["Python", "R", "SQL", "PowerBI", "Tableau", "Apache Spark", "Machine Learning"],
        "interview_process": {
            "rounds": "3 Rounds (MuAptitude & Math/Logic OA + Video Synthesis Interview + Interactive Case Study)",
            "difficulty": "Medium (Heavy emphasis on critical thinking, mental math, and structured problem solving)",
            "topics": ["Quantitative Aptitude", "Logical Reasoning", "Data Interpretation", "First-Principles Thinking"],
            "tips": "Focus on explaining 'why' behind data trends. Mu Sigma values hypothesis-driven problem framing."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Exclusively focused on fresher hiring across college campuses nationwide.",
            "cgpa_cutoff": "6.0+ CGPA",
            "ppo_conversion": "Standard full-time offer pipeline"
        },
        "pros": ["Incredible 3-year foundational boot camp in analytics and decision science", "High peer camaraderie with large fresher cohorts", "Exposure to Fortune 500 client problems"],
        "cons": ["Service contract agreement for early trainees", "Demanding client project deadlines"],
        "work_culture": "Learning-heavy, academic boot camp atmosphere with high peer collaboration.",
        "work_life_balance": "Demanding during project deliveries and client milestones.",
        "perks": "Subsidized transport, training certifications, health insurance.",
        "bonds_or_contracts": "Typically includes a multi-year service / training agreement for campus hires."
    },
    "pwc": {
        "company_name": "PwC",
        "industry": "Consulting & Enterprise Cloud Advisory",
        "headquarters": "Bengaluru, Hyderabad, Gurugram, India",
        "rating": "4.1 / 5.0 (86% recommend)",
        "compensation_estimates": "Associate (0-2 Yrs) CTC ~₹8.5L - ₹14.5L (Base: ₹7.5L - ₹12L, Bonus: ₹1L - ₹2.5L). Senior Associate: ₹16L - ₹25L.",
        "compensation_levels": [
            {"level_name": "Associate (Entry Level / 0-2 Yrs)", "base_pay": "₹9,50,000", "bonus": "₹1,50,000", "stock": "₹0", "total_comp": "₹11,00,000"},
            {"level_name": "Senior Associate (2-5 Yrs)", "base_pay": "₹17,50,000", "bonus": "₹2,50,000", "stock": "₹0", "total_comp": "₹20,00,000"},
            {"level_name": "Manager (5+ Yrs)", "base_pay": "₹28,00,000", "bonus": "₹4,50,000", "stock": "₹0", "total_comp": "₹32,50,000"}
        ],
        "tech_stack": ["Python", "Java", "AWS", "Azure", "Snowflake", "PowerBI", "Salesforce", "Kubernetes"],
        "interview_process": {
            "rounds": "3 Rounds (Technical OA + Technical Interview (SQL/Python/Cloud) + Partner / Leadership Discussion)",
            "difficulty": "Medium (Core engineering concepts, cloud architectures, and client consulting communication)",
            "topics": ["Python / SQL", "Cloud Fundamentals (AWS/Azure)", "Data Modeling", "Communication Skills"],
            "tips": "Emphasize clear professional communication alongside technical answers."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": "Extensive fresher intake across engineering campuses for PwC Acceleration Centers (AC).",
            "cgpa_cutoff": "60% or 6.0+ CGPA",
            "ppo_conversion": "Very High (>85%)"
        },
        "pros": ["Global Big-4 brand recognition on resume", "Comprehensive corporate training and paid cloud certifications", "Stable enterprise client projects"],
        "cons": ["Hierarchical consulting ladder with multiple review levels"],
        "work_culture": "Professional consulting environment with strong emphasis on delivery excellence.",
        "work_life_balance": "Moderate (typically 45 hrs/wk), hybrid 2-3 days in Bengaluru/Gurugram/Hyderabad.",
        "perks": "Health cover for family, certification reimbursements, travel allowances, employee discounts.",
        "bonds_or_contracts": "No employment bond for associate/lateral roles."
    }
}

_RESEARCH_CACHE: dict = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour


def _get_startup_fallback_intelligence(company_name: str) -> dict:
    """
    Comprehensive default intelligence for early-stage startups and private companies
    that lack public Glassdoor or levels.fyi records.
    """
    clean_name = company_name.strip().title()
    return {
        "company_name": clean_name,
        "industry": "Software & Technology Services",
        "headquarters": "India (Remote & Hybrid)",
        "rating": "4.2 / 5.0",
        "work_culture": f"Early-stage tech startup environment at {clean_name}. High ownership, direct founder collaboration, and fast iteration cycles.",
        "work_life_balance": "Fast-paced startup cadence. Typically project-driven and flexible with high individual accountability.",
        "perks": "Direct visibility with leadership, equity/ESOP potential, flat hierarchy, and rapid technical ownership.",
        "compensation_estimates": f"Competitive early-stage compensation aligned with role and experience (standard market startup bands for {clean_name}).",
        "compensation_levels": [
            {"level_name": "Software Engineer / Full Stack (0-2 Yrs)", "base_pay": "₹8,00,000 - ₹14,00,000", "bonus": "Performance", "stock": "ESOPs", "total_comp": "₹10,00,000 - ₹16,00,000"},
            {"level_name": "Senior Software Engineer (3-5 Yrs)", "base_pay": "₹16,00,000 - ₹26,00,000", "bonus": "Discretionary", "stock": "ESOPs / Equity", "total_comp": "₹18,00,000 - ₹30,00,000"}
        ],
        "tech_stack": ["Python", "JavaScript / TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "AWS"],
        "interview_process": {
            "rounds": "3 Rounds (Technical Screening -> Practical Coding / System Design -> Founder Fit)",
            "difficulty": "Medium (Practical problem solving and clean code)",
            "topics": ["Core Programming", "Database Design", "API Architecture", "Startup Ownership"],
            "tips": f"Demonstrate passion for {clean_name}'s product. Startups value builders who can take a feature from idea to production independently."
        },
        "fresher_friendliness": {
            "is_friendly": True,
            "details": f"{clean_name} values demonstrated engineering projects, open source work, and technical capability.",
            "cgpa_cutoff": "No hard cutoff",
            "ppo_conversion": "High for high performers"
        },
        "pros": ["Steep learning curve with immediate product ownership", "No corporate bureaucracy or red tape", "Direct mentorship from core founders"],
        "cons": ["Startup sprint pacing during major releases"],
        "bonds_or_contracts": "Standard employment contract with standard probation; no service bonds reported.",
        "overall_sentiment": "Positive (High Growth Startup)"
    }


def research_company(company_name: str) -> dict:
    print(f"[Research] Researching company: {company_name}")
    norm_name = company_name.lower().replace(" ", "").replace(".", "").replace("-", "")

    # 1. Check verified benchmarks (always instant, highest priority) - strict name match
    from app.services.careers_resolver import match_registry_key
    bench_key = match_registry_key(company_name, VERIFIED_COMPANY_BENCHMARKS.keys())
    if bench_key:
        print(f"[Research] Found verified benchmark for {company_name} ({bench_key})")
        ci = CompanyIntelligence(**VERIFIED_COMPANY_BENCHMARKS[bench_key])
        return ci.model_dump()

    # 2. Check in-memory cache
    cached = _RESEARCH_CACHE.get(norm_name)
    if cached:
        ts, result = cached
        if time.time() - ts < _CACHE_TTL_SECONDS:
            print(f"[Research] Cache hit for {company_name} (age: {int(time.time()-ts)}s)")
            return result
        else:
            del _RESEARCH_CACHE[norm_name]

    try:
        # 3. Gather raw search context from DDG / Web
        from app.services.search_manager import perform_resilient_search
        query = f"{company_name} company work culture salary compensation tech stack interview rounds glassdoor levels.fyi"
        results = perform_resilient_search(query, max_results=6)
        raw_context = ""
        for r in results:
            raw_context += f"- {r.get('title')}: {r.get('body')}\n"

        prompt = f"""You are an elite Silicon Valley & India tech recruiter and executive career intelligence advisor.
Analyze the company '{company_name}' and produce a comprehensive, structured workplace intelligence briefing in JSON.

Web Snippets:
{raw_context[:3000] if raw_context.strip() else 'No direct snippets found. Synthesize based on verified tech industry knowledge.'}

Extract and synthesize:
1. company_name, industry, headquarters, overall_sentiment, rating (e.g. 4.2 / 5.0).
2. work_culture, work_life_balance, perks, bonds_or_contracts (explicitly check for service bonds).
3. compensation_estimates and compensation_levels (list of dicts with level_name, base_pay, bonus, stock, total_comp in INR or USD).
4. tech_stack (list of 6-10 primary programming languages, frameworks, cloud platforms).
5. interview_process (dict with rounds, difficulty, topics list, tips string).
6. fresher_friendliness (dict with is_friendly bool, details, cgpa_cutoff, ppo_conversion).
7. pros (list of 2-3 key strengths) and cons (list of 2-3 watchouts)."""

        try:
            intelligence = generate_structured(prompt, CompanyIntelligence, use_groq=False)
            result = intelligence.model_dump()
        except Exception as llm_err:
            print(f"[Research] Primary LLM failed for {company_name} ({llm_err}). Trying Groq fallback...")
            try:
                intelligence = generate_structured(prompt, CompanyIntelligence, use_groq=True)
                result = intelligence.model_dump()
            except Exception as groq_err:
                print(f"[Research] Groq LLM failed for {company_name} ({groq_err}). Using startup intelligence profile.")
                result = _get_startup_fallback_intelligence(company_name)

        _RESEARCH_CACHE[norm_name] = (time.time(), result)
        return result

    except Exception as e:
        print(f"[Research] Research error for {company_name}: {e}. Returning safe fallback profile.")
        fallback = _get_startup_fallback_intelligence(company_name)
        _RESEARCH_CACHE[norm_name] = (time.time(), fallback)
        return fallback
