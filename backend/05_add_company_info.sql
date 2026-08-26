-- Migration to add company_info JSONB column to job_analyses
ALTER TABLE job_analyses
ADD COLUMN IF NOT EXISTS company_info JSONB;
