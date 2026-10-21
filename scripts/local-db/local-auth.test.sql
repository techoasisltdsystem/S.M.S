-- Tests for laptop sign-in (local-auth.sql). Rolled back; leaves no data.
BEGIN;

CREATE FUNCTION pg_temp.ok(_cond BOOLEAN, _label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', _label; END IF;
  RAISE NOTICE 'PASS: %', _label;
END $$;

CREATE FUNCTION pg_temp.claims(_token TEXT) RETURNS JSONB LANGUAGE sql AS $$
  SELECT convert_from(decode(rpad(translate(split_part(_token, '.', 2), '-_', '+/'),
    ((length(split_part(_token, '.', 2)) + 3) / 4) * 4, '='), 'base64'), 'UTF8')::jsonb
$$;

DO $$
DECLARE
  boot JSONB := auth_local.create_school('Login Test School', 'login-test-school', 'Login Admin', 'Login@Test.invalid', 'correct horse 1');
  res JSONB;
  tok TEXT;
  body TEXT;
BEGIN
  PERFORM pg_temp.ok((SELECT encrypted_password LIKE '$2a$%' FROM auth.users WHERE email = 'login@test.invalid'),
    'passwords are stored as bcrypt hashes');

  res := public.local_login('login@test.invalid', 'wrong password');
  PERFORM pg_temp.ok(res ->> 'error' = 'invalid_credentials' AND NOT res ? 'access_token', 'a wrong password is refused');
  res := public.local_login('nobody@test.invalid', 'whatever');
  PERFORM pg_temp.ok(res ->> 'error' = 'invalid_credentials', 'an unknown email gets the same answer as a wrong password');

  res := public.local_login(' LOGIN@test.invalid ', 'correct horse 1');
  tok := res ->> 'access_token';
  PERFORM pg_temp.ok(tok IS NOT NULL, 'the right password signs in (email is case-insensitive)');
  PERFORM pg_temp.ok(pg_temp.claims(tok) ->> 'role' = 'authenticated' AND pg_temp.claims(tok) ? 'sid'
    AND (pg_temp.claims(tok) ->> 'exp')::bigint > extract(epoch FROM now()), 'the token carries role, session and expiry');
  body := split_part(tok, '.', 1) || '.' || split_part(tok, '.', 2);
  PERFORM pg_temp.ok(split_part(tok, '.', 3) = auth_local.b64url(hmac(convert_to(body, 'UTF8'),
    convert_to((SELECT jwt_secret FROM auth_local.config), 'UTF8'), 'sha256')), 'the token is signed with the server secret');

  PERFORM set_config('request.jwt.claims', pg_temp.claims(tok)::text, true);
  PERFORM auth_local.check_request();
  PERFORM pg_temp.ok(TRUE, 'a live session is accepted');
  PERFORM public.local_logout();
  BEGIN
    PERFORM auth_local.check_request();
    PERFORM pg_temp.ok(FALSE, 'a signed-out session is rejected');
  EXCEPTION WHEN SQLSTATE 'PT401' THEN
    PERFORM pg_temp.ok(TRUE, 'a signed-out session is rejected');
  END;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  BEGIN
    PERFORM auth_local.check_request();
    PERFORM pg_temp.ok(FALSE, 'a token without a session is rejected');
  EXCEPTION WHEN SQLSTATE 'PT401' THEN
    PERFORM pg_temp.ok(TRUE, 'a token without a session is rejected');
  END;

  FOR i IN 1..5 LOOP PERFORM public.local_login('login@test.invalid', 'wrong'); END LOOP;
  res := public.local_login('login@test.invalid', 'correct horse 1');
  PERFORM pg_temp.ok(res ->> 'error' = 'too_many_attempts', 'five failures in 15 minutes lock sign-in, even with the right password');
END $$;

-- Account recovery: single-use, expiring, never revealed, audited without the token.
DO $$
DECLARE
  sid UUID := (SELECT id FROM public.schools WHERE slug = 'login-test-school');
  prof UUID := (SELECT p.id FROM public.profiles p WHERE p.school_id = (SELECT id FROM public.schools WHERE slug = 'login-test-school'));
  plat UUID := auth_local.create_platform_admin('plat@test.invalid', 'a long platform pass');
  other UUID;
  req JSONB;
  issued JSONB;
  tok TEXT;
  res JSONB;
BEGIN
  -- a school administrator cannot start a reset for anyone
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', (SELECT user_id FROM public.profiles WHERE id = prof))::text, true);
  BEGIN
    PERFORM public.platform_request_admin_reset(sid, prof);
    PERFORM pg_temp.ok(FALSE, 'a school administrator cannot start a platform reset');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.ok(TRUE, 'a school administrator cannot start a platform reset');
  END;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', plat)::text, true);
  req := public.platform_request_admin_reset(sid, prof);
  PERFORM pg_temp.ok(req ->> 'email' = 'login@test.invalid', 'the platform can start a reset for a School Admin');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = sid AND action = 'password_reset_requested' AND details ->> 'by' = 'platform'), 'the request is audited');
  PERFORM pg_temp.ok((SELECT state FROM public.platform_reset_requests(sid) LIMIT 1) = 'requested', 'its status can be read');

  PERFORM set_config('request.jwt.claims', '', true);
  issued := public.recovery_issue((req ->> 'id')::uuid);
  tok := issued ->> 'token';
  PERFORM pg_temp.ok(length(tok) = 64 AND (SELECT token_hash FROM public.password_reset_requests WHERE id = (req ->> 'id')::uuid) <> convert_to(tok, 'UTF8'), 'only the digest of the token is stored');
  PERFORM pg_temp.ok(public.recovery_issue((req ->> 'id')::uuid) IS NULL, 'a request is issued a token only once');
  PERFORM public.recovery_mark((req ->> 'id')::uuid, true, NULL);
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE details::text LIKE '%' || tok || '%'), 'the token is in no audit entry');

  BEGIN PERFORM public.local_reset_password(tok, 'short'); PERFORM pg_temp.ok(FALSE, 'a short password is refused');
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(TRUE, 'a short password is refused'); END;
  BEGIN PERFORM public.local_reset_password('not-the-token', 'a brand new passphrase'); PERFORM pg_temp.ok(FALSE, 'a wrong token is refused');
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(TRUE, 'a wrong token is refused'); END;

  PERFORM public.local_reset_password(tok, 'a brand new passphrase');
  PERFORM pg_temp.ok((public.local_login('login@test.invalid', 'a brand new passphrase') ->> 'access_token') IS NOT NULL, 'the new password works');
  PERFORM pg_temp.ok(public.local_login('login@test.invalid', 'correct horse 1') ->> 'error' = 'invalid_credentials', 'the old password no longer does');
  BEGIN PERFORM public.local_reset_password(tok, 'another passphrase here'); PERFORM pg_temp.ok(FALSE, 'a reset link works only once');
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(TRUE, 'a reset link works only once'); END;
  PERFORM pg_temp.ok((SELECT state FROM public.password_reset_requests WHERE id = (req ->> 'id')::uuid) = 'used', 'and the request is marked used');

  -- an expired link
  issued := public.recovery_issue_for_email('login@test.invalid');
  UPDATE public.password_reset_requests SET expires_at = now() - interval '1 minute' WHERE id = (issued ->> 'id')::uuid;
  BEGIN PERFORM public.local_reset_password(issued ->> 'token', 'yet another passphrase'); PERFORM pg_temp.ok(FALSE, 'an expired link is refused');
  EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok(TRUE, 'an expired link is refused'); END;

  PERFORM pg_temp.ok(public.recovery_issue_for_email('nobody@test.invalid') IS NULL, 'an unknown address gets no link (and the caller answers the same either way)');

  -- rate limit: three requests an hour per account
  PERFORM public.recovery_issue_for_email('login@test.invalid');
  PERFORM pg_temp.ok(public.recovery_issue_for_email('login@test.invalid') IS NULL, 'a fourth request in an hour is refused');
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', plat)::text, true);
  BEGIN PERFORM public.platform_request_admin_reset(sid, prof); PERFORM pg_temp.ok(FALSE, 'the platform is rate limited too');
  EXCEPTION WHEN SQLSTATE '54000' THEN PERFORM pg_temp.ok(TRUE, 'the platform is rate limited too'); END;
