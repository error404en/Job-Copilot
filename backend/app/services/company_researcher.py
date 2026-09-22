import time
from pydantic import BaseModel
from typing import Optional

from app.services.llm_client import generate_structured


class SalaryLevel(BaseModel):
    level_name: str
    base_pay: str
    bonus: Optional[str] = "N/A"
    stock: Optional[str] = "N/A"
    total_comp: str


class CompanyIntelligence(BaseModel):
    work_culture: Optional[str] = "No data found."
    work_life_balance: Optional[str] = "No data found."
    perks: Optional[str] = "No data found."
    compensation_estimates: Optional[str] = "No data found."
    compensation_levels: Optional[list[dict]] = None
    bonds_or_contracts: Optional[str] = "No data found."
    overall_sentiment: Optional[str] = "Neutral"


VERIFIED_COMPANY_BENCHMARKS = {
    "google": {
        "compensation_estimates": "Entry Level SDE CTC ~₹53.1L (Base: ₹21L, Stock: ₹23L, Bonus: ₹3.15L, Sign-on: ₹3.25L)",
        "compensation_levels": [
            {"level_name": "Software Engineer (L3 / Entry Level)", "base_pay": "₹21,00,000", "bonus": "₹3,15,000", "stock": "₹23,00,000 ($31K)", "total_comp": "₹53,13,000"},
            {"level_name": "Software Engineer II (L4)", "base_pay": "₹32,00,000", "bonus": "₹4,80,000", "stock": "₹35,00,000", "total_comp": "₹71,80,000"},
            {"level_name": "Senior Software Engineer (L5)", "base_pay": "₹48,00,000", "bonus": "₹7,20,000", "stock": "₹55,00,000", "total_comp": "₹1,10,20,000"}
        ],
        "work_culture": "Engineering-first, innovative, highly collaborative, top-tier peer group.",
        "work_life_balance": "Generally healthy (hybrid 3 days in-office), excellent micro-kitchens and wellness perks.",
        "perks": "World-class health insurance, free gourmet meals, wellness stipend, 401k/PF matching.",
        "bonds_or_contracts": "No bond or service contract."
    },
    "barclays": {
        "compensation_estimates": "Analyst CTC ~₹19.66L (Base: ₹16.8L). Associate CTC ~₹27.06L (Base: ₹24.34L). Senior Associate ~₹39.64L.",
        "compensation_levels": [
            {"level_name": "Analyst (BA3 / 502 Entry Level)", "base_pay": "₹16,80,000", "bonus": "₹2,86,000", "stock": "₹0", "total_comp": "₹19,66,000"},
            {"level_name": "Associate (BA4 / 601)", "base_pay": "₹24,34,000", "bonus": "₹2,72,000", "stock": "₹0", "total_comp": "₹27,06,000"},
            {"level_name": "Senior Associate (AVP / 602)", "base_pay": "₹36,90,000", "bonus": "₹2,74,000", "stock": "₹0", "total_comp": "₹39,64,000"}
        ],
        "work_culture": "Global investment banking culture with strong compliance standards. Structured hierarchy and established engineering practices.",
        "work_life_balance": "Moderate (typically 40-45 hours/week), 2-3 days hybrid in Pune/Noida/Chennai offices.",
        "perks": "Comprehensive private medical insurance, performance bonus, transport/cab subsidies.",
        "bonds_or_contracts": "No employment bond."
    },
    "hsbc": {
        "compensation_estimates": "Associate (Freshers 0-2 yrs) CTC ~₹12L - ₹18L depending on business division (Commercial/Tech/Operations).",
        "compensation_levels": [
            {"level_name": "Trainee / Analyst (Entry Level)", "base_pay": "₹10,50,000", "bonus": "₹1,50,000", "stock": "₹0", "total_comp": "₹12,00,000"},
            {"level_name": "Associate (0-2 Yrs Experience)", "base_pay": "₹14,50,000", "bonus": "₹2,20,000", "stock": "₹0", "total_comp": "₹16,70,000"},
            {"level_name": "Senior Software Engineer / Lead", "base_pay": "₹22,00,000", "bonus": "₹3,50,000", "stock": "₹0", "total_comp": "₹25,50,000"}
        ],
        "work_culture": "Stable financial institution environment, structured career ladder, focus on regulatory tech and cloud migration.",
        "work_life_balance": "Very stable compared to early-stage startups; predictable working hours and clear leaves.",
        "perks": "Health cover for family, employee banking benefits, subsidized loan rates.",
        "bonds_or_contracts": "No bond for experienced; training agreement period for campus grads."
    },
    "hcltech": {
        "compensation_estimates": "Total Fixed Pay: ₹11,25,000 | Total CTC: ₹12,00,600 (Base: ₹4.5L, HRA: ₹2.25L, Flexi: ₹4.5L).",
        "compensation_levels": [
            {"level_name": "Graduate Engineer Trainee (GET)", "base_pay": "₹3,50,000", "bonus": "₹50,000", "stock": "₹0", "total_comp": "₹4,25,000"},
            {"level_name": "Software Engineer (Pan India lateral / Tier 1)", "base_pay": "₹4,50,000 (Base) + ₹6.75L Allowances", "bonus": "₹75,600 (PF+Gratuity)", "stock": "₹0", "total_comp": "₹12,00,600"},
            {"level_name": "Senior Software Engineer (3-5 Yrs)", "base_pay": "₹8,50,000", "bonus": "₹1,20,000", "stock": "₹0", "total_comp": "₹16,50,000"}
        ],
        "work_culture": "Large IT service organization with varied client projects. Growth depends on project allocation.",
        "work_life_balance": "Standard 9-hour shifts, project-dependent weekend on-calls.",
        "perks": "Health insurance, corporate discounts, continuous learning certifications.",
        "bonds_or_contracts": "Some trainee roles may have 12-18 month service agreements."
    },
    "jpmorgan": {
        "compensation_estimates": "Software Engineer (Analyst Entry Level) CTC ~₹19L - ₹22L (Base: ₹16L, Bonus: ₹3L).",
        "compensation_levels": [
            {"level_name": "Software Engineer Analyst (601)", "base_pay": "₹16,50,000", "bonus": "₹3,00,000", "stock": "₹0", "total_comp": "₹19,50,000"},
            {"level_name": "Associate (602)", "base_pay": "₹26,00,000", "bonus": "₹4,50,000", "stock": "₹0", "total_comp": "₹30,50,000"}
        ],
        "work_culture": "Fast-paced fintech engineering, strong emphasis on financial data security and scale.",
        "work_life_balance": "Demanding but rewarding; hybrid policy in Bengaluru, Mumbai, and Hyderabad.",
        "perks": "Top tier health insurance, gym, transport, education assistance.",
        "bonds_or_contracts": "No bond."
    },
    "mastercard": {
        "compensation_estimates": "Software Engineer (Entry) CTC ~₹20L - ₹28L. Senior Engineer ~₹35L - ₹50L.",
        "compensation_levels": [
            {"level_name": "Software Engineer (Entry Level)", "base_pay": "₹18,00,000", "bonus": "₹2,00,000", "stock": "₹2,00,000", "total_comp": "₹22,00,000"},
            {"level_name": "Senior Software Engineer", "base_pay": "₹28,00,000", "bonus": "₹4,00,000", "stock": "₹8,00,000", "total_comp": "₹40,00,000"}
        ],
        "work_culture": "Strong fintech culture, good work-life balance, hybrid model in Pune/Bangalore.",
        "work_life_balance": "Stable hours, mostly 9-6, good leave policies.",
        "perks": "Health insurance, ESOPs, annual bonus, learning stipend.",
        "bonds_or_contracts": "No bond."
    },
    "visa": {
        "compensation_estimates": "Software Engineer (Entry) CTC ~₹22L - ₹32L. Senior Engineer ~₹40L - ₹60L.",
        "compensation_levels": [
            {"level_name": "Software Engineer I (Entry)", "base_pay": "₹20,00,000", "bonus": "₹2,50,000", "stock": "₹3,00,000", "total_comp": "₹25,50,000"},
            {"level_name": "Senior Software Engineer", "base_pay": "₹30,00,000", "bonus": "₹5,00,000", "stock": "₹10,00,000", "total_comp": "₹45,00,000"}
        ],
        "work_culture": "Global payments company, collaborative, engineering-first, good stability.",
        "work_life_balance": "Good work-life balance, hybrid work, rarely crunch.",
        "perks": "Premium health benefits, RSUs, relocation support, education assistance.",
        "bonds_or_contracts": "No bond."
    },
    "cisco": {
        "compensation_estimates": "Entry Software Engineer CTC ~₹16L - ₹22L. Senior ~₹30L - ₹45L.",
        "compensation_levels": [
            {"level_name": "Graduate Engineer (Entry)", "base_pay": "₹14,00,000", "bonus": "₹1,50,000", "stock": "₹3,00,000", "total_comp": "₹18,50,000"},
            {"level_name": "Software Engineer (2-5 Yrs)", "base_pay": "₹22,00,000", "bonus": "₹3,00,000", "stock": "₹8,00,000", "total_comp": "₹33,00,000"}
        ],
        "work_culture": "Large MNC, process-oriented, good job security, networking-focused org.",
        "work_life_balance": "Excellent, mostly 9-5 with flexible remote options in Bangalore/Hyderabad.",
        "perks": "Comprehensive health, RSUs, gym, generous PTO.",
        "bonds_or_contracts": "No bond."
    }
}

