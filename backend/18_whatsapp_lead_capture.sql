-- Migration 18: Add whatsapp_export source type and apply-later status

-- 1. Add whatsapp_export to inbox_sources.source_type CHECK constraint
-- We need to drop and recreate the constraint.
ALTER TABLE inbox_sources DROP CONSTRAINT IF EXISTS inbox_sources_source_type_check;
ALTER TABLE inbox_sources ADD CONSTRAINT inbox_sources_source_type_check 
    CHECK (source_type IN ('text', 'image', 'pdf', 'docx', 'xlsx', 'csv', 'url', 'whatsapp_export'));

-- Note: We store new fields like resolver_confidence, source_meta, verified_at 
-- inside the extraction_metadata JSONB column to keep the schema flexible.
-- The existing verification_status (verified, unverified_third_party, promo_funnel)
-- and status (pending, found, verified, unverified, not_found, expired, duplicate, ineligible, relevant)
-- cover the core states for Verified / Needs Check / Rejected.

-- 2. Ensure application_status supports 'saved' for the Apply Later workflow
-- The applications table already has 'saved', 'applied', 'interview', 'offer', 'rejected'
-- so no DB changes are required there.

-- 3. Add any additional columns if strictly necessary, but sticking to JSONB is safer.
