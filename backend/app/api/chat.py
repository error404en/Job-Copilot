from fastapi import APIRouter, Depends, HTTPException, Body, Form, File, UploadFile, Request
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from app.db.supabase_client import supabase
from app.middleware.auth import get_current_user
from app.services.llm_client import get_completion, generate_tailoring_text, generate_tailoring_text_stream, extract_text_from_image
import json
import io
import time
from app.utils.security import safe_read_file, validate_image_content, validate_pdf_content, sanitize_filename
from app.middleware.rate_limit import limiter

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

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

class RenameThreadRequest(BaseModel):
    title: str

class SendMessageRequest(BaseModel):
    content: str

import uuid
from datetime import datetime

# In-memory session fallbacks to guarantee 100% chat availability even if Supabase DDL migrations are pending
session_threads = {}   # thread_id -> thread dict
session_messages = {}  # thread_id -> list of message dicts

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/threads", response_model=List[ChatThread])
def list_threads(user_id: str = Depends(get_current_user)):
    threads = []
    for attempt in range(2):
        try:
            response = supabase.table("chat_threads").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
            if response.data:
                threads.extend(response.data)
            break
        except Exception as e:
            print(f"[Chat] Warning: Failed to query DB threads (attempt {attempt+1}): {e}")
            time.sleep(0.2)
    
    # Also include in-memory active threads for this user
    for tid, t in session_threads.items():
        if t.get("user_id") == user_id and not any(x["id"] == tid for x in threads):
            threads.insert(0, t)
            
    return threads


@router.post("/threads", response_model=ChatThread)
def create_thread(req: CreateThreadRequest, user_id: str = Depends(get_current_user)):
    new_thread_data = {
        "user_id": user_id,
        "title": req.title or "New Conversation",
        "job_id": req.job_id
    }
    
    # Try persisting to Supabase first with retry
    for attempt in range(2):
        try:
            response = supabase.table("chat_threads").insert(new_thread_data).execute()
            if response.data:
                return response.data[0]
            break
        except Exception as e:
            print(f"[Chat] Note: Supabase chat_threads insert attempt {attempt+1} ({e}).")
            time.sleep(0.2)

    # Graceful fallback: generate a valid UUID thread in session memory
    tid = str(uuid.uuid4())
    fallback_thread = {
        "id": tid,
        "user_id": user_id,
        "title": req.title or "New Conversation",
        "job_id": req.job_id,
        "created_at": datetime.utcnow().isoformat(),
        "messages": []
    }
    session_threads[tid] = fallback_thread
    session_messages[tid] = []
    return fallback_thread


@router.get("/threads/{thread_id}/messages", response_model=List[ChatMessage])
def get_thread_messages(thread_id: str, user_id: str = Depends(get_current_user)):
    messages = []
    # 1. Fetch from database first with automatic retry
    for attempt in range(2):
        try:
            response = supabase.table("chat_messages").select("*").eq("thread_id", thread_id).order("created_at", desc=False).execute()
            if response.data:
                messages.extend(response.data)
            break
        except Exception as e:
            print(f"[Chat] Warning fetching messages from DB (attempt {attempt+1}): {e}")
            time.sleep(0.2)

    # 2. Resilient session fallback if DB was empty or unmigrated
    if not messages and thread_id in session_messages:
        messages = session_messages[thread_id]

    return messages


