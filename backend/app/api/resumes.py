from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
import io
import hashlib
import PyPDF2
from typing import List
from pydantic import BaseModel
from datetime import datetime

from app.db.supabase_client import supabase
from app.services.llm_client import parse_resume_with_llm
from app.middleware.auth import get_current_user

router = APIRouter()

class ResumeVersionResponse(BaseModel):
    id: str
    file_path: str
    target_type: str
    title: str
    skills_summary: str
    created_at: str

@router.get("", response_model=List[ResumeVersionResponse])
def list_resumes(user_id: str = Depends(get_current_user)):
    res = supabase.table("resume_versions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return res.data

@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Read file content
    content = await file.read()
    
    # Calculate SHA-256 hash of the content
    file_hash = hashlib.sha256(content).hexdigest()
    
    # 1. Check exact SHA-256 hash match
    existing_by_hash = supabase.table("resume_versions").select("id, title").eq("user_id", user_id).eq("file_hash", file_hash).execute()
    if existing_by_hash.data and len(existing_by_hash.data) > 0:
        existing_title = existing_by_hash.data[0].get("title", "Unknown")
        raise HTTPException(
            status_code=409, 
            detail=f"Duplicate resume detected. This exact file was already uploaded as '{existing_title}'."
        )
    
    # 2. Check identical filename upload
    file_path_placeholder = f"local_upload_{file.filename}"
    existing_by_filename = supabase.table("resume_versions").select("id, title, file_hash").eq("user_id", user_id).eq("file_path", file_path_placeholder).execute()
    if existing_by_filename.data and len(existing_by_filename.data) > 0:
        existing_title = existing_by_filename.data[0].get("title", "Unknown")
        # Backfill hash if missing
        if not existing_by_filename.data[0].get("file_hash"):
            try:
                supabase.table("resume_versions").update({"file_hash": file_hash}).eq("id", existing_by_filename.data[0]["id"]).execute()
            except Exception:
                pass
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate resume detected. A file named '{file.filename}' was already uploaded as '{existing_title}'."
        )
    
    # Extract text — try PyPDF2 first, fall back to PyMuPDF for complex PDFs
    raw_text = ""
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        for page in pdf_reader.pages:
            raw_text += (page.extract_text() or "") + "\n"
    except Exception:
        pass

    if not raw_text.strip():
        # Fallback: PyMuPDF handles scanned/complex PDFs better
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=content, filetype="pdf")
            for page in doc:
                raw_text += page.get_text() + "\n"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
        
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="PDF appears to be empty or image-based (no extractable text found).")
        
    # Send to LLM to extract structured data
    try:
        extraction = parse_resume_with_llm(raw_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to analyze resume with AI")
        
    # 3. Check extracted title match (catches legacy resumes uploaded before file_hash was added)
    cleaned_title = extraction.title.strip()
    existing_by_title = supabase.table("resume_versions").select("id, title, file_hash").eq("user_id", user_id).ilike("title", cleaned_title).execute()
    if existing_by_title.data and len(existing_by_title.data) > 0:
        # Backfill hash on legacy resume record
        if not existing_by_title.data[0].get("file_hash"):
            try:
                supabase.table("resume_versions").update({"file_hash": file_hash}).eq("id", existing_by_title.data[0]["id"]).execute()
            except Exception:
                pass
        raise HTTPException(
            status_code=409,
            detail=f"Duplicate resume detected. A resume with title '{cleaned_title}' already exists in your account."
        )

    insert_data = {
        "file_path": file_path_placeholder,
        "title": extraction.title,
        "target_type": extraction.target_type,
        "skills_summary": extraction.skills_summary,
        "raw_content": raw_text.strip(),  # Save full resume text for .docx generation
        "user_id": user_id,
        "file_hash": file_hash
    }
    
    res = supabase.table("resume_versions").insert(insert_data).execute()
    
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save to database")
        
    return res.data[0]

@router.delete("/{resume_id}")
def delete_resume(resume_id: str, user_id: str = Depends(get_current_user)):
    res = supabase.table("resume_versions").delete().eq("id", resume_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"status": "success"}
