-- Audit actions for billing. Separate file: Postgres cannot use a new enum value in the
-- transaction that adds it.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_verified';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_failed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'subscription_renewed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'billing_adjusted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'password_reset_requested';
