-- Audit actions for learning resources and student concerns (separate file: a new enum value cannot be used in the transaction that adds it).
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'resource_added';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'resource_archived';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'concern_submitted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'concern_updated';
