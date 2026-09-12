-- 1. Drop foreign key constraints that reference auth.users(id)
ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_user_id_fkey;
ALTER TABLE public.resume_versions DROP CONSTRAINT IF EXISTS resume_versions_user_id_fkey;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_user_id_fkey;
ALTER TABLE public.job_analyses DROP CONSTRAINT IF EXISTS job_analyses_user_id_fkey;
ALTER TABLE public.application_drafts DROP CONSTRAINT IF EXISTS application_drafts_user_id_fkey;
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_user_id_fkey;
ALTER TABLE public.ats_subscriptions DROP CONSTRAINT IF EXISTS ats_subscriptions_user_id_fkey;

-- 2. Drop RLS policies since they use auth.uid() which returns a UUID
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.user_profile;
DROP POLICY IF EXISTS "Users can manage their own resumes" ON public.resume_versions;
DROP POLICY IF EXISTS "Users can manage their own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can manage their own job analyses" ON public.job_analyses;
DROP POLICY IF EXISTS "Users can manage their own application drafts" ON public.application_drafts;
DROP POLICY IF EXISTS "Users can manage their own applications" ON public.applications;
DROP POLICY IF EXISTS "Users can manage their own ats subscriptions" ON public.ats_subscriptions;

-- 3. Change user_id column types from UUID to TEXT
ALTER TABLE public.user_profile ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.resume_versions ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.jobs ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.job_analyses ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.application_drafts ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.applications ALTER COLUMN user_id TYPE TEXT;
ALTER TABLE public.ats_subscriptions ALTER COLUMN user_id TYPE TEXT;

-- 4. Drop the Supabase auth trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
