-- Tests for billing: server-side pricing, payment settlement, idempotency, renewals, expiry, reminders and access.
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


CREATE FUNCTION pg_temp.owner() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('role', 'none', true); PERFORM set_config('request.jwt.claims', '', true); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.owner() TO anon, authenticated;

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
  PERFORM pg_temp.member('school_a', 'teacher-a', 'teacher');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
END $$;

-- Real data already in the database (a laptop with demo orders) must not change what these tests expect.
SELECT set_config('t.base_rev', (SELECT COALESCE(sum(total_minor), 0) FROM public.billing_orders WHERE status = 'paid' AND gateway <> 'demo')::text, false);

-- 1. Public pricing and closed tables ------------------------------------------------------------
DO $$
DECLARE r JSONB;
BEGIN
  PERFORM pg_temp.act_as(NULL);
  r := public.billing_public_pricing();
  PERFORM pg_temp.ok(jsonb_array_length(r -> 'plans') = 3, 'anyone can read the three public packages');
  PERFORM pg_temp.ok(NOT (r::text LIKE '%unlimited%'), 'the internal unlimited plan is not on the public page');
  PERFORM pg_temp.ok((SELECT (x ->> 'monthly_price')::numeric FROM jsonb_array_elements(r -> 'plans') x WHERE x ->> 'code' = 'school') = 1200, 'prices come from the database');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT count(*) FROM public.billing_orders'), 'anonymous visitors cannot read orders');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT count(*) FROM public.payment_events'), 'nor payment events');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.billing_settle(''x'', ''{}'')'), 'nor settle an order');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.billing_settle(''x'', ''{}'')'), 'a school administrator cannot settle an order either');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.billing_record_event(''x'',''webhook'',''e'',NULL,true,''o'',''{}'')'), 'nor write payment events');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT count(*) FROM public.billing_orders'), 'nor read the orders table directly');
END $$;

-- 2. Sign-up order ---------------------------------------------------------------------------------
DO $$
DECLARE o JSONB; st JSONB; before_schools INT;
BEGIN
  PERFORM pg_temp.owner();
  SELECT count(*) INTO before_schools FROM public.schools;
  PERFORM pg_temp.act_as(NULL);
  o := public.billing_start_signup('school', 'monthly', 'Brightside Academy', 'Ama Boateng', 'Ama@Brightside.test', '0240000000');
  PERFORM set_config('t.ref1', o ->> 'reference', false);
  PERFORM set_config('t.claim1', o ->> 'claim', false);
  PERFORM pg_temp.ok((o ->> 'total_minor')::bigint = 120000, 'the amount is the stored GH₵1,200.00 in pesewas');
  PERFORM pg_temp.ok((o ->> 'reference') LIKE 'TOS-%', 'a unique reference is generated');
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok((SELECT count(*) FROM public.schools) = before_schools, 'no school exists before payment');
  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok(pg_temp.fails($f$SELECT public.billing_start_signup('school', 'monthly', 'brightside academy', 'X Y', 'x@y.test')$f$) = FALSE, 'a name not yet registered is allowed');
  PERFORM pg_temp.ok(pg_temp.fails($f$SELECT public.billing_start_signup('school', 'monthly', 'Test School A', 'X Y', 'x@y.test')$f$), 'a duplicate school name is refused');
  PERFORM pg_temp.ok(pg_temp.fails($f$SELECT public.billing_start_signup('school', 'monthly', 'Another School', 'X Y', 'not-an-email')$f$), 'a bad email is refused');
  PERFORM pg_temp.ok(pg_temp.fails($f$SELECT public.billing_start_signup('unlimited', 'monthly', 'Free Riders', 'X Y', 'x@y.test')$f$), 'the unlimited plan cannot be bought');
  PERFORM pg_temp.ok(pg_temp.fails($f$SELECT public.billing_start_signup('nonsense', 'monthly', 'Free Riders', 'X Y', 'x@y.test')$f$), 'an unknown package is refused');
  PERFORM pg_temp.ok(pg_temp.fails($f$SELECT public.billing_start_signup('school', 'weekly', 'Free Riders', 'X Y', 'x@y.test')$f$), 'an unknown billing interval is refused');
  st := public.billing_order_status(o ->> 'reference', o ->> 'claim');
  PERFORM pg_temp.ok(st ->> 'status' = 'created', 'the order starts as created, not paid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.billing_order_status(%L, %L)', o ->> 'reference', 'wrong')), 'the wrong claim code cannot read the order');
