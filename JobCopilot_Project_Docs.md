# JobCopilot — Project Documents
Following the 6-document structure (PRD → TRD → App Flow → UI/UX Brief → Backend Schema → Implementation Plan).
Paste this whole file at the start of your Antigravity conversation: "Here are my project documents. Use these as the source of truth for everything you build."

---

## 01 — PRD (Product Requirements Document)

**App name:** JobCopilot
**Tagline:** One inbox for every job posting, scored against your actual resume and goals — before you waste a click applying.

### The problem
Job-hunting off-campus means checking LinkedIn, Indeed, Glassdoor, and Naukri daily, most listings are irrelevant, and there's no fast way to tell if a posting is worth the 15 minutes it takes to tailor a resume and apply. Time gets wasted on postings that are underpaid, senior-level, or don't match actual skills — the same manual analysis has to be redone for every single listing.

### Who it's for
A single user: a final-year engineering student (graduating 2027) job-hunting for GenAI/backend/full-stack roles across India, applying off-campus, with a specific pay floor, location constraint (Delhi NCR/remote preferred), and a set of target company tiers already defined. This is a personal tool, not a multi-user product.

### Core value proposition
Every job posting gets the same rigorous fit analysis a careful human would do manually — pay floor check, seniority match, skill-gap scoring, relocation flag, goal alignment — automatically, in seconds, instead of 15+ minutes of manual reading and comparison per listing.

### Must Have (v1)
- Manually paste a job URL or raw JD text → get a full structured analysis
- Match score (0-100) against stored resume/skills profile
- Pay floor auto-reject (below ₹6L for NCR/remote roles)
- Seniority mismatch detection (flag when a JD wants 3+ yrs experience against a fresher profile)
- Relocation flag (onsite + non-NCR location)
- Plain-language verdict: Apply / Stretch / Skip, with reasoning
- Dashboard: list + detail view of all analyzed jobs
- Recommendation of which existing resume version fits best (genai / backend / llmops)

### Nice to Have (v2+)
- Browser extension to capture JD from a page you're already viewing (no bulk scraping)
- Application prep: draft cover letter + pre-filled form fields, human clicks submit
- Daily digest view (only jobs clearing the bar)
- Email digest delivery

### User stories
- As the user, I want to paste a job description and immediately see if it's worth pursuing, so I don't spend time reading it in full first.
- As the user, I want jobs under my pay floor auto-flagged as "skip," so I never waste time evaluating them further.
- As the user, I want to know which of my existing resume versions best fits a given posting, so I don't have to manually decide each time.
- As the user, I want a plain-language reason for every verdict, so I can override the tool's judgment when I disagree.

### Out of scope (explicit, non-negotiable)
- **No automated bulk scraping of LinkedIn, Indeed, Glassdoor, or Naukri search-results pages, ever, under any settings.** These platforms actively detect and ban accounts for this. The tool only ever reads a single job page the user is manually viewing/pasting — never crawls or harvests listings in bulk. This restriction is NOT toggleable.
- No multi-user accounts, auth system, or public deployment — this is a single-user personal tool.
- No mobile app in v1 — web dashboard + browser extension only.
- No payment processing or monetization features.

