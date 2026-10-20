-- Tests for fee structures, invoices, payments, parent isolation and the plan gate.
-- One transaction, rolled back; PASS or stop with FAIL.
--   Laptop:   npm run db:test
BEGIN;

CREATE FUNCTION pg_temp.ok(_cond BOOLEAN, _label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', _label; END IF;
  RAISE NOTICE 'PASS: %', _label;
END $$;

CREATE FUNCTION pg_temp.act_as(_email TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  uid UUID;
BEGIN
  PERFORM set_config('role', 'none', true);
  IF _email IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
    RETURN;
  END IF;
  SELECT id INTO uid FROM auth.users WHERE email = _email;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', uid, 'email', _email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.rows(_sql TEXT) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RETURN -1;
END $$;

CREATE FUNCTION pg_temp.fails(_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN FALSE;
EXCEPTION WHEN OTHERS THEN
  RETURN TRUE;
END $$;

CREATE FUNCTION pg_temp.count(_sql TEXT) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || _sql || ') x' INTO n;
  RETURN n;
END $$;

CREATE TEMP TABLE ids (name TEXT PRIMARY KEY, id UUID);
GRANT SELECT, INSERT, UPDATE ON pg_temp.ids TO anon, authenticated;
CREATE FUNCTION pg_temp.id(_name TEXT) RETURNS UUID LANGUAGE sql AS $$ SELECT id FROM ids WHERE name = _name $$;

-- An active member with a login (set up directly as the database owner).
CREATE FUNCTION pg_temp.member(_school TEXT, _key TEXT, _role member_role, _gender TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  uid UUID;
  pid UUID;
BEGIN
  INSERT INTO auth.users (email) VALUES (_key || '@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.profiles (school_id, full_name, email, user_id, gender, status)
  VALUES (pg_temp.id(_school), initcap(replace(_key, '-', ' ')), _key || '@test.invalid', uid, _gender, 'active')
  RETURNING id INTO pid;
  INSERT INTO public.school_memberships (school_id, profile_id, role, status) VALUES (pg_temp.id(_school), pid, _role, 'active');
  INSERT INTO ids VALUES (_key, pid);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

DO $$
DECLARE
  a JSONB := public.bootstrap_school('Test School A', 'test-school-a', 'Admin A', 'admin-a@test.invalid');
  b JSONB := public.bootstrap_school('Test School B', 'test-school-b', 'Admin B', 'admin-b@test.invalid');
  uid UUID;
BEGIN
  INSERT INTO ids VALUES ('school_a', (a ->> 'school_id')::uuid), ('school_b', (b ->> 'school_id')::uuid);
  INSERT INTO auth.users (email) VALUES ('admin-a@test.invalid') RETURNING id INTO uid;
  PERFORM public.accept_invitation_for(uid, 'admin-a@test.invalid', a ->> 'token');
  INSERT INTO auth.users (email) VALUES ('admin-b@test.invalid') RETURNING id INTO uid;
  PERFORM public.accept_invitation_for(uid, 'admin-b@test.invalid', b ->> 'token');
  PERFORM pg_temp.member('school_a', 'accountant', 'finance_officer');
  PERFORM pg_temp.member('school_a', 'teacher-math', 'teacher');
  PERFORM pg_temp.member('school_a', 'librarian', 'librarian');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-bea', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-bea', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-unverified', 'parent');
  PERFORM pg_temp.member('school_b', 'student-b', 'student');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
END $$;

DO $$
DECLARE
  y UUID; c1 UUID; c2 UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_current)
  VALUES (pg_temp.id('school_a'), '2026/2027', '2026-09-01', '2027-07-31', true) RETURNING id INTO y;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1A') RETURNING id INTO c1;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1B') RETURNING id INTO c2;
  INSERT INTO ids VALUES ('class_1a', c1), ('class_1b', c2);
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c1, pg_temp.id('student-bea'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  INSERT INTO ids SELECT 'link_bea', public.link_guardian(pg_temp.id('student-bea'), pg_temp.id('parent-bea'), 'father');
  PERFORM public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-unverified'), 'uncle');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_bea'), 'verified');
END $$;

-- ---------------------------------------------------------------------------
-- Who can manage fees
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  sid UUID;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_fee_structure(%L, NULL, 'Tuition', '', 500, NULL, NULL, current_date + 30, true)$q$, sa)), 'a teacher cannot create a fee');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.list_fee_structures(%L)$q$, sa)), 'or view fee structures');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_summary(%L)$q$, sa)), 'or the fee summary');
  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_summary(%L)$q$, sa)), 'a librarian sees no financial figures');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.list_invoices(%L)$q$, sa)) = 0, 'a student sees no invoices');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.list_invoices(%L)$q$, sa)), 'the platform cannot read a school''s invoices');

  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_fee_structure(%L, NULL, 'Bad', '', 0, NULL, NULL, current_date + 30, true)$q$, sa)), 'an amount of zero is refused');
  sid := public.save_fee_structure(sa, NULL, 'Tuition Term 1', 'Termly tuition', 500, NULL, NULL, current_date + 30, true);
  INSERT INTO ids VALUES ('tuition', sid);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_fee_structures(sa)) = 1, 'the accountant creates a fee structure');
  sid := public.save_fee_structure(sa, NULL, 'Form 1B levy', '', 80, pg_temp.id('class_1b'), NULL, current_date + 30, true);
  INSERT INTO ids VALUES ('levy_1b', sid);
