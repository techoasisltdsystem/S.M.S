-- Platform team: more than one Super Admin, each with their own login, a way to switch one off,
-- and the account self-service the Super Admin needs (change own sign-in email).

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

-- A disabled Super Admin keeps their row (history) but no longer passes this check.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid() AND disabled_at IS NULL)
     AND COALESCE(auth.jwt() ->> 'aal', '') <> 'aal1'
$$;

CREATE OR REPLACE FUNCTION public.platform_admins_list()
RETURNS TABLE (user_id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ, created_by_email TEXT, disabled_at TIMESTAMPTZ, is_you BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT a.user_id, u.email::text, a.full_name, a.created_at, c.email::text, a.disabled_at, a.user_id = auth.uid()
    FROM public.platform_admins a
    JOIN auth.users u ON u.id = a.user_id
    LEFT JOIN auth.users c ON c.id = a.created_by
    ORDER BY a.disabled_at IS NOT NULL, a.created_at;
END $$;

-- Switch a Super Admin off or on. Nobody can switch themselves off, and the last active one cannot go.
CREATE OR REPLACE FUNCTION public.platform_admin_set_disabled(_user UUID, _disabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  IF _user = auth.uid() THEN RAISE EXCEPTION 'you cannot switch off your own access' USING ERRCODE = '22023'; END IF;
  IF _disabled AND (SELECT count(*) FROM public.platform_admins WHERE disabled_at IS NULL AND user_id <> _user) < 1 THEN
    RAISE EXCEPTION 'at least one active Super Admin must remain' USING ERRCODE = '22023';
  END IF;
  UPDATE public.platform_admins SET disabled_at = CASE WHEN _disabled THEN now() ELSE NULL END WHERE user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such Super Admin' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Called by the server after it has created the login. Only an active Super Admin may add another.
CREATE OR REPLACE FUNCTION public.platform_admin_register(_user UUID, _name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user) THEN
    RAISE EXCEPTION 'that login belongs to a school account' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.platform_admins (user_id, full_name, created_by) VALUES (_user, nullif(btrim(_name), ''), auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET disabled_at = NULL, full_name = COALESCE(nullif(btrim(_name), ''), public.platform_admins.full_name);
END $$;

-- Super Admin's own display name.
CREATE OR REPLACE FUNCTION public.platform_admin_set_my_name(_name TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  UPDATE public.platform_admins SET full_name = nullif(btrim(left(_name, 100)), '') WHERE user_id = auth.uid();
END $$;

-- Change the sign-in email of the signed-in Super Admin. The page re-checks their password first.
CREATE OR REPLACE FUNCTION public.platform_admin_change_my_email(_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE addr TEXT := lower(btrim(COALESCE(_email, '')));
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(addr) > 200 THEN RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = addr AND id <> auth.uid()) THEN
    RAISE EXCEPTION 'another account already uses that email' USING ERRCODE = '23505';
  END IF;
  UPDATE auth.users SET email = addr WHERE id = auth.uid();
END $$;

-- Whether this Super Admin has a name on record, and the email they sign in with.
CREATE OR REPLACE FUNCTION public.platform_admin_me()
RETURNS TABLE (user_id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.user_id, u.email::text, a.full_name, a.created_at
    FROM public.platform_admins a JOIN auth.users u ON u.id = a.user_id WHERE a.user_id = auth.uid();
END $$;

-- One read for the "System health" page: how big the platform is and whether its background work is alive.
CREATE OR REPLACE FUNCTION public.platform_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  SELECT jsonb_build_object(
    'schools', (SELECT count(*) FROM public.schools),
    'suspended_schools', (SELECT count(*) FROM public.schools WHERE status = 'suspended'),
    'people', (SELECT count(*) FROM public.profiles),
    'platform_admins', (SELECT count(*) FROM public.platform_admins WHERE disabled_at IS NULL),
    'disabled_platform_admins', (SELECT count(*) FROM public.platform_admins WHERE disabled_at IS NOT NULL),
    'pending_invitations', (SELECT count(*) FROM public.school_invitations WHERE accepted_at IS NULL AND expires_at > now()),
    'audit_events_24h', (SELECT count(*) FROM public.audit_logs WHERE created_at > now() - interval '24 hours'),
    'database_size_bytes', pg_database_size(current_database()),
    'server_time', now()
  ) INTO r;
  RETURN r;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_admins_list(), public.platform_admin_set_disabled(UUID, BOOLEAN),
  public.platform_admin_register(UUID, TEXT), public.platform_admin_set_my_name(TEXT),
  public.platform_admin_change_my_email(TEXT), public.platform_admin_me(), public.platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_admins_list(), public.platform_admin_set_disabled(UUID, BOOLEAN),
  public.platform_admin_register(UUID, TEXT), public.platform_admin_set_my_name(TEXT),
  public.platform_admin_change_my_email(TEXT), public.platform_admin_me(), public.platform_health() TO authenticated;
