# JobCopilot 🚀

**One inbox for every job posting, scored against your actual resume and goals — before you waste a click applying.**

JobCopilot is a personal job-hunting assistant designed to eliminate the wasted time of reading irrelevant job descriptions. It automatically analyzes job postings, scores them against your specific profile (pay floor, seniority, location, required skills), and tells you whether to **Apply**, **Stretch**, or **Skip**.

---

## ✨ Features

- **Instant Fit Analysis**: Paste a job URL or raw text, and get a structured analysis in seconds.
- **Auto-Rejection Guardrails**: Automatically flags roles that are under your pay floor or require more seniority than you have.
- **Smart Resume Recommendation**: Maintains multiple versions of your resume (e.g., GenAI, Backend, Full-stack) and recommends the best one for each specific job.
- **Company Intelligence**: Automatically researches the company's work culture, work-life balance, compensation estimates, and perks using DuckDuckGo and LLM analysis.
- **Application Prep**: Drafts highly tailored, human-sounding cover letters based on the selected resume and the job description.
- **Chrome Extension (In Progress)**: Capture JDs from pages you're already viewing and get instant analysis without leaving the page. 

---

## 🛠️ Tech Stack

**Frontend**
- Next.js 14 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- TanStack Query

**Backend**
- Python 3.10+
- FastAPI
- Supabase (PostgreSQL)
- LLM Providers: Anthropic (Claude), Google (Gemini), Groq
- Web scraping & research: BeautifulSoup, DuckDuckGo Search

---

## 🚀 Setup Instructions (For Any Device)

Follow these step-by-step instructions to get JobCopilot running locally on a new machine from scratch.

### Step 1: Prerequisites
Ensure you have the following installed on your machine:
1. **Node.js** (v18 or higher): [Download here](https://nodejs.org/)
2. **Python** (3.10 or higher): [Download here](https://www.python.org/downloads/)
3. **Git**: [Download here](https://git-scm.com/downloads)

### Step 2: Database Setup (Supabase)
JobCopilot uses Supabase for a hosted PostgreSQL database.
1. Create a free account at [Supabase](https://supabase.com/).
2. Click **"New Project"** and give it a name (e.g., JobCopilot).
3. Wait for the database to provision.
4. Go to **Project Settings > API**. You will need two values from here:
   - **Project URL** (This is your `SUPABASE_URL`)
   - **service_role secret** (This is your `SUPABASE_SERVICE_ROLE_KEY`. *Do not share this!*)
5. Go to the **SQL Editor** in the left sidebar of your Supabase dashboard.
6. You must execute the following SQL migration files in this exact order to set up your tables and seed data. Open each file, copy the contents, paste them into the SQL Editor, and click "Run":
   - `backend/supabase/migrations/01_initial_schema.sql`
   - `backend/supabase/migrations/02_seed.sql` (Populates initial mock data/resumes)
   - `backend/supabase/migrations/03_add_application_data.sql`
   - `backend/04_add_deadlines_bookmarks.sql`
   - `backend/05_add_company_info.sql`

### Step 3: API Keys
You need API keys for the AI models used in the tool:
- **Gemini (Google)**: [Get API key from Google AI Studio](https://aistudio.google.com/app/apikey)
- **Groq**: [Get API key from Groq Console](https://console.groq.com/keys)
- **Anthropic** *(Optional for v1, but good to have)*: [Get API key here](https://console.anthropic.com/)

### Step 4: Backend Setup
1. Open a terminal and clone the repository (if you haven't already).
2. Navigate to the backend folder:
   ```bash
   cd "Apply Tool"/backend
   ```
3. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```
4. Activate the virtual environment:
   - On **Windows**: `.venv\Scripts\activate`
   - On **Mac/Linux**: `source .venv/bin/activate`
5. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
6. Create an environment variables file. Inside the `backend/` folder, create a new file named `.env` and add your keys:
   ```env
   SUPABASE_URL=your_supabase_project_url_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```
7. Start the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   *The API will now be running on `http://localhost:8000`.*

### Step 5: Frontend Setup
1. Open a **new terminal window** (keep the backend server running in the first one).
2. Navigate to the frontend folder:
   ```bash
   cd "Apply Tool"/frontend
   ```
3. Install frontend dependencies:
   ```bash
   npm install
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
5. Open your browser and go to [http://localhost:3000](http://localhost:3000) to use JobCopilot!

---

## ⚠️ Important Note on Scraping
This tool is built strictly as a **personal assistant** to read job pages you are already viewing. **It does not perform bulk automated scraping** of platforms like LinkedIn, Indeed, or Glassdoor, as this violates their Terms of Service and leads to account bans. The tool is designed exclusively for single-page DOM capture or manual text pasting.

---

## 📝 License
This is a personal, single-user project. Not intended for commercial multi-tenant deployment.
