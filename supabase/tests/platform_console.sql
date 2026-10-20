-- Tests for plans, entitlements, support requests, support access and the platform console.
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
  PERFORM pg_temp.member('school_a', 'teacher-math', 'teacher');
  PERFORM pg_temp.member('school_a', 'student-one', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-two', 'student', 'male');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
  INSERT INTO ids VALUES ('platform_1', uid);
  INSERT INTO auth.users (email) VALUES ('platform2@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
END $$;

-- ---------------------------------------------------------------------------
-- Plans and subscriptions
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  r JSONB;
BEGIN
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok((SELECT plan_code || '/' || status || '/' || state FROM public.platform_subscriptions() WHERE school_id = sa) = 'school/trial/ok', 'a new school starts a trial of the School plan');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_plans()) >= 4, 'the platform lists its plans');
  PERFORM pg_temp.ok((public.platform_commercial_overview() ->> 'on_trial')::int >= 2, 'the commercial overview counts schools on trial');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.platform_subscriptions()$q$), 'a school administrator cannot list every school''s subscription');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.upsert_plan('x', 'X', NULL, 5, 5, 1, '{}', true)$q$), 'nor create plans');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_school_subscription(%L, 'campus', 'active', NULL, NULL, 7, 'self-upgrade')$q$, sa)), 'nor change their own plan');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.my_subscription(%L)$q$, sa)), 'a teacher cannot read the subscription');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.upsert_plan('tiny', 'Tiny', 'Test plan', 2, 2, 100, '{"messaging":false,"assignments":false,"exports":false,"role_permissions":false}', true);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_school_subscription(%L, 'tiny', 'active', NULL, NULL, 7, '')$q$, sa)), 'a plan change needs a note');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_school_subscription(%L, 'nope', 'active', NULL, NULL, 7, 'x')$q$, sa)), 'an unknown plan is refused');
  PERFORM public.set_school_subscription(sa, 'tiny', 'active', current_date + 30, NULL, 7, 'Moved to the tiny plan for testing');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  r := public.my_subscription(sa);
  PERFORM pg_temp.ok(r -> 'plan' ->> 'code' = 'tiny' AND (r -> 'usage' ->> 'students')::int = 2 AND (r -> 'usage' ->> 'staff')::int = 2, 'the school sees its plan and usage');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.invite_member(%L, 'Student Three', 'three@test.invalid', 'student')$q$, sa)), 'the plan''s student limit stops a third student');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.invite_member(%L, 'Teacher Two', 'teacher2@test.invalid', 'teacher')$q$, sa)), 'and its staff limit stops another staff account');
  PERFORM public.invite_member(sa, 'Parent One', 'parent1@test.invalid', 'parent');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE email = 'parent1@test.invalid'$q$) = 1, 'parents are not counted against the limits');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'subscription_changed'$q$) = 1, 'the plan change is in the school''s audit log');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.subscription_history(sa)) >= 2 AND (SELECT details -> 'before' ->> 'plan' FROM public.subscription_history(sa) WHERE kind = 'plan_changed') = 'school',
    'the history keeps the before and after');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.subscription_history(%L)$q$, sa)), 'another school cannot read it');

  -- Features follow the plan.
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_conversation(%L, ARRAY[%L]::uuid[], 'x', 'hello')$q$, sa, pg_temp.id('teacher-math'))), 'messaging is refused when the plan does not include it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_role_permission(%L, 'teacher', 'attendance.view', true)$q$, sa)), 'so are role permissions');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_subscription(sa, 'school', 'active', current_date + 30, NULL, 7, 'Upgraded');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.start_conversation(sa, ARRAY[pg_temp.id('teacher-math')], 'x', 'hello');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_conversations(pg_temp.id('school_a'))$q$) = 1, 'messaging works after an upgrade');
END $$;

