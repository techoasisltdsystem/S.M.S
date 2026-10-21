-- Tests for platform events, announcements, reports and the other platform operations functions.
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

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000b001', 'po-super@test.example'),
  ('00000000-0000-0000-0000-00000000b002', 'po-support@test.example'),
  ('00000000-0000-0000-0000-00000000b003', 'po-billing@test.example');
INSERT INTO public.platform_admins (user_id, full_name, role, permissions) VALUES
  ('00000000-0000-0000-0000-00000000b001', 'Super', 'super_admin', '{}'),
  ('00000000-0000-0000-0000-00000000b002', 'Support', 'support_admin', public.platform_role_preset('support_admin')),
  ('00000000-0000-0000-0000-00000000b003', 'Billing', 'billing_admin', public.platform_role_preset('billing_admin'));

DO $$
DECLARE ann UUID; n INT; sid UUID;
BEGIN
  PERFORM pg_temp.act_as('po-super@test.example');
  -- events: written by actions, readable, immutable
  PERFORM public.platform_log_signin();
  PERFORM public.platform_invite_create('po.new@test.example', 'Po New', 'support_admin', '{}', 'po-hash-1');
  SELECT count(*) INTO n FROM public.platform_events_list(NULL, 'administrators', NULL, NULL, FALSE, 50, 0);
  PERFORM pg_temp.ok(n >= 1, 'an invitation is written to the platform event log');
  SELECT count(*) INTO n FROM public.platform_events_list(NULL, NULL, NULL, NULL, TRUE, 50, 0);
  PERFORM pg_temp.ok(n >= 2, 'a person can read their own access history');
  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.platform_events$q$), 'the event table is closed to direct reads');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(pg_temp.fails($q$UPDATE public.platform_events SET action = 'x'$q$), 'events cannot be edited');
  PERFORM pg_temp.ok(pg_temp.fails($q$DELETE FROM public.platform_events$q$), 'events cannot be deleted');

  -- announcements
  PERFORM pg_temp.act_as('po-super@test.example');
  ann := public.platform_announcement_save(NULL, 'Planned maintenance', 'We will be offline briefly.', 'maintenance', 'all', NULL, NULL);
  PERFORM pg_temp.ok(ann IS NOT NULL, 'an announcement can be drafted');
  PERFORM pg_temp.ok((SELECT status FROM public.platform_announcements_list() WHERE id = ann) = 'draft', 'a new announcement is a draft');
  PERFORM public.platform_announcement_set_status(ann, 'published');
  PERFORM pg_temp.ok((SELECT reach FROM public.platform_announcements_list() WHERE id = ann) >= 0, 'reach is counted');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_announcement_save(NULL, '', 'x', 'notice', 'all', NULL, NULL)$q$), 'an empty title is refused');
  PERFORM pg_temp.act_as('po-support@test.example');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.platform_announcements_list()$q$), 'a Support Admin cannot manage announcements');

  -- reports, onboarding, usage, school admins
  PERFORM pg_temp.act_as('po-billing@test.example');
  PERFORM pg_temp.ok((public.platform_report(current_date - 30, current_date) ->> 'orders_paid') IS NOT NULL, 'a Billing Admin can run a report');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_report(current_date, current_date - 5)$q$), 'a backwards date range is refused');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT * FROM public.platform_onboarding()$q$), 'onboarding progress loads');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT * FROM public.platform_usage()$q$), 'school usage loads');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT * FROM public.platform_school_admins(NULL, 10, 0)$q$), 'school administrators load');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT public.platform_export_transactions(NULL, NULL)$q$), 'a Billing Admin can export transactions');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_receipt('no-such-reference')$q$), 'a receipt needs a verified payment');
  PERFORM pg_temp.act_as('po-support@test.example');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_export_transactions(NULL, NULL)$q$), 'a Support Admin cannot export transactions');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_report(current_date - 30, current_date)$q$), 'a Support Admin cannot run financial reports');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT * FROM public.support_assignments()$q$), 'support assignments load');

  -- creating and suspending schools use their own permissions
  PERFORM pg_temp.ok(NOT public.platform_can('clients.suspend'), 'a Support Admin cannot suspend schools');
  PERFORM pg_temp.act_as('po-super@test.example');
  PERFORM pg_temp.ok(public.platform_can('clients.suspend') AND public.platform_can('clients.create'), 'a Super Admin can create and suspend');
END $$;

ROLLBACK;
