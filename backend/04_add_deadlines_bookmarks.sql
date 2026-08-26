-- Migration to add deadlines and bookmarks features
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_bookmarked BOOLEAN DEFAULT FALSE;
