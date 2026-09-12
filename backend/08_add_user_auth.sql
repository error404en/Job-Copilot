-- 1. Add user_id columns to all core tables
ALTER TABLE public.user_profile ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.resume_versions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.jobs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.job_analyses ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.application_drafts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.ats_subscriptions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Update unique constraints to be user-scoped
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_url_key;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_url_user_id_key UNIQUE (url, user_id);

ALTER TABLE public.ats_subscriptions DROP CONSTRAINT IF EXISTS ats_subscriptions_company_token_ats_system_key;
ALTER TABLE public.ats_subscriptions ADD CONSTRAINT ats_subscriptions_company_user_key UNIQUE (company_token, ats_system, user_id);

-- 3. Enable Row Level Security (RLS) on all tables
ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ats_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Drop any existing permissive public policies (like the ones from 07)
DROP POLICY IF EXISTS "Allow public read access on ats_subscriptions" ON public.ats_subscriptions;
DROP POLICY IF EXISTS "Allow public insert access on ats_subscriptions" ON public.ats_subscriptions;
DROP POLICY IF EXISTS "Allow public delete access on ats_subscriptions" ON public.ats_subscriptions;

-- 5. Create new RLS policies ensuring users only access their own data
CREATE POLICY "Users can manage their own profile" ON public.user_profile FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own resumes" ON public.resume_versions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own jobs" ON public.jobs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own job analyses" ON public.job_analyses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own application drafts" ON public.application_drafts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own applications" ON public.applications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own ats subscriptions" ON public.ats_subscriptions FOR ALL USING (auth.uid() = user_id);

-- 6. Trigger for auto-creating a user_profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profile (user_id, base_location, remote_ok)
  VALUES (new.id, 'Noida, Delhi NCR', true);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
