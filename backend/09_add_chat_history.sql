-- Add Chat History Tables

CREATE TABLE IF NOT EXISTS public.chat_threads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL, -- Optional: Link to a specific job
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

-- Policies for chat_threads
CREATE POLICY "Users can view their own chat threads" ON public.chat_threads
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat threads" ON public.chat_threads
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat threads" ON public.chat_threads
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat threads" ON public.chat_threads
    FOR DELETE USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies for chat_messages
-- Allow access if the user owns the parent thread
CREATE POLICY "Users can view messages in their threads" ON public.chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chat_threads
            WHERE chat_threads.id = chat_messages.thread_id
            AND chat_threads.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages in their threads" ON public.chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_threads
            WHERE chat_threads.id = chat_messages.thread_id
            AND chat_threads.user_id = auth.uid()
        )
    );