END $$;

-- 3. Settlement of non-successful and mismatched payments -------------------------------------------
DO $$
DECLARE r JSONB; ref TEXT := current_setting('t.ref1'); claim TEXT := current_setting('t.claim1'); schools_before INT;
BEGIN
  PERFORM pg_temp.owner();
  SELECT count(*) INTO schools_before FROM public.schools;
  PERFORM public.billing_mark_initialized(ref, 'paystack', 'ac_123');
  PERFORM pg_temp.ok((public.billing_order_status(ref, claim) ->> 'status') = 'pending', 'initializing moves the order to pending');

  r := public.billing_settle(ref, '{"status":"success","amount_minor":100,"currency":"GHS"}');
  PERFORM pg_temp.ok(r ->> 'status' = 'mismatch', 'a different amount is not accepted');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.schools) = schools_before, 'and creates no school');

  INSERT INTO public.billing_orders (reference, claim_hash, purpose, plan_id, plan_code, plan_name, billing_interval, currency, base_minor, tax_minor, total_minor, customer_email, draft)
  SELECT 'TOS-FAILTEST', sha256('c'), 'new_school', id, code, name, 'monthly', 'GHS', 100000, 0, 100000, 'f@f.test',
         '{"school_name":"Failing School","admin_name":"F F","admin_email":"f@f.test"}' FROM public.plans WHERE code = 'school';
  r := public.billing_settle('TOS-FAILTEST', '{"status":"failed","gateway_response":"Declined"}');
  PERFORM pg_temp.ok(r ->> 'status' = 'failed' AND NOT EXISTS (SELECT 1 FROM public.schools WHERE name = 'Failing School'), 'a failed payment activates nothing');
  INSERT INTO public.billing_orders (reference, claim_hash, purpose, plan_id, plan_code, plan_name, billing_interval, currency, base_minor, tax_minor, total_minor, customer_email, draft)
  SELECT 'TOS-ABANDON', sha256('c'), 'new_school', id, code, name, 'monthly', 'GHS', 100000, 0, 100000, 'g@g.test',
         '{"school_name":"Abandoned School","admin_name":"F F","admin_email":"g@g.test"}' FROM public.plans WHERE code = 'school';
  r := public.billing_settle('TOS-ABANDON', '{"status":"abandoned"}');
  PERFORM pg_temp.ok(NOT (r ->> 'ok')::boolean AND NOT EXISTS (SELECT 1 FROM public.schools WHERE name = 'Abandoned School'), 'an abandoned payment activates nothing');
  r := public.billing_settle('TOS-ABANDON', '{"status":"pending"}');
  PERFORM pg_temp.ok((SELECT status FROM public.billing_orders WHERE reference = 'TOS-ABANDON') = 'abandoned', 'a later non-success report does not revive it');
END $$;

