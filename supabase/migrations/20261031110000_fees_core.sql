-- School fees, completed: academic periods with due dates and reminder schedules, adjustments (discounts, waivers,
-- scholarships, charges), offline payment approval, student payment, refunds, scheduled reminders with an email
-- outbox, teacher status view, reports and settings. Everything builds on the existing invoices / payments ledger.

-- ---------------------------------------------------------------------------------------------
-- 1. Academic years and periods
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.academic_years ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'completed', 'archived'));
ALTER TABLE public.terms
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'closed')),
  ADD COLUMN IF NOT EXISTS fee_due_on DATE,
  ADD COLUMN IF NOT EXISTS reminder_days INT[] NOT NULL DEFAULT '{14,7,3,0}',
  ADD COLUMN IF NOT EXISTS exams_start DATE,
  ADD COLUMN IF NOT EXISTS exams_end DATE,
  ADD COLUMN IF NOT EXISTS break_start DATE,
  ADD COLUMN IF NOT EXISTS break_end DATE,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID;
ALTER TABLE public.fee_structures ADD COLUMN IF NOT EXISTS term_id UUID;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS term_id UUID;
CREATE INDEX IF NOT EXISTS invoices_term ON public.invoices (term_id) WHERE term_id IS NOT NULL;

ALTER TABLE public.school_config
  ADD COLUMN IF NOT EXISTS fees_offline_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fees_allow_student_pay BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fees_overdue_reminder_days INT[] NOT NULL DEFAULT '{1,7,14}';

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'fees.adjust'), ('finance_officer', 'fees.adjust'),
  ('school_admin', 'payments.approve'), ('headteacher', 'payments.approve'),
  ('school_admin', 'fees.export'), ('finance_officer', 'fees.export')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_academic_year(_school UUID, _id UUID, _name TEXT, _starts DATE, _ends DATE, _status TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  IF NOT public.has_permission(_school, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot manage academic years' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_name, ''))) < 3 THEN RAISE EXCEPTION 'give the academic year a name, for example 2026/2027' USING ERRCODE = '22023'; END IF;
  IF _starts IS NULL OR _ends IS NULL OR _ends <= _starts THEN RAISE EXCEPTION 'the end date must be after the start date' USING ERRCODE = '22023'; END IF;
  IF _ends - _starts > 800 THEN RAISE EXCEPTION 'an academic year cannot be longer than about two years' USING ERRCODE = '22023'; END IF;
  IF _status NOT IN ('draft', 'published', 'completed', 'archived') THEN RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023'; END IF;
  IF _status IN ('draft', 'published') AND EXISTS (
    SELECT 1 FROM public.academic_years y WHERE y.school_id = _school AND y.id IS DISTINCT FROM _id AND y.status IN ('draft', 'published')
      AND daterange(y.starts_on, y.ends_on, '[]') && daterange(_starts, _ends, '[]')) THEN
    RAISE EXCEPTION 'these dates overlap another academic year' USING ERRCODE = '22023';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, status) VALUES (_school, btrim(_name), _starts, _ends, _status) RETURNING id INTO rid;
  ELSE
    IF EXISTS (SELECT 1 FROM public.terms t WHERE t.academic_year_id = _id AND (t.starts_on < _starts OR t.ends_on > _ends)) THEN
      RAISE EXCEPTION 'a term in this year falls outside these dates' USING ERRCODE = '22023';
    END IF;
    UPDATE public.academic_years SET name = btrim(_name), starts_on = _starts, ends_on = _ends, status = _status WHERE id = _id AND school_id = _school RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'no such academic year' USING ERRCODE = 'P0002'; END IF;
  END IF;
  PERFORM public.write_audit(_school, 'academic_period_saved', 'academic_year', rid, left(btrim(_name), 80), jsonb_build_object('status', _status, 'starts', _starts, 'ends', _ends));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.save_term(_school UUID, _id UUID, _year UUID, _name TEXT, _starts DATE, _ends DATE, _fee_due DATE,
  _reminder_days INT[], _exams_start DATE, _exams_end DATE, _break_start DATE, _break_end DATE)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y public.academic_years; cur public.terms; rid UUID; days INT[];
BEGIN
  IF NOT public.has_permission(_school, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot manage academic periods' USING ERRCODE = '42501'; END IF;
  SELECT * INTO y FROM public.academic_years WHERE id = _year AND school_id = _school;
  IF NOT FOUND THEN RAISE EXCEPTION 'choose an academic year' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_name, ''))) < 1 THEN RAISE EXCEPTION 'give the period a name, for example Term 1 or Semester 2' USING ERRCODE = '22023'; END IF;
  IF _starts IS NULL OR _ends IS NULL OR _ends <= _starts THEN RAISE EXCEPTION 'the end date must be after the start date' USING ERRCODE = '22023'; END IF;
  IF _starts < y.starts_on OR _ends > y.ends_on THEN RAISE EXCEPTION 'the period must fall inside the academic year (% to %)', y.starts_on, y.ends_on USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.terms t WHERE t.academic_year_id = _year AND t.id IS DISTINCT FROM _id AND daterange(t.starts_on, t.ends_on, '[]') && daterange(_starts, _ends, '[]')) THEN
    RAISE EXCEPTION 'these dates overlap another period in this year' USING ERRCODE = '22023';
  END IF;
  IF _fee_due IS NOT NULL AND (_fee_due < y.starts_on OR _fee_due > y.ends_on) THEN RAISE EXCEPTION 'the fee due date must fall inside the academic year' USING ERRCODE = '22023'; END IF;
  IF (_exams_start IS NULL) <> (_exams_end IS NULL) OR (_break_start IS NULL) <> (_break_end IS NULL) THEN RAISE EXCEPTION 'give both a start and an end for exams and for breaks' USING ERRCODE = '22023'; END IF;
  IF _exams_start IS NOT NULL AND (_exams_end < _exams_start OR _exams_start < _starts OR _exams_end > _ends) THEN RAISE EXCEPTION 'the examination dates must be inside the period' USING ERRCODE = '22023'; END IF;
  IF _break_start IS NOT NULL AND (_break_end < _break_start OR _break_start < y.starts_on OR _break_end > y.ends_on) THEN RAISE EXCEPTION 'the break dates must be inside the academic year' USING ERRCODE = '22023'; END IF;
  days := COALESCE((SELECT array_agg(DISTINCT d ORDER BY d DESC) FROM unnest(COALESCE(_reminder_days, '{14,7,3,0}')) d WHERE d BETWEEN 0 AND 90), '{}');
  IF _id IS NULL THEN
    INSERT INTO public.terms (school_id, academic_year_id, name, starts_on, ends_on, fee_due_on, reminder_days, exams_start, exams_end, break_start, break_end, status)
    VALUES (_school, _year, btrim(_name), _starts, _ends, _fee_due, days, _exams_start, _exams_end, _break_start, _break_end, 'draft') RETURNING id INTO rid;
  ELSE
    SELECT * INTO cur FROM public.terms WHERE id = _id AND school_id = _school;
    IF NOT FOUND THEN RAISE EXCEPTION 'no such period' USING ERRCODE = 'P0002'; END IF;
    IF cur.status = 'closed' THEN RAISE EXCEPTION 'a closed period cannot be edited' USING ERRCODE = '22023'; END IF;
    IF _fee_due IS DISTINCT FROM cur.fee_due_on THEN RAISE EXCEPTION 'change the fee due date with a reason, so families are told and the change is recorded' USING ERRCODE = '22023'; END IF;
    UPDATE public.terms SET name = btrim(_name), starts_on = _starts, ends_on = _ends, reminder_days = days, exams_start = _exams_start, exams_end = _exams_end,
      break_start = _break_start, break_end = _break_end WHERE id = _id RETURNING id INTO rid;
  END IF;
  PERFORM public.write_audit(_school, 'academic_period_saved', 'term', rid, left(btrim(_name), 80), jsonb_build_object('starts', _starts, 'ends', _ends, 'fee_due', _fee_due));
  RETURN rid;
