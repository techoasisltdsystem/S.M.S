-- Platform roles and permissions, and invitation-based setup for new platform administrators.
--
-- Roles are presets of permissions. A Super Admin passes every check. Everyone else holds an explicit list of
-- "module.action" permissions stored on their row. Every platform function checks its own permission in the
-- database, so hiding a button is never the only protection.
--
-- Existing platform administrators become Super Admins, so nothing they could do before changes.

ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'super_admin',
  ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.platform_admins DROP CONSTRAINT IF EXISTS platform_admins_role_check;
ALTER TABLE public.platform_admins ADD CONSTRAINT platform_admins_role_check
  CHECK (role IN ('super_admin', 'platform_admin', 'billing_admin', 'support_admin'));

-- Every permission that exists. A Super Admin holds all of them.
CREATE OR REPLACE FUNCTION public.platform_all_permissions() RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['clients.view', 'clients.manage', 'billing.view', 'billing.manage', 'support.view', 'support.manage',
               'audit.view', 'audit.manage', 'settings.manage', 'health.view', 'admins.manage']
$$;

CREATE OR REPLACE FUNCTION public.platform_role_preset(_role TEXT) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN public.platform_all_permissions()
    WHEN 'platform_admin' THEN ARRAY['clients.view', 'clients.manage', 'billing.view', 'support.view', 'support.manage', 'audit.view', 'health.view']
    WHEN 'billing_admin' THEN ARRAY['clients.view', 'billing.view', 'billing.manage']
    WHEN 'support_admin' THEN ARRAY['clients.view', 'support.view', 'support.manage']
    ELSE ARRAY[]::TEXT[]
  END
$$;

-- What the signed-in administrator may do right now (empty if not an active administrator).
CREATE OR REPLACE FUNCTION public.platform_my_permissions() RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE WHEN a.role = 'super_admin' THEN public.platform_all_permissions() ELSE a.permissions END
    FROM public.platform_admins a WHERE a.user_id = auth.uid() AND a.disabled_at IS NULL
  ), ARRAY[]::TEXT[])
$$;

CREATE OR REPLACE FUNCTION public.platform_can(_perm TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin() AND _perm = ANY (public.platform_my_permissions())
$$;

CREATE OR REPLACE FUNCTION public.platform_require(_perm TEXT) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.platform_can(_perm) THEN RAISE EXCEPTION 'you do not have permission for this (%)', _perm USING ERRCODE = '42501'; END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Put a permission check into every existing platform function. The check each one had before
-- ("any platform administrator") is replaced by the permission for what that function does.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  m RECORD; f RECORD; def TEXT; newdef TEXT;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('platform_overview', 'clients.view'), ('platform_schools', 'clients.view'), ('subscription_history', 'clients.view'),
    ('platform_client', 'clients.view'), ('platform_clients', 'clients.view'), ('platform_reminders', 'clients.view'),
    ('platform_reset_requests', 'clients.view'),
    ('set_school_status', 'clients.manage'), ('platform_create_school', 'clients.manage'), ('platform_request_admin_reset', 'clients.manage'),
    ('platform_mark_reset', 'clients.manage'), ('platform_ack_reminders', 'clients.manage'),
    ('platform_billing_overview', 'billing.view'), ('platform_billing_changes', 'billing.view'), ('platform_billing_settings', 'billing.view'),
    ('platform_payment_events', 'billing.view'), ('platform_reconciliation', 'billing.view'), ('platform_transactions', 'billing.view'),
    ('platform_plans', 'billing.view'),
    ('platform_extend_subscription', 'billing.manage'), ('platform_save_plan', 'billing.manage'), ('platform_save_billing_settings', 'billing.manage'),
    ('list_support_requests', 'support.view'), ('get_support_request', 'support.view'), ('list_support_access', 'support.view'),
    ('reply_support_request', 'support.manage'), ('set_support_status', 'support.manage'), ('end_support_access', 'support.manage'),
    ('audit_monitoring_status', 'audit.view'), ('list_audit_incidents', 'audit.view'), ('get_audit_incident', 'audit.view'), ('list_platform_alerts', 'audit.view'),
    ('audit_incident_action', 'audit.manage'), ('mark_platform_alerts_read', 'audit.manage'), ('run_audit_health_check', 'audit.manage'),
    ('set_audit_settings', 'settings.manage')
  ) AS t(fn, perm)
  LOOP
    FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = m.fn LOOP
      def := pg_get_functiondef(f.oid);
      newdef := regexp_replace(def, 'NOT (public\.)?is_platform_admin\(\)', format('NOT public.platform_can(%L)', m.perm), 'g');
      newdef := regexp_replace(newdef, 'PERFORM public\.platform_only\(\);', format('PERFORM public.platform_require(%L);', m.perm), 'g');
      IF newdef <> def THEN EXECUTE newdef; END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Administrators: list, change role, switch off, and the guards that stop privilege escalation.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.platform_admins_list();