END $$;

-- ---------------------------------------------------------------------------
-- Invoices: single and for a class, without duplicates
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  r JSONB;
  inv UUID;
BEGIN
  PERFORM pg_temp.act_as('accountant@test.invalid');
  r := public.generate_invoices(pg_temp.id('tuition'), pg_temp.id('class_1a'));
  PERFORM pg_temp.ok((r ->> 'created')::int = 2 AND (r ->> 'skipped')::int = 0, 'invoices are generated for every student of a class');
  r := public.generate_invoices(pg_temp.id('tuition'), pg_temp.id('class_1a'));
  PERFORM pg_temp.ok((r ->> 'created')::int = 0 AND (r ->> 'skipped')::int = 2, 'running it again creates no duplicates');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.generate_invoices(%L, %L)$q$, pg_temp.id('levy_1b'), pg_temp.id('class_1a'))), 'a class-specific fee cannot be applied to another class');
  PERFORM pg_temp.ok((SELECT count(DISTINCT number) FROM public.list_invoices(sa)) = 2, 'invoice numbers are unique');
  PERFORM pg_temp.ok((SELECT min(number) LIKE 'INV-%-0001' FROM public.list_invoices(sa)), 'and numbered per school and year');

  inv := public.create_invoice(pg_temp.id('student-kofi'), 'Sports levy', current_date + 14, '[{"description":"Kit","amount":60},{"description":"Entry","amount":25.50}]');
  INSERT INTO ids VALUES ('inv_kofi', inv);
  PERFORM pg_temp.ok((SELECT total = 85.50 FROM public.list_invoices(sa, pg_temp.id('student-kofi'))), 'an invoice totals its lines');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_invoice(%L, 'x', current_date, '[]')$q$, pg_temp.id('student-kofi'))), 'an invoice needs lines');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_invoice(%L, 'x', current_date, '[{"description":"a","amount":-5}]')$q$, pg_temp.id('student-kofi'))), 'and positive amounts');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_invoice(%L, 'x', current_date, '[{"description":"a","amount":5}]')$q$, pg_temp.id('parent-ama'))), 'invoices are only raised for students');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_invoice(%L, 'x', current_date, '[{"description":"a","amount":5}]')$q$, pg_temp.id('student-kofi'))), 'a teacher cannot raise one');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_invoice(%L, 'x', current_date, '[{"description":"a","amount":5}]')$q$, pg_temp.id('student-kofi'))), 'another school''s administrator cannot');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.list_invoices(%L)$q$, pg_temp.id('school_b'))) = 0, 'and sees none of these');
END $$;

