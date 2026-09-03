-- Migration 06: Add personal info columns to user_profile for Auto-Apply extension feature
-- Run this in your Supabase SQL editor

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS first_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS github_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS portfolio_url TEXT DEFAULT '';
