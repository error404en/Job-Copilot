from app.services.inbox_extractor import extract_opportunities_from_text, extract_text_from_file, extract_batch_opportunities
from app.services.lead_resolver import resolve_lead, match_best_job, evaluate_lead_copilot_fit
from app.services.job_fetcher import fetch_workday_jobs, fetch_greenhouse_jobs, fetch_lever_jobs, fetch_ashby_jobs, fetch_smartrecruiters_jobs, fetch_generic_fallback
from app.models.inbox import InboxOpportunity, InboxOpportunityStatus, VerificationStatus, SourceType
from app.models.discovery import ATSInfo, ATSSystem
from app.db.supabase_client import supabase
from typing import List, Optional
import uuid
import datetime
import asyncio


ATS_FETCHERS = {
    ATSSystem.GREENHOUSE: fetch_greenhouse_jobs,
    ATSSystem.LEVER: fetch_lever_jobs,
    ATSSystem.ASHBY: fetch_ashby_jobs,
    ATSSystem.SMARTRECRUITERS: fetch_smartrecruiters_jobs,
    ATSSystem.WORKDAY: fetch_workday_jobs,
}


async def fetch_discovered_ats_jobs(ats_info: ATSInfo, role_title: str) -> List[dict]:
    """Use the canonical discovery result to delegate to an existing ATS adapter."""
    fetcher = ATS_FETCHERS[ats_info.system]
    return await asyncio.to_thread(fetcher, ats_info.token, target_keywords=[role_title])

