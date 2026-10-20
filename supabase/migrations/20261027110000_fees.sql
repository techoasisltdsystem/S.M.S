-- Phase G: fees and payments.
--
--   * Fee structures (a named charge, optionally for one class) and invoices with lines,
--     numbered per school and year. Invoices can be created one by one or generated
--     for a class from a structure without creating duplicates.
--   * Payments are recorded by the finance office (cash, mobile money, bank, cheque).
--     There is no online payment gateway. A payment can never exceed the balance, is
--     never deleted (it can be voided with a reason), and every change is audited.
--   * Parents see only their verified children's invoices and payments. Students,
--     teachers, other staff and the platform see none of it unless they hold a fees
--     permission.
--   * Notifications carry no amounts. The feature follows the school's plan.

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'fees.view'), ('school_admin', 'payments.record'), ('school_admin', 'payments.refund'),
  ('finance_officer', 'fees.view'), ('finance_officer', 'payments.record'), ('finance_officer', 'fees.invoice'),
  ('headteacher', 'fees.view'), ('auditor', 'fees.view')
ON CONFLICT DO NOTHING;

CREATE TABLE public.fee_structures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  class_id UUID,
  term_id UUID,
  due_on DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, term_id) REFERENCES public.terms (school_id, id) ON DELETE RESTRICT,
  UNIQUE (school_id, id)
);

CREATE TABLE public.fee_counters (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  year INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (school_id, kind, year)
);

CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  student_id UUID NOT NULL,
  structure_id UUID,
  number TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 150),
  issued_on DATE NOT NULL DEFAULT current_date,
  due_on DATE NOT NULL,
  total NUMERIC(12,2) NOT NULL CHECK (total > 0 AND total <= 10000000),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  last_reminded_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, structure_id) REFERENCES public.fee_structures (school_id, id) ON DELETE RESTRICT,
  UNIQUE (school_id, number),
  UNIQUE (school_id, id)
);
CREATE UNIQUE INDEX one_invoice_per_structure ON public.invoices (structure_id, student_id) WHERE structure_id IS NOT NULL AND status = 'issued';
CREATE INDEX idx_invoices_student ON public.invoices (student_id);

CREATE TABLE public.invoice_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 150),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  FOREIGN KEY (school_id, invoice_id) REFERENCES public.invoices (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  student_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'mobile_money', 'bank_transfer', 'cheque', 'other')),
  reference TEXT CHECK (reference IS NULL OR length(reference) <= 80),
  paid_on DATE NOT NULL,
  receipt_number TEXT NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  recorded_by UUID,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'voided')),
  void_reason TEXT,
  voided_by UUID,
  voided_at TIMESTAMPTZ,
  FOREIGN KEY (school_id, invoice_id) REFERENCES public.invoices (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (school_id, receipt_number)
);
CREATE INDEX idx_payments_invoice ON public.payments (invoice_id);

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_structures, public.fee_counters, public.invoices, public.invoice_lines, public.payments FROM anon, authenticated;

-- Money movements and cancellations must be on record, or not happen.
CREATE OR REPLACE FUNCTION public.audit_is_high_risk(_action public.audit_action)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _action::text IN ('role_changed', 'permission_changed', 'user_banned', 'user_suspended', 'user_activated',
    'results_approved', 'results_published', 'results_reopened', 'results_corrected', 'correction_rejected',
    'guardian_linked', 'attendance_corrected', 'school_updated', 'config_updated', 'grading_scale_changed', 'message_hidden',
    'subscription_changed', 'support_access_requested', 'support_access_approved', 'support_access_denied', 'support_access_used',
    'support_access_ended', 'admin_access_changed',
    'invoice_created', 'invoice_cancelled', 'payment_recorded', 'payment_voided')
$$;