# ---------------------------------------------------------------------------
# Simple in-memory TTL cache (1-hour) — avoids re-firing LLM calls for the
# same company within a session. Key: normalized company name, Value: (ts, data)
# ---------------------------------------------------------------------------
_RESEARCH_CACHE: dict = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour


def research_company(company_name: str) -> dict:
    print(f"[Research] Researching company: {company_name}")
    norm_name = company_name.lower().replace(" ", "").replace(".", "").replace("-", "")

    # 1. Check verified benchmarks (always instant, highest priority)
    for key, data in VERIFIED_COMPANY_BENCHMARKS.items():
        if key in norm_name or norm_name in key:
            print(f"[Research] Found verified benchmark for {company_name} ({key})")
            ci = CompanyIntelligence(**data)
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
        # 3. Gather raw search context from DDG
        from app.services.search_manager import perform_resilient_search
        query = f"{company_name} company work culture salary compensation employment bond glassdoor reddit levels.fyi"
        results = perform_resilient_search(query, max_results=6)
        raw_context = ""
        for r in results:
            raw_context += f"- {r.get('title')}: {r.get('body')}\n"

        # 4. Use Groq (no daily quota cap) to summarize and structure the findings
        prompt = f"""
        You are an expert tech career advisor. I have collected web search snippets about a company named '{company_name}'.
        Review the raw search snippets below and extract the key information into the requested JSON schema.
        If a specific field lacks enough information, default to "Not enough data."
        Be highly concise, focusing on red flags, exact numbers, and direct quotes from employees where possible.
        
        Raw Search Snippets:
        {raw_context}
        """

        intelligence = generate_structured(prompt, CompanyIntelligence, use_groq=True)
        result = intelligence.model_dump()

        # Store in cache
        _RESEARCH_CACHE[norm_name] = (time.time(), result)
        return result

    except Exception as e:
        print(f"Error researching company {company_name}: {e}")
        return CompanyIntelligence().model_dump()
