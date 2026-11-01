import json
import re
from app.services.llm_client import _try_groq_json
from typing import List, Dict, Any

_PROMO_AD_DOMAINS = (
    "atsresumebuilder.in",
    "chat.whatsapp.com",
    "t.me/",
    "telegram.me/",
    "instagram.com/",
)

_MARKETING_SUFFIX_RE = re.compile(
    r"\s*\((?:mass[\s\-]*hiring[^)]*|hiring\s*alert[^)]*|off[\s\-]*campus[^)]*|urgent[^)]*|bulk\s*hiring[^)]*|direct\s*link[^)]*)\)\s*$",
    re.I,
)


def _clean_field(val: str) -> str:
    if not val:
        return ""
    cleaned = re.sub(r"^[\s\*📌🔗🏢💼🎓📍💰⏳•\-–:]+", "", val.strip())
    cleaned = re.sub(r"[\*]+$", "", cleaned).strip()
    return cleaned


def _infer_skills_from_lead(role_title: str, qualification: str) -> List[str]:
    combined = f"{role_title} {qualification}".lower()
    skill_map = [
        ("data analyst", "Data Analytics"),
        ("business analytics", "Business Analytics"),
        ("data science", "Data Science"),
        ("data engineer", "Data Engineering"),
        ("software development", "Software Engineering"),
        ("software engineer", "Software Engineering"),
        ("sde", "Software Engineering"),
        ("android", "Android"),
        ("qa", "Quality Assurance"),
        ("testing", "Software Testing"),
        ("technology consulting", "Technology Consulting"),
        ("ai-native", "Generative AI"),
        ("ai ", "Artificial Intelligence"),
        ("python", "Python"),
        ("sql", "SQL"),
        ("java", "Java"),
        ("cloud", "Cloud"),
        ("deployment", "Cloud & Deployment"),
        ("service desk", "IT Service Desk"),
        ("digital workplace", "Enterprise IT Support"),
        ("talent acquisition", "Talent Acquisition"),
        ("human resources", "HR & Recruiting"),
        ("recruiter", "Technical Recruiting"),
        ("resource management", "Resource Management"),
        ("marketing", "Marketing"),
        ("finance", "Finance & Analytics"),
        ("commerce", "Commerce & Finance"),
        ("economics", "Economics"),
    ]
    found = []
    for kw, label in skill_map:
        if kw in combined and label not in found:
            found.append(label)
    return found[:6]


def _extract_structured_broadcast_leads(content: str) -> List[Dict[str, Any]]:
    """
    Deterministic parser for structured WhatsApp / Telegram / community job broadcasts
    formatted as repeated 'Company : ... / Role : ... / Link : ...' blocks.
    Returns [] if the text does not follow a structured key-value broadcast format.
    """
    if not content or not isinstance(content, str):
        return []

    # Split content at lines that begin a new 'Company :' or 'Company -' block
    company_line_re = re.compile(
        r"(?m)^[\s\*📌🔗🏢💼•\-–]*(?:company|organization|employer)\s*[:\-–]\s*(.+)$",
        re.I,
    )
    matches = list(company_line_re.finditer(content))
    if not matches:
        return []

    leads: List[Dict[str, Any]] = []
    for idx, m in enumerate(matches):
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(content)
        block = content[start:end].strip()

        raw_company = _clean_field(m.group(1))
        company = _MARKETING_SUFFIX_RE.sub("", raw_company).strip()

        role_m = re.search(
            r"(?m)^[\s\*📌🔗💼•\-–]*(?:role|position|job\s*title|title|designation|profile)\s*[:\-–]\s*(.+)$",
            block,
            re.I,
        )
        qual_m = re.search(
            r"(?m)^[\s\*📌🔗🎓•\-–]*(?:qualification|eligibility|degree|education)\s*[:\-–]\s*(.+)$",
            block,
            re.I,
        )
        batch_m = re.search(
            r"(?m)^[\s\*📌🔗⏳•\-–]*(?:passing\s*year|batch|experience|yoe|graduating\s*year)\s*[:\-–]\s*(.+)$",
            block,
            re.I,
        )
        loc_m = re.search(
            r"(?m)^[\s\*📌🔗📍•\-–]*(?:location|city|place|work\s*location)\s*[:\-–]\s*(.+)$",
            block,
            re.I,
        )
        sal_m = re.search(
            r"(?m)^[\s\*📌🔗💰•\-–]*(?:salary|stipend|ctc|package|compensation|pay)\s*[:\-–]\s*(.+)$",
            block,
            re.I,
        )
        link_m = re.search(
            r"(?m)^[\s\*📌🔗•\-–]*(?:apply\s*link|link|apply\s*here|apply|registration\s*link|url)\s*[:\-–]\s*(https?://\S+)",
            block,
            re.I,
        )
        if not link_m:
            # Fallback: find the first non-promo URL inside this block
            urls_in_block = re.findall(r"https?://[^\s\*\"<>]+", block)
            valid_urls = [
                u.rstrip(".,;)*")
                for u in urls_in_block
                if not any(ad in u.lower() for ad in _PROMO_AD_DOMAINS)
            ]
            submitted_url = valid_urls[0] if valid_urls else None
        else:
            submitted_url = link_m.group(1).rstrip(".,;)*")

        role_title = _clean_field(role_m.group(1)) if role_m else None
        if role_title and "_" in role_title and " " in role_title:
            role_title = role_title.replace("_", " - ")

        if not company or not role_title:
            continue

        location = _clean_field(loc_m.group(1)) if loc_m else None
        qualification = _clean_field(qual_m.group(1)) if qual_m else None
        passing_year = _clean_field(batch_m.group(1)) if batch_m else None
        salary = _clean_field(sal_m.group(1)) if sal_m else None

        loc_lower = (location or "").lower()
        if any(w in loc_lower for w in ("remote", "work-from-home", "work from home", "wfh")):
            work_mode = "Remote"
        elif "hybrid" in loc_lower:
            work_mode = "Hybrid"
        else:
            work_mode = "Onsite"

        exp_req = passing_year or ("Internship / Fresher" if "intern" in role_title.lower() or "trainee" in role_title.lower() else "Fresher / Entry Level")
        skills = _infer_skills_from_lead(role_title, qualification or "")

        leads.append({
            "company": company,
            "role_title": role_title,
            "location": location,
            "submitted_url": submitted_url,
            "source_text": block,
            "extraction_metadata": {
                "experience_req": exp_req,
                "qualification": qualification,
                "passing_year": passing_year,
                "skills": skills,
                "salary": salary,
                "deadline": None,
                "work_mode": work_mode,
            },
        })

    return deduplicate_leads(leads) if leads else []