@router.post("/threads/{thread_id}/messages")
@limiter.limit("20/minute")
def send_message(
    request: Request,
    thread_id: str, 
    content: str = Form(...),
    files: Optional[List[UploadFile]] = File(None),
    user_id: str = Depends(get_current_user)
):
    """
    Sends a message, processes optional files, builds context, calls LLM, and streams response.
    """
    try:
        # 1. Verify thread context (check DB with retry, fallback to auto-creation or session)
        thread = None
        for attempt in range(2):
            try:
                thread_res = supabase.table("chat_threads").select("*").eq("id", thread_id).eq("user_id", user_id).execute()
                if thread_res.data:
                    thread = thread_res.data[0]
                break
            except Exception as e:
                time.sleep(0.2)
                
        if not thread:
            # Ensure thread is recorded in DB to satisfy foreign keys
            try:
                ins = supabase.table("chat_threads").insert({
                    "id": thread_id,
                    "user_id": user_id,
                    "title": content[:36] + ("..." if len(content) > 36 else ""),
                    "job_id": None
                }).execute()
                if ins.data:
                    thread = ins.data[0]
            except Exception as e:
                print(f"[Chat] Note on thread DB auto-creation: {e}")

        if not thread:
            thread = session_threads.get(thread_id, {
                "id": thread_id,
                "user_id": user_id,
                "title": "New Conversation",
                "job_id": None
            })

        # 2. Process Attachment(s) if present
        attachment_text = ""
        MAX_FILES = 3
        if files:
            if len(files) > MAX_FILES:
                raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} attachments allowed.")
                
            for file in files:
                # Limit each attachment to 5MB
                file_bytes = safe_read_file(file, 5 * 1024 * 1024)
                safe_fname = sanitize_filename(file.filename)
                mime_type = file.content_type or ""
                
                if mime_type.startswith("image/"):
                    try:
                        validate_image_content(file_bytes)
                        extracted = extract_text_from_image(file_bytes, mime_type)
                        attachment_text += f"\n[User Attached Image ({safe_fname}). Extracted Text:]\n{extracted}\n"
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=f"Failed to process image {safe_fname}: {e}")
                elif mime_type == "application/pdf":
                    try:
                        validate_pdf_content(file_bytes)
                        extracted = ""
                        MAX_PAGES = 10
                        if fitz is not None:
                            pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                            for i, page in enumerate(pdf_doc):
                                if i >= MAX_PAGES:
                                    break
                                extracted += page.get_text() + "\n"
                        else:
                            import PyPDF2
                            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
                            for i, page in enumerate(reader.pages):
                                if i >= MAX_PAGES:
                                    break
                                extracted += (page.extract_text() or "") + "\n"
                        attachment_text += f"\n[User Attached PDF ({safe_fname}). Extracted Text:]\n{extracted}\n"
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=f"Failed to process PDF {safe_fname}: {e}")
                else:
                    try:
                        text = file_bytes.decode("utf-8")
                        attachment_text += f"\n[User Attached File ({safe_fname}). Extracted Text:]\n{text}\n"
                    except Exception:
                        raise HTTPException(status_code=400, detail=f"Unsupported file format for {safe_fname}. Only Text, Images, and PDFs are supported.")

        final_user_content = content + attachment_text
        user_msg_id = str(uuid.uuid4())
        user_msg = {
            "id": user_msg_id,
            "thread_id": thread_id,
            "role": "user",
            "content": final_user_content,
            "created_at": datetime.utcnow().isoformat()
        }

        # 3. Save User Message (Supabase with session fallback)
        saved_to_db = False
        for attempt in range(2):
            try:
                supabase.table("chat_messages").insert({
                    "id": user_msg_id,
                    "thread_id": thread_id,
                    "user_id": user_id,  # Phase 3 Security Fix
                    "role": "user",
                    "content": final_user_content
                }).execute()
                saved_to_db = True
                break
            except Exception as e:
                print(f"[Chat] Note: Saving message to DB (attempt {attempt+1}): {e}")
                time.sleep(0.2)
            
        if not saved_to_db:
            if thread_id not in session_messages:
                session_messages[thread_id] = []
            session_messages[thread_id].append(user_msg)

        # 4. Build System Context
        system_prompt = (
            "You are an expert career coach, senior staff software engineer, and technical mentor (Copilot Coach). "
            "You help the candidate excel at technical interviews, master software architecture, analyze job descriptions, and write high-impact resume points.\n\n"
            "CRITICAL TONE & CAPABILITY INSTRUCTIONS (FOLLOW STRICTLY):\n"
            "1. Speak naturally and bluntly, as if you are a senior engineer having a raw, unvarnished 1-on-1 coffee chat with a peer. "
            "2. NEVER use robotic AI disclaimers like 'As an AI language model...' or 'I would be happy to help with that!'. "
            "3. DO NOT use generic AI templates, forced bulleted lists, or 'coaching checklists'. "
            "4. NEVER use Markdown tables (e.g. | Column | Column |). NEVER dump overwhelming multi-part plans or long checklists. Keep your responses visually light, using short conversational paragraphs. "
            "5. Be direct, pragmatic, and highly conversational. If there is a fundamental tech stack mismatch (e.g. Python vs C#/.NET), call it out honestly instead of giving false hope or keyword-stuffing advice. "
            "6. Do not use corporate buzzwords or flowery language. Use plain, direct English. Answer one thing at a time instead of overwhelming the user. "
            "7. IMPORTANT: While you are a career coach, you are also an Expert Senior Engineer. You MUST engage in deep, complex software engineering, coding, system design, and technical discussions if the user asks. Never refuse technical or coding questions.\n\n"
        )
        
        try:
            profile_res = supabase.table("user_profile").select("*").eq("user_id", user_id).execute()
            if profile_res.data:
                prof = profile_res.data[0]
                name = f"{prof.get('first_name') or ''} {prof.get('last_name') or ''}".strip()
                if name:
                    system_prompt += f"Candidate Name: {name}\n"
                if prof.get('target_roles'):
                    system_prompt += f"Target Roles: {', '.join(prof.get('target_roles'))}\n"
                if prof.get('dream_companies'):
                    system_prompt += f"Target Companies: {', '.join(prof.get('dream_companies'))}\n"
                if prof.get('base_location'):
                    system_prompt += f"Location: {prof.get('base_location')}\n"
                system_prompt += "\n"
        except Exception as e:
            print(f"[Chat] Warning fetching user_profile: {e}")

        try:
            resumes_res = supabase.table("resume_versions").select("*").eq("user_id", user_id).execute()
            if resumes_res.data:
                system_prompt += "CANDIDATE RESUME PORTFOLIO & SKILLS:\n"
                for r in resumes_res.data:
                    system_prompt += f"- {r.get('title')} ({r.get('target_type')}): {r.get('skills_summary')}\n"
                system_prompt += "\n"
        except Exception as e:
            print(f"[Chat] Warning fetching resume_versions: {e}")

        if thread.get("job_id"):
            try:
                job_res = supabase.table("jobs").select("*").eq("id", thread["job_id"]).eq("user_id", user_id).execute()
                if job_res.data:
                    job = job_res.data[0]
                    system_prompt += f"CONTEXTUAL JOB ROLE:\nTitle: {job.get('role_title')}\nCompany: {job.get('company')}\nJD: {job.get('raw_jd')[:3000]}\n"
                    analysis_res = supabase.table("job_analyses").select("*").eq("job_id", job["id"]).execute()
                    if analysis_res.data:
                        analysis = analysis_res.data[0]
                        system_prompt += f"AI Match Score: {analysis.get('match_score')}/100\n"
                        system_prompt += f"Missing Keywords: {analysis.get('missing_keywords')}\n\n"
            except Exception as e:
                print(f"[Chat] Warning fetching contextual job: {e}")

        # 5. Fetch Chat History (Rolling Context - last 15 messages)
        history = []
        try:
            history_res = supabase.table("chat_messages").select("role, content").eq("thread_id", thread_id).order("created_at", desc=False).execute()
            if history_res.data:
                history = history_res.data
        except Exception:
            pass
            
        if not history and thread_id in session_messages:
            history = [{"role": m["role"], "content": m["content"]} for m in session_messages[thread_id]]

        recent_history = history[-15:] if history else [{"role": "user", "content": final_user_content}]
        
        # 5.5 Check Agent Router
        try:
            from app.services.agent_router import process_agent_routing
            agent_result = process_agent_routing(final_user_content, recent_history)
            if agent_result:
                system_prompt += f"\n\n[SYSTEM INJECTED ACTION RESULT - You just performed this action for the user]:\n{agent_result}\n\nFactor this result into your response.\n"
        except Exception as e:
            print(f"[Chat] Agent Router failed: {e}")
        
        full_prompt = f"{system_prompt}\n--- CHAT HISTORY ---\n"
        for msg in recent_history:
            prefix = "User" if msg["role"] == "user" else "Coach"
            full_prompt += f"{prefix}: {msg['content']}\n\n"
        
        full_prompt += "Coach:"

        # 6. Stream Response via SSE
        def response_generator():
            full_response_text = ""
            try:
                for chunk in generate_tailoring_text_stream(full_prompt):
                    if chunk:
                        full_response_text += chunk
                        yield f"data: {json.dumps({'content': chunk})}\n\n"
            except GeneratorExit:
                # Client disconnected or stopped generating
                pass
            except Exception as e:
                print(f"[Streaming Error] {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            finally:
                if full_response_text.strip():
                    saved_asst = False
                    for attempt in range(2):
                        try:
                            supabase.table("chat_messages").insert({
                                "thread_id": thread_id,
                                "user_id": user_id,  # Phase 3 Security Fix
                                "role": "assistant",
                                "content": full_response_text
                            }).execute()
                            saved_asst = True
                            break
                        except Exception as e:
                            print(f"[Chat] Warning saving assistant message to DB (attempt {attempt+1}): {e}")
                            time.sleep(0.2)
                        
                    if not saved_asst:
                        if thread_id not in session_messages:
                            session_messages[thread_id] = []
                        session_messages[thread_id].append({
                            "id": str(uuid.uuid4()),
                            "thread_id": thread_id,
                            "role": "assistant",
                            "content": full_response_text,
                            "created_at": datetime.utcnow().isoformat()
                        })
                yield "data: [DONE]\n\n"
                
        return StreamingResponse(
            response_generator(), 
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    except Exception as e:
        print(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/threads/{thread_id}", response_model=ChatThread)
def rename_thread(thread_id: str, req: RenameThreadRequest, user_id: str = Depends(get_current_user)):
    """
    Renames an existing chat thread.
    """
    clean_title = (req.title or "").strip()
    if not clean_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
        
    updated = None
    try:
        res = supabase.table("chat_threads").update({"title": clean_title}).eq("id", thread_id).eq("user_id", user_id).execute()
        if res.data:
            updated = res.data[0]
    except Exception as e:
        print(f"[Chat] Warning renaming thread in DB: {e}")
        
    if not updated and thread_id in session_threads:
        session_threads[thread_id]["title"] = clean_title
        updated = session_threads[thread_id]
        
    if not updated:
        return {
            "id": thread_id,
            "title": clean_title,
            "job_id": None,
            "created_at": datetime.utcnow().isoformat(),
            "messages": []
        }
    return updated


@router.delete("/threads/{thread_id}")
def delete_thread(thread_id: str, user_id: str = Depends(get_current_user)):
    """
    Deletes a conversation thread and all its associated messages.
    """
    try:
        supabase.table("chat_messages").delete().eq("thread_id", thread_id).execute()
        supabase.table("chat_threads").delete().eq("id", thread_id).eq("user_id", user_id).execute()
    except Exception as e:
        print(f"[Chat] Warning deleting from DB: {e}")
    if thread_id in session_threads:
        del session_threads[thread_id]
    if thread_id in session_messages:
        del session_messages[thread_id]
    return {"status": "success", "deleted_thread_id": thread_id}

