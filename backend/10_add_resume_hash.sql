-- Add file_hash column for resume deduplication
ALTER TABLE public.resume_versions 
ADD COLUMN IF NOT EXISTS file_hash TEXT;

-- Create an index to quickly lookup existing hashes
CREATE INDEX IF NOT EXISTS idx_resume_versions_file_hash ON public.resume_versions(file_hash);
