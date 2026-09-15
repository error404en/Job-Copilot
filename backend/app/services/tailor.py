import json
import re
from app.services.llm_client import generate_tailoring_text
from pydantic import BaseModel
from typing import List, Dict, Optional

class TailoredBullets(BaseModel):
    bullets: List[str]

BANNED_WORDS = (
    "delve, dive, navigate, landscape, tapestry, thrilled, excited, passionate, honored, "
    "robust, dynamic, seamless, cutting-edge, unparalleled, testament to, pivotal, transformative, "
    "In today's fast-paced, Spearheaded, Synergized, —, -, em dash, comfortable with, "
    "translating ambiguous business and technical requirements"
)


def tailor_resume_bullets(resume_summary: str, jd_text: str, missing_keywords: List[str]) -> List[str]:
    """
    Generates 3-5 high-impact resume bullet points following Claude's technical guidelines:
    - Retains 100% of hard engineering facts, frameworks, model names, and metrics.
    - Opens every bullet with an authoritative engineering action verb.
    - Never dilutes technical achievements into vague business speak.
    - Strictly avoids keyword stuffing.
    """
    keywords_str = ", ".join(missing_keywords) if missing_keywords else "None"
    
    prompt = f"""
    You are an elite technical resume writer generating resume bullets that match the gold-standard quality of Claude.
    Your task is to rewrite 3-5 resume bullet points for a candidate targeting the provided job description.
    
    CLAUDE RESUME GUIDELINES (STRICT COMPLIANCE REQUIRED):
    1. ZERO TECHNICAL DILUTION:
       - You MUST retain all specific technologies, libraries, frameworks, and model architectures mentioned in the candidate's profile (e.g., PyTorch, YOLOv8n, Llama 4, Whisper, Inngest, Qdrant, FastAPI, Next.js, Docker).
       - NEVER generalize a technical achievement into vague corporate speak (e.g., NEVER turn "integrating Llama 4 Scout Vision and Groq Whisper" into "integrating vision and speech models").
    
    2. PRESERVE ALL CONCRETE METRICS VERBATIM:
       - Keep every parameter, speed metric, and volume figure exactly as given (e.g., "29M-parameter", "18-25 FPS across 80 categories", "sub-150ms vector search latency", "sub-50ms repeat-query latency", "1000-char chunking with 200-char overlap", "15+ REST APIs", "300+ technical documents").
       - Do NOT invent metrics, and do NOT delete or round existing metrics.
    
    3. AUTHORITATIVE ENGINEERING ACTION VERBS:
       - Every bullet MUST start with a strong technical action verb:
         "Engineered", "Architected", "Delivered", "Tuned", "Designed", "Built", "Cut", "Automated", "Created".
       - NEVER start with passive, administrative, or soft verbs like "Translated requirements", "Validated system outputs", "Assisted", "Worked on".
    
    4. NO KEYWORD STUFFING:
       - Missing JD keywords: {keywords_str}
       - If a keyword has a genuine technical counterpart in the candidate's work, weave it in naturally at most ONCE or TWICE.
       - NEVER force the same keyword repeatedly into consecutive bullets.
    
    5. STRUCTURE & CONCISENESS:
       - Follow the formula: [Action Verb] [Technical What / Architecture] [Measurable Metric / Latency / Scale].
       - Maximum 2 lines per bullet. High signal-to-noise ratio.
       - Never use: {BANNED_WORDS}
    
    Candidate's Actual Profile (source of truth):
    {resume_summary}
    
    Target Job Description (for vocabulary and priorities):
    {jd_text[:3000]}
    
    Return exactly 3 to 5 bullet points.
    """
    
    full_prompt = (
        f"{prompt}\n\n"
        f"You must return ONLY a raw, valid JSON object matching the following JSON schema. "
        f"Do NOT wrap it in markdown block quotes (no ```json ... ```). "
        f"Schema:\n{TailoredBullets.model_json_schema()}"
    )
    
    raw_response = generate_tailoring_text(full_prompt)
    
    try:
        raw_response = raw_response.strip()
        if raw_response.startswith("```json"):
            raw_response = raw_response[7:]
            raw_response = raw_response[:raw_response.rfind("```")]
        elif raw_response.startswith("```"):
            raw_response = raw_response[3:]
            raw_response = raw_response[:raw_response.rfind("```")]
            
        data = json.loads(raw_response.strip())
        return data.get("bullets", [])
    except Exception as e:
        print(f"[Tailor] Failed to parse tailored bullets JSON: {e}")
        return ["Failed to generate tailored bullets. Please try again."]


