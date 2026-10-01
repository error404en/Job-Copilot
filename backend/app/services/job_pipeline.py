from datetime import datetime, timezone
from fastapi import BackgroundTasks, HTTPException
from app.db.supabase_client import supabase
from app.services.jd_parser import parse_job_description
from app.services.match_scorer import score_match
from app.api.profile import get_or_create_user_profile
from pydantic import BaseModel
from typing import Optional

class ParseRequest(BaseModel):
    raw_jd: str
    source: str = "manual"
    source_type: str = "manual"
    source_confidence: float = 0.0
    url: Optional[str] = None
    official_apply_url: Optional[str] = None
    external_job_id: Optional[str] = None
    company_name: Optional[str] = None
    role_title: Optional[str] = None
    use_groq: bool = False


def _pick_best_resume(resumes: list, role_title: str, required_skills: list = None, raw_jd: str = "") -> tuple:
    """
    Given a list of resume records, a job role title, required skills, and raw JD,
    intelligently computes a match affinity score for each resume and selects the
    optimal variant. When a user has multiple resumes for the same role family
    (e.g., multiple GenAI variants: Agentic vs Fine-Tuning vs RAG), this ranks
    them by direct technical skill overlap, title synergy, and domain fit.
    """
    if not resumes:
        return None, "Software Engineering Candidate."

    type_keywords = {
        "backend":   ["backend", "server", "api", "microservice", "distributed", "devops", "infrastructure"],
        "frontend":  ["frontend", "front-end", "react", "angular", "vue", "ui", "ux", "web dev"],
        "fullstack": ["fullstack", "full-stack", "full stack"],
        "genai":     ["ai", "ml", "machine learning", "llm", "genai", "nlp", "data science", "deep learning", "agent", "prompt", "rag"],
        "data":      ["data engineer", "data analyst", "analytics", "etl", "pipeline", "bi "],
        "product":   ["product manager", "product owner", "pm "],
        "design":    ["designer", "ux design", "ui design"],
    }

    role_lower = role_title.lower()
    skills_lower = [s.lower().strip() for s in (required_skills or []) if s]
    jd_lower = (raw_jd or "").lower()

    scored_resumes = []
    for r in resumes:
        score = 0
        r_type = (r.get("target_type") or "").lower()
        r_title = (r.get("title") or "").lower()
        r_skills = (r.get("skills_summary") or "").lower()
        r_raw = (r.get("raw_content") or "").lower()

        # 1. Target type alignment (+30 pts)
        expected_keywords = type_keywords.get(r_type, [])
        if any(kw in role_lower for kw in expected_keywords):
            score += 30

        # 2. Title token synergy (+20 pts)
        role_words = [w for w in role_lower.replace("/", " ").replace("-", " ").split() if len(w) > 2]
        title_hits = sum(1 for w in role_words if w in r_title)
        score += min(title_hits * 10, 20)

        # 3. Direct skill overlap (+50 pts)
        if skills_lower:
            skill_hits = sum(1 for s in skills_lower if s in r_skills or s in r_raw)
            score += min(skill_hits * 10, 50)
        else:
            # Check JD words in resume skills
            overlap_count = sum(1 for word in set(r_skills.split()) if len(word) > 3 and word in jd_lower)
            score += min(overlap_count * 2, 40)

        scored_resumes.append((score, r))

    # Sort descending by score; fall back to creation recency
    scored_resumes.sort(key=lambda x: x[0], reverse=True)
    best_resume = scored_resumes[0][1]

    resume_id = best_resume["id"]
    resume_text = best_resume.get("raw_content") or best_resume.get("skills_summary") or "Software Engineering Candidate."
    return resume_id, resume_text


