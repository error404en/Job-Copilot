# JobCopilot Deployment Guide

This guide details the production deployment process for the current JobCopilot architecture. 

**Current Production Stack:**
- **Frontend**: Vercel (Next.js)
- **Backend**: Railway (FastAPI)
- **Database**: Supabase (PostgreSQL)

---

## 1. Supabase (Database Layer)

JobCopilot relies on Supabase for data persistence and Row-Level Security (RLS).

### Setup
1. Create a new project at [Supabase](https://supabase.com).
2. Navigate to **Project Settings -> API** and copy:
   - Project URL
   - `service_role` secret (Do **not** use the `anon` key in the backend).
3. Open the **SQL Editor** in the Supabase dashboard and run all migration files from the `backend/supabase/migrations/` directory in sequential order (01 through 14).
4. *Crucial*: Migration `14_phase3_db_security.sql` applies strict RLS policies. Do not skip this migration or the application will be vulnerable to IDOR attacks.

---

## 2. Clerk (Authentication Layer)

JobCopilot uses Clerk for managing users, sessions, and JWTs.

### Setup
1. Create a new application at [Clerk Dashboard](https://dashboard.clerk.com).
2. Configure **Email/Password** as the primary authentication method.
3. Navigate to **API Keys** and copy:
   - Publishable Key (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`)
   - Secret Key (`CLERK_SECRET_KEY`)

---

## 3. Render / Railway (Backend Layer)

FastAPI is deployed on Render / Railway for reliable execution of background tasks and HTTP endpoints.

### Environment Variables
In your Render/Railway project settings, configure the following variables:

| Variable | Description | Recommended (512MB RAM) |
|---|---|---|
| `SUPABASE_URL` | From Supabase Project Settings | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase Project Settings | Required |
| `CLERK_SECRET_KEY` | Used to verify JWTs in backend middleware | Required |
| `GEMINI_API_KEY` | Primary LLM Key | Required |
| `GROQ_API_KEY` | Fallback LLM Key | Required |
| `ALLOWED_ORIGINS` | Comma-separated list of frontend URLs | `https://job-copilot-gold.vercel.app` |
| `ENABLE_PLAYWRIGHT` | Enables headless browser scraping | `false` on 512MB RAM tiers (fast HTTP scraper runs automatically at <5MB RAM) |
| `ENABLE_BACKGROUND_SCRAPING` | Runs 4h automated web scraping | `false` on 512MB Web instances (keeps web process lean) |
| `ENABLE_BACKGROUND_SCHEDULER` | Runs APScheduler in background | `true` (manages keep-alive and atomic scoring) |

### Start Command
Always use a single uvicorn worker on 512MB RAM tiers:
```bash
uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1
```

### Memory Optimization Architecture
1. **Fast HTTP Scraper (<5MB RAM)**: 95% of job pages and ATS portals are fetched in <300ms using `requests` + `BeautifulSoup` + JSON-LD extraction, avoiding Chromium execution entirely.
2. **Constrained Chromium Fallback**: If Playwright runs, it launches in single-process mode (`--single-process`, `--no-sandbox`, `--disable-dev-shm-usage`, `--js-flags=--max-old-space-size=128`) with media/image assets blocked.
3. **Deterministic Cleanup**: All browser instances and PDF streams are guaranteed closed in `finally:` blocks followed immediately by `gc.collect()`.
4. **Health Diagnostics**: The `/health` endpoint exposes real-time `max_rss_mb` and enforces GC if memory pressure exceeds 350MB.

---

## 4. Vercel (Frontend Layer)

The Next.js 16 frontend is deployed on Vercel.

### Environment Variables
In your Vercel project settings, configure:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | The public Railway URL (e.g., `https://your-backend.railway.app`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | From Clerk Dashboard |

### Deployment Steps
1. Import the GitHub repository into [Vercel](https://vercel.com).
2. Set the **Root Directory** to `/frontend`.
3. Vercel will automatically detect the Next.js framework.
4. Click **Deploy**.
5. Once deployed, ensure your new Vercel domain is added to the `ALLOWED_ORIGINS` on the Railway backend.
