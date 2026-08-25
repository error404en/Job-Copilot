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