-- 4. A verified payment ----------------------------------------------------------------------------------
DO $$
DECLARE r JSONB; ref TEXT; claim TEXT; tok TEXT; sid UUID; n1 INT; n2 INT; ps INT;
BEGIN
  PERFORM pg_temp.act_as(NULL);
  r := public.billing_start_signup('school', 'monthly', 'Riverside College', 'Kojo Mensah', 'kojo@riverside.test');
  ref := r ->> 'reference'; claim := r ->> 'claim';
  PERFORM set_config('t.ref2', ref, false);
  PERFORM pg_temp.owner();
  r := public.billing_settle(ref, '{"status":"success","amount_minor":120000,"currency":"GHS","channel":"mobile_money","transaction_id":"987","paid_at":"2026-10-20T10:00:00Z"}');
  PERFORM pg_temp.ok((r ->> 'ok')::boolean AND r ->> 'status' = 'paid', 'a verified successful payment is accepted');
  sid := (r ->> 'school_id')::uuid;
  PERFORM set_config('t.sid2', sid::text, false);
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.schools WHERE id = sid AND name = 'Riverside College'), 'the school is created after payment');
  PERFORM pg_temp.ok((SELECT status FROM public.school_subscriptions WHERE school_id = sid) = 'active', 'the subscription is active');
  PERFORM pg_temp.ok((SELECT current_period_end FROM public.school_subscriptions WHERE school_id = sid) = (current_date + interval '1 month')::date, 'for one month from today');
  PERFORM pg_temp.ok((SELECT code FROM public.plans p JOIN public.school_subscriptions s ON s.plan_id = p.id WHERE s.school_id = sid) = 'school', 'with the purchased package');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = sid AND action = 'payment_verified'), 'the verification is in the audit log');

  SELECT count(*) INTO n1 FROM public.schools; SELECT count(*) INTO ps FROM public.subscription_periods WHERE school_id = sid;
  r := public.billing_settle(ref, '{"status":"success","amount_minor":120000,"currency":"GHS"}');
  r := public.billing_settle(ref, '{"status":"success","amount_minor":120000,"currency":"GHS"}');
  SELECT count(*) INTO n2 FROM public.schools;
  PERFORM pg_temp.ok(r ->> 'already' = 'true' AND n1 = n2, 'settling again does not create another school');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.subscription_periods WHERE school_id = sid) = ps AND ps = 1, 'or another subscription period');
  PERFORM pg_temp.ok(public.billing_record_event(ref, 'webhook', 'charge.success', 'evt-1', true, 'processed', '{}')
                     AND NOT public.billing_record_event(ref, 'webhook', 'charge.success', 'evt-1', true, 'duplicate', '{}'), 'a repeated webhook event is recognised');

  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok((public.billing_order_status(ref, claim) ->> 'status') = 'paid', 'the buyer sees the verified status');
  tok := public.billing_claim_invite(ref, claim);
  PERFORM pg_temp.ok(tok IS NOT NULL AND public.billing_claim_invite(ref, claim) IS NULL, 'the sign-up link is handed over once only');
  PERFORM pg_temp.ok(public.billing_claim_invite(current_setting('t.ref1'), current_setting('t.claim1')) IS NULL, 'an unpaid order yields no sign-up link');
  PERFORM set_config('t.tok2', tok, false);
END $$;

-- 5. The payer becomes the school administrator -------------------------------------------------------------
DO $$
DECLARE uid UUID; r JSONB;
BEGIN
  PERFORM pg_temp.owner();
  INSERT INTO auth.users (email) VALUES ('kojo@riverside.test') RETURNING id INTO uid;
  r := public.accept_invitation_for(uid, 'kojo@riverside.test', current_setting('t.tok2'));
  PERFORM pg_temp.ok(r ->> 'role' = 'school_admin', 'the payer becomes the school administrator');
  PERFORM pg_temp.act_as('kojo@riverside.test');
  PERFORM pg_temp.ok(public.has_permission(current_setting('t.sid2')::uuid, 'staff.manage'), 'with billing rights in their own school');
  PERFORM pg_temp.ok(NOT public.has_permission(pg_temp.id('school_a'), 'staff.manage'), 'and none in another school');
END $$;

-- 6. Records cannot be edited --------------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok(pg_temp.fails('UPDATE public.billing_orders SET total_minor = 1 WHERE reference = current_setting(''t.ref2'')'), 'an order''s amount cannot be edited');
  PERFORM pg_temp.ok(pg_temp.fails('UPDATE public.billing_orders SET status = ''pending'' WHERE reference = current_setting(''t.ref2'')'), 'a paid order cannot be reversed');
  PERFORM pg_temp.ok(pg_temp.fails('DELETE FROM public.billing_orders WHERE reference = current_setting(''t.ref2'')'), 'orders cannot be deleted');
  PERFORM pg_temp.ok(pg_temp.fails('UPDATE public.payment_events SET outcome = ''x'''), 'payment events cannot be edited');
  PERFORM pg_temp.ok(pg_temp.fails('DELETE FROM public.subscription_periods'), 'subscription periods cannot be deleted');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails('UPDATE public.billing_orders SET status = ''paid'''), 'a school administrator cannot mark an order paid');
  PERFORM pg_temp.ok(pg_temp.fails('UPDATE public.plans SET monthly_price = 1'), 'nor change a package price');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_clients()'), 'nor open the platform client list');
END $$;

