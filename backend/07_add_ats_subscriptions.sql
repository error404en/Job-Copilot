-- Create ats_subscriptions table
CREATE TABLE IF NOT EXISTS public.ats_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_token TEXT NOT NULL,
    ats_system TEXT NOT NULL,
    target_keywords TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(company_token, ats_system)
);

-- Setup Row Level Security
ALTER TABLE public.ats_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on ats_subscriptions"
    ON public.ats_subscriptions FOR SELECT
    USING (true);

-- Allow public insert access
CREATE POLICY "Allow public insert access on ats_subscriptions"
    ON public.ats_subscriptions FOR INSERT
    WITH CHECK (true);

-- Allow public delete access
CREATE POLICY "Allow public delete access on ats_subscriptions"
    ON public.ats_subscriptions FOR DELETE
    USING (true);
