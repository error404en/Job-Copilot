-- Migration to add posting_date and region_wise_salary features
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS posting_date DATE,
ADD COLUMN IF NOT EXISTS region_wise_salary TEXT;