-- Next number for invoices (INV-2026-0001) or receipts (RCT-2026-0001) in a school.
CREATE OR REPLACE FUNCTION public.next_fee_number(_school UUID, _kind TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  y INT := extract(year FROM current_date)::int;
  n INT;
BEGIN
  INSERT INTO public.fee_counters (school_id, kind, year, last_number) VALUES (_school, _kind, y, 1)
  ON CONFLICT (school_id, kind, year) DO UPDATE SET last_number = public.fee_counters.last_number + 1 RETURNING last_number INTO n;
  RETURN CASE _kind WHEN 'invoice' THEN 'INV' ELSE 'RCT' END || '-' || y || '-' || lpad(n::text, 4, '0');
END $$;

-- Status of an invoice from its total and recorded payments.
CREATE OR REPLACE FUNCTION public.invoice_status(_status TEXT, _total NUMERIC, _paid NUMERIC, _due DATE)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _status = 'cancelled' THEN 'cancelled'
              WHEN _paid >= _total THEN 'paid'
              WHEN _due < current_date THEN 'overdue'
              WHEN _paid > 0 THEN 'part_paid'
              ELSE 'unpaid' END
$$;

-- Who may see this student's money records: the finance staff, or a verified guardian.
CREATE OR REPLACE FUNCTION public.can_see_fees(_school UUID, _student UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_school, 'fees.view') OR public.is_guardian_of(_student)
$$;

-- ---------------------------------------------------------------------------
-- Fee structures
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_fee_structure(
  _school UUID, _id UUID, _name TEXT, _description TEXT, _amount NUMERIC, _class UUID, _term UUID, _due DATE, _active BOOLEAN
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid UUID;
BEGIN
  IF NOT public.has_permission(_school, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot manage fees' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(_school, 'fees', 'fees and payments');
  IF _id IS NULL THEN
    INSERT INTO public.fee_structures (school_id, name, description, amount, class_id, term_id, due_on, is_active, created_by)
    VALUES (_school, btrim(_name), NULLIF(btrim(COALESCE(_description, '')), ''), _amount, _class, _term, _due, COALESCE(_active, true), public.my_profile_id(_school))
    RETURNING id INTO sid;
  ELSE
    -- Changing an amount never changes invoices already issued.
    UPDATE public.fee_structures SET name = btrim(_name), description = NULLIF(btrim(COALESCE(_description, '')), ''), amount = _amount,
      class_id = _class, term_id = _term, due_on = _due, is_active = COALESCE(_active, is_active)
     WHERE id = _id AND school_id = _school RETURNING id INTO sid;
    IF sid IS NULL THEN RAISE EXCEPTION 'fee structure not found' USING ERRCODE = '22023'; END IF;
  END IF;
  PERFORM public.write_audit(_school, 'fee_structure_saved', 'fee_structure', sid, left(btrim(_name), 80), jsonb_build_object('amount', _amount, 'new', _id IS NULL));
  RETURN sid;
END $$;

CREATE OR REPLACE FUNCTION public.list_fee_structures(_school UUID)
RETURNS TABLE (id UUID, name TEXT, description TEXT, amount NUMERIC, class_id UUID, class_name TEXT, term_id UUID, due_on DATE, is_active BOOLEAN, invoiced BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'fees.view') THEN RAISE EXCEPTION 'you cannot view fees' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT f.id, f.name, f.description, f.amount, f.class_id, c.name, f.term_id, f.due_on, f.is_active,
         (SELECT count(*) FROM public.invoices i WHERE i.structure_id = f.id AND i.status = 'issued')
    FROM public.fee_structures f LEFT JOIN public.classes c ON c.id = f.class_id
   WHERE f.school_id = _school ORDER BY f.is_active DESC, f.due_on DESC, f.name;
END $$;

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice(_student UUID, _title TEXT, _due DATE, _lines JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  inv UUID;
  total NUMERIC := 0;
  l JSONB;
  num TEXT;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _student;
  IF NOT FOUND OR NOT public.has_permission(p.school_id, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot raise invoices' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(p.school_id, 'fees', 'fees and payments');
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.profile_id = p.id AND m.school_id = p.school_id AND m.role = 'student' AND m.status IN ('invited', 'active')) THEN
    RAISE EXCEPTION 'invoices are raised for students' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 20 THEN RAISE EXCEPTION 'add between 1 and 20 lines' USING ERRCODE = '22023'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    IF length(btrim(COALESCE(l ->> 'description', ''))) = 0 OR COALESCE((l ->> 'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'every line needs a description and an amount above zero' USING ERRCODE = '22023';
    END IF;
    total := total + (l ->> 'amount')::numeric;
  END LOOP;
  IF total > 10000000 THEN RAISE EXCEPTION 'that total is too large' USING ERRCODE = '22023'; END IF;
  num := public.next_fee_number(p.school_id, 'invoice');
  INSERT INTO public.invoices (school_id, student_id, number, title, due_on, total, created_by)
  VALUES (p.school_id, p.id, num, btrim(_title), _due, total, public.my_profile_id(p.school_id)) RETURNING id INTO inv;
  INSERT INTO public.invoice_lines (school_id, invoice_id, description, amount)
  SELECT p.school_id, inv, btrim(x ->> 'description'), (x ->> 'amount')::numeric FROM jsonb_array_elements(_lines) x;
  PERFORM public.write_audit(p.school_id, 'invoice_created', 'invoice', inv, num, jsonb_build_object('total', total));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT p.school_id, g.guardian_id, 'invoice_issued', 'A new fee invoice was issued', num, '/fees'
    FROM public.guardian_links g WHERE g.student_id = p.id AND g.status = 'verified';
  RETURN inv;
END $$;

-- One invoice per student of a class from a fee structure; students who already have one are skipped.
CREATE OR REPLACE FUNCTION public.generate_invoices(_structure UUID, _class UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.fee_structures;
  s RECORD;
  created INT := 0;
  skipped INT := 0;
BEGIN
  SELECT * INTO f FROM public.fee_structures WHERE id = _structure;
  IF NOT FOUND OR NOT public.has_permission(f.school_id, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot raise invoices' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(f.school_id, 'fees', 'fees and payments');
  IF NOT f.is_active THEN RAISE EXCEPTION 'this fee structure is switched off' USING ERRCODE = '22023'; END IF;
  IF f.class_id IS NOT NULL AND f.class_id <> _class THEN RAISE EXCEPTION 'this fee is for a different class' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = _class AND school_id = f.school_id) THEN RAISE EXCEPTION 'unknown class' USING ERRCODE = '22023'; END IF;
  FOR s IN SELECT e.student_id FROM public.enrollments e WHERE e.class_id = _class AND e.status = 'active' ORDER BY e.student_id LOOP
    IF EXISTS (SELECT 1 FROM public.invoices i WHERE i.structure_id = f.id AND i.student_id = s.student_id AND i.status = 'issued') THEN
      skipped := skipped + 1;
    ELSE
      DECLARE
        inv UUID;
        num TEXT := public.next_fee_number(f.school_id, 'invoice');
      BEGIN
        INSERT INTO public.invoices (school_id, student_id, structure_id, number, title, due_on, total, created_by)
        VALUES (f.school_id, s.student_id, f.id, num, f.name, f.due_on, f.amount, public.my_profile_id(f.school_id)) RETURNING id INTO inv;
        INSERT INTO public.invoice_lines (school_id, invoice_id, description, amount) VALUES (f.school_id, inv, f.name, f.amount);
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
        SELECT f.school_id, g.guardian_id, 'invoice_issued', 'A new fee invoice was issued', num, '/fees'
          FROM public.guardian_links g WHERE g.student_id = s.student_id AND g.status = 'verified';
        created := created + 1;
      END;
    END IF;
  END LOOP;
  PERFORM public.write_audit(f.school_id, 'invoice_created', 'fee_structure', f.id, left(f.name, 80),
    jsonb_build_object('created', created, 'skipped', skipped, 'amount', f.amount));
  RETURN jsonb_build_object('created', created, 'skipped', skipped);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_invoice(_invoice UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.invoices;
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(i.school_id, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot cancel invoices' USING ERRCODE = '42501'; END IF;
  IF i.status = 'cancelled' THEN RAISE EXCEPTION 'this invoice is already cancelled' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded') THEN
    RAISE EXCEPTION 'this invoice has payments; void them first' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'give a reason' USING ERRCODE = '22023'; END IF;
  UPDATE public.invoices SET status = 'cancelled', cancelled_at = clock_timestamp(), cancel_reason = btrim(_reason) WHERE id = i.id;
  PERFORM public.write_audit(i.school_id, 'invoice_cancelled', 'invoice', i.id, i.number, jsonb_build_object('total', i.total));
END $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_payment(_invoice UUID, _amount NUMERIC, _method TEXT, _reference TEXT, _paid_on DATE, _note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.invoices;
  paid NUMERIC;
  rct TEXT;
  pid UUID;
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(i.school_id, 'payments.record') THEN RAISE EXCEPTION 'you cannot record payments' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(i.school_id, 'fees', 'fees and payments');
  IF i.status = 'cancelled' THEN RAISE EXCEPTION 'this invoice is cancelled' USING ERRCODE = '22023'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'enter an amount above zero' USING ERRCODE = '22023'; END IF;
  IF _paid_on IS NULL OR _paid_on > current_date THEN RAISE EXCEPTION 'the payment date cannot be in the future' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
  IF paid + _amount > i.total THEN
    RAISE EXCEPTION 'that is more than the balance of %', (i.total - paid) USING ERRCODE = '22023';
  END IF;
  rct := public.next_fee_number(i.school_id, 'receipt');
  INSERT INTO public.payments (school_id, invoice_id, student_id, amount, method, reference, paid_on, receipt_number, note, recorded_by)
  VALUES (i.school_id, i.id, i.student_id, _amount, _method, NULLIF(btrim(COALESCE(_reference, '')), ''), _paid_on, rct, NULLIF(btrim(COALESCE(_note, '')), ''), public.my_profile_id(i.school_id))
  RETURNING id INTO pid;
  PERFORM public.write_audit(i.school_id, 'payment_recorded', 'payment', pid, rct,
    jsonb_build_object('invoice', i.number, 'amount', _amount, 'method', _method));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT i.school_id, g.guardian_id, 'payment_received', 'A payment was recorded', rct, '/fees'
    FROM public.guardian_links g WHERE g.student_id = i.student_id AND g.status = 'verified';
  RETURN jsonb_build_object('payment_id', pid, 'receipt', rct, 'balance', i.total - paid - _amount);
END $$;

CREATE OR REPLACE FUNCTION public.void_payment(_payment UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.payments;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = _payment FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(p.school_id, 'payments.refund') THEN RAISE EXCEPTION 'you cannot void payments' USING ERRCODE = '42501'; END IF;
  IF p.status = 'voided' THEN RAISE EXCEPTION 'this payment is already voided' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 10 THEN RAISE EXCEPTION 'give a reason (at least 10 characters)' USING ERRCODE = '22023'; END IF;
  UPDATE public.payments SET status = 'voided', void_reason = btrim(_reason), voided_by = public.my_profile_id(p.school_id), voided_at = clock_timestamp() WHERE id = p.id;
  PERFORM public.write_audit(p.school_id, 'payment_voided', 'payment', p.id, p.receipt_number, jsonb_build_object('amount', p.amount));
END $$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_invoices(_school UUID, _student UUID DEFAULT NULL, _status TEXT DEFAULT NULL, _search TEXT DEFAULT NULL, _limit INT DEFAULT 50, _offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID, number TEXT, student_id UUID, student_name TEXT, class_name TEXT, title TEXT, issued_on DATE, due_on DATE,
  total NUMERIC, paid NUMERIC, balance NUMERIC, status TEXT, total_rows BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH x AS (
    SELECT i.id, i.number, i.student_id, p.full_name AS student_name,
           (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id WHERE e.student_id = i.student_id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1) AS class_name,
           i.title, i.issued_on, i.due_on, i.total,
           COALESCE((SELECT sum(pm.amount) FROM public.payments pm WHERE pm.invoice_id = i.id AND pm.status = 'recorded'), 0) AS paid,
           i.status AS raw_status
      FROM public.invoices i JOIN public.profiles p ON p.id = i.student_id
     WHERE i.school_id = _school AND public.can_see_fees(_school, i.student_id)
       AND (_student IS NULL OR i.student_id = _student)
       AND (_search IS NULL OR i.number ILIKE '%' || _search || '%' OR p.full_name ILIKE '%' || _search || '%' OR i.title ILIKE '%' || _search || '%')
  )
  SELECT x.id, x.number, x.student_id, x.student_name, x.class_name, x.title, x.issued_on, x.due_on, x.total, x.paid,
         CASE WHEN x.raw_status = 'cancelled' THEN 0 ELSE x.total - x.paid END,
         public.invoice_status(x.raw_status, x.total, x.paid, x.due_on), count(*) OVER ()
    FROM x
   WHERE _status IS NULL OR public.invoice_status(x.raw_status, x.total, x.paid, x.due_on) = _status
   ORDER BY x.issued_on DESC, x.number DESC
   LIMIT LEAST(GREATEST(_limit, 1), 200) OFFSET GREATEST(_offset, 0);
END $$;

CREATE OR REPLACE FUNCTION public.get_invoice(_invoice UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.invoices;
  staff BOOLEAN;
  paid NUMERIC;
BEGIN
  SELECT * INTO i FROM public.invoices WHERE id = _invoice;
  IF NOT FOUND OR NOT public.can_see_fees(i.school_id, i.student_id) THEN RAISE EXCEPTION 'invoice not found' USING ERRCODE = '42501'; END IF;
  staff := public.has_permission(i.school_id, 'fees.view');
  SELECT COALESCE(sum(amount), 0) INTO paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
  RETURN jsonb_build_object(
    'invoice', jsonb_build_object('id', i.id, 'number', i.number, 'title', i.title, 'issued_on', i.issued_on, 'due_on', i.due_on, 'total', i.total,
      'paid', paid, 'balance', CASE WHEN i.status = 'cancelled' THEN 0 ELSE i.total - paid END,
      'status', public.invoice_status(i.status, i.total, paid, i.due_on), 'cancel_reason', CASE WHEN staff THEN i.cancel_reason END),
    'school', jsonb_build_object('name', (SELECT name FROM public.schools WHERE id = i.school_id), 'currency', (SELECT currency FROM public.schools WHERE id = i.school_id),
      'logo_url', (SELECT logo_url FROM public.school_config WHERE school_id = i.school_id)),
    'student', jsonb_build_object('id', i.student_id, 'name', (SELECT full_name FROM public.profiles WHERE id = i.student_id),
      'admission_number', (SELECT admission_number FROM public.profiles WHERE id = i.student_id),
      'class', (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id WHERE e.student_id = i.student_id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1)),
    'lines', (SELECT COALESCE(jsonb_agg(jsonb_build_object('description', l.description, 'amount', l.amount) ORDER BY l.description), '[]') FROM public.invoice_lines l WHERE l.invoice_id = i.id),
    'payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'receipt', p.receipt_number, 'amount', p.amount, 'method', p.method, 'reference', p.reference,
                   'paid_on', p.paid_on, 'status', p.status, 'void_reason', CASE WHEN staff THEN p.void_reason END,
                   'recorded_by', CASE WHEN staff THEN (SELECT full_name FROM public.profiles WHERE id = p.recorded_by) END) ORDER BY p.recorded_at), '[]')
                   FROM public.payments p WHERE p.invoice_id = i.id AND (staff OR p.status = 'recorded')),
    'can_record', public.has_permission(i.school_id, 'payments.record'),
    'can_void', public.has_permission(i.school_id, 'payments.refund'),
    'can_cancel', public.has_permission(i.school_id, 'fees.invoice'));
END $$;

CREATE OR REPLACE FUNCTION public.fee_summary(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'fees.view') THEN RAISE EXCEPTION 'you cannot view fees' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH inv AS (
      SELECT i.id, i.student_id, i.total, i.due_on,
             COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded'), 0) AS paid,
             (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id WHERE e.student_id = i.student_id AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1) AS class_name
        FROM public.invoices i WHERE i.school_id = _school AND i.status = 'issued')
    SELECT jsonb_build_object(
      'billed', COALESCE(sum(total), 0), 'collected', COALESCE(sum(paid), 0), 'outstanding', COALESCE(sum(total - paid), 0),
      'overdue_amount', COALESCE(sum(total - paid) FILTER (WHERE due_on < current_date AND paid < total), 0),
      'overdue_count', count(*) FILTER (WHERE due_on < current_date AND paid < total),
      'invoices', count(*), 'paid_in_full', count(*) FILTER (WHERE paid >= total),
      'by_class', (SELECT COALESCE(jsonb_agg(jsonb_build_object('class', COALESCE(c, 'Not in a class'), 'billed', b, 'collected', p, 'outstanding', b - p) ORDER BY c), '[]')
                     FROM (SELECT class_name AS c, sum(total) AS b, sum(paid) AS p FROM inv GROUP BY class_name) g),
      'recent_payments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('receipt', p.receipt_number, 'amount', p.amount, 'method', p.method, 'paid_on', p.paid_on,
                            'student', (SELECT full_name FROM public.profiles WHERE id = p.student_id)) ORDER BY p.recorded_at DESC), '[]')
                            FROM (SELECT * FROM public.payments WHERE school_id = _school AND status = 'recorded' ORDER BY recorded_at DESC LIMIT 8) p))
      FROM inv);
END $$;

-- Reminders for overdue invoices: no amounts in the message; at most one a week per invoice.
CREATE OR REPLACE FUNCTION public.send_fee_reminders(_school UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i RECORD;
  n INT := 0;
BEGIN
  IF NOT public.has_permission(_school, 'fees.invoice') THEN RAISE EXCEPTION 'you cannot send reminders' USING ERRCODE = '42501'; END IF;
  FOR i IN
    SELECT v.id, v.student_id, v.number FROM public.invoices v
     WHERE v.school_id = _school AND v.status = 'issued' AND v.due_on < current_date
       AND (v.last_reminded_at IS NULL OR v.last_reminded_at < now() - interval '7 days')
       AND COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = v.id AND p.status = 'recorded'), 0) < v.total
     FOR UPDATE
  LOOP
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT _school, g.guardian_id, 'fee_reminder', 'A fee invoice is overdue', i.number, '/fees'
      FROM public.guardian_links g WHERE g.student_id = i.student_id AND g.status = 'verified';
    UPDATE public.invoices SET last_reminded_at = now() WHERE id = i.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION
  public.next_fee_number(UUID, TEXT), public.invoice_status(TEXT, NUMERIC, NUMERIC, DATE), public.can_see_fees(UUID, UUID),
  public.save_fee_structure(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, UUID, DATE, BOOLEAN), public.list_fee_structures(UUID),
  public.create_invoice(UUID, TEXT, DATE, JSONB), public.generate_invoices(UUID, UUID), public.cancel_invoice(UUID, TEXT),
  public.record_payment(UUID, NUMERIC, TEXT, TEXT, DATE, TEXT), public.void_payment(UUID, TEXT),
  public.list_invoices(UUID, UUID, TEXT, TEXT, INT, INT), public.get_invoice(UUID), public.fee_summary(UUID), public.send_fee_reminders(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.save_fee_structure(UUID, UUID, TEXT, TEXT, NUMERIC, UUID, UUID, DATE, BOOLEAN), public.list_fee_structures(UUID),
  public.create_invoice(UUID, TEXT, DATE, JSONB), public.generate_invoices(UUID, UUID), public.cancel_invoice(UUID, TEXT),
  public.record_payment(UUID, NUMERIC, TEXT, TEXT, DATE, TEXT), public.void_payment(UUID, TEXT),
  public.list_invoices(UUID, UUID, TEXT, TEXT, INT, INT), public.get_invoice(UUID), public.fee_summary(UUID), public.send_fee_reminders(UUID)
TO authenticated;
