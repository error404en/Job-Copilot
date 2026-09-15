-- 13_fix_job_analyses_fk_cascade.sql
-- Allow deleting resumes without violating foreign key constraints

ALTER TABLE public.job_analyses 
  DROP CONSTRAINT IF EXISTS job_analyses_recommended_resume_version_id_fkey,
  ADD CONSTRAINT job_analyses_recommended_resume_version_id_fkey 
    FOREIGN KEY (recommended_resume_version_id) 
    REFERENCES public.resume_versions(id) 
    ON DELETE SET NULL;

ALTER TABLE public.application_drafts 
  DROP CONSTRAINT IF EXISTS application_drafts_resume_version_id_fkey,
  ADD CONSTRAINT application_drafts_resume_version_id_fkey 
    FOREIGN KEY (resume_version_id) 
    REFERENCES public.resume_versions(id) 
    ON DELETE SET NULL;

ALTER TABLE public.applications 
  DROP CONSTRAINT IF EXISTS applications_resume_version_id_fkey,
  ADD CONSTRAINT applications_resume_version_id_fkey 
    FOREIGN KEY (resume_version_id) 
    REFERENCES public.resume_versions(id) 
    ON DELETE SET NULL;
