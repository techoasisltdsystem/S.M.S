-- Every create, change and delete of the school's setup records (years, terms,
-- classes, subjects, teacher assignments, lessons, events, notices, assessments)
-- is written to the audit log by the database itself, with the signed-in
-- person as the actor. Only names of changed columns are kept, not values.
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'record_created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'record_updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'record_deleted';

CREATE OR REPLACE FUNCTION public.audit_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_json JSONB := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  act audit_action;
  cols TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN act := 'record_created';
  ELSIF TG_OP = 'DELETE' THEN act := 'record_deleted';
  ELSE
    act := 'record_updated';
    cols := public.changed_columns(to_jsonb(OLD), to_jsonb(NEW));
    IF cardinality(cols) = 0 THEN RETURN NEW; END IF;
  END IF;
  PERFORM public.write_audit(
    (row_json ->> 'school_id')::uuid, act, TG_TABLE_NAME, (row_json ->> 'id')::uuid,
    COALESCE(row_json ->> 'name', row_json ->> 'title'),
    CASE WHEN cols IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('changed', cols) END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE EXECUTE ON FUNCTION public.audit_record() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_academic_years AFTER INSERT OR UPDATE OR DELETE ON public.academic_years FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_terms AFTER INSERT OR UPDATE OR DELETE ON public.terms FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_classes AFTER INSERT OR UPDATE OR DELETE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_subjects AFTER INSERT OR UPDATE OR DELETE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_teaching_assignments AFTER INSERT OR UPDATE OR DELETE ON public.teaching_assignments FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_timetable_slots AFTER INSERT OR UPDATE OR DELETE ON public.timetable_slots FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_events AFTER INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.audit_record();
CREATE TRIGGER audit_announcements AFTER INSERT OR UPDATE OR DELETE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.audit_record();
-- Assessment status changes are already logged by the results workflow.
CREATE TRIGGER audit_assessments AFTER INSERT OR DELETE ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.audit_record();
