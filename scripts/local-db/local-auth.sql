-- Sign-in for the laptop database (VITE_DB_PROVIDER=local). Hosted Supabase
-- uses Supabase Auth instead and never runs this file.
--
-- Passwords are stored as bcrypt hashes (pgcrypto crypt). local_login checks
-- the password in the database and returns a JWT signed with the secret that
-- PostgREST also holds (PGRST_JWT_SECRET), so every request is tied to a
-- server-checked identity. Sessions can be revoked: PostgREST calls
-- auth_local.check_request() before each request (PGRST_DB_PRE_REQUEST).
--
-- psql variable jwt_secret must be set (migrate.ps1 reads it from .env.local).
CREATE SCHEMA IF NOT EXISTS auth_local;
REVOKE ALL ON SCHEMA auth_local FROM PUBLIC;
GRANT USAGE ON SCHEMA auth_local TO anon, authenticated;

CREATE TABLE IF NOT EXISTS auth_local.config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  jwt_secret TEXT NOT NULL CHECK (length(jwt_secret) >= 32)
);
INSERT INTO auth_local.config (jwt_secret) VALUES (:'jwt_secret')
ON CONFLICT (id) DO UPDATE SET jwt_secret = EXCLUDED.jwt_secret;

CREATE TABLE IF NOT EXISTS auth_local.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS auth_local.login_attempts (
  email TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_at ON auth_local.login_attempts (email, at DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA auth_local FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION auth_local.b64url(_data BYTEA) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(rtrim(replace(encode(_data, 'base64'), E'\n', ''), '='), '+/', '-_')
$$;

CREATE OR REPLACE FUNCTION auth_local.sign(_claims JSONB) RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  body TEXT := auth_local.b64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8')) || '.' ||
               auth_local.b64url(convert_to(_claims::text, 'UTF8'));
BEGIN
  RETURN body || '.' || auth_local.b64url(hmac(convert_to(body, 'UTF8'),
    convert_to((SELECT jwt_secret FROM auth_local.config), 'UTF8'), 'sha256'));
END $$;

CREATE OR REPLACE FUNCTION auth_local.issue_session(_user UUID, _email TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  sid UUID;
  expires TIMESTAMPTZ := now() + interval '8 hours';
BEGIN
  INSERT INTO auth_local.sessions (user_id, expires_at) VALUES (_user, expires) RETURNING id INTO sid;
  RETURN jsonb_build_object(
    'access_token', auth_local.sign(jsonb_build_object(
      'sub', _user, 'email', _email, 'role', 'authenticated', 'sid', sid,
      'iat', extract(epoch FROM now())::bigint, 'exp', extract(epoch FROM expires)::bigint)),
    'expires_at', expires,
    'user', jsonb_build_object('id', _user, 'email', _email));
END $$;

-- Returns {access_token, ...} or {error}. Errors are returned, not raised, so
-- the failed attempt is still recorded for rate limiting.
CREATE OR REPLACE FUNCTION public.local_login(_email TEXT, _password TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  addr TEXT := lower(btrim(COALESCE(_email, '')));
  u auth.users;
  recent_failures INT;
BEGIN
  SELECT count(*) INTO recent_failures FROM auth_local.login_attempts
   WHERE email = addr AND NOT succeeded AND at > now() - interval '15 minutes';
  IF recent_failures >= 5 THEN
    RETURN jsonb_build_object('error', 'too_many_attempts');
  END IF;

  SELECT * INTO u FROM auth.users WHERE email = addr;
  IF NOT FOUND OR u.encrypted_password IS NULL OR crypt(COALESCE(_password, ''), u.encrypted_password) <> u.encrypted_password THEN
    INSERT INTO auth_local.login_attempts (email, succeeded) VALUES (addr, FALSE);
    RETURN jsonb_build_object('error', 'invalid_credentials');
  END IF;

  INSERT INTO auth_local.login_attempts (email, succeeded) VALUES (addr, TRUE);
  RETURN auth_local.issue_session(u.id, u.email);
END $$;

CREATE OR REPLACE FUNCTION public.local_logout() RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
  UPDATE auth_local.sessions SET revoked_at = now()
   WHERE id = NULLIF(auth.jwt() ->> 'sid', '')::uuid AND user_id = auth.uid() AND revoked_at IS NULL
$$;

-- Accepts an invitation by choosing a password: creates the login for the
-- invited email (or checks the password of an existing one) and signs in.
CREATE OR REPLACE FUNCTION public.local_accept_invitation(_token TEXT, _password TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  inv public.school_invitations;
  u auth.users;
BEGIN
  IF length(COALESCE(_password, '')) < 8 THEN
    RAISE EXCEPTION 'use at least 8 characters for your password' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO inv FROM public.school_invitations
   WHERE token_hash = sha256(convert_to(COALESCE(_token, ''), 'UTF8'))
     AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this invitation link is invalid or has expired' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO u FROM auth.users WHERE email = inv.email;
  IF NOT FOUND THEN
    INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
    VALUES (inv.email, crypt(_password, gen_salt('bf', 10)), now()) RETURNING * INTO u;
  ELSIF crypt(_password, u.encrypted_password) <> u.encrypted_password THEN
    RAISE EXCEPTION 'this email already has a login; enter its current password' USING ERRCODE = '42501';
  END IF;

  PERFORM public.accept_invitation_for(u.id, u.email, _token);
  RETURN auth_local.issue_session(u.id, u.email);
END $$;

-- Chooses a new password with a single-use reset token (see password_reset_requests). The token's
-- digest is checked and burned, the password is stored as a bcrypt hash, and every open session of
-- that login is signed out.
CREATE OR REPLACE FUNCTION public.local_reset_password(_token TEXT, _password TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  r public.password_reset_requests;
  u auth.users;
BEGIN
  IF length(COALESCE(_password, '')) < 8 THEN
    RAISE EXCEPTION 'use at least 8 characters for your password' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO r FROM public.password_reset_requests
   WHERE token_hash = sha256(convert_to(COALESCE(_token, ''), 'UTF8')) AND state IN ('requested', 'sent') AND used_at IS NULL AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this reset link is invalid or has expired' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM auth.users WHERE lower(email) = r.email;
  IF NOT FOUND THEN RAISE EXCEPTION 'this reset link is invalid or has expired' USING ERRCODE = '22023'; END IF;
  UPDATE auth.users SET encrypted_password = crypt(_password, gen_salt('bf', 10)) WHERE id = u.id;
  UPDATE auth_local.sessions SET revoked_at = now() WHERE user_id = u.id AND revoked_at IS NULL;
  UPDATE public.password_reset_requests SET state = 'used', used_at = now(), token_hash = NULL WHERE id = r.id;
  DELETE FROM auth_local.login_attempts WHERE email = r.email;
  IF r.school_id IS NOT NULL THEN
    PERFORM public.write_audit(r.school_id, 'password_reset_requested', 'user', r.target_profile_id, NULL, jsonb_build_object('request', r.id, 'completed', true));
  END IF;
END $$;

-- Changes the signed-in person's own password after checking the current one. Other open sessions
-- of this login are signed out; the one making the change stays.
CREATE OR REPLACE FUNCTION public.local_change_password(_current TEXT, _new TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  u auth.users;
  sid UUID := NULLIF(auth.jwt() ->> 'sid', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  IF length(COALESCE(_new, '')) < 8 THEN RAISE EXCEPTION 'use at least 8 characters for your new password' USING ERRCODE = '22023'; END IF;
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND OR crypt(COALESCE(_current, ''), u.encrypted_password) <> u.encrypted_password THEN
    RAISE EXCEPTION 'your current password is not correct' USING ERRCODE = '42501';
  END IF;
  UPDATE auth.users SET encrypted_password = crypt(_new, gen_salt('bf', 10)), must_change_password = FALSE WHERE id = u.id;
  UPDATE auth_local.sessions SET revoked_at = now() WHERE user_id = u.id AND revoked_at IS NULL AND id IS DISTINCT FROM sid;
END $$;

-- PostgREST pre-request hook: rejects revoked or expired sessions.
CREATE OR REPLACE FUNCTION auth_local.check_request() RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  claims JSONB := auth.jwt();
BEGIN
  IF claims ->> 'role' = 'authenticated' AND NOT EXISTS (
    SELECT 1 FROM auth_local.sessions s
     WHERE s.id = NULLIF(claims ->> 'sid', '')::uuid
       AND s.user_id = auth.uid() AND s.revoked_at IS NULL AND s.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'session expired' USING ERRCODE = 'PT401';
  END IF;
END $$;

-- Operator-only: create a school with its first administrator and password.
CREATE OR REPLACE FUNCTION auth_local.create_school(_name TEXT, _slug TEXT, _admin_name TEXT, _admin_email TEXT, _admin_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  boot JSONB := public.bootstrap_school(_name, _slug, _admin_name, _admin_email);
BEGIN
  PERFORM public.local_accept_invitation(boot ->> 'token', _admin_password);
  RETURN jsonb_build_object('school_id', boot ->> 'school_id');
END $$;

-- Operator-only: create (or promote) a platform super admin login.
CREATE OR REPLACE FUNCTION auth_local.create_platform_admin(_email TEXT, _password TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  addr TEXT := lower(btrim(COALESCE(_email, '')));
  u auth.users;
BEGIN
  IF length(COALESCE(_password, '')) < 12 THEN
    RAISE EXCEPTION 'use at least 12 characters for a platform admin password' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM auth.users WHERE email = addr;
  IF NOT FOUND THEN
    INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
    VALUES (addr, crypt(_password, gen_salt('bf', 10)), now()) RETURNING * INTO u;
  ELSIF crypt(_password, u.encrypted_password) <> u.encrypted_password THEN
    RAISE EXCEPTION 'this email already has a login; enter its current password' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.platform_admins (user_id) VALUES (u.id) ON CONFLICT DO NOTHING;
  RETURN u.id;
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA auth_local FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_local.check_request() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.local_login(TEXT, TEXT), public.local_logout(),
  public.local_accept_invitation(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.local_reset_password(TEXT, TEXT), public.local_change_password(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.local_change_password(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.local_login(TEXT, TEXT), public.local_accept_invitation(TEXT, TEXT), public.local_reset_password(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.local_logout() TO authenticated;