async def process_inbox_source(source_id: str, content: str, source_type: SourceType, user_id: str) -> List[dict]:
    # 1. Extract raw text if it's a file
    if source_type not in (SourceType.TEXT, SourceType.URL, SourceType.WHATSAPP_EXPORT):
        # content contains the file_path in these cases
        extracted_text = extract_text_from_file(content, source_type.value)
        if not extracted_text or not extracted_text.strip():
            supabase.table("inbox_sources").update({"status": "failed", "raw_content": None}).eq("id", source_id).eq("user_id", user_id).execute()
            print(f"Extraction failed for source {source_id}")
            return []
        content = extracted_text
        
        # Persist the extracted text instead of the temp file path
        supabase.table("inbox_sources").update({"raw_content": content}).eq("id", source_id).eq("user_id", user_id).execute()

    # 2. Extract opportunities
    if source_type == SourceType.WHATSAPP_EXPORT:
        from app.services.whatsapp_parser import parse_export, chunk_messages
        # We assume `content` is already the raw bytes or text. Actually `content` is file_path for WHATSAPP_EXPORT as it's an upload!
        # Wait, if WHATSAPP is text, it will be handled by upload endpoint. The API must pass the raw content or path.
        # Let's adjust to read from file if needed.
        if isinstance(content, str) and (content.endswith(".txt") or content.endswith(".zip")):
            with open(content, "rb") as f:
                raw_bytes = f.read()
        else:
            raw_bytes = content.encode("utf-8") if isinstance(content, str) else content
            
        try:
            parsed = parse_export(raw_bytes, content if isinstance(content, str) else "")
            chunks = chunk_messages(parsed["messages"])
            extracted = extract_batch_opportunities(chunks)
        except Exception as e:
            supabase.table("inbox_sources").update({"status": "failed", "raw_content": None}).eq("id", source_id).eq("user_id", user_id).execute()
            print(f"WhatsApp Parse failed: {e}")
            return []
    else:
        extracted = extract_opportunities_from_text(content)
    
    results = []
    is_multi_batch = len(extracted) > 1
    sem = asyncio.Semaphore(4)

    async def _process_one(opp_data: dict) -> Optional[dict]:
        company = opp_data.get("company")
        role_title = opp_data.get("role_title")
        location = opp_data.get("location")
        submitted_url = opp_data.get("submitted_url")
        meta = dict(opp_data.get("extraction_metadata") or {})

        # Preserve per-lead source snippet if present
        source_text = opp_data.get("source_text") or content
        if opp_data.get("source_text"):
            meta["source_text"] = opp_data["source_text"]
        if opp_data.get("source_timestamp"):
            meta["source_timestamp"] = opp_data.get("source_timestamp")
        if opp_data.get("source_sender"):
            meta["source_sender"] = opp_data.get("source_sender")

        # 3. Resolve Lead and apply Trust Gates
        if is_multi_batch:
            async with sem:
                resolution = await asyncio.to_thread(resolve_lead, company, role_title, location, submitted_url, source_text)
        else:
            resolution = resolve_lead(company, role_title, location, submitted_url, source_text)

        status = resolution["status"]
        verification_status = resolution["verification_status"]
        verified_url = resolution["verified_url"]
        relevance_explanation = resolution["relevance_explanation"]
        confidence = resolution["confidence"]
        ats_info = resolution.get("ats_info")
        official_url = resolution.get("official_url")
        final_submitted_url = resolution.get("final_submitted_url")
        extracted_jd = resolution.get("extracted_jd")

        meta["resolver_confidence"] = confidence
        if extracted_jd:
            meta["extracted_jd"] = extracted_jd[:3000]

        copilot_eval = evaluate_lead_copilot_fit(
            company or "",
            role_title or "",
            meta.get("qualification") or "",
            source_text or "",
        )
        meta["copilot_fit"] = copilot_eval["copilot_fit"]
        meta["copilot_score"] = copilot_eval["copilot_score"]
        meta["copilot_reason"] = copilot_eval["copilot_reason"]

        if copilot_eval["copilot_fit"] == "off_target":
            relevance_explanation = copilot_eval["copilot_reason"]

        linked_job_id = None

        # 4. Shared Job Discovery V2 Pipeline Handoff (Only if eligible and not off-target in multi-batch)
        should_promote = status != InboxOpportunityStatus.INELIGIBLE and bool(company)
        if is_multi_batch and copilot_eval["copilot_fit"] != "high_fit":
            should_promote = False

        if should_promote:
            try:
                best_job = None
                if extracted_jd and verification_status == VerificationStatus.VERIFIED:
                    best_job = {
                        "role_title": role_title,
                        "raw_jd": extracted_jd,
                        "source_type": ats_info.system.value if ats_info else source_type.value,
                        "source_confidence": confidence,
                        "url": verified_url or final_submitted_url,
                        "official_apply_url": verified_url or official_url,
                        "external_job_id": None,
                    }
                else:
                    jobs_found = []
                    if ats_info and not is_multi_batch:
                        jobs_found = await fetch_discovered_ats_jobs(ats_info, role_title)

                    if not jobs_found and not is_multi_batch:
                        # Generic fallback
                        fallback_url = official_url or final_submitted_url
                        if fallback_url:
                            jobs_found = await asyncio.to_thread(fetch_generic_fallback, fallback_url, company, target_keywords=[role_title])

                    if jobs_found:
                        # Use match_best_job instead of blindly taking [0]
                        best_job = match_best_job(jobs_found, role_title)
                    elif is_multi_batch and verification_status == VerificationStatus.VERIFIED and (verified_url or final_submitted_url):
                        best_job = {
                            "role_title": role_title,
                            "raw_jd": extracted_jd or source_text,
                            "source_type": ats_info.system.value if ats_info else source_type.value,
                            "source_confidence": confidence,
                            "url": verified_url or final_submitted_url,
                            "official_apply_url": verified_url or official_url,
                            "external_job_id": None,
                        }

                if best_job:
                    # ONLY auto-save and link if the lead is VERIFIED. Never auto-save unverified leads.
                    if verification_status == VerificationStatus.VERIFIED:
                        from app.services.job_pipeline import ParseRequest, process_and_store_job, run_instant_deterministic_analysis
                        from app.services.jd_parser import parse_job_description
                        req = ParseRequest(
                            raw_jd=best_job["raw_jd"],
                            source="inbox",
                            source_type=best_job.get("source_type") or source_type.value,
                            source_confidence=best_job.get("source_confidence", confidence),
                            url=best_job.get("url") or final_submitted_url,
                            official_apply_url=best_job.get("official_apply_url") or official_url,
                            external_job_id=best_job.get("external_job_id"),
                            company_name=company,
                            role_title=role_title,
                        )
                        if is_multi_batch:
                            pipeline_res = process_and_store_job(req, user_id=user_id, skip_analysis=True)
                            linked_job_id = pipeline_res.get("job_id")
                            if linked_job_id:
                                try:
                                    p_job = parse_job_description(req.raw_jd, use_groq=False, deterministic_only=True)
                                    p_job.company = company
                                    p_job.role_title = role_title
                                    run_instant_deterministic_analysis(linked_job_id, user_id, p_job, req.raw_jd)
                                except Exception:
                                    pass
                        else:
                            pipeline_res = process_and_store_job(req, user_id=user_id)
                            linked_job_id = pipeline_res.get("job_id")
                        if linked_job_id:
                            status = InboxOpportunityStatus.RELEVANT  # Mark as processed/relevant
                    else:
                        # Keep it in inbox, needs check.
                        meta["best_job_match"] = {
                            "title": best_job.get("role_title"),
                            "url": best_job.get("url")
                        }
            except Exception as e:
                print(f"V2 Handoff failed for {company} - {role_title}: {e}")

        opp_id = str(uuid.uuid4())
        record = {
            "id": opp_id,
            "user_id": user_id,
            "source_id": source_id,
            "company": company,
            "role_title": role_title,
            "location": location,
            "original_submitted_url": final_submitted_url or submitted_url,
            "verified_official_url": verified_url,
            "status": status.value,
            "verification_status": verification_status.value if verification_status else None,
            "job_id": linked_job_id,
            "extraction_metadata": meta,
            "relevance_explanation": relevance_explanation
        }

        try:
            supabase.table("inbox_opportunities").insert(record).execute()
            return record
        except Exception as e:
            # Handle unique constraint violations
            print(f"Skipping duplicate or failed opportunity insertion: {e}")
            return None

    if is_multi_batch:
        batch_records = await asyncio.gather(*(_process_one(opp) for opp in extracted))
        results = [r for r in batch_records if r is not None]
    else:
        for opp_data in extracted:
            rec = await _process_one(opp_data)
            if rec is not None:
                results.append(rec)
            
    # Mark source as completed - ALWAYS explicitly scope by user_id for security
    supabase.table("inbox_sources").update({"status": "completed"}).eq("id", source_id).eq("user_id", user_id).execute()
    
    return results