END $$;

-- The single source of truth for a period's fee deadline. Invoices raised for the period follow it.
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
    RETURNING i.id, i.student_id, i.number)
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT t.school_id, r.pid, 'fee_due_changed', 'A fee due date changed', format('%s: the new due date is %s.', m.number, to_char(_due, 'DD Mon YYYY')), '/fees'
  FROM moved m CROSS JOIN LATERAL (
    SELECT g.guardian_id AS pid FROM public.guardian_links g WHERE g.student_id = m.student_id AND g.status = 'verified' UNION SELECT m.student_id) r;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.write_audit(t.school_id, 'fee_due_changed', 'term', t.id, left(t.name, 80), jsonb_build_object('from', old, 'to', _due, 'reason', btrim(_reason)));
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.set_current_period(_school UUID, _year UUID, _term UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot manage academic periods' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academic_years WHERE id = _year AND school_id = _school) THEN RAISE EXCEPTION 'unknown academic year' USING ERRCODE = '22023'; END IF;
  IF _term IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.terms WHERE id = _term AND academic_year_id = _year AND status <> 'closed') THEN RAISE EXCEPTION 'choose an open period of that year' USING ERRCODE = '22023'; END IF;
  UPDATE public.terms SET is_current = FALSE WHERE school_id = _school AND is_current;
  UPDATE public.academic_years SET is_current = FALSE WHERE school_id = _school AND is_current;
  UPDATE public.academic_years SET is_current = TRUE, status = CASE WHEN status = 'draft' THEN 'published' ELSE status END WHERE id = _year;
  IF _term IS NOT NULL THEN UPDATE public.terms SET is_current = TRUE, status = CASE WHEN status = 'draft' THEN 'published' ELSE status END WHERE id = _term; END IF;
  PERFORM public.write_audit(_school, 'academic_period_saved', 'academic_year', _year, 'current period', jsonb_build_object('term', _term));
END $$;

