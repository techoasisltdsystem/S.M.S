-- Managing other people's logins (laptop sign-in only; hosted providers keep their own account store).
--
--   * A platform administrator may manage the logins of a school's School Admin accounts.
--   * A school administrator (users.manage) may manage the logins of the other people in their school:
--     teachers, students, parents and other staff, but not another School Admin and not themselves.
--
-- A new password is never chosen by the manager. The system generates a strong temporary password, shows
-- it once to the manager to pass on, signs the person out everywhere, and makes them choose their own
-- password at their next sign-in. The password is never written to the audit log.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.can_manage_login(_school UUID, _profile UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p public.profiles;
  target_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _profile AND school_id = _school;
  IF NOT FOUND OR p.user_id IS NULL OR p.user_id = auth.uid() THEN RETURN FALSE; END IF;
  SELECT EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.profile_id = _profile AND m.school_id = _school AND m.role = 'school_admin')
    INTO target_is_admin;
  IF public.is_platform_admin() THEN RETURN target_is_admin; END IF;
  RETURN NOT target_is_admin AND public.has_permission(_school, 'users.manage');
END $$;

CREATE OR REPLACE FUNCTION public.local_admin_set_password(_school UUID, _profile UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  p public.profiles;
  alphabet TEXT := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b BYTEA := gen_random_bytes(12);
  pw TEXT := '';
  i INT;
BEGIN
  IF NOT public.can_manage_login(_school, _profile) THEN
    RAISE EXCEPTION 'you cannot change this person''s login' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _profile;
  FOR i IN 0..11 LOOP
    pw := pw || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
    IF i IN (3, 7) THEN pw := pw || '-'; END IF;
  END LOOP;
  UPDATE auth.users SET encrypted_password = crypt(pw, gen_salt('bf', 10)), must_change_password = TRUE, updated_at = now() WHERE id = p.user_id;
  UPDATE auth_local.sessions SET revoked_at = now() WHERE user_id = p.user_id AND revoked_at IS NULL;
  DELETE FROM auth_local.login_attempts WHERE email = lower(p.email);
  PERFORM public.write_audit(_school, 'password_reset_requested', 'user', p.id, p.full_name, jsonb_build_object('method', 'temporary_password'));
  RETURN pw;
END $$;

CREATE OR REPLACE FUNCTION public.local_admin_set_email(_school UUID, _profile UUID, _email TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
DECLARE
  p public.profiles;
  addr TEXT := lower(btrim(COALESCE(_email, '')));
BEGIN
  IF NOT public.can_manage_login(_school, _profile) THEN
    RAISE EXCEPTION 'you cannot change this person''s login' USING ERRCODE = '42501';
  END IF;
  IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(addr) > 200 THEN RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = _profile;
  IF addr = lower(p.email) THEN RAISE EXCEPTION 'that is already their email' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = addr) OR EXISTS (SELECT 1 FROM public.profiles WHERE school_id = _school AND lower(email) = addr) THEN
    RAISE EXCEPTION 'another account already uses that email' USING ERRCODE = '23505';
  END IF;
  UPDATE auth.users SET email = addr, updated_at = now() WHERE id = p.user_id;
  UPDATE public.profiles SET email = addr WHERE id = p.id;
  UPDATE auth_local.sessions SET revoked_at = now() WHERE user_id = p.user_id AND revoked_at IS NULL;
  PERFORM public.write_audit(_school, 'user_updated', 'user', p.id, p.full_name, jsonb_build_object('changed', jsonb_build_array('login email')));
END $$;

CREATE OR REPLACE FUNCTION public.local_must_change_password() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth_local, pg_temp AS $$
  SELECT COALESCE((SELECT must_change_password FROM auth.users WHERE id = auth.uid()), FALSE)
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_login(UUID, UUID), public.local_admin_set_password(UUID, UUID),
  public.local_admin_set_email(UUID, UUID, TEXT), public.local_must_change_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_login(UUID, UUID), public.local_admin_set_password(UUID, UUID),
  public.local_admin_set_email(UUID, UUID, TEXT), public.local_must_change_password() TO authenticated;