def _run_analysis(job_id: str, user_id: str, parsed_job, raw_jd: str, use_groq: bool = False):
    """
    Synchronously runs the match scoring analysis and persists the result.
    Called either inline (for immediate /parse requests) or from background tasks.
    """
    try:
        # Mark job as running
        supabase.table("jobs").update({"analysis_status": "running"}).eq("id", job_id).execute()

        # Get user profile and resume — fetch full data including id and raw_content
        user_profile = get_or_create_user_profile(user_id)
        resumes_resp = supabase.table("resume_versions") \
            .select("id, title, target_type, skills_summary, raw_content") \
            .eq("user_id", user_id).order("created_at", desc=True).limit(15).execute()

        resumes = resumes_resp.data or []

        # Pick the best-matching resume by technical overlap & specialization
        req_skills = getattr(parsed_job, "required_skills", []) or []
        best_resume_id, best_resume_text = _pick_best_resume(resumes, parsed_job.role_title, req_skills, raw_jd)

        # Build a combined summary of all resumes for scoring context (LLM sees all types)
        if resumes:
            resume_summary = "\n".join(
                [f"[{r.get('target_type', 'general')}]: {r.get('skills_summary', '')}"
                 for r in resumes if r.get("skills_summary")]
            )
        else:
            resume_summary = "Software Engineering Candidate. Experience with Python, JavaScript/React, SQL, REST APIs, Git."

        # Run match scoring
        fit_report = score_match(parsed_job, user_profile, resume_summary, use_groq=use_groq)

        # Save analysis with the best-matched resume ID
        analysis_insert = {
            "job_id": job_id,
            "match_score": fit_report.match_score,
            "verdict": fit_report.verdict,
            "seniority_fit": fit_report.seniority_fit,
            "pay_floor_pass": fit_report.pay_floor_pass,
            "relocation_required": fit_report.relocation_required,
            "matched_keywords": fit_report.matched_keywords,
            "missing_keywords": fit_report.missing_keywords,
            "reasoning": fit_report.reasoning,
            "company_info": fit_report.culture_assessment,
            "recommended_resume_version_id": best_resume_id,
            "user_id": user_id,
        }
        supabase.table("job_analyses").insert(analysis_insert).execute()
        supabase.table("jobs").update({"analysis_status": "complete"}).eq("id", job_id).execute()
        print(f"[Pipeline] Analysis complete for job {job_id}: verdict={fit_report.verdict}, score={fit_report.match_score}, resume={best_resume_id}")

    except Exception as e:
        print(f"[Pipeline] Analysis failed for job {job_id}: {e}")
        try:
            supabase.table("jobs").update({"analysis_status": "failed"}).eq("id", job_id).execute()
        except Exception:
            pass