CREATE FUNCTION public.platform_admins_list()
RETURNS TABLE (user_id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ, created_by_email TEXT, disabled_at TIMESTAMPTZ,
               is_you BOOLEAN, role TEXT, permissions TEXT[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('admins.manage');
  RETURN QUERY
    SELECT a.user_id, u.email::text, a.full_name, a.created_at, c.email::text, a.disabled_at, a.user_id = auth.uid(), a.role,
           CASE WHEN a.role = 'super_admin' THEN public.platform_all_permissions() ELSE a.permissions END
    FROM public.platform_admins a
    JOIN auth.users u ON u.id = a.user_id
    LEFT JOIN auth.users c ON c.id = a.created_by
    ORDER BY a.disabled_at IS NOT NULL, a.created_at;
END $$;

DROP FUNCTION IF EXISTS public.platform_admin_me();
CREATE FUNCTION public.platform_admin_me()
RETURNS TABLE (user_id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ, role TEXT, permissions TEXT[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.user_id, u.email::text, a.full_name, a.created_at, a.role, public.platform_my_permissions()
    FROM public.platform_admins a JOIN auth.users u ON u.id = a.user_id WHERE a.user_id = auth.uid();
END $$;

-- Caller may only hand out permissions they hold themselves, and only a Super Admin makes Super Admins.
CREATE OR REPLACE FUNCTION public.platform_check_grant(_role TEXT, _perms TEXT[]) RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE mine TEXT[] := public.platform_my_permissions(); is_super BOOLEAN;
BEGIN
  SELECT role = 'super_admin' INTO is_super FROM public.platform_admins WHERE user_id = auth.uid() AND disabled_at IS NULL;
  IF _role NOT IN ('super_admin', 'platform_admin', 'billing_admin', 'support_admin') THEN RAISE EXCEPTION 'unknown role' USING ERRCODE = '22023'; END IF;
  IF _role = 'super_admin' AND NOT COALESCE(is_super, FALSE) THEN RAISE EXCEPTION 'only a Super Admin can create a Super Admin' USING ERRCODE = '42501'; END IF;
  IF NOT (_perms <@ public.platform_all_permissions()) THEN RAISE EXCEPTION 'unknown permission' USING ERRCODE = '22023'; END IF;
  IF NOT COALESCE(is_super, FALSE) AND NOT (_perms <@ mine) THEN RAISE EXCEPTION 'you cannot grant permissions you do not hold' USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_admin_set_access(_user UUID, _role TEXT, _perms TEXT[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur public.platform_admins; final TEXT[];
BEGIN
  PERFORM public.platform_require('admins.manage');
  IF _user = auth.uid() THEN RAISE EXCEPTION 'you cannot change your own role or permissions' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM public.platform_admins WHERE user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such administrator' USING ERRCODE = 'P0002'; END IF;
  final := CASE WHEN _role = 'super_admin' THEN '{}'::TEXT[] ELSE COALESCE(_perms, '{}') END;
  PERFORM public.platform_check_grant(_role, final);
  IF cur.role = 'super_admin' AND NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid() AND role = 'super_admin' AND disabled_at IS NULL) THEN
    RAISE EXCEPTION 'only a Super Admin can change a Super Admin' USING ERRCODE = '42501';
  END IF;
  IF cur.role = 'super_admin' AND _role <> 'super_admin'
     AND (SELECT count(*) FROM public.platform_admins WHERE role = 'super_admin' AND disabled_at IS NULL AND user_id <> _user) < 1 THEN
    RAISE EXCEPTION 'at least one active Super Admin must remain' USING ERRCODE = '22023';
  END IF;
  UPDATE public.platform_admins SET role = _role, permissions = final WHERE user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.platform_admin_set_disabled(_user UUID, _disabled BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur public.platform_admins;
BEGIN
  PERFORM public.platform_require('admins.manage');
  IF _user = auth.uid() THEN RAISE EXCEPTION 'you cannot switch off your own access' USING ERRCODE = '22023'; END IF;
  SELECT * INTO cur FROM public.platform_admins WHERE user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such administrator' USING ERRCODE = 'P0002'; END IF;
  IF _disabled AND cur.role = 'super_admin' AND (SELECT count(*) FROM public.platform_admins WHERE role = 'super_admin' AND disabled_at IS NULL AND user_id <> _user) < 1 THEN
    RAISE EXCEPTION 'at least one active Super Admin must remain' USING ERRCODE = '22023';
  END IF;
  UPDATE public.platform_admins SET disabled_at = CASE WHEN _disabled THEN now() ELSE NULL END WHERE user_id = _user;
END $$;

CREATE OR REPLACE FUNCTION public.platform_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  PERFORM public.platform_require('health.view');
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

-- The password-generating route is gone; new administrators are invited instead.
DROP FUNCTION IF EXISTS public.platform_admin_register(UUID, TEXT);

-- ---------------------------------------------------------------------------------------------
-- Invitations. Only the hash of the one-time link is stored. The person chooses their own password.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'platform_admin', 'billing_admin', 'support_admin')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.platform_admin_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admin_invites FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_invites_open_email
  ON public.platform_admin_invites (lower(email)) WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.platform_invites_list()
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, role TEXT, permissions TEXT[], created_at TIMESTAMPTZ, last_sent_at TIMESTAMPTZ,
               expires_at TIMESTAMPTZ, state TEXT, invited_by_email TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('admins.manage');
  RETURN QUERY
    SELECT i.id, i.email, i.full_name, i.role, i.permissions, i.created_at, i.last_sent_at, i.expires_at,
           CASE WHEN i.accepted_at IS NOT NULL THEN 'accepted' WHEN i.revoked_at IS NOT NULL THEN 'revoked'
                WHEN i.expires_at <= now() THEN 'expired' ELSE 'pending' END,
           u.email::text
    FROM public.platform_admin_invites i LEFT JOIN auth.users u ON u.id = i.invited_by
    ORDER BY i.created_at DESC LIMIT 100;
END $$;

-- Called by the server with the caller's own token, so these checks are the caller's.
CREATE OR REPLACE FUNCTION public.platform_invite_create(_email TEXT, _name TEXT, _role TEXT, _perms TEXT[], _token_hash TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE addr TEXT := lower(btrim(COALESCE(_email, ''))); final TEXT[]; new_id UUID;
BEGIN
  PERFORM public.platform_require('admins.manage');
  IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(addr) > 200 THEN RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_name, ''))) < 2 THEN RAISE EXCEPTION 'enter the full name' USING ERRCODE = '22023'; END IF;
  final := CASE WHEN _role = 'super_admin' THEN '{}'::TEXT[] ELSE COALESCE(_perms, '{}') END;
  PERFORM public.platform_check_grant(_role, final);
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = addr) THEN RAISE EXCEPTION 'that email already has a login' USING ERRCODE = '23505'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_admin_invites WHERE lower(email) = addr AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()) THEN
    RAISE EXCEPTION 'an invitation to that email is already pending; resend it instead' USING ERRCODE = '23505';
  END IF;
  UPDATE public.platform_admin_invites SET revoked_at = now() WHERE lower(email) = addr AND accepted_at IS NULL AND revoked_at IS NULL;
  INSERT INTO public.platform_admin_invites (email, full_name, role, permissions, token_hash, invited_by, expires_at, last_sent_at)
  VALUES (addr, btrim(_name), _role, final, _token_hash, auth.uid(), now() + interval '7 days', now()) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_invite_rotate(_id UUID, _token_hash TEXT)
RETURNS TABLE (email TEXT, full_name TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('admins.manage');
  RETURN QUERY UPDATE public.platform_admin_invites i SET token_hash = _token_hash, expires_at = now() + interval '7 days', last_sent_at = now()
    WHERE i.id = _id AND i.accepted_at IS NULL AND i.revoked_at IS NULL RETURNING i.email, i.full_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'that invitation is no longer pending' USING ERRCODE = 'P0002'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_invite_revoke(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('admins.manage');
  UPDATE public.platform_admin_invites SET revoked_at = now() WHERE id = _id AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'that invitation is no longer pending' USING ERRCODE = 'P0002'; END IF;
END $$;

-- Server only (owner connection): look up and consume an invitation by token hash.
CREATE OR REPLACE FUNCTION public.platform_invite_peek(_token_hash TEXT)
RETURNS TABLE (id UUID, email TEXT, full_name TEXT, role TEXT, permissions TEXT[], invited_by UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.email, i.full_name, i.role, i.permissions, i.invited_by FROM public.platform_admin_invites i
  WHERE i.token_hash = _token_hash AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION public.platform_invite_accept(_token_hash TEXT, _user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.platform_admin_invites;
BEGIN
  SELECT * INTO inv FROM public.platform_admin_invites WHERE token_hash = _token_hash AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'this invitation is not valid any more' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user) THEN RAISE EXCEPTION 'that login belongs to a school account' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.platform_admins (user_id, full_name, created_by, role, permissions)
  VALUES (_user, inv.full_name, inv.invited_by, inv.role, inv.permissions)
  ON CONFLICT (user_id) DO UPDATE SET disabled_at = NULL, role = EXCLUDED.role, permissions = EXCLUDED.permissions, full_name = EXCLUDED.full_name;
  UPDATE public.platform_admin_invites SET accepted_at = now() WHERE id = inv.id;
END $$;

REVOKE EXECUTE ON FUNCTION public.platform_invite_peek(TEXT), public.platform_invite_accept(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_all_permissions(), public.platform_role_preset(TEXT), public.platform_my_permissions(),
  public.platform_can(TEXT), public.platform_require(TEXT), public.platform_check_grant(TEXT, TEXT[]),
  public.platform_admin_set_access(UUID, TEXT, TEXT[]), public.platform_invites_list(),
  public.platform_invite_create(TEXT, TEXT, TEXT, TEXT[], TEXT), public.platform_invite_rotate(UUID, TEXT), public.platform_invite_revoke(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_all_permissions(), public.platform_role_preset(TEXT), public.platform_my_permissions(),
  public.platform_can(TEXT), public.platform_require(TEXT),
  public.platform_admin_set_access(UUID, TEXT, TEXT[]), public.platform_invites_list(),
  public.platform_invite_create(TEXT, TEXT, TEXT, TEXT[], TEXT), public.platform_invite_rotate(UUID, TEXT), public.platform_invite_revoke(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_admins_list(), public.platform_admin_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_admins_list(), public.platform_admin_me() TO authenticated;
