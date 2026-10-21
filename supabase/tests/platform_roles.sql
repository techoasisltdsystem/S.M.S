-- Tests for platform roles, permissions and administrator invitations.
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
  ('00000000-0000-0000-0000-00000000a001', 'pr-super@test.example'),
  ('00000000-0000-0000-0000-00000000a002', 'pr-billing@test.example'),
  ('00000000-0000-0000-0000-00000000a003', 'pr-support@test.example'),
  ('00000000-0000-0000-0000-00000000a004', 'pr-nobody@test.example');
INSERT INTO public.platform_admins (user_id, full_name, role, permissions) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'Super', 'super_admin', '{}'),
  ('00000000-0000-0000-0000-00000000a002', 'Billing', 'billing_admin', public.platform_role_preset('billing_admin')),
  ('00000000-0000-0000-0000-00000000a003', 'Support', 'support_admin', public.platform_role_preset('support_admin'));

DO $$
DECLARE inv UUID;
BEGIN
  PERFORM pg_temp.act_as('pr-super@test.example');
  PERFORM pg_temp.ok(public.platform_can('admins.manage'), 'a Super Admin holds every permission');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT public.platform_billing_overview()$q$), 'a Super Admin can read billing');

  PERFORM pg_temp.act_as('pr-billing@test.example');
  PERFORM pg_temp.ok(NOT pg_temp.fails($q$SELECT public.platform_billing_overview()$q$), 'a Billing Admin can read billing');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_admins_list()$q$), 'a Billing Admin cannot list administrators');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_invite_create('x@test.example','X Y','support_admin','{}','hash1')$q$), 'a Billing Admin cannot invite');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_admin_set_access('00000000-0000-0000-0000-00000000a003','super_admin','{}')$q$), 'a Billing Admin cannot make a Super Admin');

  PERFORM pg_temp.act_as('pr-support@test.example');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_billing_overview()$q$), 'a Support Admin cannot read billing');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_save_billing_settings('{}'::jsonb)$q$), 'a Support Admin cannot change billing settings');

  PERFORM pg_temp.act_as('pr-nobody@test.example');
  PERFORM pg_temp.ok(NOT public.platform_can('clients.view'), 'a non-administrator holds nothing');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_health()$q$), 'a non-administrator cannot read health');

  -- Super Admin: invite, safeguards
  PERFORM pg_temp.act_as('pr-super@test.example');
  inv := public.platform_invite_create('new.person@test.example', 'New Person', 'support_admin', '{}', 'hash-new-1');
  PERFORM pg_temp.ok(inv IS NOT NULL, 'a Super Admin can invite');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_invite_create('new.person@test.example','Again','support_admin','{}','hash-new-2')$q$), 'a second pending invitation to the same email is refused');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_invite_create('pr-billing@test.example','B','support_admin','{}','hash-new-3')$q$), 'inviting an existing login is refused');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_admin_set_access('00000000-0000-0000-0000-00000000a001','billing_admin','{}')$q$), 'nobody changes their own role');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_admin_set_disabled('00000000-0000-0000-0000-00000000a001', true)$q$), 'nobody switches themselves off');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_admin_set_access('00000000-0000-0000-0000-00000000a002','billing_admin','{nonsense.perm}')$q$), 'unknown permissions are refused');
  PERFORM public.platform_admin_set_access('00000000-0000-0000-0000-00000000a002', 'platform_admin', public.platform_role_preset('platform_admin'));
  PERFORM public.platform_invite_revoke(inv);
  PERFORM pg_temp.ok((SELECT state FROM public.platform_invites_list() WHERE id = inv) = 'revoked', 'an invitation can be revoked');

  -- the last active Super Admin is protected (the second Super Admin makes the first removable, then not)
  PERFORM public.platform_admin_set_access('00000000-0000-0000-0000-00000000a003', 'super_admin', '{}');
  PERFORM pg_temp.act_as('pr-support@test.example');
  PERFORM pg_temp.ok(public.platform_can('admins.manage'), 'a promoted Super Admin gets full access');
  PERFORM public.platform_admin_set_disabled('00000000-0000-0000-0000-00000000a001', true);
  PERFORM pg_temp.act_as('pr-super@test.example');
  PERFORM pg_temp.ok(NOT public.is_platform_admin(), 'a switched-off Super Admin loses access at once');
END $$;

ROLLBACK;
