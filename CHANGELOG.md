# Changelog

This document tracks all major architectural changes, feature additions, and system overhauls within the JobCopilot ecosystem. It details the reasoning behind the changes ("Why") and the technical implementation details ("How").

---

## [v2.0.0] - Security & Performance Overhaul
### 1. Zero-Trust Security Hardening (Phases 1-8)
**Why:** The platform was vulnerable to Insecure Direct Object Reference (IDOR), Server-Side Request Forgery (SSRF), and DoS attacks via unbounded file uploads.
**How:**
- Implemented robust Row-Level Security (RLS) in Supabase via `14_phase3_db_security.sql`.
- Overhauled authentication to correctly decouple Clerk JWT AuthN from Supabase AuthZ.
- Added strict SSRF IP filters in `validate_safe_url()` to prevent internal VPC scanning via the JD scraper.
- Enforced cryptographic magic-byte checking and synchronous 5MB chunking for PDF/Image uploads.
- Introduced global IP/User-based rate limiting via `slowapi` on all endpoints.

### 2. Concurrency & Event Loop Optimization (Phase 9)
**Why:** The FastAPI server would lock up for all users when a single user ran a background ATS scrape or triggered a long LLM generation, due to synchronous IO blocking the main `asyncio` event loop.
**How:**
- Re-architected heavy endpoints (`chat.py`, `jobs.py`, `resumes.py`) from `async def` to `def`, successfully offloading blocking Supabase and LLM API calls to FastAPI's external threadpool.
- Wrapped necessary blocking DB calls inside persistent `async def` routes using `asyncio.to_thread`.
- Modified `fetch_and_analyze_ats` to lazy-load LLM scoring via `skip_analysis=True`, preventing thread starvation during bulk background scraping.
- Resolved React rendering cascades and hydration mismatches in the frontend (`AIOrb.tsx`, `CopilotCoach.tsx`).

---

## [v1.2.0] - 2026-09-15
### 1. Smart Resume Deduplication
**Why:** Users were wasting AI API tokens and cluttering the database by uploading the exact same resume multiple times. We needed a way to instantly identify exact duplicates.
**How:**
- Implemented SHA-256 cryptographic hashing in `backend/app/api/resumes.py` to generate a unique signature from the uploaded file's raw bytes before triggering the LLM parser.
- Added a `file_hash` column to the `resume_versions` table via the `10_add_resume_hash.sql` migration.
- Updated the backend to throw an `HTTP 409 Conflict` if the hash exists.
- Updated `frontend/app/resumes/page.tsx` to handle the 409 error natively using standard UI alerts.

### 2. Multi-Modal Copilot Coach (File & Image Support)
**Why:** Users needed the ability to ask the Coach about complex job postings (via screenshots) or specific external documents (PDFs) directly within the chat interface, similar to Claude's multi-modal capabilities.
**How:**
- Re-architected the `backend/app/api/chat.py` `/messages` endpoint from accepting `application/json` to accepting `multipart/form-data`.
- Integrated `PyMuPDF` (`fitz`) to extract raw text from PDF attachments and append it to the prompt.
- Integrated Gemini Vision as a fallback router to extract text from image attachments.
- Updated `CopilotCoach.tsx` on the frontend to support file attachment inputs and render previews using `FormData`.

### 3. Claude Parity Phase 1: Real-Time Token Streaming
**Why:** The chat interface felt sluggish. Users had to wait 5-10 seconds for the entire LLM generation to complete before seeing any text, unlike mainstream products which stream responses instantly.
**How:**
- Modified `backend/app/services/llm_client.py` to yield tokens incrementally via `generate_tailoring_text_stream` using the Groq API's `stream=True` flag.
- Converted the FastAPI endpoint in `chat.py` to return a `StreamingResponse` (Server-Sent Events).
- Refactored `sendMessageMutation` in `CopilotCoach.tsx` to utilize `TextDecoder` and manually parse the `data: ...` SSE chunks, optimistically updating the React Query cache to type out text in real-time.

### 4. Claude Parity Phase 2: Rolling Context Memory & Permissive Guardrails
**Why:** 
1. Long chat histories combined with heavily injected RAG context (Resume + Job Description) were hitting the Llama 3.3 token limits and crashing the API.
2. The AI was trapped in a "refusal loop", rejecting valid coding questions because it believed it was strictly a non-technical career coach.
**How:**
- **Rolling Context:** Sliced the Supabase chat history query in `chat.py` to `history_res.data[-15:]`, ensuring the LLM only ever sees the most recent 15 messages alongside the permanent RAG context.
- **Permissive Guardrails:** Updated the `system_prompt` to explicitly state: *"You are an Expert Senior Engineer... You MUST engage in deep, complex software engineering, coding, system design... if it serves the purpose of interview preparation."*