### Optional module: Auto-Apply (off by default, user-toggleable, NOT part of the core build)
Auto-apply (automated form submission on a company's own career page — e.g. Greenhouse/Lever-hosted pages) is a **separate, optional, explicitly opt-in module**. It is not wired into the core pipeline and must not be built as a dependency of any other feature. Requirements:
- **Default state: OFF.** The feature does not run unless the user has explicitly enabled it via a dashboard toggle (`user_profile.auto_apply_enabled`, default `false`).
- **Scope restriction: company career pages only (Greenhouse/Lever/custom ATS), never LinkedIn/Indeed/Glassdoor/Naukri.** Those platforms remain covered by the non-negotiable restriction above regardless of this toggle.
- **Per-site risk disclosure required in the UI** before the toggle can be enabled — show the user (this restates what's true, not a legal opinion): many ATS platforms and company career pages have their own Terms of Service that may prohibit automated submission, and some run their own bot-detection that can silently discard bot-submitted applications regardless of platform. Enabling this feature is the user's own informed choice per posting, not a default assumption.
- **Even when enabled, submission still requires a final human click** — this module auto-fills the form; it does not remove the human-confirm step. There is no fully-silent submission mode in this product, on any platform, at any setting.
- Build this module last, after everything else is working, and keep it in its own isolated code path that can be deleted entirely without affecting any other feature.

### Success metrics
- Every job the user manually pastes/captures gets a complete, accurate analysis within 10 seconds
- Pay-floor and seniority-mismatch false negatives are zero (a job that should be auto-rejected is never shown as "apply")
- Reduces per-listing manual evaluation time from ~15 minutes to under 1 minute of review

---

## 02 — TRD (Technical Requirements Document)

- **Frontend framework:** Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query — matches existing stack from LitLens AI project
- **Backend framework:** Python, FastAPI — matches existing stack from LitLens AI and internship work
- **Database:** PostgreSQL via Supabase (matches existing LitLens AI stack)
- **Authentication:** None required for v1 (single-user, local/personal deployment). If deployed publicly later: Supabase Auth.
- **Hosting/deployment:** Local development first; Vercel (frontend) + Railway or Fly.io (backend) if deployed. Supabase hosted Postgres either way.
- **Third-party APIs/services:**
  - Anthropic API (claude-sonnet-4-6) for JD parsing/extraction and match-report generation
  - No LinkedIn/Indeed/Glassdoor official API integration in v1 (manual paste / extension-capture only, per Out of Scope)
- **Browser extension:** Chrome/Edge, Manifest V3, TypeScript
- **Folder structure:**
  ```
  /backend
    /app
      /api          — FastAPI route definitions
      /services      — jd_parser.py, match_scorer.py, application_prep.py
      /models        — pydantic models
      /config        — resume_profile.py (user's actual resume/goals data)
      /db            — Supabase client, migrations
    main.py
  /frontend
    /app
      page.tsx                — dashboard
      /jobs/[id]/page.tsx      — job detail
      /jobs/new/page.tsx       — manual add form
      /digest/page.tsx         — v2, daily digest
    /components
    /lib               — TanStack Query hooks, API client
  /extension
    manifest.json
    /content-scripts    — per-site DOM extraction
    /popup
  ```
- **Environment variables needed:**
  - `ANTHROPIC_API_KEY`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (backend), `SUPABASE_ANON_KEY` (frontend)
  - `BACKEND_API_URL` (frontend + extension, points to local or deployed backend)
- **Hard constraints:**
  - No scraping libraries (Selenium/Playwright/BeautifulSoup) used against LinkedIn/Indeed/Glassdoor live pages in an automated/headless/background capacity
  - No auto-submit logic anywhere in the extension codebase

---

## 03 — App Flow (Navigation & User Journey Map)

### Screens
1. **Dashboard (`/`)** — list of all analyzed jobs as cards (company, role, score, verdict badge, pay range, location). Filter controls at top (verdict, source, remote type). Sort by score descending by default.
2. **Job Detail (`/jobs/[id]`)** — full Fit Report: score breakdown, matched/missing keywords (two columns), pay floor pass/fail, relocation flag, seniority fit, goal alignment note, reasoning paragraph, recommended resume version, link to original posting URL.
3. **Add Job (`/jobs/new`)** — form: paste raw JD text + optional source URL + source dropdown (LinkedIn/Indeed/Glassdoor/Naukri/Other). Submit triggers parse → analyze → redirect to detail page.
4. **Digest (`/digest`)** — v2. Today's jobs that cleared the bar (verdict = apply/stretch AND pay_floor_pass = true), separate from the full list.

### Navigation structure
Simple top nav: Dashboard | Add Job | Digest. No sidebar needed — this is a small, single-user tool, not a complex app.

### Entry point
User lands on Dashboard by default. Empty state (no jobs yet) shows a prominent "Add your first job" CTA pointing to `/jobs/new`.

### Auth flow
None in v1 — no login screen, straight to Dashboard on load.

### Key user journeys
1. **Paste-and-analyze:** Add Job → paste JD → submit → auto-redirect to Detail page showing the completed Fit Report.
2. **Daily review:** Dashboard → filter to verdict=apply → click into 2-3 top-scored jobs → decide to apply manually using the recommended resume version.
3. **Extension capture (v2):** Browsing LinkedIn → click "Analyze with JobCopilot" button injected on page → toast shows score → click toast to open Detail page in dashboard.

### Edge cases
- **Empty state:** No jobs analyzed yet → Dashboard shows CTA, not a blank list.
- **Parsing failure:** JD text too short/malformed to extract meaningful fields → show partial results with fields marked "unclear," never fail silently or crash.
- **Pay not disclosed:** Show "Pay not disclosed — estimate: ₹X-Y LPA (unverified)" rather than blank, matching how pay estimates were handled throughout manual job analysis in this conversation.
- **Duplicate job:** Same URL pasted twice → detect and show existing analysis instead of re-analyzing (unless user explicitly requests re-analysis).
- **Loading states:** Add Job form shows a spinner/progress indicator during the parse+analyze LLM calls (can take a few seconds) — never a frozen blank screen.

### Redirect logic
- Successful Add Job → redirect to `/jobs/[new_id]`
- Delete/archive a job (v2) → redirect to Dashboard

---

## 04 — UI/UX Design Brief

- **Overall aesthetic:** Minimal, information-dense, functional — closer to a spreadsheet-meets-dashboard than a consumer product. This is a personal tool used daily for quick decisions, not a showcase app.
- **Color palette:**
  - Background: white / very light grey (`#FAFAFA`)
  - Text: near-black (`#1A1A1A`)
  - Verdict colors: Apply = green (`#16A34A`), Stretch = amber (`#D97706`), Skip = red (`#DC2626`) — used as small badges, not full-card backgrounds, to keep density high
  - Accent: a single navy or slate accent color for links/buttons (`#1F3864`, matching resume branding for visual consistency across your personal materials)
- **Typography:** System font stack or Inter — clean, readable at small sizes since this is a data-dense dashboard. Headings slightly bold, body text regular weight, monospace for score numbers to aid quick scanning.
- **Component style:** Sharp-to-slightly-rounded corners (4-6px), flat design with subtle borders rather than heavy shadows — prioritize scan-ability over visual flourish.
- **Dark/light mode:** Light mode only for v1 — not worth the build time for a single-user tool.
- **Inspiration references:** Linear (information density, clean data tables), a basic admin dashboard/CRM aesthetic — not a marketing-site aesthetic.
- **Key UI patterns:** Cards for the job list, a two-column layout for matched/missing keywords on the detail page, badges for verdict/status, a simple table-like list rather than heavy visual cards if information density becomes a priority.
- **Mobile responsiveness:** Nice to have, not required for v1 — this will primarily be used on desktop during a focused daily job-search session.
- **Accessibility:** Standard contrast ratios (WCAG AA), readable font sizes (14px+ body) — no special accommodation needed beyond baseline good practice.

---

## 05 — Backend Schema (Data Model & Auth Architecture)

```sql
-- user_profile: single row, your standing preferences
CREATE TABLE user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_location TEXT NOT NULL DEFAULT 'Noida, Delhi NCR',
  remote_ok BOOLEAN DEFAULT true,
  pay_floor_ncr_remote INT DEFAULT 600000, -- in INR, annual
  pay_floor_other_cities JSONB DEFAULT '{}',
  target_roles TEXT[] DEFAULT '{}',
  target_tiers TEXT[] DEFAULT '{}',
  dream_companies TEXT[] DEFAULT '{}',
  graduation_date DATE,
  auto_apply_enabled BOOLEAN NOT NULL DEFAULT false, -- optional module toggle, off by default
  created_at TIMESTAMP DEFAULT now()
);

-- resume_versions: your existing tailored resumes
CREATE TABLE resume_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'genai' | 'backend' | 'llmops' | 'custom'
  title TEXT NOT NULL,
  skills_summary TEXT, -- flattened text used for match scoring
  created_at TIMESTAMP DEFAULT now()
);

-- jobs: every posting analyzed
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'linkedin' | 'indeed' | 'glassdoor' | 'naukri' | 'manual'
  url TEXT,
  company TEXT NOT NULL,
  role_title TEXT NOT NULL,
  raw_jd TEXT NOT NULL,
  location TEXT,
  remote_type TEXT, -- 'remote' | 'hybrid' | 'onsite' | 'unclear'
  pay_min INT,
  pay_max INT,
  pay_currency TEXT DEFAULT 'INR',
  pay_confidence TEXT, -- 'stated' | 'estimated' | 'unknown'
  seniority_required TEXT, -- 'fresher' | '0-2yr' | '2-5yr' | 'senior' | 'unclear'
  required_skills TEXT[],
  nice_to_have_skills TEXT[],
  fetched_at TIMESTAMP DEFAULT now(),
  UNIQUE(url) -- prevents duplicate analysis of the same posting
);

-- job_analyses: the Fit Report per job
CREATE TABLE job_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  match_score INT NOT NULL, -- 0-100
  matched_keywords TEXT[],
  missing_keywords TEXT[],
  pay_floor_pass BOOLEAN,
  relocation_required BOOLEAN,
  seniority_fit TEXT, -- 'good_fit' | 'stretch' | 'overqualified' | 'underqualified'
  goal_alignment_note TEXT,
  verdict TEXT NOT NULL, -- 'apply' | 'stretch' | 'skip'
  recommended_resume_version_id UUID REFERENCES resume_versions(id),
  reasoning TEXT,
  analyzed_at TIMESTAMP DEFAULT now()
);

-- application_drafts: v2, prepared (not submitted) application content
CREATE TABLE application_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  resume_version_id UUID REFERENCES resume_versions(id),
  cover_letter_text TEXT,
  generated_at TIMESTAMP DEFAULT now()
);

-- applications: tracks actual (human-confirmed) submissions
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  resume_version_id UUID REFERENCES resume_versions(id),
  status TEXT DEFAULT 'prepared', -- 'prepared' | 'confirmed_submitted' | 'rejected' | 'interview' | 'offer'
  applied_at TIMESTAMP,
  notes TEXT
);

-- Indexes for fast dashboard queries
CREATE INDEX idx_jobs_fetched_at ON jobs(fetched_at DESC);
CREATE INDEX idx_job_analyses_verdict ON job_analyses(verdict);
CREATE INDEX idx_job_analyses_job_id ON job_analyses(job_id);
```

- **Auth model:** None in v1 — single-user, no Row Level Security needed for local/personal use. If ever deployed multi-device with Supabase Auth, add a `user_id` column to every table and RLS policies scoping all reads/writes to `auth.uid()`.
- **Sensitive fields:** None requiring encryption — no payment info, no third-party credentials stored in the database (API keys live in environment variables, never in the DB).
- **File storage:** Resume PDFs/docx referenced by `file_path` — stored locally or in Supabase Storage, not inline in Postgres.
- **API endpoint list:**
  - `POST /api/jobs/parse` — parse raw JD text into structured `jobs` row
  - `POST /api/jobs/{id}/analyze` — run match scorer, create `job_analyses` row
  - `GET /api/jobs` — list all jobs with their latest analysis (filterable by verdict, source, remote_type)
  - `GET /api/jobs/{id}` — full detail (job + analysis)
  - `POST /api/jobs/{id}/application-draft` — v2, generate cover letter draft

---

## 06 — Implementation Plan (Step-by-Step Build Sequence)

### Phase 1: Project setup
- Repo structure (`/backend`, `/frontend`, `/extension` per TRD)
- Supabase project created, connection configured
- Environment variables set up (`.env.example` committed, real `.env` gitignored)
- **Done when:** backend boots with a working `/health` endpoint, frontend boots with a placeholder page, both can reach Supabase.

### Phase 2: Database schema and migrations
- Run the full schema from section 05 as a Supabase migration
- Seed `user_profile` with real data (pay floor ₹6L NCR/remote, target roles, dream companies, graduation date)
- Seed `resume_versions` with the three existing resume files (genai/backend/llmops) and their skills summaries
- **Done when:** all tables exist, `user_profile` and `resume_versions` are populated with real data, verifiable via a Supabase query.

### Phase 3: Core analysis engine (JD Parser + Match Scorer)
- Build `jd_parser.py` (Prompt 2 from prior plan) — LLM-based extraction, marks pay/seniority as estimated/unclear when not explicitly stated
- Build `match_scorer.py` (Prompt 3) — scoring logic including hard pay-floor and seniority-mismatch caps
- Test against 3-5 real job postings pasted manually via a test script (no UI needed yet)
- **Done when:** pasting a raw JD via a test script returns an accurate, honestly-reasoned Fit Report matching the quality of the manual analyses done earlier in this conversation.

### Phase 4: Dashboard UI
- Build Dashboard, Job Detail, Add Job pages per App Flow section 03
- Wire up TanStack Query against the FastAPI endpoints
- Apply UI/UX Design Brief (section 04) styling
- **Done when:** can paste a JD through the UI, see it analyzed, and browse/filter the job list — full end-to-end flow without touching the API directly.

### Phase 5: Daily digest / auto-filter
- Add `/digest` view: jobs from the last 24 hours where verdict != skip AND pay_floor_pass = true
- **Done when:** the digest view reliably excludes anything that should be auto-rejected (verified against the pay-floor and seniority test cases from Phase 3).

### Phase 6: Browser extension (capture only, no bulk scraping)
- Content script per site (LinkedIn/Indeed/Glassdoor/Naukri) with per-site DOM selectors
- "Analyze with JobCopilot" button injection, single-page capture only
- Explicit code comment guardrail against bulk/background scraping (per Out of Scope)
- **Done when:** clicking the button on a real job posting page correctly sends JD text to the backend and the toast shows the resulting score.

### Phase 7: Application prep (prepare-only, human-confirmed submit — core, always on)
- `application_prep.py`: cover letter draft generation
- Extension form-fill feature: pre-fills fields, never auto-clicks submit
- Explicit code comment guardrail against auto-submit
- **Done when:** a prepared application's cover letter and resume recommendation are reviewable in the dashboard, and the extension correctly pre-fills a real application form without submitting it.

### Phase 8: Auto-Apply module (optional, off-by-default, build last, isolated)
- Build as a self-contained module under `/extension/optional-modules/auto-apply/` and `/backend/app/services/auto_apply.py` — deletable without touching any other feature.
- Dashboard settings page with the `auto_apply_enabled` toggle (default off) and the risk-disclosure text (see PRD Optional Module section) shown before the toggle can be switched on.
- Scope restricted at the code level to career-page domains only (Greenhouse/Lever/custom ATS patterns) — the content script must explicitly exclude linkedin.com, indeed.com, glassdoor.com, naukri.com domains even if the toggle is on, since those remain covered by the non-negotiable restriction regardless of settings.
- ATS-platform feasibility reference (for the DOM-selector work):
  - Greenhouse, Lever: standard HTML forms, moderate-high auto-fill feasibility
  - Workday: complex multi-step JS forms, low feasibility, expect frequent breakage — deprioritize
  - iCIMS/SuccessFactors/custom: unpredictable, build selectors per-company as needed rather than generically
- Still requires human final click on Submit — no exceptions, no "fully automated" setting exists in this product.
- **Done when:** the toggle correctly gates the feature end-to-end, the module can be fully disabled/removed without breaking Phases 1-7, and the domain exclusion for LinkedIn/Indeed/Glassdoor/Naukri is verified even with the toggle enabled.

**Realistic priority order given competing time demands (SLM major project + job search itself):** Phases 1-5 deliver full standalone value — paste, score, filter, review. Ship and use that before starting Phase 6-7. Phase 8 (auto-apply) is genuinely optional — build it only if the manual-apply workflow from Phases 1-7 turns out to still be too slow in practice, not by default.
