# 🚀 JobCopilot — AI-Powered Job Application Platform

> The ultimate AI copilot for your career. Analyze job postings, score your resume match, track applications, prepare for technical interviews with a multi-modal AI coach, and deploy an auto-apply agent—all in one unified platform.

![Stack](https://img.shields.io/badge/Next.js-16-black?logo=next.js) ![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi) ![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase) ![Gemini](https://img.shields.io/badge/Gemini-Vision-4285F4?logo=google) ![Groq](https://img.shields.io/badge/Groq-LLaMA_3-F55036)

---

## 📖 Table of Contents

- [Features](#-features)
- [Architecture & System Design](#-architecture--system-design)
- [Local Development Setup](#-local-development-setup)
- [Environment Variables](#-environment-variables)
- [Supabase Database Setup](#-supabase-database-setup)
- [Running the App](#-running-the-app)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Contributing](#-contributing)

---

## ✨ Features

JobCopilot has evolved into a complete, end-to-end career management system featuring cutting-edge AI integrations:

| Feature | Description |
|---|---|
| **Hermes Auto-Apply Agent** | AI agent capable of structuring applicant data and automating aspects of the application process dynamically. |
| **Multi-Modal Copilot Coach** | Interactive chat interface featuring real-time token streaming (SSE), rolling context memory, and multi-modal support (upload PDFs & images for OCR via Gemini Vision). Configured with permissive guardrails for deep technical interview prep. |
| **Advanced Tailoring Studio** | Automatically generate AI-tailored `.docx` resumes optimized for ATS parsers, following strict formatting guidelines. Includes 1-page constraints and custom instruction support. |
| **Smart Resume Deduplication** | Employs SHA-256 cryptographic hashing to prevent redundant uploads, saving AI tokens and database storage. |
| **JD Analysis & Match Scoring** | Paste any job description or URL. The AI extracts skills, pay, seniority, and remote status, scoring it 0–100 against your resume with an actionable verdict (Apply / Stretch / Skip). |
| **Screenshot Upload & OCR** | Upload a job screenshot. The platform uses Gemini Vision OCR to extract and instantly analyze the posting. |
| **Company Deep Dive & Discovery** | 3-tier discovery protocol: direct ATS API queries → ATS search → career page scraping to discover hidden roles. |
| **ATS Subscriptions** | Subscribe to Greenhouse, Lever, and Ashby boards to receive a daily digest of new roles matching your profile. |
| **Modern 'Collect' UI** | A completely redesigned, premium frontend featuring an interactive AI Orb, status date pickers, horizontal-scroll fixes, and dynamic hover states for a native application feel. |

---

## 🏗️ Architecture & System Design

```text
Frontend (Next.js 16)
  +-- Proxy Rewrite (/api/*) ➔ Backend (FastAPI)
                                +-- Hermes Auto-Apply Agent
                                +-- JD Parser & Match Scorer (LLM)
                                +-- Job Fetcher (Greenhouse/Lever/Ashby/Scraper)
                                +-- Multi-Modal Chat (SSE Streams + RAG + PyMuPDF)
                                +-- ATS Resume Generator (Docx)
                                +-- APScheduler (Daily Digests)

LLM Waterfall (6 models for zero downtime):
  Gemini 2.0 Flash ➔ Gemini 1.5 Flash ➔ Gemini 1.5 Flash-8B
    ➔ llama-3.1-8b-instant ➔ llama3-70b-8192 ➔ mixtral-8x7b-32768

Data Layer (Supabase PostgreSQL):
  Jobs, Analyses, Resume Hashes, Chat History, Profile, Subscriptions
```

### Key Technical Innovations
- **Real-Time Streaming Engine**: Implements Server-Sent Events (SSE) combined with optimistic React Query updates and `TextDecoder` parsing to deliver instantaneous, Claude-parity chat experiences.
- **6-Model LLM Waterfall Engine**: Seamlessly falls back through Google Gemini and Groq models if rate limits or errors occur, ensuring 100% uptime.
- **Cryptographic File Management**: SHA-256 hashing on uploaded resumes instantly catches duplicates (HTTP 409) prior to expensive LLM processing.
- **Rolling Context Memory**: The chat backend intelligently slices context history (`history_res.data[-15:]`) alongside permanent RAG context to stay strictly within token limits without losing conversational awareness.

---

## 🛠️ Local Development Setup

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

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description | Where to get it |
|---|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role secret key | Supabase → Project Settings → API |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GROQ_API_KEY` | ✅ | Groq API key (LLM fallback) | [Groq Console](https://console.groq.com/keys) |
| `GEMINI_MODEL` | ❌ | Override primary Gemini model | Default: `gemini-2.0-flash` |
| `GEMINI_VISION_MODEL` | ❌ | Override vision model | Default: `gemini-2.0-flash` |
| `GROQ_MODEL` | ❌ | Override primary Groq model | Default: `llama-3.1-8b-instant` |
| `ALLOWED_ORIGINS` | ❌ | CORS origins (comma-separated) | Default: `http://localhost:3000` |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | ❌ | Backend URL. Default: `http://localhost:8000` |

---

## 🗄️ Supabase Database Setup

### Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **Service Role Key** into `backend/.env`

### Step 2: Run SQL Migrations
Open **Supabase SQL Editor** and run each file in order (from `backend/supabase/migrations/` and `backend/`):
```text
01_initial_schema.sql         ➔ Core tables (jobs, resumes, analyses)
02_seed.sql                   ➔ Creates initial profile row
03_add_application_data.sql
04_add_deadlines_bookmarks.sql
05_add_company_info.sql
06_add_personal_info.sql
07_add_ats_subscriptions.sql
09_add_chat_history.sql       ➔ Supports Copilot Coach rolling memory
10_add_resume_hash.sql        ➔ Supports smart resume deduplication
```

---

## 🚀 Running the App

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

## ☁️ Deployment

### Frontend ➔ Vercel
1. Push code to GitHub
2. Import the repo at [vercel.com](https://vercel.com) (set root to `frontend/`)
3. Add environment variable: `NEXT_PUBLIC_BACKEND_URL = https://your-backend.railway.app`
4. Deploy 🚀

### Backend ➔ Railway
1. New project at [railway.app](https://railway.app) → connect GitHub
2. Set root directory to `backend/`
3. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (Supabase URLs, Gemini/Groq API keys, Allowed Origins)
5. Deploy 🚀

---

## 📚 API Reference

All endpoints are prefixed with `/api/`. In development, they proxy through Next.js to `localhost:8000`.

### Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/jobs` | List all analyzed jobs with analyses |
| `POST` | `/api/jobs/parse` | Analyze a job description (text) |
| `POST` | `/api/jobs/parse-image` | Analyze from screenshot (multipart upload) |
| `GET` | `/api/jobs/scrape-url?url=` | Fetch and analyze from URL |
| `GET` | `/api/jobs/digest` | Top matches from last 24 hours |
| `POST` | `/api/jobs/{id}/application-draft` | Generate AI cover letter / trigger Hermes |
| `POST` | `/api/resumes/upload` | Upload PDF resume (SHA-256 hashed to prevent duplicates) |
| `POST` | `/api/chat/messages` | Multi-modal chat endpoint returning SSE stream (Supports images/PDFs) |
| `POST` | `/api/research/company` | Company deep dive (returns company info + discovered jobs) |

---

## 🤝 Contributing

1. Fork → clone → create branch (`feat/my-feature`)
2. Make changes, then verify backend imports are clean:
   ```bash
   cd backend
   python -c "import sys; sys.path.insert(0,'.'); from app.api import jobs, resumes, profile, research, chat; print('OK')"
   ```
3. Commit and open a PR.

### Strict Architectural Rules
- **LLM Abstraction**: All LLM calls must go through `llm_client.py` — never instantiate Gemini/Groq clients directly in endpoint logic.
- **Frontend Routing**: All frontend API calls must use the `/api/...` path. Never hardcode `localhost:8000` to ensure seamless Vercel deployment.
- **Database Migrations**: Any schema change must be accompanied by a sequentially numbered SQL migration file in the backend.

---

## 📜 License

MIT — free to use, fork, and build on.

---

*Built with Next.js 16, FastAPI, Supabase, Google Gemini, and Groq*
