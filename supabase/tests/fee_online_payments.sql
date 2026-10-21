-- Tests for online (Paystack) payment of school fees: eligibility, verification, idempotency, concurrency, isolation.
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
  inv UUID; o1 JSONB; o2 JSONB; oa JSONB; ob JSONB; r JSONB; n INT;
  ok_gw JSONB;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  inv := public.create_invoice(pg_temp.id('student-ama'), 'Term 1 fees', current_date + 30,
    '[{"description":"Tuition","amount":2500},{"description":"ICT","amount":500}]'::jsonb);

  -- who may start a payment
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 100)$q$, inv)), 'another family parent cannot pay this invoice');
  PERFORM pg_temp.act_as('parent-unverified@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 100)$q$, inv)), 'an unverified guardian cannot pay');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 100)$q$, inv)), 'a student cannot start a payment');
  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 100)$q$, inv)), 'a signed-out visitor cannot pay');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 0)$q$, inv)), 'a zero amount is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_start(%L, 3000.01)$q$, inv)), 'more than the balance is refused');
  o1 := public.fee_pay_start(inv, 1000);
  PERFORM pg_temp.ok((o1 ->> 'reference') LIKE 'FEE-%' AND (o1 ->> 'amount')::numeric = 1000, 'the guardian can start a partial payment');

  -- the browser cannot settle anything
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_settle(%L, '{"status":"success"}')$q$, o1 ->> 'reference')), 'the browser cannot settle a payment');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.fee_payment_orders$q$), 'orders are closed to direct reads');

  -- server side: failed, mismatched, then verified
  PERFORM set_config('role', 'none', true);
  r := public.fee_settle(o1 ->> 'reference', '{"status":"failed","gateway_response":"Declined"}');
  PERFORM pg_temp.ok(r ->> 'status' = 'failed' AND (SELECT count(*) FROM public.payments WHERE invoice_id = inv) = 0, 'a declined payment creates no payment and no receipt');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  o2 := public.fee_pay_start(inv, 1000);
  PERFORM set_config('role', 'none', true);
  r := public.fee_settle(o2 ->> 'reference', '{"status":"success","amount_minor":99900,"currency":"GHS","transaction_id":"1"}');
  PERFORM pg_temp.ok(r ->> 'status' = 'mismatch' AND (SELECT count(*) FROM public.payments WHERE invoice_id = inv) = 0, 'an amount that does not match the order is not accepted');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  o2 := public.fee_pay_start(inv, 1000);
  PERFORM set_config('role', 'none', true);
  ok_gw := jsonb_build_object('status', 'success', 'amount_minor', 100000, 'currency', 'GHS', 'channel', 'card', 'transaction_id', '77', 'gateway_response', 'Approved');
  r := public.fee_settle(o2 ->> 'reference', ok_gw);
  PERFORM pg_temp.ok(r ->> 'status' = 'paid' AND (r ->> 'receipt') IS NOT NULL AND (r ->> 'balance')::numeric = 2000, 'a verified payment is recorded with a receipt and the balance falls to 2000');
  PERFORM public.fee_settle(o2 ->> 'reference', ok_gw);
  PERFORM public.fee_settle(o2 ->> 'reference', ok_gw);
  PERFORM pg_temp.ok((SELECT count(*) FROM public.payments WHERE invoice_id = inv AND status = 'recorded') = 1, 'repeated callbacks do not create a second payment');
  PERFORM pg_temp.ok((SELECT method FROM public.payments WHERE invoice_id = inv) = 'paystack', 'the payment is labelled as an online Paystack payment');

  -- notifications
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = pg_temp.id('parent-ama') AND title = 'School fees payment confirmed';
  PERFORM pg_temp.ok(n = 1, 'the guardian is notified exactly once');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = pg_temp.id('accountant') AND title = 'School fees payment confirmed';
  PERFORM pg_temp.ok(n = 1, 'finance staff are notified');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = pg_temp.id('parent-bea');
  PERFORM pg_temp.ok(n = 0, 'another family is not notified');

  -- two payers racing for the same last 2000: only the balance is applied, the rest is flagged
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  oa := public.fee_pay_start(inv, 2000);
  ob := public.fee_pay_start(inv, 2000);
  PERFORM set_config('role', 'none', true);
  r := public.fee_settle(oa ->> 'reference', jsonb_build_object('status', 'success', 'amount_minor', 200000, 'currency', 'GHS', 'transaction_id', '78'));
  PERFORM pg_temp.ok(r ->> 'status' = 'paid' AND (r ->> 'balance')::numeric = 0, 'the first of two competing payments settles the invoice');
  r := public.fee_settle(ob ->> 'reference', jsonb_build_object('status', 'success', 'amount_minor', 200000, 'currency', 'GHS', 'transaction_id', '79'));
  PERFORM pg_temp.ok((r ->> 'excess')::numeric = 2000 AND (r ->> 'applied')::numeric = 0, 'the second is not over-collected: the 2000 is flagged as excess');
  PERFORM pg_temp.ok((SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE invoice_id = inv AND status = 'recorded') = 3000, 'the ledger never exceeds the invoice total');
  SELECT count(*) INTO n FROM public.notifications WHERE recipient_id = pg_temp.id('accountant') AND title = 'Payment received above the balance';
  PERFORM pg_temp.ok(n = 1, 'finance staff are told about the excess');

  -- reading
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((public.fee_pay_status(o2 ->> 'reference') ->> 'status') = 'paid', 'the payer can read their payment status');
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_status(%L)$q$, o2 ->> 'reference')), 'another parent cannot read it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.fee_orders_list(%L)$q$, pg_temp.id('school_a'))), 'a parent cannot list the school online payments');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.fee_orders_list(pg_temp.id('school_a'), 'review')) = 2, 'finance sees the mismatch and the excess in the review list');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.fee_orders_list(%L)$q$, pg_temp.id('school_a'))), 'another school cannot see these payments');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.fee_pay_status(%L)$q$, o2 ->> 'reference')), 'another school cannot read the order by reference');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.fee_orders_list(%L)$q$, pg_temp.id('school_a'))), 'a teacher cannot list online payments');
END $$;

ROLLBACK;