-- 7. Renewals and price changes ---------------------------------------------------------------------------------
DO $$
DECLARE o JSONB; r JSONB; ra JSONB; sid UUID := current_setting('t.sid2')::uuid; oldend DATE; newend DATE;
BEGIN
  PERFORM pg_temp.act_as('teacher-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.billing_start_order(%L, ''school'', ''monthly'')', pg_temp.id('school_a'))), 'a teacher cannot start a renewal');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.billing_start_order(%L, ''school'', ''monthly'')', pg_temp.id('school_a'))), 'one school''s administrator cannot renew another school');
  PERFORM pg_temp.act_as('kojo@riverside.test');
  o := public.billing_start_order(sid, 'school', 'yearly');
  PERFORM pg_temp.ok((o ->> 'total_minor')::bigint = 1200000, 'the yearly renewal price is the stored annual price');
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok((SELECT purpose FROM public.billing_orders WHERE reference = o ->> 'reference') = 'renewal', 'the same package is a renewal');
  SELECT current_period_end INTO oldend FROM public.school_subscriptions WHERE school_id = sid;
  r := public.billing_settle(o ->> 'reference', '{"status":"success","amount_minor":1200000,"currency":"GHS","channel":"card"}');
  SELECT current_period_end INTO newend FROM public.school_subscriptions WHERE school_id = sid;
  PERFORM pg_temp.ok(newend = (oldend + interval '1 year')::date, 'a renewal continues from the end of the paid period');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.subscription_periods WHERE school_id = sid) = 2, 'and keeps the earlier period');
  r := public.billing_settle(o ->> 'reference', '{"status":"success","amount_minor":1200000,"currency":"GHS"}');
  PERFORM pg_temp.ok((SELECT current_period_end FROM public.school_subscriptions WHERE school_id = sid) = newend, 'a repeated confirmation does not extend it again');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.platform_save_plan('school', 'School', 'x', 1500, 15000, 'GHS', 30, 800, 100, NULL,
    '{"fees":true,"attendance":true}'::jsonb, '[]', true, true, true, 'Annual price review');
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok((SELECT total_minor FROM public.billing_orders WHERE reference = o ->> 'reference') = 1200000, 'a price change does not rewrite an earlier order');
  PERFORM pg_temp.ok((SELECT amount_minor FROM public.subscription_periods WHERE order_id = (SELECT id FROM public.billing_orders WHERE reference = o ->> 'reference')) = 1200000, 'nor its subscription period');
  PERFORM pg_temp.act_as('kojo@riverside.test');
  ra := public.billing_start_order(sid, 'school', 'monthly');
  PERFORM pg_temp.ok((ra ->> 'total_minor')::bigint = 150000, 'a new order uses the new price');
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.billing_changes WHERE kind = 'plan_saved' AND subject = 'school' AND reason = 'Annual price review'), 'the price change is recorded with a reason');
END $$;

-- 8. Package change and tax ----------------------------------------------------------------------------------------
DO $$
DECLARE o JSONB; sid UUID := current_setting('t.sid2')::uuid;
BEGIN
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.platform_save_billing_settings('Tech Oasis', 'help@x.test', NULL, NULL, NULL, 12.5, 'VAT', 7, ARRAY[7,3,1,0,-3], 'c', 'r', 'Introduce VAT');
  PERFORM pg_temp.act_as('kojo@riverside.test');
  o := public.billing_start_order(sid, 'campus', 'monthly');
  PERFORM pg_temp.ok((o ->> 'tax_minor')::bigint = 28750 AND (o ->> 'total_minor')::bigint = 258750, 'tax is added on the server: 2300 + 12.5%');
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok((SELECT purpose FROM public.billing_orders WHERE reference = o ->> 'reference') = 'change_plan', 'a different package is a plan change');
  PERFORM public.billing_settle(o ->> 'reference', '{"status":"success","amount_minor":258750,"currency":"GHS"}');
  PERFORM pg_temp.ok((SELECT p.code FROM public.plans p JOIN public.school_subscriptions s ON s.plan_id = p.id WHERE s.school_id = sid) = 'campus', 'the entitlements follow the new package');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profiles WHERE school_id = sid), 'and the school''s records are untouched');
END $$;

-- 9. Demo payments --------------------------------------------------------------------------------------------------
DO $$
DECLARE o JSONB; r JSONB;
BEGIN
  PERFORM pg_temp.act_as(NULL);
  o := public.billing_start_signup('starter', 'monthly', 'Demo Academy', 'Dee Mo', 'dee@demo-academy.test');
  PERFORM pg_temp.owner();
  PERFORM public.billing_mark_initialized(o ->> 'reference', 'demo', NULL);
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.billing_settle(%L, %L)', o ->> 'reference', jsonb_build_object('status','success','amount_minor',(o ->> 'total_minor')::bigint,'currency','GHS')::text)), 'a demo payment is refused when demos are off');
  r := public.billing_settle(o ->> 'reference', jsonb_build_object('status','success','amount_minor',(o ->> 'total_minor')::bigint,'currency','GHS'), true);
  PERFORM pg_temp.ok((r ->> 'ok')::boolean AND (SELECT gateway FROM public.billing_orders WHERE reference = o ->> 'reference') = 'demo', 'and accepted, flagged as demo, only when the server allows it');
