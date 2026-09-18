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

## 3. Railway (Backend Layer)

FastAPI is deployed on Railway for reliable execution of background tasks and long-running HTTP endpoints.

### Environment Variables
In your Railway project settings, configure the following variables:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | From Supabase Project Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase Project Settings |
| `CLERK_SECRET_KEY` | Used to verify JWTs in backend middleware |
| `GEMINI_API_KEY` | Primary LLM Key |
| `GROQ_API_KEY` | Fallback LLM Key |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend URLs (e.g., `https://your-frontend.vercel.app`) |

### Deployment Steps
1. Create a new project in [Railway](https://railway.app).
2. Deploy from your GitHub repository.
3. Under **Settings -> Root Directory**, enter `/backend`.
4. Railway will automatically detect the `requirements.txt` and install dependencies.
5. Provide a Custom Start Command in Railway Settings:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
6. Generate a public domain in the Networking tab (e.g., `https://your-backend.railway.app`).

### Playwright Requirements
Because the Hermes Agent uses Playwright, the backend environment requires system-level browser dependencies. If Railway fails to install Playwright browsers automatically, add a custom `railway.json` or `Dockerfile` to the `backend/` directory to run `playwright install --with-deps chromium`.

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
