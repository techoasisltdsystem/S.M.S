-- New audit actions for result corrections, grading scales and report exports.
-- Separate file: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'result_correction_requested';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'results_corrected';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'correction_rejected';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'report_exported';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'grading_scale_changed';