-- ---------------------------------------------------------------------------
-- Parents see only their own child's money
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  ama_inv UUID;
BEGIN
  PERFORM set_config('role', 'none', true);
  SELECT i.id INTO ama_inv FROM public.invoices i WHERE i.student_id = pg_temp.id('student-ama');
  INSERT INTO ids VALUES ('inv_ama', ama_inv);

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.list_invoices(%L)$q$, sa)) = 1, 'a parent sees one invoice: their child''s');
  PERFORM pg_temp.ok((public.get_invoice(ama_inv) -> 'invoice' ->> 'total')::numeric = 500, 'and can open it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_invoice(%L)$q$, pg_temp.id('inv_kofi'))), 'but not another family''s');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 10, 'cash', '', current_date, '')$q$, ama_inv)), 'a parent cannot record a payment');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cancel_invoice(%L, 'no longer needed')$q$, ama_inv)), 'cancel an invoice');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_summary(%L)$q$, sa)), 'or read school-wide figures');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'invoice_issued' AND body LIKE 'INV-%'$q$) = 1, 'the parent is notified, naming the invoice number only');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE body ~ '[0-9]{3}\.|GH|500'$q$) = 0, 'and no amount');

  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_invoice(%L)$q$, ama_inv)), 'another parent cannot open it by its identifier');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.list_invoices(%L, %L)$q$, sa, pg_temp.id('student-ama'))) = 0, 'or list it by naming the student');
  PERFORM pg_temp.act_as('parent-unverified@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.list_invoices(%L)$q$, sa)) = 0, 'an unverified guardian sees nothing');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_invoice(%L)$q$, ama_inv)), 'and cannot open it');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_invoice(%L)$q$, ama_inv)), 'a student cannot open their own invoice');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_invoice(%L)$q$, ama_inv)), 'nor can the platform');
END $$;

-- ---------------------------------------------------------------------------
-- Payments: balance rules, receipts, voiding
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  ama_inv UUID := pg_temp.id('inv_ama');
  r JSONB;
  pid UUID;
BEGIN
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 0, 'cash', '', current_date, '')$q$, ama_inv)), 'a payment must be above zero');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 100, 'bitcoin', '', current_date, '')$q$, ama_inv)), 'with a known method');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 100, 'cash', '', current_date + 3, '')$q$, ama_inv)), 'and not dated in the future');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 500.01, 'cash', '', current_date, '')$q$, ama_inv)), 'a payment cannot exceed the balance');
  r := public.record_payment(ama_inv, 200, 'mobile_money', 'MM-12345', current_date, 'First instalment');
  pid := (r ->> 'payment_id')::uuid;
  PERFORM pg_temp.ok((r ->> 'balance')::numeric = 300 AND r ->> 'receipt' LIKE 'RCT-%-0001', 'a payment returns a receipt and the new balance');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 300.01, 'cash', '', current_date, '')$q$, ama_inv)), 'the balance is respected on the next payment too');
  PERFORM pg_temp.ok((SELECT status = 'part_paid' AND paid = 200 AND balance = 300 FROM public.list_invoices(sa, pg_temp.id('student-ama'))), 'the invoice shows part paid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cancel_invoice(%L, 'cancelling with a payment')$q$, ama_inv)), 'an invoice with payments cannot be cancelled');
END $$;

DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  ama_inv UUID := pg_temp.id('inv_ama');
  pid UUID;
  r JSONB;
BEGIN
  PERFORM set_config('role', 'none', true);
  SELECT id INTO pid FROM public.payments WHERE invoice_id = ama_inv AND status = 'recorded';

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.void_payment(%L, 'a long enough reason')$q$, pid)), 'a teacher cannot void a payment');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 5, 'cash', '', current_date, '')$q$, ama_inv)), 'another school cannot record against this invoice');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.void_payment(%L, 'a long enough reason')$q$, pid)), 'or void its payments');

  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.void_payment(%L, 'oops')$q$, pid)), 'voiding needs a proper reason');
  PERFORM public.void_payment(pid, 'Entered against the wrong student');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.void_payment(%L, 'a second attempt here')$q$, pid)), 'a payment can be voided only once');
  PERFORM pg_temp.ok((SELECT status = 'unpaid' AND balance = 500 FROM public.list_invoices(sa, pg_temp.id('student-ama'))), 'a voided payment restores the balance');
  PERFORM pg_temp.ok((SELECT count(*) FROM jsonb_array_elements(public.get_invoice(ama_inv) -> 'payments') x WHERE x ->> 'status' = 'voided' AND x ->> 'void_reason' LIKE 'Entered%') = 1, 'the finance office still sees the voided payment and why');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(public.get_invoice(ama_inv) -> 'payments') = 0, 'a parent sees only payments that count');

  PERFORM pg_temp.act_as('accountant@test.invalid');
  r := public.record_payment(ama_inv, 150, 'cash', '', current_date, '');
  PERFORM pg_temp.ok(r ->> 'receipt' LIKE 'RCT-%-0002', 'receipt numbers are never reused');
  PERFORM public.record_payment((SELECT id FROM public.list_invoices(sa, pg_temp.id('student-bea')) LIMIT 1), 500, 'bank_transfer', 'TRF-9', current_date, '');
  PERFORM pg_temp.ok((SELECT status FROM public.list_invoices(sa, pg_temp.id('student-bea'))) = 'paid', 'an invoice paid in full shows paid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 1, 'cash', '', current_date, '')$q$, (SELECT id FROM public.list_invoices(sa, pg_temp.id('student-bea')) LIMIT 1))), 'and takes nothing more');

  -- Cancelling an unpaid invoice.
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cancel_invoice(%L, 'no')$q$, pg_temp.id('inv_kofi'))), 'cancelling needs a reason');
  PERFORM public.cancel_invoice(pg_temp.id('inv_kofi'), 'Raised for the wrong term');
  PERFORM pg_temp.ok((SELECT status || balance FROM public.list_invoices(sa, pg_temp.id('student-kofi'))) = 'cancelled0', 'a cancelled invoice owes nothing');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 10, 'cash', '', current_date, '')$q$, pg_temp.id('inv_kofi'))), 'and takes no payments');

  -- Figures.
  r := public.fee_summary(sa);
  PERFORM pg_temp.ok((r ->> 'billed')::numeric = 1000 AND (r ->> 'collected')::numeric = 650 AND (r ->> 'outstanding')::numeric = 350, 'the summary counts billed, collected and outstanding; cancelled invoices are excluded');
  PERFORM pg_temp.ok(jsonb_array_length(r -> 'recent_payments') = 2 AND (r -> 'by_class' -> 0 ->> 'class') = 'JHS 1A', 'with recent payments and a class breakdown');