-- Publish the calendar: the year and its draft periods become visible to the school.
CREATE OR REPLACE FUNCTION public.publish_academic_calendar(_year UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE y public.academic_years; n INT;
BEGIN
  SELECT * INTO y FROM public.academic_years WHERE id = _year;
  IF NOT FOUND OR NOT public.has_permission(y.school_id, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot publish the calendar' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.terms WHERE academic_year_id = _year) THEN RAISE EXCEPTION 'add at least one term or semester first' USING ERRCODE = '22023'; END IF;
  UPDATE public.terms SET status = 'published' WHERE academic_year_id = _year AND status = 'draft';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.academic_years SET status = 'published' WHERE id = _year AND status = 'draft';
  IF n > 0 THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT y.school_id, m.profile_id, 'calendar_published', 'The academic calendar was published', y.name, '/calendar'
    FROM public.school_memberships m WHERE m.school_id = y.school_id AND m.status = 'active';
  END IF;
  PERFORM public.write_audit(y.school_id, 'academic_period_saved', 'academic_year', y.id, left(y.name, 80), jsonb_build_object('published_periods', n));
  RETURN n;
END $$;

-- Closing a period keeps everything: invoices, payments and receipts stay exactly as they were.
CREATE OR REPLACE FUNCTION public.close_term(_term UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.terms;
BEGIN
  SELECT * INTO t FROM public.terms WHERE id = _term;
  IF NOT FOUND OR NOT public.has_permission(t.school_id, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot close academic periods' USING ERRCODE = '42501'; END IF;
  IF t.status = 'closed' THEN RAISE EXCEPTION 'this period is already closed' USING ERRCODE = '22023'; END IF;
  UPDATE public.terms SET status = 'closed', is_current = FALSE, closed_at = now(), closed_by = public.my_profile_id(t.school_id) WHERE id = t.id;
  PERFORM public.write_audit(t.school_id, 'academic_period_closed', 'term', t.id, left(t.name, 80), '{}');
END $$;

-- What period the school is in now (for the dashboards). Fee deadlines only for people who deal with fees.
CREATE OR REPLACE FUNCTION public.current_period(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE y public.academic_years; t public.terms; show_fee BOOLEAN;
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  SELECT * INTO y FROM public.academic_years WHERE school_id = _school AND status IN ('published', 'draft') AND (is_current OR current_date BETWEEN starts_on AND ends_on)
    ORDER BY is_current DESC, starts_on DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('year', NULL); END IF;
  SELECT * INTO t FROM public.terms WHERE academic_year_id = y.id AND status <> 'draft' AND (is_current OR current_date BETWEEN starts_on AND ends_on)
    ORDER BY is_current DESC, starts_on LIMIT 1;
  show_fee := public.has_permission(_school, 'fees.view') OR public.has_role_in(_school, 'parent') OR public.has_role_in(_school, 'student');
  RETURN jsonb_build_object('year', y.name, 'year_id', y.id, 'year_status', y.status, 'term', t.name, 'term_id', t.id, 'starts_on', t.starts_on, 'ends_on', t.ends_on,
    'fee_due_on', CASE WHEN show_fee THEN t.fee_due_on END);
END $$;

-- Dates the calendar shows next to events. Drafts and closed history are for managers only; fee deadlines for fee roles only.
CREATE OR REPLACE FUNCTION public.calendar_periods(_school UUID)
RETURNS TABLE (term_id UUID, term TEXT, year TEXT, starts_on DATE, ends_on DATE, fee_due_on DATE, exams_start DATE, exams_end DATE, break_start DATE, break_end DATE, status TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mgr BOOLEAN; show_fee BOOLEAN;
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  mgr := public.has_permission(_school, 'school.settings.manage');
  show_fee := public.has_permission(_school, 'fees.view') OR public.has_role_in(_school, 'parent') OR public.has_role_in(_school, 'student');
  RETURN QUERY
    SELECT t.id, t.name, y.name, t.starts_on, t.ends_on, CASE WHEN show_fee THEN t.fee_due_on END, t.exams_start, t.exams_end, t.break_start, t.break_end, t.status
    FROM public.terms t JOIN public.academic_years y ON y.id = t.academic_year_id
    WHERE t.school_id = _school AND (mgr OR (t.status <> 'draft' AND y.status <> 'draft'))
    ORDER BY t.starts_on;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Fee settings
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_settings(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('student_pay', c.fees_allow_student_pay, 'offline_approval', c.fees_offline_approval, 'overdue_days', c.fees_overdue_reminder_days)
          FROM public.school_config c WHERE c.school_id = _school);
END $$;

CREATE OR REPLACE FUNCTION public.save_fee_settings(_school UUID, _offline_approval BOOLEAN, _student_pay BOOLEAN, _overdue_days INT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE days INT[];
BEGIN
  IF NOT public.has_permission(_school, 'school.settings.manage') THEN RAISE EXCEPTION 'you cannot change fee settings' USING ERRCODE = '42501'; END IF;
  days := COALESCE((SELECT array_agg(DISTINCT d ORDER BY d) FROM unnest(COALESCE(_overdue_days, '{}')) d WHERE d BETWEEN 1 AND 120), '{}');
  UPDATE public.school_config SET fees_offline_approval = COALESCE(_offline_approval, FALSE), fees_allow_student_pay = COALESCE(_student_pay, FALSE), fees_overdue_reminder_days = days WHERE school_id = _school;
  PERFORM public.write_audit(_school, 'fee_settings_changed', 'school_config', NULL, 'fees', jsonb_build_object('offline_approval', _offline_approval, 'student_pay', _student_pay, 'overdue_days', days));
END $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Adjustments: discounts, scholarships, waivers and extra charges. Recorded as their own rows and as visible
--    lines on the invoice; payments are never changed.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.invoices'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%total > 0%' LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', c);
  END LOOP;
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.invoice_lines'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%amount > 0%' LOOP
    EXECUTE format('ALTER TABLE public.invoice_lines DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_total_range CHECK (total >= 0 AND total <= 10000000);
ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_amount_nonzero CHECK (amount <> 0);

CREATE TABLE public.fee_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('discount', 'scholarship', 'waiver', 'charge')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 5),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, invoice_id) REFERENCES public.invoices (school_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.fee_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_adjustments FROM PUBLIC, anon, authenticated;
CREATE TRIGGER fee_adjustments_immutable BEFORE UPDATE OR DELETE ON public.fee_adjustments FOR EACH ROW EXECUTE FUNCTION public.platform_events_immutable();

CREATE OR REPLACE FUNCTION public.apply_fee_adjustment(_invoice UUID, _kind TEXT, _amount NUMERIC, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.invoices; amt NUMERIC := round(COALESCE(_amount, 0), 2); held NUMERIC; new_total NUMERIC; aid UUID;
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(i.school_id, 'fees.adjust') THEN RAISE EXCEPTION 'you cannot adjust invoices' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(i.school_id, 'fees', 'fees and payments');
  IF i.status = 'cancelled' THEN RAISE EXCEPTION 'this invoice is cancelled' USING ERRCODE = '22023'; END IF;
  IF _kind NOT IN ('discount', 'scholarship', 'waiver', 'charge') THEN RAISE EXCEPTION 'unknown adjustment type' USING ERRCODE = '22023'; END IF;
  IF amt <= 0 THEN RAISE EXCEPTION 'enter an amount above zero' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'give a reason (at least 5 characters)' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO held FROM public.payments WHERE invoice_id = i.id AND status IN ('recorded', 'pending');
  new_total := CASE WHEN _kind = 'charge' THEN i.total + amt ELSE i.total - amt END;
  IF new_total < held THEN RAISE EXCEPTION 'that would take the invoice below the % already paid; refund the payment instead', held USING ERRCODE = '22023'; END IF;
  IF new_total > 10000000 THEN RAISE EXCEPTION 'that is too large' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.fee_adjustments (school_id, invoice_id, kind, amount, reason, created_by)
  VALUES (i.school_id, i.id, _kind, amt, btrim(_reason), public.my_profile_id(i.school_id)) RETURNING id INTO aid;
  INSERT INTO public.invoice_lines (school_id, invoice_id, description, amount)
  VALUES (i.school_id, i.id, left(initcap(_kind) || ': ' || btrim(_reason), 150), CASE WHEN _kind = 'charge' THEN amt ELSE -amt END);
  UPDATE public.invoices SET total = new_total WHERE id = i.id;
  PERFORM public.write_audit(i.school_id, 'fee_adjusted', 'invoice', i.id, i.number, jsonb_build_object('kind', _kind, 'amount', amt, 'reason', btrim(_reason), 'total_before', i.total, 'total_after', new_total));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT i.school_id, r.pid, 'fee_adjusted', 'Your fee invoice was adjusted', format('%s: %s of %s. New total %s.', i.number, initcap(_kind), to_char(amt, 'FM999,999,990.00'), to_char(new_total, 'FM999,999,990.00')), '/fees'
  FROM (SELECT g.guardian_id AS pid FROM public.guardian_links g WHERE g.student_id = i.student_id AND g.status = 'verified' UNION SELECT i.student_id) r;
  RETURN jsonb_build_object('adjustment_id', aid, 'total', new_total, 'balance', new_total - held);
END $$;

-- ---------------------------------------------------------------------------------------------
-- 4. Offline payments can wait for approval. Pending rows are not counted as paid anywhere.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.payments'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%voided%' LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check CHECK (status IN ('recorded', 'voided', 'pending'));

CREATE OR REPLACE FUNCTION public.record_payment(_invoice UUID, _amount NUMERIC, _method TEXT, _reference TEXT, _paid_on DATE, _note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.invoices; held NUMERIC; rct TEXT; pid UUID; needs_approval BOOLEAN; ref TEXT := NULLIF(btrim(COALESCE(_reference, '')), '');
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(i.school_id, 'payments.record') THEN RAISE EXCEPTION 'you cannot record payments' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(i.school_id, 'fees', 'fees and payments');
  IF i.status = 'cancelled' THEN RAISE EXCEPTION 'this invoice is cancelled' USING ERRCODE = '22023'; END IF;
  IF _method NOT IN ('cash', 'mobile_money', 'bank_transfer', 'cheque', 'other') THEN RAISE EXCEPTION 'choose how the payment was made' USING ERRCODE = '22023'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'enter an amount above zero' USING ERRCODE = '22023'; END IF;
  IF _paid_on IS NULL OR _paid_on > current_date THEN RAISE EXCEPTION 'the payment date cannot be in the future' USING ERRCODE = '22023'; END IF;
  IF ref IS NOT NULL AND EXISTS (SELECT 1 FROM public.payments p WHERE p.school_id = i.school_id AND lower(p.reference) = lower(ref) AND p.status <> 'voided' AND p.method <> 'paystack') THEN
    RAISE EXCEPTION 'a payment with that reference was already recorded' USING ERRCODE = '23505';
  END IF;
  SELECT COALESCE(sum(amount), 0) INTO held FROM public.payments WHERE invoice_id = i.id AND status IN ('recorded', 'pending');
  IF held + _amount > i.total THEN RAISE EXCEPTION 'that is more than the balance of %', (i.total - held) USING ERRCODE = '22023'; END IF;
  needs_approval := COALESCE((SELECT fees_offline_approval FROM public.school_config WHERE school_id = i.school_id), FALSE) AND NOT public.has_permission(i.school_id, 'payments.approve');
  rct := public.next_fee_number(i.school_id, 'receipt');
  INSERT INTO public.payments (school_id, invoice_id, student_id, amount, method, reference, paid_on, receipt_number, note, recorded_by, status)
  VALUES (i.school_id, i.id, i.student_id, _amount, _method, ref, _paid_on, rct, NULLIF(btrim(COALESCE(_note, '')), ''), public.my_profile_id(i.school_id),
          CASE WHEN needs_approval THEN 'pending' ELSE 'recorded' END)
  RETURNING id INTO pid;
  PERFORM public.write_audit(i.school_id, 'payment_recorded', 'payment', pid, rct,
    jsonb_build_object('invoice', i.number, 'amount', _amount, 'method', _method, 'pending_approval', needs_approval));
  IF NOT needs_approval THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT i.school_id, g.guardian_id, 'payment_received', 'A payment was recorded', rct, '/fees'
      FROM public.guardian_links g WHERE g.student_id = i.student_id AND g.status = 'verified';
  ELSE
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT i.school_id, m.profile_id, 'payment_pending', 'An offline payment needs approval', format('%s for %s', rct, i.number), '/fees'
      FROM public.school_memberships m WHERE m.school_id = i.school_id AND m.status = 'active' AND m.role IN ('school_admin', 'headteacher');
  END IF;
  RETURN jsonb_build_object('payment_id', pid, 'receipt', rct, 'balance', i.total - held - _amount, 'pending', needs_approval);
END $$;

CREATE OR REPLACE FUNCTION public.review_payment(_payment UUID, _approve BOOLEAN, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments; me UUID;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(p.school_id, 'payments.approve') THEN RAISE EXCEPTION 'you cannot approve payments' USING ERRCODE = '42501'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'this payment is not waiting for approval' USING ERRCODE = '22023'; END IF;
  me := public.my_profile_id(p.school_id);
  IF me IS NOT DISTINCT FROM p.recorded_by THEN RAISE EXCEPTION 'someone else must approve a payment you recorded' USING ERRCODE = '42501'; END IF;
  IF _approve THEN
    UPDATE public.payments SET status = 'recorded' WHERE id = p.id;
    PERFORM public.write_audit(p.school_id, 'payment_approved', 'payment', p.id, p.receipt_number, jsonb_build_object('amount', p.amount));
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT p.school_id, g.guardian_id, 'payment_received', 'A payment was recorded', p.receipt_number, '/fees'
      FROM public.guardian_links g WHERE g.student_id = p.student_id AND g.status = 'verified';
  ELSE
    IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'give a reason for rejecting it' USING ERRCODE = '22023'; END IF;
    UPDATE public.payments SET status = 'voided', void_reason = 'Rejected: ' || btrim(_reason), voided_by = me, voided_at = clock_timestamp() WHERE id = p.id;
    PERFORM public.write_audit(p.school_id, 'payment_rejected', 'payment', p.id, p.receipt_number, jsonb_build_object('amount', p.amount, 'reason', btrim(_reason)));
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Students see their own fees; they may pay only if the school switches that on.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_see_fees(_school UUID, _student UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_school, 'fees.view') OR public.is_guardian_of(_student) OR public.is_self_student(_student)
$$;

CREATE OR REPLACE FUNCTION public.fee_pay_start(_invoice UUID, _amount NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.invoices; paid NUMERIC; bal NUMERIC; amt NUMERIC := round(COALESCE(_amount, 0), 2);
  me UUID; ref TEXT; oid UUID; cur TEXT; email TEXT; allowed BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in to pay' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'you cannot pay this invoice' USING ERRCODE = '42501'; END IF;
  allowed := public.is_guardian_of(i.student_id)
    OR (public.is_self_student(i.student_id) AND COALESCE((SELECT fees_allow_student_pay FROM public.school_config WHERE school_id = i.school_id), FALSE));
  IF NOT allowed THEN RAISE EXCEPTION 'you cannot pay this invoice' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(i.school_id, 'fees', 'fees and payments');
  IF i.status = 'cancelled' THEN RAISE EXCEPTION 'this invoice is cancelled' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
  bal := i.total - paid;
  IF bal <= 0 THEN RAISE EXCEPTION 'this invoice is already fully paid' USING ERRCODE = '22023'; END IF;
  IF amt <= 0 THEN RAISE EXCEPTION 'enter an amount above zero' USING ERRCODE = '22023'; END IF;
  IF amt > bal THEN RAISE EXCEPTION 'that is more than the balance of %', bal USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.fee_payment_orders WHERE invoice_id = i.id AND status IN ('created', 'pending') AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'too many unfinished payment attempts; finish or wait before starting another' USING ERRCODE = '54000';
  END IF;
  SELECT id INTO me FROM public.profiles WHERE school_id = i.school_id AND user_id = auth.uid();
  SELECT currency INTO cur FROM public.schools WHERE id = i.school_id;
  SELECT u.email::text INTO email FROM auth.users u WHERE u.id = auth.uid();
  ref := 'FEE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  INSERT INTO public.fee_payment_orders (school_id, invoice_id, student_id, payer_profile_id, payer_user_id, payer_name, payer_email, reference, amount, currency)
  VALUES (i.school_id, i.id, i.student_id, me, auth.uid(), (SELECT full_name FROM public.profiles WHERE id = me), email, ref, amt, COALESCE(cur, 'GHS'))
  RETURNING id INTO oid;
  RETURN jsonb_build_object('order_id', oid, 'reference', ref, 'amount', amt, 'currency', COALESCE(cur, 'GHS'), 'balance_before', bal);
END $$;

-- Teachers granted 'fees.status' see only a one-word status for the students of a class they teach. No amounts, no history.
CREATE OR REPLACE FUNCTION public.fee_class_status(_school UUID, _class UUID)
RETURNS TABLE (student_id UUID, student_name TEXT, status TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(_school, 'fees.view') OR (public.has_permission(_school, 'fees.status') AND EXISTS (
      SELECT 1 FROM public.teaching_assignments ta JOIN public.profiles p ON p.id = ta.teacher_id
      WHERE ta.school_id = _school AND ta.class_id = _class AND p.user_id = auth.uid()))) THEN
    RAISE EXCEPTION 'you cannot see fee status for this class' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT e.student_id, p.full_name,
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.student_id = e.student_id AND i.status = 'issued') THEN 'none'
        WHEN EXISTS (SELECT 1 FROM public.invoices i WHERE i.student_id = e.student_id AND i.status = 'issued' AND i.due_on < current_date
                     AND COALESCE((SELECT sum(x.amount) FROM public.payments x WHERE x.invoice_id = i.id AND x.status = 'recorded'), 0) < i.total) THEN 'overdue'
        WHEN EXISTS (SELECT 1 FROM public.invoices i WHERE i.student_id = e.student_id AND i.status = 'issued'
                     AND COALESCE((SELECT sum(x.amount) FROM public.payments x WHERE x.invoice_id = i.id AND x.status = 'recorded'), 0) > 0
                     AND COALESCE((SELECT sum(x.amount) FROM public.payments x WHERE x.invoice_id = i.id AND x.status = 'recorded'), 0) < i.total) THEN 'part_paid'
        WHEN EXISTS (SELECT 1 FROM public.invoices i WHERE i.student_id = e.student_id AND i.status = 'issued'
                     AND COALESCE((SELECT sum(x.amount) FROM public.payments x WHERE x.invoice_id = i.id AND x.status = 'recorded'), 0) < i.total) THEN 'not_yet_due'
        ELSE 'paid' END
    FROM public.enrollments e JOIN public.profiles p ON p.id = e.student_id
    WHERE e.class_id = _class AND e.school_id = _school AND e.status = 'active' ORDER BY p.full_name;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Email outbox (delivery is tracked separately from the thing it announces; a failed email never undoes a payment)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.notification_outbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  recipient_id UUID,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX notification_outbox_open ON public.notification_outbox (created_at) WHERE status IN ('pending', 'failed');
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_outbox FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_email(_school UUID, _recipient UUID, _subject TEXT, _body TEXT, _key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE addr TEXT;
BEGIN
  SELECT p.email::text INTO addr FROM public.profiles p WHERE p.id = _recipient AND p.school_id = _school AND p.status = 'active';
  IF addr IS NULL OR addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RETURN; END IF;
  INSERT INTO public.notification_outbox (school_id, recipient_id, to_email, subject, body, dedupe_key) VALUES (_school, _recipient, addr, _subject, _body, _key)
  ON CONFLICT (dedupe_key) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.outbox_claim(_limit INT DEFAULT 25)
RETURNS TABLE (id UUID, to_email TEXT, subject TEXT, body TEXT, school_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
    WITH c AS (SELECT o.id FROM public.notification_outbox o WHERE o.status IN ('pending', 'failed') AND o.attempts < 5 ORDER BY o.created_at LIMIT least(GREATEST(_limit, 1), 100) FOR UPDATE SKIP LOCKED),
         u AS (UPDATE public.notification_outbox o SET attempts = o.attempts + 1 FROM c WHERE o.id = c.id RETURNING o.id, o.to_email, o.subject, o.body, o.school_id)
    SELECT u.id, u.to_email, u.subject, u.body, s.name FROM u JOIN public.schools s ON s.id = u.school_id;
END $$;

CREATE OR REPLACE FUNCTION public.outbox_mark(_id UUID, _ok BOOLEAN, _error TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notification_outbox SET status = CASE WHEN _ok THEN 'sent' WHEN attempts >= 5 THEN 'dead' ELSE 'failed' END,
    sent_at = CASE WHEN _ok THEN clock_timestamp() END, last_error = CASE WHEN _ok THEN NULL ELSE left(_error, 300) END WHERE id = _id
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Scheduled fee reminders. Safe to run as often as you like: each (invoice, stage, due date, person) is sent once.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.fee_reminder_log (
  invoice_id UUID NOT NULL REFERENCES public.invoices (id) ON DELETE CASCADE,
  stage INT NOT NULL,
  due_on DATE NOT NULL,
  recipient_id UUID NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (invoice_id, stage, due_on, recipient_id)
);
ALTER TABLE public.fee_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_reminder_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fee_reminder_tick()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i RECORD; r RECORD; stage INT; stages INT[]; pick INT; fresh BOOLEAN; sent INT := 0; bal NUMERIC; days INT; sname TEXT; tname TEXT; subj TEXT; msg TEXT; cur TEXT;
BEGIN
  FOR i IN
    SELECT v.*, COALESCE(NULLIF(t.reminder_days, '{}'), '{14,7,3,0}') AS before_days, t.name AS term_name, c.fees_overdue_reminder_days AS after_days, s.name AS school_name, s.currency
    FROM public.invoices v JOIN public.schools s ON s.id = v.school_id LEFT JOIN public.terms t ON t.id = v.term_id LEFT JOIN public.school_config c ON c.school_id = v.school_id
    WHERE v.status = 'issued' AND s.status = 'active' AND v.due_on BETWEEN current_date - 120 AND current_date + 90
  LOOP
    SELECT i.total - COALESCE(sum(p.amount), 0) INTO bal FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded';
    bal := COALESCE(bal, i.total);
    IF bal <= 0 THEN CONTINUE; END IF;
    days := i.due_on - current_date;
    -- Stages are days before the deadline (positive) or days after it (negative).
    stages := i.before_days || COALESCE((SELECT array_agg(-d) FROM unnest(COALESCE(i.after_days, '{1,7,14}')) d), '{}');
    SELECT min(x) INTO pick FROM unnest(stages) x WHERE x >= days;
    IF pick IS NULL THEN CONTINUE; END IF;
    SELECT name INTO sname FROM public.profiles WHERE id = i.student_id;
    cur := COALESCE(i.currency, 'GHS');
    FOR r IN SELECT g.guardian_id AS pid FROM public.guardian_links g WHERE g.student_id = i.student_id AND g.status = 'verified' UNION SELECT i.student_id LOOP
      fresh := FALSE;
      FOREACH stage IN ARRAY stages LOOP
        IF stage >= days THEN
          INSERT INTO public.fee_reminder_log (invoice_id, stage, due_on, recipient_id) VALUES (i.id, stage, i.due_on, r.pid) ON CONFLICT DO NOTHING;
          IF FOUND AND stage = pick THEN fresh := TRUE; END IF;
        END IF;
      END LOOP;
      IF fresh THEN
        tname := COALESCE(i.term_name, i.title);
        subj := CASE WHEN days < 0 THEN 'School fees are overdue' ELSE 'School fees reminder' END;
        msg := format('The outstanding school fees for %s (%s) are %s %s. The due date %s %s. Sign in to view the breakdown and your payment options.',
                      sname, tname, cur, to_char(bal, 'FM999,999,990.00'), CASE WHEN days < 0 THEN 'was' ELSE 'is' END, to_char(i.due_on, 'DD Mon YYYY'));
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link) VALUES (i.school_id, r.pid, 'fee_reminder', subj, msg, '/fees');
        PERFORM public.enqueue_email(i.school_id, r.pid, subj || ' - ' || i.school_name, msg || E'\n\n' || i.school_name, 'feeRem:' || i.id || ':' || pick || ':' || i.due_on || ':' || r.pid);
        sent := sent + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN sent;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Settlement again, now also queueing the confirmation email
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_settle(_reference TEXT, _gateway JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.fee_payment_orders; i public.invoices; g_status TEXT := _gateway ->> 'status';
  paid NUMERIC; bal NUMERIC; apply_amt NUMERIC; rct TEXT; pid UUID; student_name TEXT; total_paid NUMERIC; sname TEXT; msg TEXT; r RECORD; yr TEXT;
BEGIN
  SELECT * INTO o FROM public.fee_payment_orders WHERE reference = _reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unknown'); END IF;
  IF o.status = 'paid' THEN RETURN jsonb_build_object('status', 'paid', 'payment_id', o.payment_id); END IF;

  IF g_status = 'success' THEN
    IF (_gateway ->> 'amount_minor')::bigint IS DISTINCT FROM round(o.amount * 100)::bigint OR upper(COALESCE(_gateway ->> 'currency', '')) <> upper(o.currency) THEN
      UPDATE public.fee_payment_orders SET status = 'mismatch', verified_at = clock_timestamp(), gateway_response = 'Amount or currency did not match the order',
        gateway_transaction_id = _gateway ->> 'transaction_id' WHERE id = o.id;
      RETURN jsonb_build_object('status', 'mismatch');
    END IF;
    SELECT * INTO i FROM public.invoices WHERE id = o.invoice_id FOR UPDATE;
    SELECT COALESCE(sum(amount), 0) INTO paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
    bal := CASE WHEN i.status = 'cancelled' THEN 0 ELSE GREATEST(i.total - paid, 0) END;
    apply_amt := LEAST(o.amount, bal);
    IF apply_amt > 0 THEN
      rct := public.next_fee_number(o.school_id, 'receipt');
      INSERT INTO public.payments (school_id, invoice_id, student_id, amount, method, reference, paid_on, receipt_number, note, order_id)
      VALUES (o.school_id, o.invoice_id, o.student_id, apply_amt, 'paystack', o.reference, current_date, rct,
              'Online payment verified with Paystack' || CASE WHEN o.payer_name IS NOT NULL THEN ' (paid by ' || o.payer_name || ')' ELSE '' END, o.id)
      RETURNING id INTO pid;
    END IF;
    UPDATE public.fee_payment_orders SET status = 'paid', verified_at = clock_timestamp(), paid_at = COALESCE((_gateway ->> 'paid_at')::timestamptz, clock_timestamp()),
      channel = _gateway ->> 'channel', gateway_response = _gateway ->> 'gateway_response', gateway_transaction_id = _gateway ->> 'transaction_id',
      payment_id = pid, excess = o.amount - apply_amt WHERE id = o.id;
    SELECT COALESCE(sum(amount), 0) INTO total_paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
    SELECT full_name INTO student_name FROM public.profiles WHERE id = o.student_id;

    BEGIN
      IF apply_amt > 0 THEN
        SELECT y.name INTO yr FROM public.terms t JOIN public.academic_years y ON y.id = t.academic_year_id WHERE t.id = i.term_id;
        sname := (SELECT name FROM public.schools WHERE id = o.school_id);
        FOR r IN
          SELECT g.guardian_id AS pid FROM public.guardian_links g WHERE g.student_id = o.student_id AND g.status = 'verified'
          UNION SELECT o.student_id
          UNION SELECT m.profile_id FROM public.school_memberships m WHERE m.school_id = o.school_id AND m.status = 'active' AND m.role IN ('school_admin', 'finance_officer')
        LOOP
          msg := format('%s %s received for %s (%s). Paid to date %s of %s. Receipt %s. Reference %s.', o.currency, to_char(apply_amt, 'FM999,999,990.00'), student_name,
                        COALESCE(yr || ' - ', '') || i.title, to_char(total_paid, 'FM999,999,990.00'), to_char(i.total, 'FM999,999,990.00'), rct, o.reference);
          INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link) VALUES (o.school_id, r.pid, 'payment_received', 'School fees payment confirmed', msg, '/fees');
          PERFORM public.enqueue_email(o.school_id, r.pid, 'School fees payment confirmed - ' || sname,
            'We have successfully confirmed a payment. ' || msg || ' Outstanding balance: ' || o.currency || ' ' || to_char(i.total - total_paid, 'FM999,999,990.00') ||
            E'.\n\nYou can sign in to view the receipt and payment history.\n\n' || sname, 'feePaid:' || o.id || ':' || r.pid);
        END LOOP;
      END IF;
      IF o.amount - apply_amt > 0 THEN
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
        SELECT o.school_id, m.profile_id, 'payment_received', 'Payment received above the balance',
          format('%s %s of order %s was paid after the invoice was settled. It needs a refund or credit decision.', o.currency, to_char(o.amount - apply_amt, 'FM999,999,990.00'), o.reference), '/fees'
        FROM public.school_memberships m WHERE m.school_id = o.school_id AND m.status = 'active' AND m.role IN ('school_admin', 'finance_officer');
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('status', 'paid', 'payment_id', pid, 'receipt', rct, 'applied', apply_amt, 'excess', o.amount - apply_amt, 'balance', i.total - total_paid);
  END IF;

  IF g_status IN ('failed', 'abandoned', 'reversed') THEN
    UPDATE public.fee_payment_orders SET status = CASE WHEN g_status = 'abandoned' THEN 'abandoned' ELSE 'failed' END, verified_at = clock_timestamp(),
      gateway_response = _gateway ->> 'gateway_response', gateway_transaction_id = _gateway ->> 'transaction_id' WHERE id = o.id;
    RETURN jsonb_build_object('status', CASE WHEN g_status = 'abandoned' THEN 'abandoned' ELSE 'failed' END);
  END IF;
  RETURN jsonb_build_object('status', o.status);
END $$;

-- ---------------------------------------------------------------------------------------------
-- 9. Refunds. The original payment stays visible (voided, with its reason); the refund row tracks the money going back.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE public.fee_payment_orders ADD COLUMN IF NOT EXISTS excess_refunded_at TIMESTAMPTZ;
CREATE TABLE public.fee_refunds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  payment_id UUID,
  order_id UUID,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 5),
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_provider', 'refunded', 'failed')),
  provider_reference TEXT,
  error TEXT,
  requested_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.fee_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_refunds FROM PUBLIC, anon, authenticated;

-- Start a refund of a recorded payment. Needs the refund permission. The payment is reversed in the ledger at once.
CREATE OR REPLACE FUNCTION public.fee_refund_begin(_payment UUID, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.payments; o public.fee_payment_orders; rid UUID; cur TEXT;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(p.school_id, 'payments.refund') THEN RAISE EXCEPTION 'you cannot refund payments' USING ERRCODE = '42501'; END IF;
  IF p.status <> 'recorded' THEN RAISE EXCEPTION 'only a recorded payment can be refunded' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'give a reason (at least 5 characters)' USING ERRCODE = '22023'; END IF;
  SELECT currency INTO cur FROM public.schools WHERE id = p.school_id;
  IF p.method = 'paystack' THEN SELECT * INTO o FROM public.fee_payment_orders WHERE id = p.order_id; END IF;
  UPDATE public.payments SET status = 'voided', void_reason = 'Refunded: ' || btrim(_reason), voided_by = public.my_profile_id(p.school_id), voided_at = clock_timestamp() WHERE id = p.id;
  INSERT INTO public.fee_refunds (school_id, payment_id, order_id, amount, currency, reason, method, status, requested_by)
  VALUES (p.school_id, p.id, o.id, p.amount, COALESCE(o.currency, cur, 'GHS'), btrim(_reason), p.method, CASE WHEN p.method = 'paystack' THEN 'pending_provider' ELSE 'refunded' END, public.my_profile_id(p.school_id))
  RETURNING id INTO rid;
  IF p.method <> 'paystack' THEN UPDATE public.fee_refunds SET completed_at = clock_timestamp() WHERE id = rid; END IF;
  PERFORM public.write_audit(p.school_id, 'payment_refunded', 'payment', p.id, p.receipt_number, jsonb_build_object('amount', p.amount, 'reason', btrim(_reason), 'method', p.method));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT p.school_id, g.guardian_id, 'payment_refunded', 'A payment was refunded', format('%s: %s %s. %s', p.receipt_number, COALESCE(o.currency, cur, 'GHS'), to_char(p.amount, 'FM999,999,990.00'),
    CASE WHEN p.method = 'paystack' THEN 'It is being returned through Paystack.' ELSE 'The school will return the money.' END), '/fees'
  FROM public.guardian_links g WHERE g.student_id = p.student_id AND g.status = 'verified';
  RETURN jsonb_build_object('refund_id', rid, 'method', p.method, 'amount', p.amount, 'reference', o.reference, 'currency', COALESCE(o.currency, cur, 'GHS'));
END $$;

-- Refund money that arrived after an invoice was already settled (the "excess" case).
CREATE OR REPLACE FUNCTION public.fee_refund_excess_begin(_order UUID, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fee_payment_orders; rid UUID;
BEGIN
  SELECT * INTO o FROM public.fee_payment_orders WHERE id = _order FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(o.school_id, 'payments.refund') THEN RAISE EXCEPTION 'you cannot refund payments' USING ERRCODE = '42501'; END IF;
  IF o.status <> 'paid' OR o.excess <= 0 OR o.excess_refunded_at IS NOT NULL THEN RAISE EXCEPTION 'there is no unrefunded excess on this payment' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'give a reason (at least 5 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE public.fee_payment_orders SET excess_refunded_at = clock_timestamp() WHERE id = o.id;
  INSERT INTO public.fee_refunds (school_id, order_id, amount, currency, reason, method, status, requested_by)
  VALUES (o.school_id, o.id, o.excess, o.currency, btrim(_reason), 'paystack', 'pending_provider', public.my_profile_id(o.school_id)) RETURNING id INTO rid;
  PERFORM public.write_audit(o.school_id, 'payment_refunded', 'fee_order', o.id, o.reference, jsonb_build_object('amount', o.excess, 'reason', btrim(_reason), 'excess', true));
  RETURN jsonb_build_object('refund_id', rid, 'method', 'paystack', 'amount', o.excess, 'reference', o.reference, 'currency', o.currency);
END $$;

CREATE OR REPLACE FUNCTION public.fee_refund_retry(_refund UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fee_refunds; o public.fee_payment_orders;
BEGIN
  SELECT * INTO f FROM public.fee_refunds WHERE id = _refund FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(f.school_id, 'payments.refund') THEN RAISE EXCEPTION 'you cannot refund payments' USING ERRCODE = '42501'; END IF;
  IF f.status <> 'failed' OR f.method <> 'paystack' THEN RAISE EXCEPTION 'only a failed online refund can be retried' USING ERRCODE = '22023'; END IF;
  SELECT * INTO o FROM public.fee_payment_orders WHERE id = f.order_id;
  UPDATE public.fee_refunds SET status = 'pending_provider', error = NULL WHERE id = f.id;
  RETURN jsonb_build_object('refund_id', f.id, 'method', 'paystack', 'amount', f.amount, 'reference', o.reference, 'currency', f.currency);
END $$;

-- Server only: record what Paystack answered.
CREATE OR REPLACE FUNCTION public.fee_refund_finish(_refund UUID, _ok BOOLEAN, _provider_ref TEXT, _error TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fee_refunds;
BEGIN
  UPDATE public.fee_refunds SET status = CASE WHEN _ok THEN 'refunded' ELSE 'failed' END, provider_reference = _provider_ref, error = CASE WHEN _ok THEN NULL ELSE left(_error, 300) END,
    completed_at = CASE WHEN _ok THEN clock_timestamp() END WHERE id = _refund AND status = 'pending_provider' RETURNING * INTO f;
  IF FOUND AND NOT _ok THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT f.school_id, m.profile_id, 'refund_failed', 'An online refund did not go through', left(COALESCE(_error, 'Paystack refused it'), 200), '/fees'
    FROM public.school_memberships m WHERE m.school_id = f.school_id AND m.status = 'active' AND m.role IN ('school_admin', 'finance_officer');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fee_refunds_list(_school UUID)
RETURNS TABLE (id UUID, amount NUMERIC, currency TEXT, reason TEXT, method TEXT, status TEXT, error TEXT, created_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, student TEXT, receipt TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'fees.view') THEN RAISE EXCEPTION 'you cannot see refunds' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT f.id, f.amount, f.currency, f.reason, f.method, f.status, f.error, f.created_at, f.completed_at,
      COALESCE((SELECT pr.full_name FROM public.payments p JOIN public.profiles pr ON pr.id = p.student_id WHERE p.id = f.payment_id),
               (SELECT pr.full_name FROM public.fee_payment_orders o JOIN public.profiles pr ON pr.id = o.student_id WHERE o.id = f.order_id)),
      (SELECT p.receipt_number FROM public.payments p WHERE p.id = f.payment_id)
    FROM public.fee_refunds f WHERE f.school_id = _school ORDER BY f.created_at DESC LIMIT 100;
END $$;

-- Online attempts the server should re-check with Paystack (stuck pending). Server only.
CREATE OR REPLACE FUNCTION public.fee_orders_to_reconcile(_school UUID DEFAULT NULL, _limit INT DEFAULT 25)
RETURNS TABLE (reference TEXT) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.reference FROM public.fee_payment_orders o
  WHERE o.status IN ('created', 'pending') AND o.initialized_at IS NOT NULL AND o.created_at < now() - interval '10 minutes' AND o.created_at > now() - interval '7 days'
    AND (_school IS NULL OR o.school_id = _school) ORDER BY o.created_at LIMIT least(GREATEST(_limit, 1), 100)
$$;

-- ---------------------------------------------------------------------------------------------
-- 10. Reports (settled ledger only; gross, refunds, reversals and net kept apart)
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fee_report(_school UUID, _year UUID DEFAULT NULL, _term UUID DEFAULT NULL, _class UUID DEFAULT NULL, _from DATE DEFAULT NULL, _to DATE DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  IF NOT public.has_permission(_school, 'fees.view') THEN RAISE EXCEPTION 'you cannot view fee reports' USING ERRCODE = '42501'; END IF;
  WITH inv AS (
    SELECT i.id, i.student_id, i.total, i.due_on, i.term_id,
      (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id WHERE e.student_id = i.student_id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1) AS class_name
    FROM public.invoices i
    WHERE i.school_id = _school AND i.status = 'issued'
      AND (_term IS NULL OR i.term_id = _term)
      AND (_year IS NULL OR i.term_id IN (SELECT id FROM public.terms WHERE academic_year_id = _year))
      AND (_class IS NULL OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = i.student_id AND e.class_id = _class AND e.status = 'active'))
  ), pay AS (
    SELECT p.*, inv.class_name, inv.term_id FROM public.payments p JOIN inv ON inv.id = p.invoice_id
    WHERE (_from IS NULL OR p.paid_on >= _from) AND (_to IS NULL OR p.paid_on <= _to)
  ), bal AS (
    SELECT inv.*, COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = inv.id AND p.status = 'recorded'), 0) AS paid FROM inv
  ), adj AS (
    SELECT a.* FROM public.fee_adjustments a JOIN inv ON inv.id = a.invoice_id
  )
  SELECT jsonb_build_object(
    'invoices', (SELECT count(*) FROM bal),
    'net_assessed', COALESCE((SELECT sum(total) FROM bal), 0),
    'discounts', COALESCE((SELECT sum(amount) FROM adj WHERE kind <> 'charge'), 0),
    'charges', COALESCE((SELECT sum(amount) FROM adj WHERE kind = 'charge'), 0),
    'assessed', COALESCE((SELECT sum(total) FROM bal), 0) + COALESCE((SELECT sum(amount) FROM adj WHERE kind <> 'charge'), 0) - COALESCE((SELECT sum(amount) FROM adj WHERE kind = 'charge'), 0),
    'online_collected', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'recorded' AND method = 'paystack'), 0),
    'offline_collected', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'recorded' AND method <> 'paystack'), 0),
    'net_collected', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'recorded'), 0),
    'refunds', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'voided' AND void_reason LIKE 'Refunded:%'), 0),
    'reversals', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'voided' AND void_reason NOT LIKE 'Refunded:%' AND void_reason NOT LIKE 'Rejected:%'), 0),
    'gross_collected', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'recorded' OR (status = 'voided' AND void_reason NOT LIKE 'Rejected:%')), 0),
    'pending_offline', COALESCE((SELECT sum(amount) FROM pay WHERE status = 'pending'), 0),
    'outstanding', COALESCE((SELECT sum(total - paid) FROM bal WHERE paid < total), 0),
    'overdue_amount', COALESCE((SELECT sum(total - paid) FROM bal WHERE due_on < current_date AND paid < total), 0),
    'overdue_accounts', (SELECT count(*) FROM bal WHERE due_on < current_date AND paid < total),
    'students_paid', (SELECT count(*) FROM bal WHERE paid >= total),
    'students_part_paid', (SELECT count(*) FROM bal WHERE paid > 0 AND paid < total),
    'students_unpaid', (SELECT count(*) FROM bal WHERE paid = 0 AND total > 0),
    'by_class', COALESCE((SELECT jsonb_agg(jsonb_build_object('class', COALESCE(class_name, 'Not in a class'), 'assessed', a, 'collected', c, 'outstanding', a - c) ORDER BY class_name)
                          FROM (SELECT class_name, sum(total) a, sum(paid) c FROM bal GROUP BY class_name) g), '[]'),
    'by_term', COALESCE((SELECT jsonb_agg(jsonb_build_object('term', COALESCE(tn, 'No period'), 'assessed', a, 'collected', c, 'outstanding', a - c) ORDER BY tn)
                         FROM (SELECT t.name AS tn, sum(b.total) a, sum(b.paid) c FROM bal b LEFT JOIN public.terms t ON t.id = b.term_id GROUP BY t.name) g), '[]'),
    'by_category', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', d, 'amount', s) ORDER BY s DESC)
                             FROM (SELECT l.description d, sum(l.amount) s FROM public.invoice_lines l JOIN inv ON inv.id = l.invoice_id WHERE l.amount > 0 GROUP BY l.description) g), '[]'),
    'by_method', COALESCE((SELECT jsonb_agg(jsonb_build_object('method', method, 'amount', s, 'payments', n) ORDER BY s DESC)
                           FROM (SELECT method, sum(amount) s, count(*) n FROM pay WHERE status = 'recorded' GROUP BY method) g), '[]'),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', d, 'amount', s) ORDER BY d)
                       FROM (SELECT paid_on d, sum(amount) s FROM pay WHERE status = 'recorded' AND paid_on >= COALESCE(_from, current_date - 30) GROUP BY paid_on) g), '[]'),
    'monthly', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'amount', s) ORDER BY m)
                         FROM (SELECT to_char(date_trunc('month', paid_on), 'YYYY-MM') m, sum(amount) s FROM pay WHERE status = 'recorded' GROUP BY 1) g), '[]'),
    'recent_adjustments', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'reason', reason, 'at', created_at) ORDER BY created_at DESC)
                                    FROM (SELECT * FROM adj ORDER BY created_at DESC LIMIT 8) x), '[]'),
    'upcoming_deadlines', COALESCE((SELECT jsonb_agg(jsonb_build_object('due_on', due_on, 'accounts', n, 'outstanding', s) ORDER BY due_on)
                                    FROM (SELECT due_on, count(*) n, sum(total - paid) s FROM bal WHERE paid < total AND due_on >= current_date GROUP BY due_on ORDER BY due_on LIMIT 5) x), '[]')
  ) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.fee_log_export(_school UUID, _what TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'fees.export') THEN RAISE EXCEPTION 'you cannot export fee data' USING ERRCODE = '42501'; END IF;
  PERFORM public.write_audit(_school, 'fees_exported', 'report', NULL, left(COALESCE(_what, 'fee report'), 80), '{}');
