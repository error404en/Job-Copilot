# 🐞 JobCopilot — Complete Bug & Resolution Log

> **Purpose:** Detailed chronological and technical record of all bugs, crashes, and architecture issues encountered during development, cloud deployment (Vercel & Render), and extension integration — along with root causes, solutions, and prevention tips.

---

## 📑 Table of Contents
1. [Bug 01: Nested `.git` Repository in Frontend](#bug-01-nested-git-repository-in-frontend)
2. [Bug 02: Root `.gitignore` Blocking `frontend/lib`](#bug-02-root-gitignore-blocking-frontendlib)
3. [Bug 03: Vercel `NEXT_PUBLIC_` Environment Variable Block](#bug-03-vercel-next_public_-environment-variable-block)
4. [Bug 04: Edge Middleware Crash (`500 MIDDLEWARE_INVOCATION_FAILED`)](#bug-04-edge-middleware-crash-500-middleware_invocation_failed)
5. [Bug 05: Next.js SSR Error Boundary Crash (`ERROR 2719504037`)](#bug-05-nextjs-ssr-error-boundary-crash-error-2719504037)
6. [Bug 06: Clerk Multi-User Auth "Data Disappeared" Confusion](#bug-06-clerk-multi-user-auth-data-disappeared-confusion)
7. [Bug 07: Extension Token Expiration (`Backend error 401: Token has expired`)](#bug-07-extension-token-expiration-backend-error-401-token-has-expired)
8. [Bug 08: Extension Hardcoded Localhost Endpoints](#bug-08-extension-hardcoded-localhost-endpoints)
9. [Bug 09: Extension Popup Character Encoding (`ðŸ¤–` vs `🤖`)](#bug-09-extension-popup-character-encoding-ðÿ-vs-)
10. [Bug 10: Timezone False-Positive ("Analysis missing or failed")](#bug-10-timezone-false-positive-analysis-missing-or-failed)
11. [Bug 11: Missing Re-analyze & Delete Endpoints](#bug-11-missing-re-analyze--delete-endpoints)

---

### Bug 01: Nested `.git` Repository in Frontend
- **Symptom:** Vercel deployment returned 404 or couldn't detect Next.js framework preset; GitHub repo showed `frontend` as an empty folder or submodule icon.
- **Root Cause:** When `create-next-app` was initially executed inside the `frontend/` directory, it generated its own `.git` sub-repository. The parent git repository treated `frontend` as an uncommitted nested git repo and refused to track its files.
- **Fix:** 
  1. Deleted the hidden `frontend/.git` folder.
  2. Removed `frontend` from git cache: `git rm --cached frontend`.
  3. Re-added all frontend files to root git: `git add frontend/` and pushed to GitHub.
- **Takeaway:** Always remove nested `.git` directories when creating sub-projects inside a monorepo.

---

### Bug 02: Root `.gitignore` Blocking `frontend/lib`
- **Symptom:** Next.js production build failed on Vercel with `Module not found: Can't resolve '@/lib/useApiClient'`.
- **Root Cause:** The root `.gitignore` had a generic Python rule `lib/` intended for Python virtual environments. This unintentionally excluded `frontend/lib/` from being tracked by git.
- **Fix:** Removed the blanket `lib/` pattern from `.gitignore` and committed `frontend/lib/apiClient.ts`, `supabase.ts`, and `useApiClient.ts`.
- **Takeaway:** Use specific `.gitignore` rules (e.g., `venv/`, `.venv/`, `lib64/`) rather than broad folder names that collide with frontend conventions.

---

### Bug 03: Vercel `NEXT_PUBLIC_` Environment Variable Block
- **Symptom:** Vercel dashboard threw validation errors and prevented saving environment variables with the `NEXT_PUBLIC_` prefix when the type was selected as "Secret".
- **Root Cause:** Vercel security policy disallows marking `NEXT_PUBLIC_` variables as encrypted "Secrets" because variables prefixed with `NEXT_PUBLIC_` are explicitly intended to be baked into public client-side JavaScript bundles.
- **Fix:** Switched the environment variable type switch in Vercel to **"Config"** (the `< >` icon).
- **Takeaway:** In Next.js/Vercel, private keys (`CLERK_SECRET_KEY`) can be "Secret", but client-exposed keys (`NEXT_PUBLIC_*`) must be "Config" or "Plain text".

---

### Bug 04: Edge Middleware Crash (`500 MIDDLEWARE_INVOCATION_FAILED`)
- **Symptom:** Navigating to the live Vercel app crashed immediately with HTTP status `500 MIDDLEWARE_INVOCATION_FAILED`.
- **Root Cause:** 
  1. Initially, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` was missing in Vercel Edge Runtime, causing Clerk to throw `Missing publishableKey`.
  2. Attempting to pass keys directly as `clerkMiddleware({ publishableKey, secretKey })` made Clerk enter "Dynamic Key" mode, which strictly requires a `CLERK_ENCRYPTION_KEY` environment variable. Lacking this key, Clerk threw an uncaught exception on Edge workers.
- **Fix:** Reverted `frontend/middleware.ts` to the standard zero-argument export:
  ```typescript
  import { clerkMiddleware } from "@clerk/nextjs/server";
  export default clerkMiddleware();
  ```
  This automatically reads `process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` without triggering dynamic encryption requirements.
- **Takeaway:** Avoid passing inline options into `clerkMiddleware()`; allow it to read from environment variables natively.

---

### Bug 05: Next.js SSR Error Boundary Crash (`ERROR 2719504037`)
- **Symptom:** Browser displayed a black screen: *"This page couldn't load. A server error occurred. ERROR 2719504037"*.
- **Root Cause:** To stop the middleware from crashing in Bug 04, `frontend/middleware.ts` was renamed to `middleware.ts.disabled`. However, `@clerk/nextjs` Server Components and `<ClerkProvider>` strictly require `clerkMiddleware()` to process requests. Without middleware, SSR threw:
  `Error: Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()`.
- **Fix:** Restored `frontend/middleware.ts` and deleted the `.disabled` file.
- **Takeaway:** Never completely disable Clerk's middleware in Next.js App Router — the entire auth context relies on headers injected by the middleware.

---

### Bug 06: Clerk Multi-User Auth "Data Disappeared" Confusion
- **Symptom:** User saw *"No jobs found for this filter / Analyze your first job →"* on the newly deployed Vercel domain and feared all database records were wiped.
- **Root Cause:** The database contained 25 jobs, all tied to the user's Clerk ID (`user_3JAc1CetYlxL6He1C2hgocU9p76`). On the new Vercel domain, the browser was unauthenticated ("Signed Out"). Per the multi-tenant architecture (`enabled: isLoaded && !!isSignedIn`), the client does not query user jobs when signed out.
- **Fix:** Clicked **"Sign in"** on the live site with the same account. All 25 jobs immediately populated.
- **Takeaway:** Multi-tenant apps gated by user session cookies will always render empty states until the user logs into the specific domain.

---

### Bug 07: Extension Token Expiration (`Backend error 401: Token has expired`)
- **Symptom:** Extension popup failed with `Backend error 401: {"detail":"Token has expired"}`.
- **Root Cause:** `extension/popup.js` read the raw `__session` cookie from `http://localhost:3000`. Clerk session JWTs expire in **60 seconds**. When the web dashboard tab was idle or closed, the cookie expired. The extension sent this stale token to the backend, where `jwt.decode` threw `jwt.ExpiredSignatureError`.
- **Fix:** Created `extension/auth_helper.js`:
  1. Checks if a JobCopilot dashboard tab is open and executes `window.Clerk.session.getToken()`. Clerk's SDK automatically generates a fresh, unexpired token on demand.
  2. Inspects cookie expiration before sending (`exp * 1000 > Date.now()`).
  3. If expired, displays an **"Open JobCopilot Dashboard ↗"** button in the popup instead of an unhandled crash.
- **Takeaway:** Never rely on static cookie reads for short-lived JWTs in browser extensions; use the SDK's token refresh mechanism via tab execution.

---

### Bug 08: Extension Hardcoded Localhost Endpoints
- **Symptom:** Extension only communicated with `localhost:8000` and redirected to `localhost:3000`.
- **Root Cause:** URLs were hardcoded in `popup.js`, `background.js`, `capture.js`, and `auto_apply.js`.
- **Fix:** Added dynamic URL resolution in `auth_helper.js`:
  - Production backend: `https://job-copilot-ci8e.onrender.com`
  - Production frontend: `https://job-copilot-gold.vercel.app`
  - Graceful fallback to `http://localhost:8000` / `http://localhost:3000` when running locally.
  - Added production domains to `host_permissions` in `extension/manifest.json`.
- **Takeaway:** Centralize API and Dashboard endpoints in extensions into a shared config/helper file.

---

### Bug 09: Extension Popup Character Encoding (`ðŸ¤–` vs `🤖`)
- **Symptom:** Header text in the extension popup showed corrupted characters `ðŸ¤– JobCopilot`.
- **Root Cause:** `extension/popup.html` was missing `<meta charset="UTF-8">`, causing Chrome to parse Unicode emoji bytes as ISO-8859-1 / Windows-1252.
- **Fix:** Added `<meta charset="UTF-8">` to `popup.html` and updated styling to a sleek dark theme.
- **Takeaway:** Always include `<meta charset="UTF-8">` in every HTML document, especially Chrome extension popups containing emojis.

---

### Bug 10: Timezone False-Positive ("Analysis missing or failed")
- **Symptom:** When a job was submitted, the detail page immediately flashed *"Analysis missing or failed"* after just 1 second, even though the AI was still processing.
- **Root Cause:** Supabase returned the `fetched_at` timestamp as a UTC ISO string without a timezone suffix (e.g., `"2026-09-12T19:40:43"` without `Z`). When parsed in India (IST, UTC+5:30), `new Date(rawTime)` interpreted it as local Indian time (5.5 hours behind actual UTC). The timeout check:
  ```typescript
  (Date.now() - fetchedAt) > 5 * 60 * 1000
  ```
  evaluated to **330 minutes > 5 minutes (TRUE)** on the very first millisecond, prematurely rendering the error screen while the background task was still running on Render.
- **Fix:** 
  1. Updated `frontend/app/jobs/[id]/page.tsx` with safe UTC parsing:
     ```typescript
     const dateStr = rawTime.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(rawTime) 
       ? rawTime 
       : `${rawTime}Z`;
     ```
  2. Polling interval set to 2 seconds while analysis is running.
  3. Added **"🔄 Re-analyze Job"** and **"🗑 Delete Job"** buttons on timeout.
- **Takeaway:** Never parse database timestamps with `new Date()` without verifying whether a UTC timezone indicator (`Z` or `+00:00`) is attached.

---

### Bug 11: Missing Re-analyze & Delete Endpoints
- **Symptom:** Users had no way to retry analysis on existing jobs or delete obsolete jobs from the UI.
- **Root Cause:** Backend only supported creating new jobs via `/parse`, lacking dedicated retry or delete endpoints.
- **Fix:** Implemented in `backend/app/api/jobs.py`:
  - `POST /api/jobs/{job_id}/reanalyze`: Resets the timestamp, deletes previous partial analysis, and triggers a fresh LLM evaluation.
  - `DELETE /api/jobs/{job_id}`: Removes the job and cascaded analyses from Supabase.
- **Takeaway:** Every asynchronous AI processing pipeline must provide user-facing retry and deletion endpoints for recovery.

---

### Bug 12: New User Onboarding ('User profile not found in DB' & False 'Backend Offline')
- **Symptom:** When a new user (or second account) signed into JobCopilot and attempted to parse a job with the extension, the in-page button flashed `❌ Backend Offline` and popup failed with `User profile not found in DB`.
- **Root Cause:**
  1. No auto-provisioning existed for newly registered Clerk accounts in Supabase `user_profile`.
  2. `capture.js` caught all API/auth errors and displayed `❌ Backend Offline`, masking the real cause.
  3. If a new user hadn't uploaded a resume yet, `jobs.py` threw a 500 error instead of gracefully falling back.
- **Fix:**
  1. Added `get_or_create_user_profile()` in `backend/app/api/profile.py` to auto-provision default profiles on demand for any new Clerk user.
  2. Integrated auto-provisioning in `backend/app/api/jobs.py` `/parse` and `/reanalyze`.
  3. Made resume scoring gracefully fallback to a general candidate summary if no resume is uploaded yet.
  4. Updated `capture.js` to show contextual badges (`⚠️ Please Sign In`, `⚠️ Upload Resume First`, `❌ Backend Waking Up`) with full tooltip diagnostics.
  5. Re-compressed `JobCopilot_Extension.zip`.

---

## 📊 Summary Status

| Component | Status | Hosting Platform |
|---|---|---|
| **Frontend** | 🟢 Healthy | [Vercel](https://job-copilot-gold.vercel.app) |
| **Backend API** | 🟢 Healthy | [Render](https://job-copilot-ci8e.onrender.com) |
| **Database** | 🟢 Healthy (27 Jobs) | [Supabase](https://supabase.com) |
| **Chrome Extension** | 🟢 Healthy (v1.1) | Local Chrome unpacked |
| **Auth** | 🟢 Healthy | [Clerk](https://clerk.com) |
