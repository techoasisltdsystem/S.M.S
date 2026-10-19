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

ROLLBACK;
