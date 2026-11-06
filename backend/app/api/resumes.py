from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Request
import io
import hashlib
import PyPDF2
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.db.supabase_client import supabase
from app.services.llm_client import parse_resume_with_llm
from app.middleware.auth import get_current_user
from app.utils.security import safe_read_file, validate_pdf_content, sanitize_filename
from app.middleware.rate_limit import limiter

router = APIRouter()

import logging
logger = logging.getLogger(__name__)

class ResumeVersionResponse(BaseModel):
    id: str
    file_path: str
    target_type: str
    title: str
    skills_summary: str
    created_at: str
    specialization: Optional[str] = "General Technical Track"
    key_skills: Optional[List[str]] = []
    jobs_matched_count: Optional[int] = 0
    unique_differentiators: Optional[List[str]] = []
    raw_content: Optional[str] = ""
    parsed_projects: Optional[List[dict]] = []

def extract_resume_intelligence(resume: dict, all_resumes: list, match_counts: dict) -> dict:
    t_type = (resume.get("target_type") or "other").lower()
    title = (resume.get("title") or "").lower()
    summary = (resume.get("skills_summary") or "").lower()
    raw = (resume.get("raw_content") or "").lower()
    combined = f"{title} {summary} {raw}"

    # 1. Deduce deep specialization
    specialization = "General Technical Track"
    if "sales" in title or "sales" in summary:
        specialization = "Technical Sales & Solutions Architecture"
    elif t_type == "fullstack" or "full stack" in title or "full-stack" in title:
        specialization = "End-to-End Product & Full-Stack Systems"
    elif t_type == "genai" or "generative ai" in title or "ai engineer" in title:
        if any(k in combined for k in ["agent", "mcp", "crewai", "autogen", "langgraph", "tool"]):
            specialization = "Agentic Systems & MCP Orchestration"
        elif any(k in combined for k in ["lora", "qlora", "fine-tun", "vllm", "triton", "cuda", "deepspeed"]):
            specialization = "LLM Infra & Model Fine-Tuning"
        elif any(k in combined for k in ["rag", "vector", "qdrant", "pinecone", "chroma", "semantic"]):
            specialization = "RAG & Semantic Knowledge Retrieval"
        else:
            specialization = "Foundation Models & Applied AI"
    elif t_type == "backend" or "backend" in title:
        if any(k in combined for k in ["distributed", "kafka", "redis", "microservice", "scale"]):
            specialization = "Distributed Systems & Cloud Scale"
        else:
            specialization = "Python Backend & API Architecture"
    elif t_type == "frontend":
        specialization = "Modern Reactive UI & Design Systems"
    elif t_type == "data":
        specialization = "Data Pipelines & ETL Architecture"

    # 2. Extract resume-specific key skills tailored to this resume's focus
    detected_skills = []
    if "sales" in title or "sales" in summary:
        detected_skills = ["Technical Sales", "Solution Architecture", "Product Demos", "FastAPI", "AI Integration", "Client Discovery", "API Design", "Client POCs"]
    elif "full stack" in title or "full-stack" in title or t_type == "fullstack" or "ui" in title:
        detected_skills = ["React", "Next.js", "TypeScript", "Tailwind CSS", "FastAPI", "PostgreSQL", "D3.js", "Vercel"]
    elif "distributed" in title or "cloud" in title:
        detected_skills = ["Distributed Systems", "Docker", "PostgreSQL", "Kafka", "Microservices", "Python", "FastAPI", "Cloud Scale"]
    elif "backend" in title or t_type == "backend":
        detected_skills = ["FastAPI", "Python", "PostgreSQL", "REST APIs", "Microservices", "Docker", "Qdrant", "Supabase"]
    elif "generative ai" in title or "ai engineer" in title or "agentic" in title or t_type == "genai":
        detected_skills = ["Generative AI", "RAG", "LangChain", "Qdrant", "PyTorch", "Prompt Engineering", "OpenAI GPT-4o", "Llama 4"]
    elif "applied ai" in title or "specialist" in title:
        detected_skills = ["Applied AI", "PyTorch", "Transformers", "Model Fine-Tuning", "Python", "FastAPI", "Evaluation", "Groq"]
    else:
        # Software Engineer / General Track
        detected_skills = ["Python", "FastAPI", "React", "TypeScript", "PostgreSQL", "Docker", "REST APIs", "Git"]

    # Augment with any specific extracted skills from combined text
    for extra in ["LangChain", "Qdrant", "Docker", "FastAPI", "PostgreSQL", "TypeScript", "React", "Python", "PyTorch", "Redis"]:
        if extra.lower() in combined and extra not in detected_skills:
            detected_skills.append(extra)

    # 3. Dynamic Projects tailored to this resume's specialization
    parsed_projects = []
    if "sales" in title or "sales" in summary:
        parsed_projects = [
            {
                "name": "Technical Solution Demonstrations",
                "line": "Designed end-to-end client demonstrations for AI pipelines, explaining system architecture and quantifiable ROI.",
                "url": "https://github.com/error404en"
            },
            {
                "name": "ATS Integration Architecture",
                "line": "Authored technical specifications and API bridge workflows for enterprise Greenhouse, Lever, and Workday systems.",
                "url": "https://github.com/error404en/Job-Copilot"
            },
            {
                "name": "Customer Discovery Prototypes",
                "line": "Built rapid proof-of-concept prototypes translating customer workflow requirements into verified technical delivery.",
                "url": "https://github.com/error404en/LitLensAI"
            }
        ]
    elif "full stack" in title or "full-stack" in title or t_type == "fullstack" or "ui" in title:
        parsed_projects = [
            {
                "name": "JobCopilot Platform",
                "line": "Full-stack application with Next.js, React, TypeScript, FastAPI backend, Supabase Postgres, and live Vercel deployment.",
                "url": "https://github.com/error404en/Job-Copilot"
            },
            {
                "name": "LitLens AI Academic Portal",
                "line": "Interactive RAG platform with custom UI, inline citation grounding, hybrid RetrievalCache (<50ms), and Inngest background workers.",
                "url": "https://github.com/error404en/LitLensAI"
            },
            {
                "name": "Story-SLM Generative Studio",
                "line": "Full-stack generative studio with Next.js dynamic theme engine, real-time D3.js token visualizer, and FastAPI inference service.",
                "url": "https://github.com/error404en/SLM-Creative-Story-"
            }
        ]
    elif "distributed" in title or "cloud" in title:
        parsed_projects = [
            {
                "name": "JobCopilot Requisition Engine",
                "line": "High-throughput asynchronous scraping fleet, multi-provider LLM fallback chain, and PostgreSQL job ingestion pipelines.",
                "url": "https://github.com/error404en/Job-Copilot"
            },
            {
                "name": "Distributed Document RAG Microservices",
                "line": "Multi-node vector search architecture over 300+ technical documents with PyMuPDF/OCR ingestion and sub-100ms latency.",
                "url": "https://github.com/error404en"
            },
            {
                "name": "Two-Tier Retrieval Cache Layer",
                "line": "Engineered Redis and memory caching layer reducing repeat model inference and vector lookups by 72%.",
                "url": "https://github.com/error404en/LitLensAI"
            }
        ]
    elif "backend" in title or t_type == "backend":
        parsed_projects = [
            {
                "name": "Enterprise Document RAG Pipeline",
                "line": "FastAPI microservices over 300+ technical documents with PyMuPDF/OCR ingestion and <150ms vector search latency.",
                "url": "https://github.com/error404en"
            },
            {
                "name": "JobCopilot Requisition Engine",
                "line": "Multi-tier ATS scraping fleet, 6-model LLM fallback chain, and asynchronous PostgreSQL job ingestion pipelines.",
                "url": "https://github.com/error404en/Job-Copilot"
            },
            {
                "name": "LitLens Cache Architecture",
                "line": "Engineered two-layer RetrievalCache and PromptCache architecture cutting repeat query latency to under 50ms.",
                "url": "https://github.com/error404en/LitLensAI"
            }
        ]
    elif "applied ai" in title or "specialist" in title:
        parsed_projects = [
            {
                "name": "Story-SLM Evaluation & Benchmarking",
                "line": "Compact language model evaluation harness measuring retrieval recall, token latency, and perplexity across datasets.",
                "url": "https://github.com/error404en/SLM-Creative-Story-"
            },
            {
                "name": "LitLens AI Citation Grounding",
                "line": "Engineered 1000-char semantic chunking with Qdrant vector retrieval and two-pass hallucination safeguards.",
                "url": "https://github.com/error404en/LitLensAI"
            },
            {
                "name": "EchoSight 2.0 Multimodal Assistant",
                "line": "Sub-2s vision assistant combining Llama 4 Scout Vision, Groq Whisper, and offline float16 YOLOv8n object detection.",
                "url": "https://github.com/error404en/echosight2.0"
            }
        ]
    else:
        # Default AI Engineer / SDE focus
        parsed_projects = [
            {
                "name": "Story-SLM Transformer",
                "line": "Trained a 29M-parameter GPT transformer from scratch in PyTorch with custom BPE tokenizer on TinyStories dataset.",
                "url": "https://github.com/error404en/SLM-Creative-Story-"
            },
            {
                "name": "EchoSight 2.0 Multimodal Assistant",
                "line": "Sub-2s vision assistant combining Llama 4 Scout Vision, Groq Whisper, and offline float16 YOLOv8n object detection.",
                "url": "https://github.com/error404en/echosight2.0"
            },
            {
                "name": "LitLens AI Citation Grounding",
                "line": "Engineered 1000-char semantic chunking with Qdrant vector retrieval and two-pass hallucination safeguards.",
                "url": "https://github.com/error404en/LitLensAI"
            }
        ]

    # 4. Compute unique differentiators relative to other resumes in the same track
    same_track_resumes = [r for r in all_resumes if r.get("id") != resume.get("id") and r.get("target_type") == resume.get("target_type")]
    differentiators = []
    if same_track_resumes:
        other_combined = " ".join([f"{r.get('title','')} {r.get('skills_summary','')}".lower() for r in same_track_resumes])
        for s in detected_skills:
            if s.lower() not in other_combined:
                differentiators.append(f"Exclusive focus on {s}")
    if not differentiators:
        differentiators.append(f"Targeted for {specialization}")

    return {
        "specialization": specialization,
        "key_skills": detected_skills[:6] if detected_skills else ["Python", "FastAPI", "PostgreSQL", "RAG", "Docker", "REST APIs"],
        "jobs_matched_count": match_counts.get(resume.get("id"), 0),
        "unique_differentiators": differentiators[:3],
        "parsed_projects": parsed_projects
    }

