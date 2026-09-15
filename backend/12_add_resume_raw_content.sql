-- 12_add_resume_raw_content.sql
-- Add raw_content column to save full resume text for .docx generation
ALTER TABLE public.resume_versions ADD COLUMN IF NOT EXISTS raw_content TEXT;
