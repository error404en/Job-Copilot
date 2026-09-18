-- Migration: 16_opportunity_inbox.sql
-- Description: Creates the Opportunity Inbox tables for tracking community job leads

-- 1. Inbox Sources Table
CREATE TABLE IF NOT EXISTS public.inbox_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('text', 'image', 'pdf', 'docx', 'xlsx', 'csv', 'url')),
    raw_content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on inbox_sources
ALTER TABLE public.inbox_sources ENABLE ROW LEVEL SECURITY;

-- RLS is enabled but managed purely via service-role backend authorization
-- (Clerk user IDs are used, so auth.uid() UUID checking is incompatible)

CREATE INDEX IF NOT EXISTS idx_inbox_sources_user_id ON public.inbox_sources(user_id);

-- 2. Inbox Opportunities Table
CREATE TABLE IF NOT EXISTS public.inbox_opportunities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT NOT NULL,
    source_id UUID NOT NULL REFERENCES public.inbox_sources(id) ON DELETE CASCADE,
    company TEXT,
    role_title TEXT,
    location TEXT,
    original_submitted_url TEXT,
    verified_official_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'found', 'verified', 'unverified', 'not_found', 'expired', 'duplicate', 'ineligible', 'relevant')),
    verification_status TEXT CHECK (verification_status IN ('verified', 'unverified_third_party', 'promo_funnel')),
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
    extraction_metadata JSONB DEFAULT '{}'::jsonb,
    relevance_explanation TEXT,
    missing_requirements JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate opportunities from the same source
    UNIQUE(source_id, company, role_title)
);

-- Enable RLS on inbox_opportunities
ALTER TABLE public.inbox_opportunities ENABLE ROW LEVEL SECURITY;

-- RLS is enabled but managed purely via service-role backend authorization
-- (Clerk user IDs are used, so auth.uid() UUID checking is incompatible)

CREATE INDEX IF NOT EXISTS idx_inbox_opps_user_id ON public.inbox_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_inbox_opps_source_id ON public.inbox_opportunities(source_id);