END $$;

-- Managing other people's logins: who may, and what it leaves behind.
DO $$
DECLARE
  sid UUID := (SELECT id FROM public.schools WHERE slug = 'login-test-school');
  admin_p UUID := (SELECT p.id FROM public.profiles p WHERE p.school_id = (SELECT id FROM public.schools WHERE slug = 'login-test-school') AND p.email = 'login@test.invalid');
  plat UUID := (SELECT id FROM auth.users WHERE email = 'plat@test.invalid');
  admin_uid UUID := (SELECT id FROM auth.users WHERE email = 'login@test.invalid');
  teacher_p UUID; teacher_u UUID; other_sid UUID; other_p UUID;
  pw TEXT; res JSONB; tok TEXT;
BEGIN
  INSERT INTO auth.users (email, encrypted_password) VALUES ('teach@test.invalid', crypt('teacher old password', gen_salt('bf', 8))) RETURNING id INTO teacher_u;
  INSERT INTO public.profiles (school_id, full_name, email, user_id, status) VALUES (sid, 'Teach Er', 'teach@test.invalid', teacher_u, 'active') RETURNING id INTO teacher_p;
  INSERT INTO public.school_memberships (school_id, profile_id, role, status) VALUES (sid, teacher_p, 'teacher', 'active');
  other_sid := (auth_local.create_school('Other Login School', 'other-login-school', 'Other Admin', 'other@test.invalid', 'other admin password') ->> 'school_id')::uuid;
  other_p := (SELECT id FROM public.profiles WHERE school_id = other_sid LIMIT 1);

  -- the platform manages a School Admin
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', plat)::text, true);
  PERFORM pg_temp.ok(public.can_manage_login(sid, admin_p), 'the platform may manage a School Admin''s login');
  PERFORM pg_temp.ok(NOT public.can_manage_login(sid, teacher_p), 'but not a teacher''s (that is the school''s job)');
  pw := public.local_admin_set_password(sid, admin_p);
  PERFORM pg_temp.ok(pw ~ '^[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}$', 'a strong temporary password is generated, not chosen by the manager');
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.ok((public.local_login('login@test.invalid', pw) ->> 'access_token') IS NOT NULL, 'the temporary password signs the admin in');
  PERFORM pg_temp.ok(public.local_login('login@test.invalid', 'a brand new passphrase') ->> 'error' = 'invalid_credentials', 'the old password stops working');
  PERFORM pg_temp.ok((SELECT must_change_password FROM auth.users WHERE id = admin_uid), 'and they must choose their own at sign-in');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE details::text LIKE '%' || pw || '%'), 'the password is in no audit entry');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = sid AND action = 'password_reset_requested' AND details ->> 'method' = 'temporary_password'), 'but the change is recorded');

  -- the admin chooses their own password: the requirement clears
  res := public.local_login('login@test.invalid', pw);
  tok := res ->> 'access_token';
  PERFORM set_config('request.jwt.claims', convert_from(decode(rpad(translate(split_part(tok, '.', 2), '-_', '+/'), ((length(split_part(tok, '.', 2)) + 3) / 4) * 4, '='), 'base64'), 'UTF8'), true);
  PERFORM public.local_change_password(pw, 'my own new passphrase');
  PERFORM pg_temp.ok(NOT public.local_must_change_password(), 'choosing their own password clears the requirement');

  -- the school administrator manages teachers, students and parents, not admins or themselves
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', admin_uid)::text, true);
  PERFORM pg_temp.ok(public.can_manage_login(sid, teacher_p), 'a school administrator may manage a teacher''s login');
  PERFORM pg_temp.ok(NOT public.can_manage_login(sid, admin_p), 'but not their own');
  PERFORM pg_temp.ok(NOT public.can_manage_login(other_sid, other_p), 'nor another school''s administrator');
  pw := public.local_admin_set_password(sid, teacher_p);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.ok((public.local_login('teach@test.invalid', pw) ->> 'access_token') IS NOT NULL AND public.local_login('teach@test.invalid', 'teacher old password') ->> 'error' = 'invalid_credentials', 'the teacher signs in with the new temporary password only');
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', admin_uid)::text, true);
  PERFORM public.local_admin_set_email(sid, teacher_p, 'new.teacher@test.invalid');
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.ok((public.local_login('new.teacher@test.invalid', pw) ->> 'access_token') IS NOT NULL AND (SELECT email FROM public.profiles WHERE id = teacher_p) = 'new.teacher@test.invalid', 'a changed login email works and the profile follows');

  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', admin_uid)::text, true);
  BEGIN PERFORM public.local_admin_set_email(sid, teacher_p, 'plat@test.invalid'); PERFORM pg_temp.ok(FALSE, 'an email already in use is refused');
  EXCEPTION WHEN unique_violation THEN PERFORM pg_temp.ok(TRUE, 'an email already in use is refused'); END;
  BEGIN PERFORM public.local_admin_set_password(other_sid, other_p); PERFORM pg_temp.ok(FALSE, 'a school administrator cannot touch another school');
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(TRUE, 'a school administrator cannot touch another school'); END;

  -- a teacher cannot manage anyone
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', (SELECT id FROM auth.users WHERE email = 'new.teacher@test.invalid'))::text, true);
  BEGIN PERFORM public.local_admin_set_password(sid, admin_p); PERFORM pg_temp.ok(FALSE, 'a teacher cannot change logins');
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(TRUE, 'a teacher cannot change logins'); END;
END $$;

ROLLBACK;