-- ---------------------------------------------------------------------------
-- Expiry: grace, read-only, renewal
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
BEGIN
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_subscription(sa, 'school', 'active', current_date - 3, NULL, 7, 'Lapsed three days ago');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.subscription_state(sa) = 'grace', 'a lapsed subscription is in grace for a while');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$INSERT INTO public.subjects (school_id, name) VALUES (%L, 'Science')$q$, sa)) = 1, 'and the school keeps working during grace');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_subscription(sa, 'school', 'active', current_date - 20, NULL, 7, 'Lapsed twenty days ago');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(public.subscription_state(sa) = 'blocked', 'beyond the grace period it is blocked');
  PERFORM pg_temp.ok((SELECT status = 'suspended' AND suspended_by_subscription FROM public.schools WHERE id = sa), 'the school becomes read-only');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$INSERT INTO public.subjects (school_id, name) VALUES (%L, 'History')$q$, sa)) = -1, 'writes are refused');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.subjects$q$) >= 1, 'but its records can still be read');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_subscription(sa, 'school', 'active', current_date + 30, NULL, 7, 'Renewed');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status = 'active' AND NOT suspended_by_subscription FROM public.schools WHERE id = sa), 'a renewal restores the school');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.subscription_events WHERE school_id = sa AND kind IN ('suspended', 'restored')), 'both changes are in the history');

  -- A manual suspension by the platform is never undone by a renewal.
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_status(sa, 'suspended', 'Investigating a complaint');
  PERFORM public.set_school_subscription(sa, 'school', 'active', current_date + 60, NULL, 7, 'Paid early');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT status = 'suspended' AND NOT suspended_by_subscription FROM public.schools WHERE id = sa), 'a manual suspension stays until the platform lifts it');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.set_school_status(sa, 'active', 'Resolved');
END $$;

-- ---------------------------------------------------------------------------
-- Support requests
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  rid UUID;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_support_request(%L, 'Help', 'x')$q$, sa)), 'a teacher cannot contact platform support');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.create_support_request(%L, 'Help', '')$q$, sa)), 'a request needs a description');
  rid := public.create_support_request(sa, 'Cannot import students', 'The import page shows an error.', 'high');
  INSERT INTO ids VALUES ('req', rid);
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.list_support_requests(pg_temp.id('school_a'))$q$) = 1, 'the school sees its request');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.list_support_requests(pg_temp.id('school_b'))$q$) = 0, 'another school does not');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_support_request(%L)$q$, rid)), 'and cannot open it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.reply_support_request(%L, 'spam')$q$, rid)), 'or reply to it');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.list_support_requests(NULL, 'active')$q$) = 1, 'the platform sees open requests from every school');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.list_platform_alerts() WHERE kind = 'support'$q$) = 1, 'a new request raises an alert');
  PERFORM public.reply_support_request(rid, 'We are looking into it.');
  PERFORM public.set_support_status(rid, 'in_progress');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'support_reply'$q$) = 1, 'the school is told about the reply');
  PERFORM pg_temp.ok(jsonb_array_length(public.get_support_request(rid) -> 'messages') = 2, 'the whole conversation is visible to the school');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_support_status(%L, 'resolved')$q$, rid)), 'a school cannot mark its own request resolved');
  PERFORM public.reply_support_request(rid, 'Thanks, it works now.');
  PERFORM public.set_support_status(rid, 'closed');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.reply_support_request(%L, 'more')$q$, rid)), 'a closed request takes no more replies');
END $$;

-- ---------------------------------------------------------------------------
-- Support access: approved by the school, time-limited, read-only, audited
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  gid UUID;
  seen JSONB;
BEGIN
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_support_access(%L, 'too short', 2)$q$, sa)), 'a short reason is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_support_access(%L, 'Investigating the import problem in detail', 48)$q$, sa)), 'access cannot last more than 24 hours');
  gid := public.request_support_access(sa, 'Investigating the import problem the school reported', 2);
  INSERT INTO ids VALUES ('grant', gid);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_support_access(%L, 'Investigating the import problem a second time', 2)$q$, sa)), 'only one pending request at a time');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.support_view_school(%L)$q$, gid)), 'nothing can be viewed before the school approves');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.decide_support_access(%L, true)$q$, gid)), 'a teacher cannot approve access');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.decide_support_access(%L, true)$q$, gid)), 'another school cannot approve it');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'support_access_requested'$q$) = 1, 'the school administrator is told');
  PERFORM pg_temp.ok((SELECT reason LIKE 'Investigating the import%' FROM public.list_support_access(sa) WHERE id = gid), 'and sees the reason');
  PERFORM public.decide_support_access(gid, true, 'Approved for today');

  PERFORM pg_temp.act_as('platform2@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.support_view_school(%L)$q$, gid)), 'another platform administrator cannot use this approval');
  PERFORM pg_temp.act_as('platform@test.invalid');
  seen := public.support_view_school(gid);
  PERFORM pg_temp.ok(seen -> 'school' ->> 'name' = 'Test School A' AND jsonb_array_length(seen -> 'staff_accounts') = 2, 'support sees the school''s settings and staff accounts');
  PERFORM pg_temp.ok(seen::text NOT ILIKE '%student one%' AND seen::text NOT ILIKE '%student two%' AND seen::text NOT ILIKE '%parent one%', 'but no pupil or parent names');
  PERFORM pg_temp.ok(NOT (seen ? 'marks') AND NOT (seen ? 'attendance') AND NOT (seen ? 'messages'), 'and no marks, attendance or messages');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action IN ('support_access_requested', 'support_access_approved', 'support_access_used')$q$) = 3,
    'the school''s own audit log shows the request, the approval and the use');
  PERFORM pg_temp.ok((SELECT uses FROM public.list_support_access(sa) WHERE id = gid) = 1, 'and how often the access was used');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.list_support_access(%L)$q$, sa)), 'a teacher cannot see access requests');

  -- Expiry and revocation.
  PERFORM set_config('role', 'none', true);
  UPDATE public.support_access_grants SET expires_at = now() - interval '1 minute' WHERE id = gid;
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.support_view_school(%L)$q$, gid)), 'access stops when it expires');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((SELECT effective_status FROM public.list_support_access(sa) WHERE id = gid) = 'expired', 'and is shown as expired');

  PERFORM pg_temp.act_as('platform@test.invalid');
  gid := public.request_support_access(sa, 'Second look at the import settings with the school', 1);
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.decide_support_access(gid, true);
  PERFORM public.end_support_access(gid);
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.support_view_school(%L)$q$, gid)), 'the school can withdraw access at any time');
  gid := public.request_support_access(sa, 'Third request, which the school will decline', 1);
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.decide_support_access(gid, false, 'Not needed');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.support_view_school(%L)$q$, gid)), 'a denied request gives no access');
END $$;

