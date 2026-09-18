# JobCopilot API Documentation

All backend endpoints are prefixed with `/api/` in the frontend and proxy to the FastAPI backend.
In local development, the frontend proxy forwards `/api/*` to `http://localhost:8000/*`.

## Base URLs
- **Frontend / Next.js**: `http://localhost:3000/api/`
- **Backend / FastAPI**: `http://localhost:8000/`

## Authentication
Every request to a protected endpoint must include an `Authorization: Bearer <token>` header containing a valid Clerk JWT. The backend uses the `Clerk-Secret-Key` to verify this JWT, decodes the `sub` (user_id), and enforces Row-Level Security on all database access.

---

## 1. Jobs API

### `GET /api/jobs`
Returns a list of all analyzed jobs for the authenticated user, complete with the AI match analysis.
- **Response Model**: `List[JobResponse]`
- **RLS**: Scoped to the authenticated user.

### `POST /api/jobs/parse`
Parses a raw text Job Description and scores it against the user's resume and profile.
- **Request Body**:
  ```json
  {
    "raw_jd": "Software Engineer... [text]",
    "source": "linkedin",
    "url": "https://linkedin.com/jobs/view/...",
    "use_groq": false
  }
  ```
- **Concurrency**: Handled synchronously by the external threadpool (`def`).
- **Rate Limit**: Default backend throttling.

### `POST /api/jobs/parse-image`
Extracts text from a screenshot using Gemini Vision and proceeds to parse and score the job.
- **Format**: `multipart/form-data`
- **Fields**: `file` (UploadFile)
- **Rate Limit**: 5 requests per minute.
- **Constraint**: Max 10MB image size, strict magic-byte validation.

### `GET /api/jobs/scrape-url`
Navigates to a given URL, attempts to extract the job description text, and scores it.
- **Query Params**: `url=string`
- **Security**: Strictly sanitized by `validate_safe_url()` against SSRF attacks. Blocks `169.254.169.254` and `127.0.0.1`.

### `GET /api/jobs/digest`
Returns the user's daily digest: jobs scraped from ATS subscriptions in the last 24 hours that passed the pay floor and were not rejected.

### `POST /api/jobs/{id}/application-draft`
Generates a customized AI cover letter and triggers the Hermes auto-apply prep.
- **Rate Limit**: 5 requests per minute.

---

## 2. ATS & Companies API

### `POST /api/jobs/fetch-ats`
Triggers a background worker to scrape one or more company careers pages.
- **Request Body**:
  ```json
  {
    "company_tokens": ["stripe", "discord"],
    "system": "greenhouse",
    "target_keywords": ["engineer", "developer"],
    "subscribe": true
  }
  ```
- **Concurrency**: Dispatched to `BackgroundTasks`. Uses `skip_analysis=True` to insert jobs quickly without exhausting LLM resources.

### `POST /api/research/company`
Performs a deep-dive analysis on a company, pulling background information and finding potential roles.
- **Rate Limit**: Default backend throttling.

---

## 3. Resumes API

### `POST /api/resumes/upload`
Uploads a user's resume (PDF) for parsing and matching.
- **Format**: `multipart/form-data`
- **Fields**: `file` (UploadFile)
- **Security constraints**: Max 5MB, strict PDF magic-byte validation (`%PDF-`).
- **Deduplication**: Hashes the file using SHA-256. If a matching hash already exists for the user, throws `409 Conflict`.
- **Rate Limit**: 10 requests per minute.

---

## 4. Chat API (Copilot Coach)

### `GET /api/chat/threads`
Lists the user's past chat conversations.

### `POST /api/chat/threads/{thread_id}/messages`
Sends a message to the AI Copilot Coach. Supports file attachments.
- **Format**: `multipart/form-data`
- **Fields**: 
  - `content`: `string`
  - `files`: `List[UploadFile]` (Max 3 files, 5MB each)
- **Response**: Server-Sent Events (SSE) stream returning markdown chunks in real-time.
- **Concurrency**: Executed as a synchronous generator on an external thread to prevent blocking the async event loop.
- **Rate Limit**: 20 requests per minute.

---

## 5. Applications (Hermes Agent)

### `POST /api/applications/auto-apply`
Triggers the Hermes background agent to attempt an automated form fill using `async_playwright`.
- **Request Body**:
  ```json
  {
    "url": "https://boards.greenhouse.io/...",
    "job_id": "uuid-here"
  }
  ```
- **Security**: The backend explicitly blocks bulk platforms (LinkedIn, Indeed, Glassdoor) even if this endpoint is called, restricting Hermes purely to approved ATS domains.
