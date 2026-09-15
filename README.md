# ?? JobCopilot — AI-Powered Job Application Platform

> Analyze job postings, score your resume match, track applications, and auto-discover roles — all in one place.

![Stack](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi) ![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase) ![Gemini](https://img.shields.io/badge/Gemini-AI-4285F4?logo=google) ![Groq](https://img.shields.io/badge/Groq-LLaMA-F55036)

---

## ?? Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Supabase Database Setup](#supabase-database-setup)
- [Running the App](#running-the-app)
- [Deployment](#deployment)
- [LLM Fallback System](#llm-fallback-system)
- [API Reference](#api-reference)
- [Contributing](#contributing)

---

## ? Features

| Feature | Description |
|---|---|
| **JD Analysis** | Paste any job description ? AI extracts skills, pay, seniority, remote type |
| **Resume Match Scoring** | 0–100 score against your resume + verdict (Apply / Stretch / Skip) |
| **Screenshot Upload** | Upload a job screenshot ? OCR via Gemini Vision ? instant analysis |
| **URL Scrape** | Paste a job URL ? auto-fetches and analyzes the posting |
| **Company Deep Dive** | 3-tier discovery: known ATS API ? ATS search ? careers page scrape |
| **ATS Subscriptions** | Subscribe to Greenhouse/Lever/Ashby boards ? daily digest of new roles |
| **Application Drafts** | AI-generated cover letters tailored to each role |
| **Dashboard** | All analyzed jobs with match scores, verdicts, apply links |
| **Daily Digest** | Top matches from the last 24h, sorted by score |
| **Resume Manager** | Upload multiple tailored resumes; AI extracts skills for matching |
| **Job Bookmarking** | Bookmark roles for later review |
| **Tailored Resume Generator** | Automatically generate AI-tailored .docx resumes for specific jobs |
| **Copilot Coach** | Interactive chat interface with full history for job application strategy and prep |

---

## ??? Architecture

```
Frontend (Next.js 16)
  +-- /api/* proxy rewrite ? Backend (FastAPI)
                                +-- JD Parser (LLM)
                                +-- Match Scorer (LLM)
                                +-- Job Fetcher (Greenhouse/Lever/Ashby/Scraper)
                                +-- Company Researcher (LLM + DDG)
                                +-- Application Prep (LLM)
                                +-- Scheduler (APScheduler — daily digest)

LLM Waterfall (6 models, never crashes):
  Gemini 2.0 Flash ? Gemini 1.5 Flash ? Gemini 1.5 Flash-8B
    ? llama-3.1-8b-instant ? llama3-70b-8192 ? mixtral-8x7b-32768

Data Layer:
  Supabase PostgreSQL (jobs, analyses, resumes, profile, subscriptions)
```

### Key Design Decisions

- **6-model LLM waterfall**: Falls through Gemini and Groq models automatically on rate limits or errors.
- **Next.js rewrite proxy**: All frontend calls go to `/api/*` — point `NEXT_PUBLIC_BACKEND_URL` to any backend URL without touching code.
- **3-tier job discovery**: Direct ATS API ? DDG search for ATS ? Generic careers page scrape + LLM extraction.

---

## ??? Local Development Setup

### Prerequisites

| Tool | Version |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| Git | Any |

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/apply-tool.git
cd apply-tool
```

### 2. Set Up the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env
# Then edit .env with your API keys (see Environment Variables below)
```

### 4. Set Up the Frontend

```bash
cd ../frontend
npm install
```

---

## ?? Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | ? | Supabase project URL | Supabase ? Project Settings ? API |
| `SUPABASE_SERVICE_ROLE_KEY` | ? | Service role secret key | Supabase ? Project Settings ? API |
| `GEMINI_API_KEY` | ? | Google Gemini API key | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GROQ_API_KEY` | ? | Groq API key (LLM fallback) | [Groq Console](https://console.groq.com/keys) |
| `GEMINI_MODEL` | ? | Override primary Gemini model | Default: `gemini-2.0-flash` |
| `GEMINI_VISION_MODEL` | ? | Override vision model | Default: `gemini-2.0-flash` |
| `GROQ_MODEL` | ? | Override primary Groq model | Default: `llama-3.1-8b-instant` |
| `ALLOWED_ORIGINS` | ? | CORS origins (comma-separated) | Default: `http://localhost:3000` |

**Example `backend/.env`:**
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
GEMINI_API_KEY=AIzaSy...
GROQ_API_KEY=gsk_...
```

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | ? | Backend URL. Default: `http://localhost:8000` |

---

## ??? Supabase Database Setup

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) ? New Project
2. Copy your **Project URL** and **Service Role Key** into `backend/.env`

### Step 2: Run SQL Migrations

Open **Supabase SQL Editor** and run each file in order:

```
backend/supabase/migrations/01_initial_schema.sql   ? Core tables (jobs, resumes, analyses)
backend/supabase/migrations/02_seed.sql             ? Creates initial profile row
backend/supabase/migrations/03_add_application_data.sql
backend/04_add_deadlines_bookmarks.sql
backend/05_add_company_info.sql
backend/06_add_personal_info.sql
backend/07_add_ats_subscriptions.sql
```

### Step 3: Verify Tables

After running, you should see these tables:

| Table | Purpose |
|---|---|
| `user_profile` | Preferences (pay floor, location, target roles) |
| `resume_versions` | Uploaded resumes with AI-extracted skills summary |
| `jobs` | Every analyzed job posting |
| `job_analyses` | Match scores, verdicts, keyword analysis per job |
| `application_drafts` | AI-generated cover letters |
| `applications` | Application status tracking |
| `ats_subscriptions` | Saved company ATS board subscriptions |

---

## ?? Running the App

### Start the Backend

```bash
cd backend
# Ensure venv is active
uvicorn main:app --reload --port 8000
```

- API running at: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### Start the Frontend

```bash
cd frontend
npm run dev
```

- App running at: `http://localhost:3000`

---

## ?? Deployment

### Frontend ? Vercel

1. Push code to GitHub
2. Import the repo at [vercel.com](https://vercel.com) (set root to `frontend/`)
3. Add environment variable:
   ```
   NEXT_PUBLIC_BACKEND_URL = https://your-backend.railway.app
   ```
4. Deploy ?

### Backend ? Railway

1. New project at [railway.app](https://railway.app) ? connect GitHub
2. Set root directory to `backend/`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   GEMINI_API_KEY=...
   GROQ_API_KEY=...
   ALLOWED_ORIGINS=https://your-app.vercel.app
   ```
5. Deploy ?

### Backend ? Render (Alternative)

1. New Web Service ? root: `backend/`
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Same environment variables as Railway

---

## ?? LLM Fallback System

Every AI call goes through a **6-model waterfall** — the system never crashes due to rate limits:

```
Primary chain (Gemini):
  gemini-2.0-flash ? gemini-1.5-flash ? gemini-1.5-flash-8b

Fallback chain (Groq — activates if all Gemini fail):
  llama-3.1-8b-instant ? llama3-70b-8192 ? mixtral-8x7b-32768
```

Vision/OCR uses only Gemini models (Groq has no vision API).

**Free tier limits:**
| Model | Requests/Day |
|---|---|
| Gemini 2.0 Flash | ~1,500 |
| Gemini 1.5 Flash | ~1,500 |
| Groq llama-3.1-8b-instant | ~14,400 |

For a personal or small-team app, free tiers are more than sufficient.

---

## ?? API Reference

All endpoints are prefixed with `/api/`. In development they go through the Next.js proxy to `localhost:8000`.

### Jobs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/jobs` | List all analyzed jobs with analyses |
| `POST` | `/api/jobs/parse` | Analyze a job description (text) |
| `POST` | `/api/jobs/parse-image` | Analyze from screenshot (multipart upload) |
| `GET` | `/api/jobs/scrape-url?url=` | Fetch and analyze from URL |
| `GET` | `/api/jobs/digest` | Top matches from last 24 hours |
| `GET` | `/api/jobs/{id}` | Get single job with analysis |
| `PATCH` | `/api/jobs/{id}` | Update job fields (e.g., add URL) |
| `DELETE` | `/api/jobs/{id}` | Delete a job |
| `PATCH` | `/api/jobs/{id}/bookmark` | Toggle bookmark |
| `POST` | `/api/jobs/{id}/application-draft` | Generate AI cover letter |
| `POST` | `/api/jobs/fetch-ats` | Fetch from Greenhouse/Lever/Ashby |
| `GET` | `/api/jobs/subscriptions/list` | List ATS subscriptions |
| `DELETE` | `/api/jobs/subscriptions/{id}` | Remove ATS subscription |

### Resumes

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/resumes` | List all uploaded resumes |
| `POST` | `/api/resumes/upload` | Upload PDF resume (multipart) |
| `DELETE` | `/api/resumes/{id}` | Delete a resume |

### Profile

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/profile` | Get preferences |
| `PUT` | `/api/profile` | Update preferences (pay floor, location, etc.) |

### Research

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/research/company` | Company deep dive — returns company info + discovered jobs |

**Request body for `/api/research/company`:**
```json
{
  "company_name": "Zepto",
  "target_keywords": "backend, python, data engineering"
}
```

---

## ?? Contributing

```bash
# Fork ? clone ? create branch
git checkout -b feat/my-feature

# Make changes, then verify backend imports are clean:
cd backend
python -c "import sys; sys.path.insert(0,'.'); from app.api import jobs, resumes, profile, research; print('OK')"

# Commit and open a PR
git commit -m "feat: add X feature"
git push origin feat/my-feature
```

### Rules
- All LLM calls must go through `llm_client.py` — never instantiate Gemini/Groq clients elsewhere.
- All frontend API calls must use `/api/...` path — never hardcode `localhost:8000`.
- New tables need a corresponding SQL migration file.

---

## ?? License

MIT — free to use, fork, and build on.

---

*Built with Next.js 16, FastAPI, Supabase, Google Gemini, and Groq*