END $$;

-- 10. Super Admin views ---------------------------------------------------------------------------------------------------
DO $$
DECLARE ov JSONB; c JSONB; rev BIGINT;
BEGIN
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_clients(NULL, NULL, NULL, 'name', 50, 0)) >= 4, 'the Super Admin sees every client');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.platform_clients('riverside', NULL, NULL, 'name', 50, 0) WHERE admin_email = 'kojo@riverside.test' AND plan_code = 'campus'), 'with the administrator and package');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_clients(NULL, 'active', NULL, 'expiry', 50, 0)) >= 2, 'filtered by status');
  c := public.platform_client(current_setting('t.sid2')::uuid);
  PERFORM pg_temp.ok(jsonb_array_length(c -> 'orders') >= 3 AND jsonb_array_length(c -> 'periods') >= 3, 'the client page lists payments and periods');
  PERFORM pg_temp.ok(c -> 'subscription' ->> 'period_end' IS NOT NULL AND c -> 'subscription' ->> 'started_on' IS NOT NULL, 'with start and expiry dates');
  ov := public.platform_billing_overview();
  SELECT sum((x ->> 'total_minor')::bigint) INTO rev FROM jsonb_array_elements(ov -> 'revenue') x;
  PERFORM pg_temp.ok(rev = current_setting('t.base_rev')::bigint + 120000 + 1200000 + 258750, 'revenue is only verified, non-demo payments');
  PERFORM pg_temp.ok((ov ->> 'demo_paid')::int >= 1, 'demo payments are counted separately');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.platform_reconciliation() WHERE issue = 'amount_mismatch'), 'reconciliation flags the mismatched payment');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_transactions('paid', NULL, NULL, 50, 0)) >= 4, 'transactions can be listed and filtered');
  PERFORM pg_temp.ok(jsonb_array_length(ov -> 'growth') = 12, 'charts come with twelve months of data');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_billing_overview()'), 'a school administrator cannot open it');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_transactions()'), 'nor the transactions');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_save_plan(''x'',''X'',NULL,1,1,''GHS'',0,NULL,NULL,NULL,''{}'',''[]'',true,false,true,''hack!'')'), 'nor edit packages');
  PERFORM pg_temp.act_as('teacher-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.my_billing(%L)', pg_temp.id('school_a'))), 'a teacher cannot see billing');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(public.my_billing(pg_temp.id('school_a')) -> 'orders') = 0, 'a school administrator sees only their own school''s orders');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.my_billing(%L)', current_setting('t.sid2'))), 'not another school''s');
END $$;

-- 11. Manual adjustments ---------------------------------------------------------------------------------------------------
DO $$
DECLARE sid UUID := current_setting('t.sid2')::uuid; e1 DATE; e2 DATE; paid_before INT; paid_after INT;
BEGIN
  PERFORM pg_temp.owner();
  SELECT current_period_end INTO e1 FROM public.school_subscriptions WHERE school_id = sid;
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.platform_extend_subscription(%L, 10, true, ''short'')', sid)), 'an extension needs a real reason');
  PERFORM pg_temp.owner(); SELECT count(*) INTO paid_before FROM public.billing_orders WHERE status = 'paid'; PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.platform_extend_subscription(sid, 14, true, 'Goodwill after a billing mistake');
  PERFORM pg_temp.owner();
  SELECT current_period_end INTO e2 FROM public.school_subscriptions WHERE school_id = sid;
  PERFORM pg_temp.ok(e2 = e1 + 14, 'a complimentary extension moves the end date');
  PERFORM pg_temp.owner(); SELECT count(*) INTO paid_after FROM public.billing_orders WHERE status = 'paid';
  PERFORM pg_temp.ok(paid_before = paid_after, 'and creates no payment record');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.subscription_events WHERE school_id = sid AND kind = 'complimentary_extension' AND details -> 'before' ->> 'period_end' IS NOT NULL), 'with before and after values');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = sid AND action = 'billing_adjusted'), 'and an audit entry');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.platform_extend_subscription(%L, 10, true, ''I would like free time please'')', pg_temp.id('school_a'))), 'a school cannot extend its own subscription');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_subscription(sid, 'campus', 'cancelled', e2, NULL, 7, 'Customer asked to cancel');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.set_school_subscription(%L, ''campus'', ''past_due'', NULL, NULL, 7, ''bad move'')', sid)), 'a cancelled subscription cannot jump to past due');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.platform_extend_subscription(%L, 5, false, ''extending a cancelled one'')', sid)), 'nor be extended without reactivation');
  PERFORM public.set_school_subscription(sid, 'campus', 'active', e2, NULL, 7, 'Reactivated at customer request');
  PERFORM pg_temp.owner();
  PERFORM pg_temp.ok((SELECT status FROM public.school_subscriptions WHERE school_id = sid) = 'active', 'but it can be reactivated');
