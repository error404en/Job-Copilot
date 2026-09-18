-- Migration: 17_fix_inbox_user_id.sql
-- Description: Alters inbox_sources and inbox_opportunities to use TEXT user_id for Clerk integration, and drops restrictive native UUID auth RLS policies.

-- 1. Drop obsolete native RLS policies based on auth.uid()
DROP POLICY IF EXISTS "Users can manage their own inbox sources" ON public.inbox_sources;
DROP POLICY IF EXISTS "Users can manage their own inbox opportunities" ON public.inbox_opportunities;

-- 2. Drop foreign key constraints linking to auth.users UUID
ALTER TABLE public.inbox_sources DROP CONSTRAINT IF EXISTS inbox_sources_user_id_fkey;
ALTER TABLE public.inbox_opportunities DROP CONSTRAINT IF EXISTS inbox_opportunities_user_id_fkey;

-- 3. Drop dependent indexes before altering type
DROP INDEX IF EXISTS idx_inbox_sources_user_id;
DROP INDEX IF EXISTS idx_inbox_opps_user_id;

-- 4. Change column type from UUID to TEXT
ALTER TABLE public.inbox_sources ALTER COLUMN user_id TYPE TEXT USING user_id::text;
ALTER TABLE public.inbox_opportunities ALTER COLUMN user_id TYPE TEXT USING user_id::text;

-- 5. Recreate the indexes
CREATE INDEX idx_inbox_sources_user_id ON public.inbox_sources(user_id);
CREATE INDEX idx_inbox_opps_user_id ON public.inbox_opportunities(user_id);

-- RLS remains ENABLED on the tables to protect against unauthorized access, 
-- but is intentionally managed via the backend's Supabase service-role key which enforces `.eq("user_id", user_id)` natively.
