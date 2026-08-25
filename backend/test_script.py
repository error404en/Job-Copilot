import json
from app.services.jd_parser import parse_job_description
from app.services.match_scorer import score_match

# Mock user data based on the seed
USER_PROFILE = {
    "base_location": "Noida, Delhi NCR",
    "remote_ok": True,
    "pay_floor_ncr_remote": 600000,
    "target_roles": ["Backend Engineer", "Generative AI Engineer"]
}

RESUME_SUMMARY = "Python, C++, JavaScript, TypeScript, SQL, FastAPI, REST APIs, WebSockets, Microservices, Authentication, Event-Driven Architecture, MySQL, Supabase (Postgres), Qdrant, RAG, LangChain, Prompt Engineering, Embeddings, Semantic Search, OpenAI GPT-4o, Llama 4, YOLOv8, React, Next.js"

SAMPLE_JD = """
We are looking for a Senior Backend Engineer to join our team in Bangalore (Onsite).
You will be responsible for building scalable APIs using Python and FastAPI.
Required Experience: 4+ years of backend development.
Skills: Python, FastAPI, Postgres, AWS, Docker, Kubernetes.
Salary: ₹12,000,000 - ₹18,000,000 LPA
"""

def test_pipeline():
    print("Parsing JD...")
    parsed_job = parse_job_description(SAMPLE_JD, use_groq=False) # Testing with Gemini
    print("\n--- Parsed Job ---")
    print(parsed_job.model_dump_json(indent=2))
    
    print("\nScoring Match...")
    fit_report = score_match(parsed_job, USER_PROFILE, RESUME_SUMMARY, use_groq=False)
    print("\n--- Fit Report ---")
    print(fit_report.model_dump_json(indent=2))

if __name__ == "__main__":
    test_pipeline()