def process_and_store_job(req: ParseRequest, user_id: str, background_tasks: BackgroundTasks = None, skip_analysis: bool = False):
    """
    Shared business logic for parsing and persisting jobs.
    - For manual /parse calls (background_tasks provided): runs analysis inline immediately.
    - For bulk ATS ingestion (skip_analysis=True): saves job as pending; analysis worker picks it up later.
    """
    target_url = req.url.strip() if req.url else None

    # Auto-fetch full JD if raw_jd is just a placeholder/stub and a real HTTP URL is provided
    if (not req.raw_jd or len(req.raw_jd.strip()) < 350 or "[Extracted via" in req.raw_jd) and target_url and target_url.startswith("http"):
        try:
            from app.api.jobs import scrape_job_url
            scraped = scrape_job_url(target_url, user_id=user_id)
            if scraped and scraped.get("raw_jd") and len(scraped["raw_jd"]) > len(req.raw_jd or ""):
                req.raw_jd = scraped["raw_jd"]
                print(f"[Pipeline] Auto-fetched full JD from {target_url} ({len(req.raw_jd)} chars)")
        except Exception as se:
            print(f"[Pipeline] Could not auto-fetch full JD from URL {target_url}: {se}")

    # 1. Parse JD using best available model
    try:
        parsed_job = parse_job_description(req.raw_jd, use_groq=req.use_groq)
    except Exception as e:
        print(f"[Pipeline] JD parse failed, using minimal defaults: {e}")
        from app.models.job import ParsedJob
        parsed_job = ParsedJob(
            company=req.company_name or "Unknown Company",
            role_title=req.role_title or "Unknown Role",
            location="India",
            remote_type="unclear",
            required_skills=[],
        )

    # Override company name and role title if explicitly provided from verified/ATS source
    if req.company_name:
        parsed_job.company = req.company_name
    if req.role_title:
        parsed_job.role_title = req.role_title

    # 2. Validate job before storing
    resolved_url = target_url or parsed_job.apply_link or ""
    from app.services.job_validator import is_valid_job_posting
    is_valid, reason = is_valid_job_posting(
        role_title=parsed_job.role_title,
        url=resolved_url,
        company_name=parsed_job.company,
        raw_jd=req.raw_jd or "",
        external_job_id=req.external_job_id
    )
    if not is_valid:
        print(f"[Pipeline] Rejected invalid job '{parsed_job.role_title}' at '{resolved_url}': {reason}")
        return {"job_id": None, "is_duplicate": False, "is_rejected": True, "rejection_reason": reason}

    # 3. Save to DB
    job_insert = {
        "source": req.source,
        "source_type": req.source_type,
        "source_url": target_url,
        "official_apply_url": req.official_apply_url or resolved_url,
        "external_job_id": req.external_job_id,
        "source_confidence": req.source_confidence,
        "url": resolved_url,
        "company": parsed_job.company,
        "role_title": parsed_job.role_title,
        "raw_jd": req.raw_jd,
        "location": parsed_job.location,
        "remote_type": parsed_job.remote_type,
        "pay_min": parsed_job.pay_min,
        "pay_max": parsed_job.pay_max,
        "pay_currency": parsed_job.pay_currency,
        "pay_confidence": parsed_job.pay_confidence,
        "posting_date": parsed_job.posting_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "region_wise_salary": parsed_job.region_wise_salary,
        "deadline": parsed_job.deadline_date,
        "seniority_required": parsed_job.seniority_required,
        "required_skills": parsed_job.required_skills,
        "nice_to_have_skills": parsed_job.nice_to_have_skills,
        "user_id": user_id,
        "analysis_status": "pending",
    }

    try:
        job_resp = supabase.table("jobs").insert(job_insert).execute()
        job_id = job_resp.data[0]["id"]
    except Exception as e:
        err_str = str(e)
        if "duplicate key value" in err_str or "23505" in err_str:
            dedup_col = "external_job_id" if req.external_job_id else "url"
            dedup_val = req.external_job_id if req.external_job_id else resolved_url
            try:
                supabase.table("jobs").update({"last_seen_at": datetime.now(timezone.utc).isoformat()}) \
                    .eq("user_id", user_id).eq("source_type", req.source_type) \
                    .eq("company", parsed_job.company).eq(dedup_col, dedup_val).execute()
            except Exception as update_e:
                print(f"Failed to update last_seen_at for duplicate job: {update_e}")

            existing_id = None
            try:
                # Primary lookup matching full identity
                primary_res = supabase.table("jobs").select("id") \
                    .eq("user_id", user_id).eq("source_type", req.source_type) \
                    .eq("company", parsed_job.company).eq(dedup_col, dedup_val).execute()
                if primary_res.data:
                    existing_id = primary_res.data[0]["id"]
            except Exception as p_err:
                print(f"[Pipeline] Primary duplicate lookup error: {p_err}")

            # Fallback duplicate recovery without source_type constraint
            if not existing_id:
                try:
                    if resolved_url:
                        ex_res = supabase.table("jobs").select("id").eq("user_id", user_id).eq("url", resolved_url).limit(1).execute()
                        if ex_res.data:
                            existing_id = ex_res.data[0]["id"]
                    if not existing_id and parsed_job.company and parsed_job.role_title:
                        ex_res = supabase.table("jobs").select("id").eq("user_id", user_id).eq("company", parsed_job.company).eq("role_title", parsed_job.role_title).limit(1).execute()
                        if ex_res.data:
                            existing_id = ex_res.data[0]["id"]
                except Exception as find_err:
                    print(f"[Pipeline] Fallback duplicate recovery error: {find_err}")

            if existing_id:
                if not skip_analysis:
                    if background_tasks is not None:
                        background_tasks.add_task(_run_analysis, existing_id, user_id, parsed_job, req.raw_jd, req.use_groq)
                    else:
                        _run_analysis(existing_id, user_id, parsed_job, req.raw_jd, req.use_groq)
                return {"job_id": existing_id, "is_duplicate": True}
            return {"job_id": None, "is_duplicate": True}
        raise HTTPException(status_code=400, detail=f"Failed to insert job: {err_str}")

    # 3. Run analysis
    if not skip_analysis:
        if background_tasks is not None:
            # Non-blocking: let FastAPI run it after response is sent
            background_tasks.add_task(_run_analysis, job_id, user_id, parsed_job, req.raw_jd, req.use_groq)
        else:
            # Synchronous fallback (e.g. called from a scheduler/worker)
            _run_analysis(job_id, user_id, parsed_job, req.raw_jd, req.use_groq)

    return {"job_id": job_id, "is_duplicate": False}
