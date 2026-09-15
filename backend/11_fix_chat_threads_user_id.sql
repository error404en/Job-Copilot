-- 11_fix_chat_threads_user_id.sql
-- COMPREHENSIVE FIX for Chat Architecture
-- Run this in Supabase SQL Editor:

-- 1. Drop Legacy Constraints
-- If the table was originally created linking to Supabase auth.users, drop that link.
ALTER TABLE public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_user_id_fkey;

-- 2. Drop Broken & Irrelevant RLS Policies
-- Our architecture uses Clerk for Auth and the Supabase Service Role Key for DB access, bypassing RLS.
-- The old policies comparing auth.uid() (UUID) to user_id (TEXT) cause Postgres type mismatch errors.
DROP POLICY IF EXISTS "Users can view their own chat threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Users can insert their own chat threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Users can update their own chat threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Users can delete their own chat threads" ON public.chat_threads;
DROP POLICY IF EXISTS "Users can view messages in their threads" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert messages in their threads" ON public.chat_messages;

-- 3. Ensure Correct Data Types for Clerk
-- Clerk uses string IDs (e.g. 'user_2aX...'), so user_id must be TEXT, not UUID.
ALTER TABLE public.chat_threads ALTER COLUMN user_id TYPE TEXT;

-- 4. Add High-Performance Indexes
-- The backend queries chat_threads by user_id and chat_messages by thread_id. 
-- Without these indexes, the DB will perform full table scans, degrading chat latency.
CREATE INDEX IF NOT EXISTS idx_chat_threads_user_id ON public.chat_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_id ON public.chat_messages(thread_id);
