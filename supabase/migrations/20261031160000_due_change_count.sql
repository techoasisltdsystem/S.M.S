-- set_term_fee_due should report how many invoices moved, not how many notices were written.
CREATE OR REPLACE FUNCTION public.set_term_fee_due(_term UUID, _due DATE, _reason TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.terms; y public.academic_years; n INT := 0; old DATE;
BEGIN
  SELECT * INTO t FROM public.terms WHERE id = _term;
  IF NOT FOUND OR NOT public.has_permission(t.school_id, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot change fee due dates' USING ERRCODE = '42501'; END IF;
  IF t.status = 'closed' THEN RAISE EXCEPTION 'this period is closed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO y FROM public.academic_years WHERE id = t.academic_year_id;
  IF _due IS NULL OR _due < y.starts_on OR _due > y.ends_on THEN RAISE EXCEPTION 'choose a date inside the academic year' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'give a reason for the change' USING ERRCODE = '22023'; END IF;
  old := t.fee_due_on;
  UPDATE public.terms SET fee_due_on = _due WHERE id = t.id;
  -- Open invoices of this period move with it. Reminders are worked out from the due date, so they follow too.
  WITH moved AS (
    UPDATE public.invoices i SET due_on = _due
    WHERE i.term_id = t.id AND i.status = 'issued' AND i.due_on IS DISTINCT FROM _due
      AND COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded'), 0) < i.total
    RETURNING i.id, i.student_id, i.number),
  told AS (
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT t.school_id, r.pid, 'fee_due_changed', 'A fee due date changed', format('%s: the new due date is %s.', m.number, to_char(_due, 'DD Mon YYYY')), '/fees'
    FROM moved m CROSS JOIN LATERAL (
      SELECT g.guardian_id AS pid FROM public.guardian_links g WHERE g.student_id = m.student_id AND g.status = 'verified' UNION SELECT m.student_id) r
    RETURNING 1)
  SELECT count(*) INTO n FROM moved;
  PERFORM public.write_audit(t.school_id, 'fee_due_changed', 'term', t.id, left(t.name, 80), jsonb_build_object('from', old, 'to', _due, 'reason', btrim(_reason), 'invoices_moved', n));
  RETURN n;
END $$;
