-- The new academic-period fields (status, fee due date, reminders, exams, breaks) change only through the functions that
-- validate them and write the audit trail. Direct writes keep working for the original columns.
REVOKE INSERT, UPDATE ON public.terms FROM authenticated;
GRANT INSERT (school_id, academic_year_id, name, starts_on, ends_on, is_current) ON public.terms TO authenticated;
GRANT UPDATE (name, starts_on, ends_on, is_current) ON public.terms TO authenticated;
REVOKE INSERT, UPDATE ON public.academic_years FROM authenticated;
GRANT INSERT (school_id, name, starts_on, ends_on, is_current) ON public.academic_years TO authenticated;
GRANT UPDATE (name, starts_on, ends_on, is_current) ON public.academic_years TO authenticated;

-- A closed period is history: its dates cannot be edited from the browser.
CREATE OR REPLACE FUNCTION public.guard_closed_term()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND OLD.status = 'closed' THEN
    RAISE EXCEPTION 'a closed period cannot be edited' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_closed_term BEFORE UPDATE ON public.terms FOR EACH ROW EXECUTE FUNCTION public.guard_closed_term();
