-- Audit actions for subscriptions, support and platform access to a school.
-- Separate file: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'subscription_changed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'support_request_created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'support_access_requested';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'support_access_approved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'support_access_denied';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'support_access_used';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'support_access_ended';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'admin_access_changed';
