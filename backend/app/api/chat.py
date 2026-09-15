from fastapi import APIRouter, Depends, HTTPException, Body, Form, File, UploadFile
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from app.db.supabase_client import get_current_user, supabase
from app.services.llm_client import get_completion, generate_tailoring_text, generate_tailoring_text_stream, extract_text_from_image
import json
import io
import fitz  # PyMuPDF

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


@router.post("/threads/{thread_id}/messages")
async def send_message(
    thread_id: str, 
    content: str = Form(...),
    file: Optional[UploadFile] = File(None),
    user=Depends(get_current_user)
):
    """
    Sends a message, processes optional files, builds context, calls LLM, and saves response.
    """
    try:
        # 1. Verify thread & get context
        thread_res = supabase.table("chat_threads").select("*").eq("id", thread_id).eq("user_id", user["id"]).execute()
        if not thread_res.data:
            raise HTTPException(status_code=404, detail="Thread not found")
        thread = thread_res.data[0]

        # 2. Process Attachment if present
        attachment_text = ""
        if file:
            file_bytes = await file.read()
            mime_type = file.content_type or ""
            if mime_type.startswith("image/"):
                try:
                    attachment_text = extract_text_from_image(file_bytes, mime_type)
                    attachment_text = f"\n[User Attached Image. Extracted Text:]\n{attachment_text}\n"
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to process image: {e}")
            elif mime_type == "application/pdf":
                try:
                    pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                    extracted = ""
                    for page in pdf_doc:
                        extracted += page.get_text() + "\n"
                    attachment_text = f"\n[User Attached PDF. Extracted Text:]\n{extracted}\n"
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to process PDF: {e}")
            else:
                try:
                    # Attempt to read as raw text
                    text = file_bytes.decode("utf-8")
                    attachment_text = f"\n[User Attached File. Extracted Text:]\n{text}\n"
                except:
                    raise HTTPException(status_code=400, detail="Unsupported file format")

        # Combine user content and attachment
        final_user_content = content + attachment_text

        # 3. Save User Message
        user_msg = {
            "thread_id": thread_id,
            "role": "user",
            "content": final_user_content
        }
        supabase.table("chat_messages").insert(user_msg).execute()

        # 4. Build System Context
        profile_res = supabase.table("user_profile").select("*").eq("user_id", user["id"]).execute()
        resumes_res = supabase.table("resumes").select("*").eq("user_id", user["id"]).execute()
        
        system_prompt = (
            "You are an expert career coach and technical mentor (Copilot Coach). You help the user analyze job descriptions, identify skill gaps, and prepare for interviews.\n\n"
            "CRITICAL TONE & CAPABILITY INSTRUCTIONS:\n"
            "Speak naturally, as if you are a senior engineer having a coffee chat with a mentee. "
            "Do NOT use robotic AI disclaimers like 'As an AI language model...' or 'I'd be happy to help!'. "
            "Do not be overly enthusiastic or use flowery language. Be direct, pragmatic, and insightful. "
            "Keep your responses concise and highly actionable.\n"
            "IMPORTANT: While you are a career coach, you are also an Expert Senior Engineer. You MUST engage in deep, complex software engineering, coding, system design, and technical discussions if the user asks, as long as it serves the purpose of skill-building or interview preparation. Do not refuse technical questions.\n\n"
        )
        
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

        # 5. Fetch Chat History (Rolling Context - last 15 messages)
        history_res = supabase.table("chat_messages").select("role, content").eq("thread_id", thread_id).order("created_at", desc=False).execute()
        
        recent_history = history_res.data[-15:] if history_res.data else []
        
        full_prompt = f"{system_prompt}\n--- CHAT HISTORY ---\n"
        for msg in recent_history:
            prefix = "User" if msg["role"] == "user" else "Coach"
            full_prompt += f"{prefix}: {msg['content']}\n\n"
        
        full_prompt += "Coach:"

        # 6. Call LLM Streaming & Yield
        async def response_generator():
            full_response_text = ""
            try:
                for chunk in generate_tailoring_text_stream(full_prompt):
                    if chunk:
                        full_response_text += chunk
                        yield f"data: {json.dumps({'content': chunk})}\n\n"
                
                if full_response_text:
                    assistant_msg = {
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": full_response_text
                    }
                    supabase.table("chat_messages").insert(assistant_msg).execute()
            except Exception as e:
                print(f"[Streaming Error] {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            finally:
                yield "data: [DONE]\n\n"
                
        return StreamingResponse(response_generator(), media_type="text/event-stream")

    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

