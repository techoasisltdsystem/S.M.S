-- New audit actions and calendar categories. Separate file: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'fee_adjusted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'fee_due_changed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_approved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_rejected';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payment_refunded';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'fees_exported';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'academic_period_saved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'academic_period_closed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'event_changed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'fee_settings_changed';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'registration';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'fees';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'assessment';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'break';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'report_cards';
ALTER TYPE public.event_category ADD VALUE IF NOT EXISTS 'ceremony';
