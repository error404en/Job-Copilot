-- 15_job_discovery_v2.sql
-- Run this in Supabase SQL Editor:

-- 1. Provenance & Identity
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_type TEXT; 
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS official_apply_url TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_job_id TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_confidence NUMERIC DEFAULT 0.0;

-- 2. Timestamps for Lifecycle Management
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- 3. Stateful Analysis Tracking
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'pending'; -- pending, running, complete, failed

-- 4. Deduplication Index
-- Ensures concurrent ingestion cannot create duplicates.
-- Stable identity: user_id + source_type + company + external_job_id (with URL fallback)
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_stable_identity 
ON public.jobs (user_id, source_type, company, COALESCE(external_job_id, url));

-- 5. ATS Subscription Pagination State
-- Tracks partial scans for enterprise ATS APIs that hit safety ceilings
ALTER TABLE public.ats_subscriptions ADD COLUMN IF NOT EXISTS partially_scanned BOOLEAN DEFAULT FALSE;
ALTER TABLE public.ats_subscriptions ADD COLUMN IF NOT EXISTS next_offset INTEGER DEFAULT 0;
