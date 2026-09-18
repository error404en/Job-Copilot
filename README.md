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
- [Security & Rate Limiting](#-security--rate-limiting)

---

## ✨ Features

JobCopilot is an end-to-end career management system featuring cutting-edge AI integrations and hardened security:

| Feature | Description |
|---|---|
| **Hermes Auto-Apply Agent** | Playwright-powered background agent for automating ATS data entry and job applications. |
| **Multi-Modal Copilot Coach** | Interactive chat interface featuring real-time token streaming (SSE), rolling context memory, and multi-modal support (upload PDFs & images for OCR via Gemini Vision). Configured with permissive guardrails for deep technical interview prep. |
| **Advanced Tailoring Studio** | Automatically generate AI-tailored `.docx` resumes optimized for ATS parsers, following strict formatting guidelines. Includes 1-page constraints and custom instruction support. |
| **JD Analysis & Match Scoring** | Paste any job description or URL. The AI extracts skills, pay, seniority, and remote status, scoring it 0–100 against your resume with an actionable verdict (Apply / Stretch / Skip). |
| **Screenshot Upload & OCR** | Upload a job screenshot. The platform uses Gemini Vision OCR to extract and instantly analyze the posting. |
| **Company Deep Dive & Discovery** | 3-tier discovery protocol: direct ATS API queries → ATS search → career page scraping to discover hidden roles. |
| **ATS Subscriptions** | Subscribe to Greenhouse, Lever, and Ashby boards to receive a daily digest of new roles matching your profile. LLM analysis is skipped during background scraping to prevent blocking. |

---

## 🏗️ Architecture & System Design

```text
Frontend (Next.js 16)
  +-- Proxy Rewrite (/api/*) ➔ Backend (FastAPI)
                                +-- Hermes Auto-Apply Agent (Playwright, async)
                                +-- JD Parser & Match Scorer (LLM, threadpool)
                                +-- Job Fetcher (Greenhouse/Lever/Ashby/Scraper)
                                +-- Multi-Modal Chat (SSE Streams + RAG + PyMuPDF)
                                +-- ATS Resume Generator (Docx)

LLM Waterfall (6 models for zero downtime):
  Gemini 2.0 Flash ➔ Gemini 1.5 Flash ➔ Gemini 1.5 Flash-8B
    ➔ llama-3.1-8b-instant ➔ llama3-70b-8192 ➔ mixtral-8x7b-32768

Data Layer (Supabase PostgreSQL):
  Jobs, Analyses, Resume Hashes, Chat History, Profile, Subscriptions
```

### Key Technical Innovations
- **Synchronous Threadpool Offloading**: To prevent main event-loop blocking, heavy DB queries and blocking LLM network requests are routed to synchronous `def` endpoints, seamlessly offloading work to FastAPI's external threadpool. Only non-blocking async Playwright operations use `async def`.
- **6-Model LLM Waterfall Engine**: Seamlessly falls back through Google Gemini and Groq models if rate limits or errors occur, ensuring 100% uptime.
- **Rolling Context Memory**: The chat backend intelligently slices context history (`history_res.data[-15:]`) alongside permanent RAG context to stay strictly within token limits without losing conversational awareness.
- **Smart ATS Background Task**: The background scraper `BackgroundTasks` processes bulk jobs synchronously but skips expensive LLM processing to prevent thread starvation.

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
| `CLERK_SECRET_KEY` | ✅ | Used to verify JWTs securely in middleware | Clerk Dashboard |
| `CLERK_PUBLISHABLE_KEY`| ✅ | Used by frontend | Clerk Dashboard |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GROQ_API_KEY` | ✅ | Groq API key (LLM fallback) | [Groq Console](https://console.groq.com/keys) |

### Frontend (`frontend/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | ❌ | Backend URL. Default: `http://localhost:8000` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ | Clerk public key |

---

## 🗄️ Supabase Database Setup

### Step 1: Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **Service Role Key** into `backend/.env`

### Step 2: Run SQL Migrations
Open **Supabase SQL Editor** and run each file in order (from `backend/supabase/migrations/` and `backend/`):
```text
# Base Schema
01_initial_schema.sql
02_seed.sql
03_add_application_data.sql
04_add_deadlines_bookmarks.sql
05_add_company_info.sql
06_add_personal_info.sql
07_add_ats_subscriptions.sql
08_add_user_auth.sql
09_add_chat_history.sql
10_add_resume_hash.sql
11_add_job_fields.sql

# Security & Permissions
14_phase3_db_security.sql     ➔ RLS Policies, FK cascades, and Auth validation
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

### Start the Frontend
```bash
cd frontend
npm run dev
```
- App running at: `http://localhost:3000`

---

## ☁️ Deployment

*Refer to `DEPLOYMENT.md` for full production deployment instructions.*

---

## 📚 API Reference

*Refer to `API_DOCS.md` for full API specifications.*

---

## 🛡️ Security & Rate Limiting
JobCopilot implements a robust defense-in-depth security model:
1. **Authentication vs Authorization:** Authentication is handled by Clerk via JWTs. However, the backend validates JWTs directly in middleware, extracting the `user_id`, and enforces strict Row-Level Security (RLS) policies on every database transaction to prevent IDOR (Insecure Direct Object Reference).
2. **SSRF Protections:** All outgoing network requests initiated by users (e.g., scraping a URL) are sanitized against private IP routing (e.g. `169.254.169.254`, `127.0.0.1`, RFC 1918 blocks) via `validate_safe_url()`.
3. **Global Rate Limiting:** `slowapi` enforces strict endpoint quotas (e.g. `5/minute` for LLM drafting, `20/minute` for chat) stored in-memory using an `InMemoryStorage` Redis-compatible backend.
4. **Cryptographic Deduplication:** Resumes are hashed (SHA-256) pre-upload to reject duplicate processing attempts globally per user.

---

*Built with Next.js 16, FastAPI, Supabase, Google Gemini, and Groq*
