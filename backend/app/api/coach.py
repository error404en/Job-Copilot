from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.services.llm_client import generate_tailoring_text

router = APIRouter()

class CoachAskRequest(BaseModel):
    job_id: str
    question: str

@router.post("/ask")
def ask_coach(req: CoachAskRequest, user_id: str = Depends(get_current_user)):
    """
    Answers a direct tactical question about a specific job requisition using AI coach intelligence.
    """
    question = (req.question or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
        
    job_id = req.job_id
    
    # 1. Fetch job details
    job = None
    try:
        res = supabase.table("jobs").select("*").eq("id", job_id).execute()
        if res.data:
            job = res.data[0]
    except Exception as e:
        print(f"[Coach] Error fetching job {job_id}: {e}")
        
    if not job:
        # Fallback generic response
        return {
            "answer": f"Here is strategic guidance for your target requisition:\n• Analyze the core competencies in the job posting.\n• Structure your responses with the STAR method (Situation, Task, Action, Result).\n• Quantify technical metrics (latency, scale, cost, reliability) in your answers."
        }
        
    role_title = job.get("role_title") or "Software Engineer"
    company = job.get("company") or "Target Company"
    required_skills = job.get("required_skills") or []
    skills_str = ", ".join(required_skills[:8]) if isinstance(required_skills, list) else str(required_skills)
    jd_snippet = (job.get("raw_jd") or "")[:1200]
    
    prompt = f"""You are JobCopilot AI Strategic Interview & Career Coach.
Target Role: {role_title}
Company: {company}
Required Core Skills: {skills_str}

Job Description Snippet:
{jd_snippet}

Candidate's Tactical Question:
"{question}"

Provide a crisp, actionable, high-impact coach briefing directly addressing their question.
Focus on:
1. Concrete talking points and technical depth expected by {company} interviewers.
2. How to showcase real production ownership.
3. Common pitfalls to avoid for this specific role.

Keep your response structured, concise (3-4 bullet points), and immediately usable."""

    try:
        answer = generate_tailoring_text(prompt)
        if answer and answer.strip():
            return {"answer": answer.strip()}
    except Exception as e:
        print(f"[Coach] Error generating answer with LLM: {e}")
        
    # Structured fallback if LLM is temporarily unreachable
    return {
        "answer": f"### Strategic Coaching for {role_title} at {company}\n\n"
                  f"• **High-Impact Competencies**: Highlight measurable production experience in **{skills_str or 'distributed systems, data structures, and APIs'}**.\n"
                  f"• **Interview Framing**: When answering behavioral or technical questions for {company}, emphasize end-to-end ownership, edge-case mitigation, and architecture trade-offs.\n"
                  f"• **Tactical Preparation**: Practice concise 90-second answers using the STAR method, leading with quantifiable engineering impact (e.g. latency, throughput, scale)."
    }

