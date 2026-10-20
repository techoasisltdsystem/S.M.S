-- Let the office remove setup records it created by mistake. Foreign keys are
-- ON DELETE RESTRICT, so anything already in use (enrolled classes, marked
-- subjects, years with terms) is refused by the database instead of orphaned.
-- Each delete is written to the audit log by the audit_record() triggers.
GRANT DELETE ON public.academic_years, public.terms, public.subjects, public.classes,
  public.events, public.announcements TO authenticated;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years', 'terms', 'subjects', 'classes'] LOOP
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$s FOR DELETE TO authenticated USING (public.has_permission(school_id, ''academics.manage''))', t);
  END LOOP;
END $$;

CREATE POLICY events_delete ON public.events FOR DELETE TO authenticated
  USING (public.has_permission(school_id, 'communications.manage'));
CREATE POLICY announcements_delete ON public.announcements FOR DELETE TO authenticated
  USING (public.has_permission(school_id, 'communications.manage')
         OR created_by = public.my_profile_id(school_id));