-- ---------------------------------------------------------------------------
-- Platform activity log: filters and redaction
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  n BIGINT;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.platform_activity_log()$q$), 'a school administrator cannot read the platform log');
  PERFORM public.invite_member(sa, 'Parent Two', 'parent2@test.invalid', 'parent');
  PERFORM public.link_guardian(pg_temp.id('student-one'), (SELECT id FROM public.profiles WHERE email = 'parent2@test.invalid'), 'mother');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_activity_log(_admins_only => false)) > 0, 'the platform can read the activity log');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_activity_log(_admins_only => false) WHERE action IN ('login', 'logout')), 'sign-in noise is left out');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_activity_log(_admins_only => false) WHERE target_type IN ('user', 'membership') AND target_name IS NOT NULL), 'people''s names are redacted');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_activity_log(_school => pg_temp.id('school_a'), _admins_only => false) WHERE target_name ~* '(student|parent|admin a|teacher)'), 'no person''s name appears for any record type');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_activity_log(_admins_only => false) WHERE details::text ~* '(@test|reason)'), 'details hold no emails or free-text reasons');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_activity_log(_school => pg_temp.id('school_b'), _admins_only => false)) < (SELECT count(*) FROM public.platform_activity_log(_admins_only => false)), 'it can be filtered by school');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_activity_log(_action => 'subscription_changed')) >= 3 AND NOT EXISTS (SELECT 1 FROM public.platform_activity_log(_action => 'subscription_changed') WHERE action <> 'subscription_changed'), 'by action type');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_activity_log(_actor => 'Platform', _admins_only => false)) > 0, 'by actor');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_activity_log(_from => now() + interval '1 day', _admins_only => false)) = 0, 'by date');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_activity_log(_target_type => 'school', _admins_only => false)) > 0, 'by affected record type');
  SELECT total INTO n FROM public.platform_activity_log(_limit => 2, _admins_only => false) LIMIT 1;
  PERFORM pg_temp.ok(n > 2 AND (SELECT count(*) FROM public.platform_activity_log(_limit => 2, _admins_only => false)) = 2, 'results are paged with a total');
END $$;

-- ---------------------------------------------------------------------------
-- Disabling a compromised school administrator
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  pid UUID;
BEGIN
  PERFORM set_config('role', 'none', true);
  SELECT id INTO pid FROM public.profiles WHERE email = 'admin-a@test.invalid';
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.platform_school_admins(%L)$q$, sa)), 'a school administrator cannot use the platform controls');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok((SELECT status::text FROM public.platform_school_admins(sa) LIMIT 1) = 'active', 'the platform lists a school''s administrators');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.platform_set_admin_status(%L, %L, true, 'short')$q$, sa, pid)), 'disabling needs a proper reason');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.platform_set_admin_status(%L, %L, true, 'Suspected account compromise')$q$, sa, pg_temp.id('teacher-math'))), 'only administrators can be disabled this way');
  PERFORM public.platform_set_admin_status(sa, pid, true, 'Suspected account compromise, investigating');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(NOT public.is_member(sa), 'the disabled administrator loses access at once');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.subjects$q$) = 0, 'and sees nothing');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.platform_set_admin_status(sa, pid, false, 'Verified the account is safe again');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(public.is_member(sa), 'and can be restored');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'admin_access_changed'$q$) = 2, 'both changes are in the school''s audit log');
END $$;

ROLLBACK;
