-- New audience and audit actions for targeted, scheduled announcements.
-- Separate file: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE public.audience ADD VALUE IF NOT EXISTS 'teachers';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'announcement_published';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'announcement_cancelled';
