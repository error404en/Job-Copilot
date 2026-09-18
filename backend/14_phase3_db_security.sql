-- 14_phase3_db_security.sql
-- Run this in Supabase SQL Editor:

-- 1. User Profile Uniqueness
-- Ensures one profile per user
ALTER TABLE public.user_profile DROP CONSTRAINT IF EXISTS user_profile_user_id_key;
ALTER TABLE public.user_profile ADD CONSTRAINT user_profile_user_id_key UNIQUE (user_id);

-- 2. Resume Version Data Integrity (Deduplication per user)
-- Prevents race conditions from inserting duplicate file hashes for a user
ALTER TABLE public.resume_versions DROP CONSTRAINT IF EXISTS resume_versions_user_id_file_hash_key;
ALTER TABLE public.resume_versions ADD CONSTRAINT resume_versions_user_id_file_hash_key UNIQUE (user_id, file_hash);

-- 3. Chat Message Ownership Integrity (IDOR Prevention)
-- Adds a unique constraint on (id, user_id) to chat_threads so we can reference it.
ALTER TABLE public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_id_user_id_key;
ALTER TABLE public.chat_threads ADD CONSTRAINT chat_threads_id_user_id_key UNIQUE (id, user_id);

-- Add user_id to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Backfill user_id for existing messages
UPDATE public.chat_messages cm
SET user_id = ct.user_id
FROM public.chat_threads ct
WHERE cm.thread_id = ct.id AND cm.user_id IS NULL;

-- Ensure no orphans existed that couldn't be backfilled, then set NOT NULL
DELETE FROM public.chat_messages WHERE user_id IS NULL;
ALTER TABLE public.chat_messages ALTER COLUMN user_id SET NOT NULL;

-- Replace old thread_id FK with composite FK on (thread_id, user_id)
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_fkey;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_thread_id_user_id_fkey 
    FOREIGN KEY (thread_id, user_id) 
    REFERENCES public.chat_threads (id, user_id) 
    ON DELETE CASCADE;

-- 4. Performance & Security Indexes
-- Speeds up ownership filtering which is essential for backend API endpoints
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON public.applications(user_id);
CREATE INDEX IF NOT EXISTS idx_application_drafts_user_id ON public.application_drafts(user_id);
CREATE INDEX IF NOT EXISTS idx_resume_versions_user_id ON public.resume_versions(user_id);
CREATE INDEX IF NOT EXISTS idx_ats_subscriptions_user_id ON public.ats_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_user_id ON public.user_profile(user_id);
