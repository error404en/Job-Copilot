import json
from app.services.llm_client import _try_groq_json
from typing import List, Dict, Any

def extract_opportunities_from_text(content: str) -> List[Dict[str, Any]]:
    """
    Extracts job opportunities from unstructured text (e.g., WhatsApp, Telegram, LinkedIn).
    Uses Groq for fast, structured JSON extraction.
    """
    prompt = f"""
    You are an AI tasked with extracting job opportunities from community messages.
    Extract ALL distinct job leads found in the following text.
    For each job, provide a JSON object with:
    - company: name of the company (or null if not found)
    - role_title: job title
    - location: job location
    - submitted_url: any apply link associated with this specific job (MUST be a valid URL or null)
    - extraction_metadata: an object containing:
      - experience_req: string
      - skills: list of strings
      - salary: string
      - deadline: string
      - work_mode: string (Remote, Hybrid, Onsite)
      
    If there are multiple jobs in the text, return an array of objects.
    
    Text:
    {content}
    
    Respond ONLY with a valid JSON array of objects.
    """
    
    try:
        res = _try_groq_json(prompt)
        if not res:
            from app.services.llm_client import _try_gemini_json
            res = _try_gemini_json(prompt)
        if not res:
            from app.services.llm_client import _try_ollama_json
            res = _try_ollama_json(prompt)
            
        if isinstance(res, str):
            # Clean up markdown code blocks if any
            clean_res = res.strip()
            if clean_res.startswith("```json"):
                clean_res = clean_res[7:]
            if clean_res.startswith("```"):
                clean_res = clean_res[3:]
            if clean_res.endswith("```"):
                clean_res = clean_res[:-3]
            try:
                res = json.loads(clean_res.strip())
            except json.JSONDecodeError:
                print("Failed to parse JSON string:", clean_res)
                return []
                
        if isinstance(res, dict):
            # If the LLM wraps it in {"jobs": [...]}
            if "jobs" in res and isinstance(res["jobs"], list):
                return res["jobs"]
            return [res] # Wrap in list if it returned a single object
        if isinstance(res, list):
            return res
        return []
    except Exception as e:
        print(f"Failed to extract opportunities: {e}")
        return []

def deduplicate_leads(leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate leads by (company, role, url) or fuzzy company+role."""
    import re
    from difflib import SequenceMatcher
    
    unique = []
    
    def normalize(text):
        return re.sub(r"\W+", "", str(text or "")).lower()
        
    def is_dupe(a, b):
        ca, cb = normalize(a.get("company")), normalize(b.get("company"))
        if not ca or not cb or ca != cb:
            return False
            
        ra, rb = normalize(a.get("role_title")), normalize(b.get("role_title"))
        if not ra or not rb:
            return False
            
        ua, ub = a.get("submitted_url"), b.get("submitted_url")
        if ua and ub:
            # If both have URLs, they must match (ignoring query params/fragments)
            n_ua = ua.split("?")[0].split("#")[0].rstrip("/")
            n_ub = ub.split("?")[0].split("#")[0].rstrip("/")
            if n_ua == n_ub:
                return True
            return False
            
        # If URLs missing on one or both, use fuzzy role match
        # Already checked exact role match above via normalize, but let's be safe
        if ra == rb:
            return True
            
        seq = SequenceMatcher(None, str(a.get("role_title")).lower(), str(b.get("role_title")).lower()).ratio()
        return seq > 0.8

    for lead in leads:
        if not any(is_dupe(lead, existing) for existing in unique):
            unique.append(lead)
            
    return unique

def extract_batch_opportunities(chunks: List[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """Process message chunks and extract leads."""
    import json
    all_leads = []
    
    for chunk in chunks:
        # Convert chunk to text format for LLM
        text_lines = []
        for i, msg in enumerate(chunk):
            sender = msg.get("sender") or "User"
            ts = msg.get("timestamp") or "Unknown"
            text_lines.append(f"[{ts}] {sender}: {msg.get('text')}")
            
        chunk_text = "\n".join(text_lines)
        
        prompt = f"""
        You are an AI tasked with extracting job opportunities from community messages.
        Extract ALL distinct job leads found in the following messages.
        For each job, provide a JSON object with:
        - company: name of the company (or null if not found)
        - role_title: job title (or null)
        - location: job location (or null)
        - submitted_url: any apply link associated with this specific job (MUST be a valid URL or null)
        - source_text: the exact original message text that contained this lead (do not alter it)
        - source_timestamp: the timestamp of the message (if available, else null)
        - source_sender: the sender of the message (if available, else null)
        - extraction_metadata: an object containing:
          - experience_req: string
          - skills: list of strings
          - salary: string
          - deadline: string
          - work_mode: string (Remote, Hybrid, Onsite)
          
        Text:
        {chunk_text}
        
        Respond ONLY with a valid JSON array of objects. Never hallucinate missing values, use null.
        """
        
        try:
            res = _try_groq_json(prompt)
            if not res:
                from app.services.llm_client import _try_gemini_json
                res = _try_gemini_json(prompt)
                
            if isinstance(res, str):
                clean_res = res.strip()
                if clean_res.startswith("```json"):
                    clean_res = clean_res[7:]
                if clean_res.startswith("```"):
                    clean_res = clean_res[3:]
                if clean_res.endswith("```"):
                    clean_res = clean_res[:-3]
                try:
                    res = json.loads(clean_res.strip())
                except json.JSONDecodeError:
                    res = []
                    
            if isinstance(res, dict) and "jobs" in res:
                res = res["jobs"]
            elif isinstance(res, dict):
                res = [res]
                
            if isinstance(res, list):
                all_leads.extend(res)
        except Exception as e:
            print(f"Failed to extract chunk: {e}")
            
    return deduplicate_leads(all_leads)

def extract_text_from_file(file_path: str, source_type: str) -> str:
    """
    Extracts text from various file formats.
    """
    text = ""
    try:
        if source_type == 'pdf':
            # Try lightweight pure-Python parser first (<10MB RAM)
            try:
                try:
                    import pypdf
                    reader = pypdf.PdfReader(file_path)
                except ImportError:
                    import PyPDF2
                    reader = PyPDF2.PdfReader(file_path)
                for page in reader.pages:
                    text += (page.extract_text() or "") + "\n"
            except Exception:
                text = ""

            # Fallback to PyMuPDF with guaranteed resource cleanup
            if not text.strip():
                try:
                    import pymupdf
                except ImportError:
                    import fitz as pymupdf
                with pymupdf.open(file_path) as doc:
                    for page in doc:
                        text += page.get_text() + "\n"
            import gc
            gc.collect()
        elif source_type == 'docx':
            import docx
            doc = docx.Document(file_path)
            text = "\n".join([para.text for para in doc.paragraphs])
        elif source_type == 'xlsx':
            import pandas as pd
            df = pd.read_excel(file_path)
            text = df.to_string()
        elif source_type == 'csv':
            import pandas as pd
            df = pd.read_csv(file_path)
            text = df.to_string()
        elif source_type == 'image':
            # We use gemini vision via our llm_client 
            from app.services.llm_client import extract_text_from_image
            import mimetypes
            
            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = 'image/jpeg'
                
            with open(file_path, 'rb') as f:
                image_bytes = f.read()
                
            text = extract_text_from_image(image_bytes, mime_type)
    except Exception as e:
        print(f"Error extracting text from file {file_path}: {e}")
        
    return text
