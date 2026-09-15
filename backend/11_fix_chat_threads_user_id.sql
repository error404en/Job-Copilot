-- 11_fix_chat_threads_user_id.sql
-- Run this in Supabase SQL Editor:
ALTER TABLE public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_user_id_fkey;

-- Drop RLS policies that rely on auth.uid() (since Clerk handles authentication)
DROP POLICY IF EXISTS Users can view their own chat threads ON public.chat_threads;
DROP POLICY IF EXISTS Users can insert their own chat threads ON public.chat_threads;
DROP POLICY IF EXISTS Users can update their own chat threads ON public.chat_threads;
DROP POLICY IF EXISTS Users can delete their own chat threads ON public.chat_threads;
DROP POLICY IF EXISTS Users can view messages in their threads ON public.chat_messages;
DROP POLICY IF EXISTS Users can insert messages in their threads ON public.chat_messages;

-- Change user_id column from UUID to TEXT to match Clerk string user IDs
ALTER TABLE public.chat_threads ALTER COLUMN user_id TYPE TEXT;