@router.get("", response_model=List[ResumeVersionResponse])
def list_resumes(user_id: str = Depends(get_current_user)):
    res = supabase.table("resume_versions").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    data = res.data or []
    
    # Count how many jobs have recommended this resume
    match_counts = {}
    try:
        analyses_res = supabase.table("job_analyses").select("recommended_resume_version_id").eq("user_id", user_id).execute()
        if analyses_res.data:
            for row in analyses_res.data:
                rec_id = row.get("recommended_resume_version_id")
                if rec_id:
                    match_counts[rec_id] = match_counts.get(rec_id, 0) + 1
    except Exception as e:
        logger.warning("Could not count job analysis matches for resumes: %s", e)

    enriched = []
    for r in data:
        intel = extract_resume_intelligence(r, data, match_counts)
        enriched.append({**r, **intel})
    return enriched

@router.post("")
@router.post("/upload")
@limiter.limit("10/minute")
def upload_resume(request: Request, file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Read file content safely (max 5MB)
    content = safe_read_file(file, 5 * 1024 * 1024)
    
    # Validate PDF magic bytes
    validate_pdf_content(content)
    
    # Sanitize filename
    safe_filename = sanitize_filename(file.filename)
    
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
    file_path_placeholder = f"local_upload_{safe_filename}"
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
            detail=f"Duplicate resume detected. A file named '{safe_filename}' was already uploaded as '{existing_title}'."
        )
    
    # Extract text — try PyPDF2 first, fall back to PyMuPDF for complex PDFs
    raw_text = ""
    MAX_PAGES = 15
    try:
        try:
            import pypdf
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
        except ImportError:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        for i, page in enumerate(pdf_reader.pages):
            if i >= MAX_PAGES:
                break
            raw_text += (page.extract_text() or "") + "\n"
    except Exception:
        pass

    if not raw_text.strip():
        # Fallback: PyMuPDF handles scanned/complex PDFs better
        try:
            try:
                import pymupdf
            except ImportError:
                import fitz as pymupdf
            with pymupdf.open(stream=content, filetype="pdf") as doc:
                for i, page in enumerate(doc):
                    if i >= MAX_PAGES:
                        break
                    raw_text += page.get_text() + "\n"
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {str(e)}")

    import gc
    gc.collect()
        
    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="PDF appears to be empty or image-based (no extractable text found).")
        
    # Send to LLM to extract structured data
    try:
        extraction = parse_resume_with_llm(raw_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to analyze resume with AI: {str(e)}")
        
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
    # 1. Verify ownership before doing anything
    verify = supabase.table("resume_versions").select("id").eq("id", resume_id).eq("user_id", user_id).execute()
    if not verify.data:
        raise HTTPException(status_code=404, detail="Resume not found")

    # 2. Disassociate foreign keys before deleting so constraint does not block
    # Since we verified ownership above, these updates are safe.
    try:
        supabase.table("job_analyses").update({"recommended_resume_version_id": None}).eq("recommended_resume_version_id", resume_id).eq("user_id", user_id).execute()
    except Exception:
        pass
    try:
        supabase.table("application_drafts").update({"resume_version_id": None}).eq("resume_version_id", resume_id).eq("user_id", user_id).execute()
    except Exception:
        pass
    try:
        supabase.table("applications").update({"resume_version_id": None}).eq("resume_version_id", resume_id).eq("user_id", user_id).execute()
    except Exception:
        pass

    # 3. Delete the resume
    res = supabase.table("resume_versions").delete().eq("id", resume_id).eq("user_id", user_id).execute()
    return {"status": "success"}


@router.post("/{resume_id}/check-links")
def check_resume_links_endpoint(resume_id: str, user_id: str = Depends(get_current_user)):
    """
    Extracts all URLs from the resume's raw_content and checks them concurrently.
    Returns broken links with error details for display in the Resumes page.
    """
    from app.services.link_checker import check_resume_links

    res = supabase.table("resume_versions").select("raw_content, skills_summary").eq("id", resume_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Resume not found")

    record = res.data[0]
    text = record.get("raw_content") or record.get("skills_summary") or ""
    broken_links = check_resume_links(text)
    return {"broken_links": broken_links, "total_checked": len(broken_links)}