END $$;

-- 12. Expiry and reminders ----------------------------------------------------------------------------------------------------
DO $$
DECLARE sid UUID := pg_temp.id('school_b'); r JSONB; n1 INT; n2 INT; adm UUID;
BEGIN
  PERFORM pg_temp.owner();
  UPDATE public.school_subscriptions SET plan_id = (SELECT id FROM public.plans WHERE code = 'school'), status = 'active', current_period_end = current_date + 3, trial_ends_on = NULL, grace_days = 7 WHERE school_id = sid;
  r := public.billing_reminder_tick();
  PERFORM pg_temp.ok((SELECT count(*) FROM public.reminder_log WHERE school_id = sid AND interval_days = 3 AND channel = 'in_app') = 2, 'a 3-day reminder is made for the platform and the school');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.reminder_log WHERE school_id = sid AND channel = 'email' AND state = 'queued') = 2, 'email reminders are queued, not claimed as sent');
  SELECT m.profile_id INTO adm FROM public.school_memberships m WHERE m.school_id = sid AND m.role = 'school_admin';
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.notifications WHERE school_id = sid AND recipient_id = adm AND kind = 'subscription_reminder'), 'the school administrator is notified in the app');
  SELECT count(*) INTO n1 FROM public.reminder_log; PERFORM public.billing_reminder_tick(); SELECT count(*) INTO n2 FROM public.reminder_log;
  PERFORM pg_temp.ok(n1 = n2, 'running again does not repeat a reminder');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.notifications WHERE school_id = sid AND kind = 'subscription_reminder') = 1, 'nor notify twice');

  UPDATE public.school_subscriptions SET current_period_end = current_date - 1 WHERE school_id = sid;
  PERFORM public.billing_reminder_tick();
  PERFORM pg_temp.ok((SELECT status FROM public.school_subscriptions WHERE school_id = sid) = 'past_due', 'an unpaid period becomes past due');
  PERFORM pg_temp.ok((SELECT status FROM public.schools WHERE id = sid) = 'active', 'but access continues during the grace period');

  UPDATE public.school_subscriptions SET current_period_end = current_date - 10 WHERE school_id = sid;
  PERFORM public.billing_reminder_tick();
  PERFORM public.subscriptions_enforce();
  PERFORM pg_temp.ok((SELECT status FROM public.school_subscriptions WHERE school_id = sid) = 'expired', 'after the grace period it expires');
  PERFORM pg_temp.ok((SELECT status FROM public.schools WHERE id = sid) = 'suspended', 'and the school becomes read-only');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.profiles WHERE school_id = sid), 'its records are kept');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_reminders(true)) >= 1, 'the Super Admin sees reminders');
  PERFORM pg_temp.ok(public.platform_ack_reminders() >= 1, 'and can mark them seen');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_reminders()'), 'a school administrator cannot');

  PERFORM pg_temp.act_as('admin-b@test.invalid');
  r := public.billing_start_order(sid, 'school', 'monthly');
  PERFORM pg_temp.owner();
  PERFORM public.billing_settle(r ->> 'reference', jsonb_build_object('status', 'success', 'amount_minor', (r ->> 'total_minor')::bigint, 'currency', 'GHS'));
  PERFORM pg_temp.ok((SELECT status FROM public.school_subscriptions WHERE school_id = sid) = 'active' AND (SELECT status FROM public.schools WHERE id = sid) = 'active', 'a verified renewal restores access');
  PERFORM pg_temp.ok((SELECT current_period_end FROM public.school_subscriptions WHERE school_id = sid) = (current_date + interval '1 month')::date, 'from today, not from the lapsed date');
END $$;

ROLLBACK;
