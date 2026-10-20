-- Additional school staff roles and audit actions. Kept in its own file because
-- Postgres cannot use a new enum value in the transaction that adds it; the
-- next migration uses these values.
--
-- finance_officer is the accountant / bursar role (shown as such in the app).
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'headteacher';
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'academic_coordinator';
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'librarian';
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'receptionist';

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'message_hidden';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'conversation_started';
