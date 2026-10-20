-- Audit actions for fees and payments. Separate file: Postgres cannot use a new enum
-- value in the transaction that adds it.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'fee_structure_saved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invoice_created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invoice_cancelled';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_recorded';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_voided';