def generate_targeted_cover_letter(resume_summary: str, jd_text: str, role_title: str, company: str) -> str:
    """
    Generates a highly personalized, structurally unique cover letter using Llama 3.3 70B / Claude-level standard.
    """
    prompt = f"""
    You are writing a cover letter for a candidate applying for the '{role_title}' role at '{company}'.
    
    CRITICAL RULES:
    1. You must NEVER use any of the following words or phrases. If you use them, you fail:
       {BANNED_WORDS}
    2. Do NOT use the standard cover letter structure.
       - Do NOT start with "I am writing to express my interest in..." or "I am thrilled to apply for..."
       - Do NOT end with "In conclusion" or "I look forward to hearing from you."
    3. Start immediately with a strong, factual hook about a relevant technical achievement from the candidate's profile that perfectly matches the JD.
    4. Vary your sentence lengths. Keep it under 200 words.
    5. Be direct, professional, understated, and factual.
    
    Base Candidate Profile:
    {resume_summary}
    
    Target Job Description:
    {jd_text[:3000]}
    
    Return ONLY the body of the cover letter. Do not include subject lines, addresses, or placeholder names at the top/bottom.
    """
    
    response = generate_tailoring_text(prompt)
    return response.strip()


def _parse_json_response(raw: str) -> dict:
    """Strips markdown fences and parses JSON safely."""
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
        raw = raw[:raw.rfind("```")]
    elif raw.startswith("```"):
        raw = raw[3:]
        raw = raw[:raw.rfind("```")]
    return json.loads(raw.strip())


def tailor_professional_summary(original_summary: Optional[str], raw_content: str, jd_text: str, target_role: str = "") -> str:
    """
    Generates an authoritative 4-sentence summary following Claude's exact formula:
    Sentence 1: Education, CS specialization, and engineering pillars (backend, applied AI, full-stack).
    Sentence 2: Technology internship delivery at scale (APIs shipped, data/documents indexed, latency).
    Sentence 3: Portfolio breadth (from-scratch model training pipeline, multi-service systems).
    Sentence 4: Hard proficiencies (Python, JS/TS, DSA, OOP, modern practices) and explicit target role.
    """
    prompt = f"""
    You are an elite technical resume writer. Write a 4-sentence professional summary for this candidate
    targeting the role: '{target_role or "Software Engineer"}'.
    
    STRICT CLAUDE SUMMARY FORMULA (4 sentences total, dense and authoritative):
    - Sentence 1: Level/Degree + CS Specialization + core engineering pillars (e.g. "Final-year B.Tech (Computer Science specialization, Electronics & Communication Engineering) undergraduate with hands-on software engineering experience across backend systems, applied AI, and full-stack delivery.")
    - Sentence 2: Production internship highlight with concrete volume/scope (e.g. "During a technology internship, built and shipped 15+ production REST APIs while working cross-functionally to translate requirements into working systems.")
    - Sentence 3: Independent technical portfolio breadth (e.g. "Independently designed and delivered four additional full-stack projects, including a from-scratch model-training pipeline and a multi-service integration platform.")
    - Sentence 4: Core technical proficiencies + Target Role (e.g. "Proficient in Python, JavaScript/TypeScript, data structures & algorithms, OOP, and modern engineering practices (Git, CI/CD, testing). Seeking {target_role or 'Software Engineer'} roles.")
    
    ABSOLUTE RULES:
    - NEVER use hedging or weak phrases like "Comfortable with", "familiar with", or "seeking to learn".
    - NEVER use generic consulting fluff like "translating ambiguous business and technical requirements into working solutions" unless the target role is explicitly a consulting role.
    - Keep it strictly to 4 sentences. Dense, confident, and professional.
    - Never use: {BANNED_WORDS}
    
    Candidate's Resume Text:
    {raw_content[:4000]}
    
    Target Job Description:
    {jd_text[:2000]}
    
    Return ONLY the 4-sentence summary paragraph as plain text. No preambles, no quotes.
    """
    try:
        res = generate_tailoring_text(prompt).strip()
        # Clean stray quotes
        if res.startswith('"') and res.endswith('"'):
            res = res[1:-1].strip()
        return res
    except Exception as e:
        print(f"[Tailor] Summary tailoring failed: {e}")
        return original_summary or ""


