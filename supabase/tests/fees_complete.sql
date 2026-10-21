-- Tests for the complete fees module: academic periods, adjustments, approvals, reminders, refunds, reports and the calendar.
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


DO $$
DECLARE
  sa UUID := pg_temp.id('school_a'); sb UUID := pg_temp.id('school_b');
  yid UUID; y2 UUID; t1 UUID; t2 UUID; sid UUID; inv UUID; inv2 UUID; pay1 UUID; pay2 UUID; o JSONB; r JSONB; n INT; f JSONB; ev UUID; ev2 UUID; ev3 UUID; ref UUID; refund JSONB;
  gw JSONB;
BEGIN
  SELECT id INTO yid FROM public.academic_years WHERE school_id = sa LIMIT 1;

  -- ===== academic years and periods =====
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  y2 := public.save_academic_year(sa, NULL, '2027/2028', '2027-09-01', '2028-07-31', 'draft');
  PERFORM pg_temp.ok(y2 IS NOT NULL, 'an administrator can create an academic year');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_academic_year(%L, NULL, '2026/27 b', '2027-06-01', '2027-12-31', 'draft')$q$, sa)), 'overlapping academic years are refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_academic_year(%L, NULL, 'Backwards', '2030-09-01', '2030-01-01', 'draft')$q$, sa)), 'an end date before the start is refused');
  t1 := public.save_term(sa, NULL, yid, 'Term 1', '2026-09-01', '2026-12-15', '2026-11-30', '{14,7,3,0}', '2026-12-01', '2026-12-10', NULL, NULL);
  t2 := public.save_term(sa, NULL, yid, 'Term 2', '2027-01-10', '2027-04-10', '2027-02-15', '{7,0}', NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ok(t1 IS NOT NULL AND t2 IS NOT NULL, 'terms can be created with fee due dates and reminder schedules');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_term(%L, NULL, %L, 'Clash', '2026-12-01', '2026-12-31', NULL, NULL, NULL, NULL, NULL, NULL)$q$, sa, yid)), 'a period overlapping another is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_term(%L, NULL, %L, 'Outside', '2025-01-01', '2025-03-01', NULL, NULL, NULL, NULL, NULL, NULL)$q$, sa, yid)), 'a period outside its academic year is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_term(%L, %L, %L, 'Term 1', '2026-09-01', '2026-12-15', '2026-12-01', '{14}', NULL, NULL, NULL, NULL)$q$, sa, t1, yid)), 'a fee due date cannot be changed without a reason');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_term(%L, NULL, %L, 'Bad exams', '2027-05-01', '2027-06-30', NULL, NULL, '2027-07-01', '2027-07-05', NULL, NULL)$q$, sa, yid)), 'exam dates outside the period are refused');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_term(%L, NULL, %L, 'Sneaky', '2027-05-01', '2027-06-30', NULL, NULL, NULL, NULL, NULL, NULL)$q$, sa, yid)), 'a teacher cannot create periods');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_academic_year(%L, NULL, 'Not yours', '2031-09-01', '2032-07-31', 'draft')$q$, sa)), 'another school cannot create years here');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$UPDATE public.terms SET fee_due_on = current_date WHERE id = %L$q$, t1)), 'the fee due date cannot be written directly');

  -- publishing tells the school
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.publish_academic_calendar(yid);
  PERFORM public.save_term(sa, NULL, y2, 'Semester 1', '2027-09-01', '2028-01-31', NULL, NULL, NULL, NULL, NULL, NULL);
  PERFORM pg_temp.ok(public.publish_academic_calendar(y2) = 1, 'publishing the calendar publishes its draft periods');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND kind = 'calendar_published') >= 1, 'the school is told the calendar is published');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.calendar_periods(sa)) >= 3 AND (SELECT count(fee_due_on) FROM public.calendar_periods(sa)) >= 2, 'a parent sees published periods with fee due dates');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok((SELECT count(fee_due_on) FROM public.calendar_periods(sa)) = 0, 'a teacher sees period dates but not fee deadlines');
  PERFORM pg_temp.ok((public.current_period(sa) ->> 'term') IS NOT NULL OR (public.current_period(sa) ->> 'year') IS NOT NULL, 'the active period is available to every member');

  -- ===== fee structure -> invoices follow the period =====
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  sid := public.save_fee_structure(sa, NULL, 'Tuition Term 1', 'Termly tuition', 3000, pg_temp.id('class_1a'), t1, current_date + 5, true);
  PERFORM public.generate_invoices(sid, pg_temp.id('class_1a'));
  PERFORM public.generate_invoices(sid, pg_temp.id('class_1a'));
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.invoices WHERE structure_id = sid) = 2, 'publishing the same fee twice does not duplicate assessments');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  SELECT id INTO inv FROM public.invoices WHERE structure_id = sid AND student_id = pg_temp.id('student-ama');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT due_on FROM public.invoices WHERE id = inv) = '2026-11-30' AND (SELECT term_id FROM public.invoices WHERE id = inv) = t1, 'invoices take the period and its fee due date');
  PERFORM pg_temp.act_as('admin-a@test.invalid');

  -- ===== adjustments =====
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.apply_fee_adjustment(%L, 'discount', 100, 'sibling discount')$q$, inv)), 'a parent cannot give themselves a discount');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.apply_fee_adjustment(%L, 'discount', 100, 'sibling discount')$q$, inv)), 'a teacher cannot adjust fees');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.apply_fee_adjustment(%L, 'discount', 100, 'x')$q$, inv)), 'an adjustment needs a real reason');
  r := public.apply_fee_adjustment(inv, 'scholarship', 500, 'Merit scholarship 2026');
  PERFORM pg_temp.ok((r ->> 'total')::numeric = 2500, 'a scholarship lowers the total from 3000 to 2500');
  r := public.apply_fee_adjustment(inv, 'charge', 100, 'Late registration charge');
  PERFORM pg_temp.ok((r ->> 'total')::numeric = 2600, 'a charge raises the total');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.fee_adjustments WHERE invoice_id = inv) = 2, 'every adjustment is its own record');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$UPDATE public.fee_adjustments SET amount = 1$q$), 'adjustment records cannot be edited');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.apply_fee_adjustment(%L, 'discount', 5000, 'too big a discount')$q$, inv)), 'a discount cannot take the invoice below zero');

  -- ===== offline payments and approval =====
  PERFORM public.save_fee_settings(sa, true, false, '{1,7}');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  r := public.record_payment(inv, 600, 'cash', 'CASH-1', current_date, 'first instalment');
  PERFORM pg_temp.ok((r ->> 'pending')::boolean, 'with approval switched on an offline payment waits');
  PERFORM pg_temp.ok((SELECT paid FROM public.list_invoices(sa, pg_temp.id('student-ama')) WHERE id = inv) = 0, 'a pending payment is not counted as paid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.record_payment(%L, 10, 'cash', 'cash-1', current_date, NULL)$q$, inv)), 'a duplicate payment reference is refused');
  PERFORM set_config('role', 'none', true);
  SELECT id INTO pay1 FROM public.payments WHERE invoice_id = inv AND status = 'pending';
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.review_payment(%L, true, NULL)$q$, pay1)), 'finance staff without the approval permission cannot approve');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.review_payment(pay1, true, NULL);
  PERFORM pg_temp.ok((SELECT paid FROM public.list_invoices(sa, pg_temp.id('student-ama')) WHERE id = inv) = 600, 'an approved payment counts as paid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND title = 'A payment was recorded') >= 1, 'the family hears about it only once it is approved');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  r := public.record_payment(inv, 50, 'cash', 'CASH-2', current_date, NULL);
  PERFORM set_config('role', 'none', true);
  SELECT id INTO pay2 FROM public.payments WHERE invoice_id = inv AND status = 'pending';
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.review_payment(pay2, false, 'No evidence of this payment');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status FROM public.payments WHERE id = pay2) = 'voided', 'a rejected payment is kept as voided, never deleted');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.save_fee_settings(sa, false, true, '{1,7}');

  -- ===== students =====
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_invoices(sa)) = 1, 'a student sees only their own invoices');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_invoices(sa, pg_temp.id('student-bea'))) = 0, 'a student cannot see a classmate''s fees');
  o := public.fee_pay_start(inv, 100);
  PERFORM pg_temp.ok((o ->> 'reference') LIKE 'FEE-%', 'a student can pay when the school allows it');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.save_fee_settings(sa, false, false, '{1,7}');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 100)$q$, inv)), 'a student cannot pay when the school has not allowed it');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.list_invoices(sa)) = 0, 'a student with no invoices sees none');

  -- ===== teacher status view =====
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.fee_class_status(%L, %L)$q$, sa, pg_temp.id('class_1a'))), 'a teacher has no fee status by default');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok((SELECT status FROM public.fee_class_status(sa, pg_temp.id('class_1a')) WHERE student_id = pg_temp.id('student-ama')) = 'part_paid', 'finance sees the class status');

  -- ===== reminders: once, with the remaining balance =====
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  UPDATE public.invoices SET due_on = current_date + 7 WHERE id = inv;
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  n := public.fee_reminder_tick();
  PERFORM pg_temp.ok(n >= 2, 'a reminder goes out when the invoice is within a reminder window');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT body FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND kind = 'fee_reminder' ORDER BY created_at DESC LIMIT 1) LIKE '%2,000.00%', 'the reminder names the remaining balance (2600 less 600 paid), not the original amount');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notification_outbox WHERE dedupe_key LIKE 'feeRem:%' AND recipient_id = pg_temp.id('parent-ama')) = 1, 'an email is queued for the parent');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  n := public.fee_reminder_tick();
  PERFORM pg_temp.ok(n = 0, 'running the job again sends nothing new');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND kind = 'fee_reminder') = 1, 'no duplicate reminder for the same stage');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  UPDATE public.invoices SET due_on = current_date + 3 WHERE id = inv;
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.fee_reminder_tick() >= 1, 'a new stage sends a new reminder');
  PERFORM set_config('role', 'none', true);
  UPDATE public.invoices SET due_on = current_date + 40 WHERE id = inv;
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.fee_reminder_tick() = 0, 'nothing is sent outside any reminder window');
  PERFORM set_config('role', 'none', true);
  UPDATE public.invoices SET due_on = current_date - 3 WHERE id = inv;
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.fee_reminder_tick() >= 1, 'an overdue reminder is sent after the deadline');

  -- the claim and mark cycle for email delivery
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO n FROM public.outbox_claim(50);
  PERFORM pg_temp.ok(n >= 1, 'queued emails can be claimed for sending');
  PERFORM set_config('role', 'none', true);
  PERFORM public.outbox_mark((SELECT id FROM public.notification_outbox WHERE status = 'pending' AND attempts = 1 LIMIT 1), false, 'mail server down');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notification_outbox WHERE status = 'failed') = 1, 'a failed email is marked failed and kept for retry');
  PERFORM pg_temp.act_as('admin-a@test.invalid');

  -- paid in full: no more reminders
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  r := public.record_payment(inv, 2000, 'bank_transfer', 'BT-9', current_date, NULL);
  PERFORM set_config('role', 'none', true);
  UPDATE public.invoices SET due_on = current_date - 10 WHERE id = inv;
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.fee_reminder_log WHERE invoice_id = inv) > 0, 'reminders were logged earlier');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  n := (SELECT count(*) FROM public.notifications WHERE kind = 'fee_reminder');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM public.fee_reminder_tick();
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE kind = 'fee_reminder') = n, 'a fully paid invoice gets no reminder');
  PERFORM pg_temp.act_as('admin-a@test.invalid');

  -- ===== changing the fee due date moves open invoices and tells families =====
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  inv2 := (SELECT id FROM public.invoices WHERE structure_id = sid AND student_id = pg_temp.id('student-bea'));
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_term_fee_due(%L, '2026-12-10', 'x')$q$, t1)), 'a due date change needs a reason');
  PERFORM pg_temp.ok(public.set_term_fee_due(t1, '2026-12-10', 'Parents asked for more time') = 1, 'only the unpaid invoice moves');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT due_on FROM public.invoices WHERE id = inv2) = '2026-12-10', 'the unpaid invoice follows the new due date');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT due_on FROM public.invoices WHERE id = inv) <> '2026-12-10', 'a paid invoice is left alone');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('parent-bea') AND kind = 'fee_due_changed') = 1, 'the family is told');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs WHERE school_id = sa AND action::text = 'fee_due_changed') = 1, 'the change is in the audit trail with its reason');
  PERFORM pg_temp.act_as('admin-a@test.invalid');

  -- ===== refunds =====
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  o := public.fee_pay_start(inv2, 1000);
  PERFORM set_config('role', 'none', true);
  gw := jsonb_build_object('status', 'success', 'amount_minor', 100000, 'currency', 'GHS', 'channel', 'card', 'transaction_id', '555');
  PERFORM set_config('role', 'none', true);
  r := public.fee_settle(o ->> 'reference', gw);
  PERFORM pg_temp.ok(r ->> 'status' = 'paid', 'an online payment settles');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notification_outbox WHERE dedupe_key LIKE 'feePaid:%' AND recipient_id = pg_temp.id('parent-bea')) = 1, 'the confirmation email is queued once');
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM set_config('role', 'none', true);
  SELECT id INTO pay1 FROM public.payments WHERE invoice_id = inv2 AND status = 'recorded';
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_refund_begin(%L, 'Customer asked for money back')$q$, pay1)), 'staff without the refund permission cannot refund');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  refund := public.fee_refund_begin(pay1, 'Student withdrew from the school');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status FROM public.payments WHERE id = pay1) = 'voided' AND (SELECT void_reason FROM public.payments WHERE id = pay1) LIKE 'Refunded:%', 'the refunded payment stays on record as voided with its reason');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((SELECT paid FROM public.list_invoices(sa, pg_temp.id('student-bea')) WHERE id = inv2) = 0, 'the balance rises again after a refund');
  PERFORM pg_temp.ok((SELECT status FROM public.fee_refunds_list(sa) LIMIT 1) = 'pending_provider', 'an online refund waits for Paystack');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_refund_begin(%L, 'Again please do it')$q$, pay1)), 'the same payment cannot be refunded twice');
  PERFORM set_config('role', 'none', true);
  PERFORM public.fee_refund_finish((refund ->> 'refund_id')::uuid, false, NULL, 'Paystack could not refund');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status FROM public.fee_refunds WHERE id = (refund ->> 'refund_id')::uuid) = 'failed', 'a failed refund is recorded as failed');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.fee_refund_retry((refund ->> 'refund_id')::uuid);
  PERFORM set_config('role', 'none', true);
  PERFORM public.fee_refund_finish((refund ->> 'refund_id')::uuid, true, 'rf_1', NULL);
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status FROM public.fee_refunds WHERE id = (refund ->> 'refund_id')::uuid) = 'refunded', 'a retried refund can complete');
  PERFORM pg_temp.act_as('admin-a@test.invalid');

  -- ===== reports reconcile with the ledger =====
  PERFORM pg_temp.act_as('accountant@test.invalid');
  f := public.fee_report(sa, yid, t1, NULL, NULL, NULL);
  PERFORM pg_temp.ok((f ->> 'invoices')::int = 2, 'the report counts both invoices of the period');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((f ->> 'net_assessed')::numeric = (SELECT sum(total) FROM public.invoices WHERE term_id = t1), 'assessed matches the invoices');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((f ->> 'net_collected')::numeric = (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE status = 'recorded' AND invoice_id IN (SELECT id FROM public.invoices WHERE term_id = t1)), 'net collected matches recorded payments');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok((f ->> 'refunds')::numeric = 1000, 'refunds are shown on their own line');
  PERFORM pg_temp.ok((f ->> 'gross_collected')::numeric = (f ->> 'net_collected')::numeric + (f ->> 'refunds')::numeric + (f ->> 'reversals')::numeric, 'gross = net + refunds + reversals');
  PERFORM pg_temp.ok((f ->> 'discounts')::numeric = 500 AND (f ->> 'charges')::numeric = 100, 'discounts and charges are reported separately');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((f ->> 'outstanding')::numeric = (SELECT COALESCE(sum(i.total - COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded'), 0)), 0) FROM public.invoices i WHERE i.term_id = t1), 'outstanding matches the ledger');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_report(%L)$q$, sa)), 'a parent cannot run the school report');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_report(%L)$q$, sa)), 'another school cannot run it');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(public.student_statement(sa, pg_temp.id('student-ama')) -> 'invoices') = 1, 'a parent can read their child''s statement');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_statement(%L, %L)$q$, sa, pg_temp.id('student-bea'))), 'but not another child''s');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM public.fee_log_export(sa, 'collections');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_log_export(%L, 'x')$q$, sa)), 'a teacher cannot export');

  -- closing a period keeps every record
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  n := (SELECT count(*) FROM public.payments);
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.close_term(t1);
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status FROM public.terms WHERE id = t1) = 'closed' AND (SELECT count(*) FROM public.payments) = n, 'closing a period deletes nothing');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_term_fee_due(%L, '2026-12-12', 'closed period change')$q$, t1)), 'a closed period cannot be changed');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$UPDATE public.terms SET name = 'Hacked' WHERE id = %L$q$, t1)), 'nor edited directly');

  -- ===== calendar =====
  INSERT INTO public.events (school_id, title, category, starts_at, ends_at, audience, status, reminder_days)
  VALUES (sa, 'Draft exam week', 'exam', now() + interval '10 days', now() + interval '12 days', 'everyone', 'draft', '{7,1}') RETURNING id INTO ev;
  INSERT INTO public.events (school_id, title, category, starts_at, audience, status)
  VALUES (sa, 'Staff only meeting', 'meeting', now() + interval '3 days', 'staff', 'published') RETURNING id INTO ev2;
  INSERT INTO public.events (school_id, title, category, starts_at, audience, status, class_id)
  VALUES (sa, 'JHS 1A trip', 'other', now() + interval '5 days', 'everyone', 'published', pg_temp.id('class_1a')) RETURNING id INTO ev3;
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id = ev) = 0, 'a draft event is hidden from students');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id = ev2) = 0, 'a staff-only meeting is hidden from students');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id = ev3) = 1, 'a class event is visible to a student in that class');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id = ev3) = 0, 'but not to a student in another class');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id = ev2) = 0 AND (SELECT count(*) FROM public.events WHERE id = ev3) = 1, 'a parent sees their child''s class event and not the staff meeting');
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id = ev3) = 1, 'the other parent in that class sees it too');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.events WHERE id IN (ev, ev2, ev3)) = 3, 'managers see drafts and private events');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.event_conflicts(sa, now() + interval '10 days', now() + interval '11 days')) >= 1, 'overlapping events are reported');
  -- publishing notifies the audience
  UPDATE public.events SET status = 'published' WHERE id = ev;
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('student-ama') AND kind = 'event_published' AND title LIKE '%Draft exam week') = 1, 'publishing notifies students');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('student-kofi') AND title LIKE '%JHS 1A trip') = 0, 'a class event notifies only that class');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  -- moving the date
  UPDATE public.events SET starts_at = starts_at + interval '2 days', ends_at = ends_at + interval '2 days' WHERE id = ev;
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND kind = 'event_changed') = 1, 'moving an event notifies the audience');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.event_history(ev)) >= 2, 'the event keeps a history of its changes');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs WHERE school_id = sa AND action::text = 'event_changed' AND target_id = ev) >= 1, 'the change is in the audit trail');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$UPDATE public.events SET status = 'cancelled' WHERE id = %L$q$, ev)), 'cancelling needs a reason');
  UPDATE public.events SET status = 'cancelled', cancel_reason = 'Venue unavailable' WHERE id = ev;
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('student-ama') AND kind = 'event_cancelled') = 1, 'cancelling notifies the audience');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT status FROM public.events WHERE id = ev) = 'cancelled', 'a cancelled event stays visible, marked as cancelled');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.events (school_id, title, starts_at) VALUES (%L, 'Teacher made', now())$q$, sa)), 'a teacher cannot create school events');
  -- reminders, once per date
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.events (school_id, title, category, starts_at, audience, status, reminder_days)
  VALUES (sa, 'Reminded event', 'academic', now() + interval '1 day', 'students', 'published', '{7,1}') RETURNING id INTO ev;
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.calendar_reminder_tick() >= 1, 'an event reminder goes out in its window');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.calendar_reminder_tick() = 0, 'and not twice');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('student-ama') AND kind = 'event_reminder') = 1, 'one reminder per student');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND kind = 'event_reminder') = 0, 'parents are not reminded of a student-only event');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
END $$;

ROLLBACK;
