from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
import io
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
    
    # Extract text using PyPDF2
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        raw_text = ""
        for page in pdf_reader.pages:
            raw_text += page.extract_text() + "\n"
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")
        
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="PDF appears to be empty or image-based.")
        
    # Send to LLM to extract structured data
    try:
        extraction = parse_resume_with_llm(raw_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to analyze resume with AI")
        
    # Save to database
    # In a full system we'd upload the file to Supabase Storage and save the URL.
    # For now, since we only need the skills for analysis, we use a placeholder or local filename.
    file_path_placeholder = f"local_upload_{file.filename}"
    
    insert_data = {
        "file_path": file_path_placeholder,
        "title": extraction.title,
        "target_type": extraction.target_type,
        "skills_summary": extraction.skills_summary,
        "user_id": user_id
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