def generate_tailored_resume_json(raw_content: str, jd_text: str, missing_keywords: List[str], one_page_only: bool = False, custom_instructions: str = "") -> Dict:
    """
    Two-pass LLM pipeline to generate a fully tailored resume JSON adhering to Claude's guidelines:
    
    Pass 1: Structure Extraction
      Parses raw resume text into clean JSON schema (name, contact, experience, projects, education, skills).
      Preserves all 4 projects and extracts clean GitHub links and metadata.
    
    Pass 2: Content & Bullet Tailoring (Anti-Dilution & High Technical Signal)
      - Generates an authoritative 4-sentence Claude-style summary.
      - Rewrites bullet points starting with active engineering verbs, preserving all technologies,
        model names (PyTorch, YOLOv8n, Whisper, Llama 4, Inngest), and quantitative metrics verbatim.
      - Ensures all 4 projects are retained (no project deletion).
    
    Returns a dict matching the docx_generator schema.
    """

    # ─────────────────────────────────────────────────────────
    # PASS 1: Parse raw resume text into structured JSON
    # ─────────────────────────────────────────────────────────
    parse_prompt = f"""
    You are a precise data-extraction assistant. Parse the following raw resume text
    and extract it into a clean JSON object. 
    
    RULES:
    - Extract ONLY information that is explicitly present in the text. 
    - Do NOT invent, infer, or fill missing values. If a field is missing, use null or an empty list.
    - Do NOT extract or include any phone numbers.
    - Explicitly prioritize extracting links for GitHub, LinkedIn, and any personal portfolio website.
    - For projects: "name" is the project name (e.g. "LitLens AI"), "tech" is the project repo link or key stack (e.g. "github.com/error404en/LitLensAI").
    - For "bullets" under experience/projects: copy the existing bullet points verbatim.
    - For "skills", split skills into:
      "languages": languages + core CS fundamentals (e.g. "Python, C++, JavaScript/TypeScript, SQL, DSA, OOP, DBMS, OS, Computer Networks, System Design")
      "frameworks": web/ML frameworks (e.g. "FastAPI, React, Next.js, Tailwind CSS, PyTorch, LangChain")
      "tools": tools and DevOps (e.g. "Git, GitHub, Docker, Postman, Linux/CLI, CI/CD")
      "databases": database systems (e.g. "PostgreSQL (Supabase), Qdrant")
    
    Return ONLY a raw JSON object (no markdown fences) matching this exact schema:
    {{
      "name": "string",
      "email": "string",
      "linkedin": "string",
      "github": "string",
      "portfolio_website": "string",
      "summary": "string or null",
      "experience": [
        {{
          "company": "string",
          "title": "string",
          "location": "string or null",
          "dates": "string",
          "bullets": ["string"]
        }}
      ],
      "projects": [
        {{
          "name": "string",
          "tech": "string",
          "bullets": ["string"]
        }}
      ],
      "education": [
        {{
          "institution": "string",
          "degree": "string",
          "dates": "string",
          "gpa": "string or null"
        }}
      ],
      "skills": {{
        "languages": "string",
        "frameworks": "string",
        "tools": "string",
        "databases": "string"
      }}
    }}
    
    Raw Resume Text:
    {raw_content[:6000]}
    """

    try:
        raw_parse = generate_tailoring_text(parse_prompt)
        resume_json = _parse_json_response(raw_parse)
    except Exception as e:
        print(f"[Tailor DOCX] Pass 1 (parse) failed: {e}")
        raise ValueError("Failed to parse resume structure. Please ensure your resume has clear section headings.")

    # ─────────────────────────────────────────────────────────
    # PASS 2: Tailor Professional Summary & Bullets
    # ─────────────────────────────────────────────────────────
    keywords_str = ", ".join(missing_keywords) if missing_keywords else "None"

    # Extract target role title from JD if available
    target_role = "Software Engineer"
    role_match = re.search(r"(Software Engineer|Backend Engineer|Full Stack Engineer|Data Engineer|Applied AI Engineer|AI/ML Engineer|Business Technology Analyst)", jd_text, re.IGNORECASE)
    if role_match:
        target_role = role_match.group(1)

    # 1. Tailor Summary to match Claude's 4-sentence formula
    tailored_summary = tailor_professional_summary(
        original_summary=resume_json.get("summary"),
        raw_content=raw_content,
        jd_text=jd_text,
        target_role=target_role
    )
    if tailored_summary:
        resume_json["summary"] = tailored_summary

    # 2. Ensure ALL projects are preserved without truncation
    # Cap bullets per project to 2-3 to guarantee a crisp 1-page fit
    for proj in resume_json.get("projects", []):
        if len(proj.get("bullets", [])) > 3:
            proj["bullets"] = proj["bullets"][:3]
    for exp in resume_json.get("experience", []):
        if len(exp.get("bullets", [])) > 3:
            exp["bullets"] = exp["bullets"][:3]

    # Collect all bullets into one indexed list
    all_bullets = []
    for i, exp in enumerate(resume_json.get("experience", [])):
        for b in exp.get("bullets", []):
            all_bullets.append({"section": "experience", "index": i, "original": b})
    for i, proj in enumerate(resume_json.get("projects", [])):
        for b in proj.get("bullets", []):
            all_bullets.append({"section": "projects", "index": i, "original": b})

    if not all_bullets:
        return resume_json

    bullets_input = json.dumps([item["original"] for item in all_bullets], indent=2)
    custom_rule = f"MANDATORY CUSTOM INSTRUCTIONS: {custom_instructions}" if custom_instructions else ""

    tailor_prompt = f"""
    You are an elite technical resume writer generating resume bullets that match the gold-standard quality of Claude.
    Rewrite the following resume bullet points to align with the target job description while strictly obeying Claude's writing guidelines.
    
    CLAUDE BULLET GUIDELINES (STRICT COMPLIANCE REQUIRED):
    1. ZERO TECHNICAL DILUTION:
       - You MUST preserve all specific tools, libraries, frameworks, model names, and architectures mentioned in each bullet (e.g. PyTorch, YOLOv8n, Llama 4, Groq Whisper, TinyStories, DistilBERT, Inngest, Qdrant, D3.js, FastAPI, Next.js, Supabase, Docker).
       - NEVER dilute engineering details into vague abstractions (e.g. NEVER replace "integrating Llama 4 Scout Vision and Groq Whisper" with "integrating vision and speech models"; NEVER replace "from-scratch 29M-parameter GPT-style transformer in PyTorch" with "built a FastAPI backend").
    
    2. CONCRETE METRICS VERBATIM:
       - Every metric and parameter must be preserved verbatim (e.g. "29M-parameter", "18-25 FPS across 80 categories", "sub-150ms vector search latency", "sub-50ms repeat-query latency", "1000-character chunking with 200-character overlap", "15+ REST APIs", "300+ technical documents").
       - Do NOT delete or round down metrics, and do NOT fabricate new ones.
    
    3. AUTHORITATIVE ENGINEERING ACTION VERBS:
       - Every bullet MUST begin with a decisive engineering action verb:
         "Engineered", "Architected", "Delivered", "Tuned", "Designed", "Built", "Cut", "Automated", "Created".
       - NEVER use passive or administrative verbs like "Translated requirements", "Validated system outputs", "Helped", "Assisted", "Worked on".
    
    4. NO KEYWORD STUFFING:
       - Target JD Keywords: {keywords_str}
       - If a keyword has a genuine architectural counterpart in the bullet, adapt framing naturally at most ONCE or TWICE across the entire resume.
       - NEVER repeatedly insert the same JD keyword into multiple consecutive bullets.
    
    5. FORMATTING & DENSITY:
       - Exactly 1 to 2 lines per bullet. Concise, high-density, action -> architecture -> metric.
       - Return EXACTLY the same number of bullets ({len(all_bullets)}), in the exact same order.
       - Never use: {BANNED_WORDS}
    {custom_rule}
    
    Input bullets (rewrite these, same count, same order):
    {bullets_input}
    
    Target Job Description:
    {jd_text[:2000]}
    
    Return ONLY a raw JSON array of strings. Example: ["bullet 1", "bullet 2", ...]
    """

    try:
        raw_tailor = generate_tailoring_text(tailor_prompt)
        tailored_bullets = _parse_json_response(raw_tailor)
        if not isinstance(tailored_bullets, list) or len(tailored_bullets) != len(all_bullets):
            print(f"[Tailor DOCX] Bullet count mismatch (got {len(tailored_bullets) if isinstance(tailored_bullets, list) else 'non-list'}, expected {len(all_bullets)}). Using original bullets.")
            tailored_bullets = [item["original"] for item in all_bullets]
    except Exception as e:
        print(f"[Tailor DOCX] Pass 2 (tailor) failed: {e}. Using original bullets.")
        tailored_bullets = [item["original"] for item in all_bullets]

    # Reinsert tailored bullets back into the structured JSON
    bullet_idx = 0
    for i in range(len(resume_json.get("experience", []))):
        original_count = len(resume_json["experience"][i].get("bullets", []))
        resume_json["experience"][i]["bullets"] = tailored_bullets[bullet_idx:bullet_idx + original_count]
        bullet_idx += original_count

    for i in range(len(resume_json.get("projects", []))):
        original_count = len(resume_json["projects"][i].get("bullets", []))
        resume_json["projects"][i]["bullets"] = tailored_bullets[bullet_idx:bullet_idx + original_count]
        bullet_idx += original_count

    return resume_json
