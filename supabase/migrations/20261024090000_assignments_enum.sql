-- Audit actions for the assignment workflow. Separate file: Postgres cannot use a
-- new enum value in the transaction that adds it.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'assessment_released';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'submission_received';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'submission_returned';