END $$;

-- ---------------------------------------------------------------------------
-- Overdue and reminders
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
BEGIN
  PERFORM set_config('role', 'none', true);
  UPDATE public.invoices SET due_on = current_date - 5 WHERE id = pg_temp.id('inv_ama');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok((SELECT status FROM public.list_invoices(sa, pg_temp.id('student-ama'))) = 'overdue', 'an unpaid invoice past its due date is overdue');
  PERFORM pg_temp.ok((public.fee_summary(sa) ->> 'overdue_count')::int = 1 AND (public.fee_summary(sa) ->> 'overdue_amount')::numeric = 350, 'and counted as overdue');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_invoices(sa, NULL, 'overdue')) = 1, 'it can be filtered');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.send_fee_reminders(%L)$q$, sa)), 'a teacher cannot send reminders');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(public.send_fee_reminders(sa) = 1, 'one reminder goes out');
  PERFORM pg_temp.ok(public.send_fee_reminders(sa) = 0, 'and not again within a week');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'fee_reminder' AND body LIKE 'INV-%'$q$) = 1, 'the parent gets the reminder without any amount');
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'fee_reminder'$q$) = 0, 'a parent whose child owes nothing gets none');
END $$;

-- ---------------------------------------------------------------------------
-- Audit trail, plan gate, suspension
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'payment_recorded'$q$) = 3, 'every payment is in the audit log');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'payment_voided' AND target_name LIKE 'RCT-%'$q$) = 1, 'the void too, naming the receipt');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'invoice_cancelled'$q$) = 1, 'and the cancellation');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action IN ('payment_recorded', 'payment_voided') AND details::text ~* 'student'$q$) = 0, 'without naming the student');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_activity_log(_school => sa, _action => 'payment_recorded', _admins_only => false) WHERE details::text ~ '[0-9]{3}'),
    'the platform activity log shows no amounts');
  PERFORM public.upsert_plan('nofees', 'No fees', NULL, NULL, NULL, 0, '{"fees":false}', true);
  PERFORM public.set_school_subscription(sa, 'nofees', 'active', current_date + 30, NULL, 7, 'Plan without fees');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_invoice(%L, 'x', current_date, '[{"description":"a","amount":5}]')$q$, pg_temp.id('student-kofi'))), 'a plan without fees refuses new invoices');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 1, 'cash', '', current_date, '')$q$, pg_temp.id('inv_ama'))), 'and payments');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_invoices(sa)) = 3, 'but the records can still be read');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_subscription(sa, 'school', 'active', current_date + 30, NULL, 7, 'Back on the School plan');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM public.record_payment(pg_temp.id('inv_ama'), 1, 'cash', '', current_date, '');

  PERFORM set_config('role', 'none', true);
  UPDATE public.schools SET status = 'suspended' WHERE id = sa;
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 1, 'cash', '', current_date, '')$q$, pg_temp.id('inv_ama'))), 'a suspended school takes no new payments');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_invoices(sa)) = 3, 'but its records stay readable');
END $$;

ROLLBACK;
