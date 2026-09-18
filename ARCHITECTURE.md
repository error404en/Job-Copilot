# Architecture & System Design

JobCopilot's architecture balances real-time frontend responsiveness with heavy, blocking backend AI workloads. This document details the system design, concurrency model, and data security layer.

## System Diagram

```mermaid
graph TD
    User([User / Browser])
    NextJS[Frontend: Next.js 16 (Vercel)]
    FastAPI[Backend: FastAPI 0.115 (Render/Railway)]
    Clerk[Clerk Auth]
    Supabase[(Supabase PostgreSQL)]
    LLM[LLM Engine: Gemini / Groq]
    Playwright[Hermes / ATS Scrapers]

    User -->|Views UI / Submits Forms| NextJS
    User -->|Authenticates| Clerk
    NextJS -->|Proxies Requests| FastAPI
    FastAPI -->|Validates JWT & Applies RLS| Supabase
    FastAPI -->|Offloads Heavy Compute| LLM
    FastAPI -->|Spawns Background Agents| Playwright
```

---

## 1. Concurrency Model: Avoiding Event Loop Blocks

FastAPI runs on an asynchronous event loop (`asyncio`). However, both our database client (`supabase-py`) and our LLM generation clients (`google-genai`, `groq`) are inherently **synchronous** libraries that perform blocking network I/O.

### The "Synchronous Def" Pattern
To prevent a single long-running LLM generation from freezing the entire FastAPI server, we employ a strict concurrency pattern:

- **`async def`**: Used **only** for routes that are fully asynchronous end-to-end (e.g., triggering a Playwright browser via `async_playwright`). If a database query is required inside an `async def` route, it *must* be wrapped in `await asyncio.to_thread()`.
- **`def`**: Used for all heavy routes (e.g., `/api/jobs/parse`, `/api/chat/messages`, `/api/resumes/upload`). By defining the route with a standard `def`, FastAPI automatically offloads the execution to an external threadpool. This allows synchronous database queries and LLM text generation to block a single background thread while the main event loop continues serving other users concurrently.

### Background Task Limitations
For long-running loops (like `fetch_and_analyze_ats` which can iterate over 100+ jobs), we discovered that calling the synchronous LLM scorer inside the loop would tie up a threadpool worker for over an hour.
**Solution**: We introduced lazy evaluation (`skip_analysis=True`). Background scrapers dump raw job data directly into the DB and terminate quickly. LLM scoring is only invoked when the user explicitly interacts with that job in the UI.

---

## 2. Authentication vs Authorization

JobCopilot strictly separates *who you are* (AuthN) from *what data you can access* (AuthZ) to prevent Insecure Direct Object Reference (IDOR) vulnerabilities.

### Authentication (Clerk)
- The Next.js frontend uses Clerk to handle OAuth, sessions, and JWT minting.
- The FastAPI backend uses custom middleware (`app/middleware/auth.py`) to cryptographically verify the incoming Clerk JWT against the `CLERK_SECRET_KEY`.
- The middleware extracts the `user_id` and passes it via `Depends(get_current_user)`.

### Authorization (Supabase RLS)
- The backend uses the `SUPABASE_SERVICE_ROLE_KEY` to interact with the database. **Wait, using the service role bypasses RLS!**
- *Correction*: To enforce data isolation, the backend manually scopes *every single query* to the authenticated user.
  - Example: `supabase.table("jobs").select("*").eq("user_id", user_id).execute()`
- **Database-Level Protection**: Phase 3 DB Security introduced strict RLS policies directly in PostgreSQL. Even if the backend logic accidentally forgot the `.eq("user_id", user_id)` clause, the RLS policy acts as a hard failsafe. We simulate the user context in the backend using set_config if necessary, or rely on the mandatory `user_id` column constraints.

---

## 3. Data Integrity & Security

### Cryptographic Deduplication
Every resume uploaded is hashed using SHA-256 before processing.
1. The hash is compared against `resume_versions.file_hash`.
2. If a match is found, the upload is instantly rejected (HTTP 409 Conflict).
3. This saves expensive LLM OCR tokens, DB storage, and prevents user confusion.

### SSRF Protection
The application allows users to paste arbitrary URLs for JD scraping. To prevent an attacker from port scanning our internal VPC or hitting cloud metadata endpoints (`169.254.169.254`), all outgoing requests pass through `validate_safe_url()`. This resolves the DNS to an IP and strictly blocks any RFC 1918 private/loopback subnets.

### Multi-Model Fallback Engine
To achieve zero-downtime, the `llm_client.py` implements a waterfall pattern:
1. `gemini-2.0-flash` (Primary, via `google-genai` SDK)
2. `gemini-1.5-flash` (Fallback 1)
3. `gemini-1.5-flash-8b` (Fallback 2)
4. `llama-3.1-8b-instant` (Fallback 3, via Groq for high-speed inference)
5. `llama3-70b-8192` (Fallback 4)
6. `mixtral-8x7b-32768` (Fallback 5)

If a rate limit (HTTP 429) or model outage occurs, the engine automatically catches the exception and retries the prompt on the next model in the chain.

---

## 4. Hermes Auto-Apply Agent (Phase 8 Extension)
Hermes is a background agent built with `async_playwright`.
- **Purpose**: Dynamically parses a job application form, compares required fields against the user's `profile` and `resume_versions`, and attempts to draft/autofill application structures.
- **Safety**: Out-of-scope bulk scraping domains (LinkedIn, Indeed, Glassdoor) are strictly blocked at the architectural level. The agent operates exclusively on direct ATS career pages (Greenhouse, Lever, etc.). It does not auto-submit without user verification.