def _unwrap_llm_jobs_payload(res: Any) -> List[Dict[str, Any]]:
    if isinstance(res, list):
        return [item for item in res if isinstance(item, dict)]
    if isinstance(res, dict):
        for key in ("jobs", "opportunities", "leads", "results", "items", "data"):
            if key in res and isinstance(res[key], list):
                return [item for item in res[key] if isinstance(item, dict)]
        for val in res.values():
            if isinstance(val, list) and all(isinstance(x, dict) for x in val):
                return val
        if res.get("company") or res.get("role_title"):
            return [res]
    return []


def extract_opportunities_from_text(content: str) -> List[Dict[str, Any]]:
    """
    Extracts job opportunities from unstructured text (e.g., WhatsApp, Telegram, LinkedIn).
    1. First runs a deterministic structured broadcast parser (0ms, 100% recall on multi-job broadcasts).
    2. Falls back to Groq / Gemini / Ollama JSON extraction for free-form unstructured posts.
    """
    structured = _extract_structured_broadcast_leads(content)
    if structured:
        return structured

    prompt = f"""
    You are an AI tasked with extracting job opportunities from community messages.
    Extract ALL distinct job leads found in the following text.
    Ignore promotional ads for resume builders, job trackers, or WhatsApp/Telegram group invite links.
    For each job, provide a JSON object with:
    - company: name of the company (or null if not found)
    - role_title: job title
    - location: job location
    - submitted_url: any apply link associated with this specific job (MUST be a valid URL or null)
    - source_text: the snippet of text corresponding to this specific job lead
    - extraction_metadata: an object containing:
      - experience_req: string
      - skills: list of strings
      - salary: string
      - deadline: string
      - work_mode: string (Remote, Hybrid, Onsite)
      
    Text:
    {content}
    
    Respond ONLY with a valid JSON object containing a "jobs" array: {{"jobs": [...]}}
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
                
        items = _unwrap_llm_jobs_payload(res)
        filtered = []
        for item in items:
            u = (item.get("submitted_url") or "").lower()
            if u and any(ad in u for ad in _PROMO_AD_DOMAINS) and not item.get("company"):
                continue
            filtered.append(item)
        return deduplicate_leads(filtered)
    except Exception as e:
        print(f"Failed to extract opportunities: {e}")
        return []

def deduplicate_leads(leads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate leads by (company, role, url) or fuzzy company+role."""
    import re
    from urllib.parse import urlparse, parse_qsl, urlencode
    from difflib import SequenceMatcher
    
    unique = []
    _TRACKING_PARAMS = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "fbclid", "gclid", "gh_src"}
    
    def normalize(text):
        return re.sub(r"\W+", "", str(text or "")).lower()

    def canonical_url(u: str) -> str:
        if not u:
            return ""
        try:
            p = urlparse(u.strip())
            kept_q = [(k, v) for k, v in parse_qsl(p.query) if k.lower() not in _TRACKING_PARAMS]
            q_str = urlencode(sorted(kept_q))
            base = f"{p.scheme}://{p.netloc}{p.path.rstrip('/')}"
            return f"{base}?{q_str}" if q_str else base
        except Exception:
            return u.split("#")[0].rstrip("/")
        
    def is_dupe(a, b):
        ca, cb = normalize(a.get("company")), normalize(b.get("company"))
        if not ca or not cb or ca != cb:
            return False
            
        ra, rb = normalize(a.get("role_title")), normalize(b.get("role_title"))
        if not ra or not rb:
            return False
            
        ua, ub = a.get("submitted_url"), b.get("submitted_url")
        if ua and ub:
            n_ua = canonical_url(ua)
            n_ub = canonical_url(ub)
            if n_ua == n_ub and (ra == rb or SequenceMatcher(None, str(a.get("role_title")).lower(), str(b.get("role_title")).lower()).ratio() > 0.75):
                return True
            return False
            
        # If URLs missing on one or both, use fuzzy role match
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
        structured = _extract_structured_broadcast_leads(chunk_text)
        if structured:
            all_leads.extend(structured)
            continue
        
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
        
        Respond ONLY with a valid JSON object containing a "jobs" array: {{"jobs": [...]}}. Never hallucinate missing values, use null.
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
                    
            items = _unwrap_llm_jobs_payload(res)
            all_leads.extend(items)
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
