import json
from pydantic import BaseModel
from typing import Optional
from duckduckgo_search import DDGS
from app.services.llm_client import generate_structured

class CompanyIntelligence(BaseModel):
    work_culture: Optional[str] = "No data found."
    work_life_balance: Optional[str] = "No data found."
    perks: Optional[str] = "No data found."
    compensation_estimates: Optional[str] = "No data found."
    bonds_or_contracts: Optional[str] = "No data found."
    overall_sentiment: Optional[str] = "Neutral"

def research_company(company_name: str) -> dict:
    print(f"[Research] Researching company: {company_name}")
    try:
        # 1. Gather raw search context from DDG
        queries = [
            f"{company_name} company work culture work life balance reddit",
            f"{company_name} salary compensation software engineer reddit levels.fyi",
            f"{company_name} employment bond training contract glassdoor"
        ]
        
        raw_context = ""
        with DDGS() as ddgs:
            for q in queries:
                results = ddgs.text(q, max_results=4)
                for r in results:
                    raw_context += f"- {r.get('title')}: {r.get('body')}\n"
                    
        # 2. Use LLM to summarize and structure the findings
        prompt = f"""
        You are an expert tech career advisor. I have collected web search snippets about a company named '{company_name}'.
        Review the raw search snippets below and extract the key information into the requested JSON schema.
        If a specific field lacks enough information, default to "Not enough data."
        Be highly concise, focusing on red flags, exact numbers, and direct quotes from employees where possible.
        
        Raw Search Snippets:
        {raw_context}
        """
        
        intelligence = generate_structured(prompt, CompanyIntelligence)
        return intelligence.model_dump()
        
    except Exception as e:
        print(f"Error researching company {company_name}: {e}")
        # Return fallback
        return CompanyIntelligence().model_dump()
