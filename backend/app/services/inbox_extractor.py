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

def extract_text_from_file(file_path: str, source_type: str) -> str:
    """
    Extracts text from various file formats.
    """
    text = ""
    try:
        if source_type == 'pdf':
            import fitz # PyMuPDF
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text() + "\n"
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