END $$;

-- A student's account across every invoice: the statement parents and students can download.
CREATE OR REPLACE FUNCTION public.student_statement(_school UUID, _student UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE staff BOOLEAN;
BEGIN
  IF NOT public.can_see_fees(_school, _student) THEN RAISE EXCEPTION 'you cannot see this account' USING ERRCODE = '42501'; END IF;
  staff := public.has_permission(_school, 'fees.view');
  RETURN jsonb_build_object(
    'school', (SELECT jsonb_build_object('name', s.name, 'currency', s.currency) FROM public.schools s WHERE s.id = _school),
    'student', (SELECT jsonb_build_object('name', p.full_name, 'admission_number', p.admission_number) FROM public.profiles p WHERE p.id = _student),
    'invoices', COALESCE((SELECT jsonb_agg(jsonb_build_object('number', i.number, 'title', i.title, 'term', t.name, 'year', y.name, 'issued_on', i.issued_on, 'due_on', i.due_on, 'total', i.total,
        'paid', COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded'), 0), 'status', i.status,
        'payments', COALESCE((SELECT jsonb_agg(jsonb_build_object('receipt', p.receipt_number, 'amount', p.amount, 'method', p.method, 'paid_on', p.paid_on, 'status', p.status) ORDER BY p.paid_on)
                              FROM public.payments p WHERE p.invoice_id = i.id AND (staff OR p.status <> 'pending')), '[]')) ORDER BY i.issued_on)
      FROM public.invoices i LEFT JOIN public.terms t ON t.id = i.term_id LEFT JOIN public.academic_years y ON y.id = t.academic_year_id
      WHERE i.school_id = _school AND i.student_id = _student), '[]'));
END $$;

-- Which period a fee belongs to. Invoices raised from it follow that period's fee due date.
CREATE OR REPLACE FUNCTION public.set_structure_term(_structure UUID, _term UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f public.fee_structures;
BEGIN
  SELECT * INTO f FROM public.fee_structures WHERE id = _structure;
  IF NOT FOUND OR NOT public.has_permission(f.school_id, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot change fees' USING ERRCODE = '42501'; END IF;
  IF _term IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.terms WHERE id = _term AND school_id = f.school_id AND status <> 'closed') THEN RAISE EXCEPTION 'choose an open period' USING ERRCODE = '22023'; END IF;
  UPDATE public.fee_structures SET term_id = _term WHERE id = _structure;
END $$;

-- Invoices raised from a fee now carry its period and, when the period has one, its fee due date.
CREATE OR REPLACE FUNCTION public.generate_invoices(_structure UUID, _class UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.fee_structures; s RECORD; created INT := 0; skipped INT := 0; due DATE;
BEGIN
  SELECT * INTO f FROM public.fee_structures WHERE id = _structure;
  IF NOT FOUND OR NOT public.has_permission(f.school_id, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot raise invoices' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(f.school_id, 'fees', 'fees and payments');
  IF NOT f.is_active THEN RAISE EXCEPTION 'this fee structure is switched off' USING ERRCODE = '22023'; END IF;
  IF f.class_id IS NOT NULL AND f.class_id <> _class THEN RAISE EXCEPTION 'this fee is for a different class' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = _class AND school_id = f.school_id) THEN RAISE EXCEPTION 'unknown class' USING ERRCODE = '22023'; END IF;
  due := COALESCE((SELECT t.fee_due_on FROM public.terms t WHERE t.id = f.term_id), f.due_on);
  FOR s IN SELECT e.student_id FROM public.enrollments e WHERE e.class_id = _class AND e.status = 'active' ORDER BY e.student_id LOOP
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.structure_id = f.id AND i.student_id = s.student_id AND i.status = 'issued') THEN
      skipped := skipped + 1;
    ELSE
      DECLARE
        inv UUID; num TEXT := public.next_fee_number(f.school_id, 'invoice');
      BEGIN
        INSERT INTO public.invoices (school_id, student_id, structure_id, term_id, number, title, due_on, total, created_by)
        VALUES (f.school_id, s.student_id, f.id, f.term_id, num, f.name, due, f.amount, public.my_profile_id(f.school_id)) RETURNING id INTO inv;
        INSERT INTO public.invoice_lines (school_id, invoice_id, description, amount) VALUES (f.school_id, inv, f.name, f.amount);
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
        SELECT f.school_id, g.guardian_id, 'invoice_issued', 'A new fee invoice was issued', num, '/fees'
          FROM public.guardian_links g WHERE g.student_id = s.student_id AND g.status = 'verified';
        created := created + 1;
      END;
    END IF;
  END LOOP;
  PERFORM public.write_audit(f.school_id, 'invoice_created', 'fee_structure', f.id, left(f.name, 80), jsonb_build_object('created', created, 'skipped', skipped, 'amount', f.amount));
  RETURN jsonb_build_object('created', created, 'skipped', skipped);
END $$;

DO $$
DECLARE fn TEXT;
BEGIN
  -- server-only
  FOREACH fn IN ARRAY ARRAY['fee_reminder_tick()', 'enqueue_email(UUID, UUID, TEXT, TEXT, TEXT)', 'outbox_claim(INT)', 'outbox_mark(UUID, BOOLEAN, TEXT)',
    'fee_refund_finish(UUID, BOOLEAN, TEXT, TEXT)', 'fee_orders_to_reconcile(UUID, INT)', 'fee_settle(TEXT, JSONB)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
  -- callable by signed-in people; each checks its own permission
  FOREACH fn IN ARRAY ARRAY['save_academic_year(UUID, UUID, TEXT, DATE, DATE, TEXT)', 'save_term(UUID, UUID, UUID, TEXT, DATE, DATE, DATE, INT[], DATE, DATE, DATE, DATE)',
    'set_term_fee_due(UUID, DATE, TEXT)', 'set_current_period(UUID, UUID, UUID)', 'publish_academic_calendar(UUID)', 'close_term(UUID)', 'current_period(UUID)', 'calendar_periods(UUID)',
    'fee_settings(UUID)', 'save_fee_settings(UUID, BOOLEAN, BOOLEAN, INT[])', 'apply_fee_adjustment(UUID, TEXT, NUMERIC, TEXT)', 'record_payment(UUID, NUMERIC, TEXT, TEXT, DATE, TEXT)',
    'review_payment(UUID, BOOLEAN, TEXT)', 'fee_pay_start(UUID, NUMERIC)', 'fee_class_status(UUID, UUID)', 'fee_refund_begin(UUID, TEXT)', 'fee_refund_excess_begin(UUID, TEXT)',
    'fee_refund_retry(UUID)', 'fee_refunds_list(UUID)', 'fee_report(UUID, UUID, UUID, UUID, DATE, DATE)', 'fee_log_export(UUID, TEXT)', 'student_statement(UUID, UUID)',
    'set_structure_term(UUID, UUID)', 'generate_invoices(UUID, UUID)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
