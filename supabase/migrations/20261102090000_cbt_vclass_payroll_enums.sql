-- Audit actions for CBT, virtual classes and payroll (separate file: a new enum value cannot be used in the transaction that adds it).
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'cbt_test_saved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'cbt_test_status';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'cbt_attempt_terminated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'cbt_graded';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'vclass_scheduled';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'vclass_status';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payroll_profile_saved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payroll_run';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'payroll_advance';
