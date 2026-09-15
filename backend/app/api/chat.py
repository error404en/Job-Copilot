from fastapi import APIRouter, Depends, HTTPException, Body
from typing import List, Optional
from pydantic import BaseModel
from app.db.supabase_client import get_current_user, supabase
from app.services.llm_client import get_completion, generate_tailoring_text
import json

router = APIRouter()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    id: str
    role: str
    content: str
    created_at: str

class ChatThread(BaseModel):
    id: str
    title: str
    job_id: Optional[str] = None
    created_at: str
    messages: Optional[List[ChatMessage]] = []

class CreateThreadRequest(BaseModel):
    title: Optional[str] = "New Conversation"
    job_id: Optional[str] = None

class SendMessageRequest(BaseModel):
    content: str

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/threads", response_model=List[ChatThread])
def list_threads(user=Depends(get_current_user)):
    try:
        response = supabase.table("chat_threads").select("*").eq("user_id", user["id"]).order("created_at", desc=True).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/threads", response_model=ChatThread)
def create_thread(req: CreateThreadRequest, user=Depends(get_current_user)):
    try:
        new_thread = {
            "user_id": user["id"],
            "title": req.title,
            "job_id": req.job_id
        }
        response = supabase.table("chat_threads").insert(new_thread).execute()
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create thread")
        return response.data[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/threads/{thread_id}/messages", response_model=List[ChatMessage])
def get_thread_messages(thread_id: str, user=Depends(get_current_user)):
    try:
        # Verify ownership implicitly via RLS or explicitly
        thread = supabase.table("chat_threads").select("id").eq("id", thread_id).eq("user_id", user["id"]).execute()
        if not thread.data:
            raise HTTPException(status_code=404, detail="Thread not found")

        response = supabase.table("chat_messages").select("*").eq("thread_id", thread_id).order("created_at", desc=False).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/threads/{thread_id}/messages", response_model=ChatMessage)
def send_message(thread_id: str, req: SendMessageRequest, user=Depends(get_current_user)):
    """
    Sends a message, builds context, calls LLM, and saves response.
    """
    try:
        # 1. Verify thread & get context
        thread_res = supabase.table("chat_threads").select("*").eq("id", thread_id).eq("user_id", user["id"]).execute()
        if not thread_res.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        thread = thread_res.data[0]

        # 2. Save User Message
        user_msg = {
            "thread_id": thread_id,
            "role": "user",
            "content": req.content
        }
        supabase.table("chat_messages").insert(user_msg).execute()

        # 3. Build System Context
        profile_res = supabase.table("user_profile").select("*").eq("user_id", user["id"]).execute()
        resumes_res = supabase.table("resumes").select("*").eq("user_id", user["id"]).execute()
        
        system_prompt = "You are an expert career coach and technical mentor (Copilot Coach). You help the user analyze job descriptions, identify skill gaps, and prepare for interviews.\n\n"
        
        if profile_res.data:
            prof = profile_res.data[0]
            system_prompt += f"USER PROFILE:\nName: {prof.get('first_name', '')} {prof.get('last_name', '')}\n"
            system_prompt += f"Education: {prof.get('education_level', '')}\n"
            system_prompt += f"Base Skills: {prof.get('base_skills', '')}\n\n"
            
        if resumes_res.data:
            system_prompt += "USER RESUMES (Parsed Summaries):\n"
            for r in resumes_res.data:
                system_prompt += f"- {r.get('title')}: {r.get('skills_summary')}\n"
            system_prompt += "\n"

        if thread.get("job_id"):
            job_res = supabase.table("jobs").select("*").eq("id", thread["job_id"]).execute()
            if job_res.data:
                job = job_res.data[0]
                system_prompt += f"CONTEXTUAL JOB ROLE:\nTitle: {job.get('role_title')}\nCompany: {job.get('company')}\nJD: {job.get('raw_jd')[:3000]}\n"
                # Add analysis if available
                analysis_res = supabase.table("job_analyses").select("*").eq("job_id", job["id"]).execute()
                if analysis_res.data:
                    analysis = analysis_res.data[0]
                    system_prompt += f"AI Match Score: {analysis.get('match_score')}/100\n"
                    system_prompt += f"Missing Keywords: {analysis.get('missing_keywords')}\n\n"

        # 4. Fetch Chat History
        history_res = supabase.table("chat_messages").select("role, content").eq("thread_id", thread_id).order("created_at", desc=False).execute()
        
        full_prompt = f"{system_prompt}\n--- CHAT HISTORY ---\n"
        for msg in history_res.data:
            prefix = "User" if msg["role"] == "user" else "Coach"
            full_prompt += f"{prefix}: {msg['content']}\n\n"
        
        full_prompt += "Coach:"

        # 5. Call LLM (using the high tier Groq 70B if available)
        print(f"[Chat] Sending prompt of length {len(full_prompt)} to Tailoring LLM")
        llm_response = generate_tailoring_text(full_prompt)

        # 6. Save Assistant Message
        assistant_msg = {
            "thread_id": thread_id,
            "role": "assistant",
            "content": llm_response
        }
        res = supabase.table("chat_messages").insert(assistant_msg).execute()
        
        return res.data[0]

    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
