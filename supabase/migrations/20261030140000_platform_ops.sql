-- Platform operations: an event log for platform administrators, finer permissions, announcements,
-- reports, onboarding progress, school administrator and usage views, receipts, exports and support assignment.

-- ---------------------------------------------------------------------------------------------
-- 1. Platform event log: who did what on the console. Append-only: nobody may edit or delete a row.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_id UUID,
  actor_email TEXT,
  category TEXT NOT NULL CHECK (category IN ('access', 'administrators', 'billing', 'announcements', 'support', 'data')),
  action TEXT NOT NULL,
  subject TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'refused'))
);
CREATE INDEX IF NOT EXISTS platform_events_at ON public.platform_events (at DESC);
ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_events_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'platform events cannot be changed or removed' USING ERRCODE = '42501'; END $$;
DROP TRIGGER IF EXISTS platform_events_no_change ON public.platform_events;
CREATE TRIGGER platform_events_no_change BEFORE UPDATE OR DELETE ON public.platform_events
  FOR EACH ROW EXECUTE FUNCTION public.platform_events_immutable();

-- Internal: record an event as the signed-in administrator. Never put secrets in _detail.
CREATE OR REPLACE FUNCTION public.platform_log(_category TEXT, _action TEXT, _subject TEXT DEFAULT NULL, _detail JSONB DEFAULT '{}')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.platform_events (actor_id, actor_email, category, action, subject, detail)
  VALUES (auth.uid(), (SELECT email::text FROM auth.users WHERE id = auth.uid()), _category, _action, _subject, COALESCE(_detail, '{}'));
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_log(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_log_signin() RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RETURN; END IF;
  PERFORM public.platform_log('access', 'sign_in');
END $$;

CREATE OR REPLACE FUNCTION public.platform_events_list(
  _search TEXT DEFAULT NULL, _category TEXT DEFAULT NULL, _from DATE DEFAULT NULL, _to DATE DEFAULT NULL,
  _mine BOOLEAN DEFAULT FALSE, _limit INT DEFAULT 25, _offset INT DEFAULT 0
) RETURNS TABLE (id UUID, at TIMESTAMPTZ, actor_email TEXT, category TEXT, action TEXT, subject TEXT, detail JSONB, outcome TEXT, total_rows BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _mine THEN PERFORM public.platform_require('audit.view');
  ELSIF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT e.id, e.at, e.actor_email, e.category, e.action, e.subject, e.detail, e.outcome, count(*) OVER ()
    FROM public.platform_events e
    WHERE (NOT _mine OR e.actor_id = auth.uid())
      AND (_category IS NULL OR e.category = _category)
      AND (_from IS NULL OR e.at >= _from) AND (_to IS NULL OR e.at < _to + 1)
      AND (_search IS NULL OR e.action ILIKE '%' || _search || '%' OR e.subject ILIKE '%' || _search || '%' OR e.actor_email ILIKE '%' || _search || '%')
    ORDER BY e.at DESC LIMIT least(GREATEST(_limit, 1), 200) OFFSET GREATEST(_offset, 0);
END $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Finer permissions
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_all_permissions() RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['clients.view', 'clients.create', 'clients.manage', 'clients.suspend', 'billing.view', 'billing.manage', 'billing.export',
               'support.view', 'support.manage', 'audit.view', 'audit.manage', 'settings.manage', 'announcements.manage', 'health.view', 'admins.manage']
$$;

CREATE OR REPLACE FUNCTION public.platform_role_preset(_role TEXT) RETURNS TEXT[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'super_admin' THEN public.platform_all_permissions()
    WHEN 'platform_admin' THEN ARRAY['clients.view', 'clients.create', 'clients.manage', 'clients.suspend', 'billing.view', 'support.view', 'support.manage', 'audit.view', 'announcements.manage', 'health.view']
    WHEN 'billing_admin' THEN ARRAY['clients.view', 'billing.view', 'billing.manage', 'billing.export']
    WHEN 'support_admin' THEN ARRAY['clients.view', 'support.view', 'support.manage']
    ELSE ARRAY[]::TEXT[]
  END
$$;

-- Creating and suspending schools now have their own permissions.
DO $$
DECLARE m RECORD; f RECORD; def TEXT; newdef TEXT;
BEGIN
  FOR m IN SELECT * FROM (VALUES ('set_school_status', 'clients.suspend'), ('platform_create_school', 'clients.create')) AS t(fn, perm) LOOP
    FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = m.fn LOOP
      def := pg_get_functiondef(f.oid);
      newdef := replace(def, 'platform_can(''clients.manage'')', format('platform_can(%L)', m.perm));
      IF newdef <> def THEN EXECUTE newdef; END IF;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Log the administrator-management actions (replaces the versions from the roles migration)
-- ---------------------------------------------------------------------------------------------
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
  PERFORM public.platform_log('administrators', 'access_changed', (SELECT email::text FROM auth.users WHERE id = _user),
    jsonb_build_object('from_role', cur.role, 'to_role', _role, 'permissions', final));
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
  PERFORM public.platform_log('administrators', CASE WHEN _disabled THEN 'access_switched_off' ELSE 'access_restored' END, (SELECT email::text FROM auth.users WHERE id = _user));
END $$;

CREATE OR REPLACE FUNCTION public.platform_admin_change_my_email(_email TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE addr TEXT := lower(btrim(COALESCE(_email, ''))); old TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(addr) > 200 THEN RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = addr AND id <> auth.uid()) THEN
    RAISE EXCEPTION 'another account already uses that email' USING ERRCODE = '23505';
  END IF;
  SELECT email::text INTO old FROM auth.users WHERE id = auth.uid();
  UPDATE auth.users SET email = addr WHERE id = auth.uid();
  PERFORM public.platform_log('access', 'sign_in_email_changed', addr, jsonb_build_object('previous', old));
END $$;

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
  PERFORM public.platform_log('administrators', 'invited', addr, jsonb_build_object('role', _role, 'permissions', final));
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.platform_invite_rotate(_id UUID, _token_hash TEXT)
RETURNS TABLE (email TEXT, full_name TEXT) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('admins.manage');
  RETURN QUERY UPDATE public.platform_admin_invites i SET token_hash = _token_hash, expires_at = now() + interval '7 days', last_sent_at = now()
    WHERE i.id = _id AND i.accepted_at IS NULL AND i.revoked_at IS NULL RETURNING i.email, i.full_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'that invitation is no longer pending' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_log('administrators', 'invitation_resent', (SELECT i.email FROM public.platform_admin_invites i WHERE i.id = _id));
END $$;

CREATE OR REPLACE FUNCTION public.platform_invite_revoke(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('admins.manage');
  UPDATE public.platform_admin_invites SET revoked_at = now() WHERE id = _id AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'that invitation is no longer pending' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_log('administrators', 'invitation_revoked', (SELECT i.email FROM public.platform_admin_invites i WHERE i.id = _id));
END $$;

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
  INSERT INTO public.platform_events (actor_id, actor_email, category, action, subject, detail)
  VALUES (_user, inv.email, 'administrators', 'invitation_accepted', inv.email, jsonb_build_object('role', inv.role, 'invited_by', inv.invited_by));
END $$;
REVOKE EXECUTE ON FUNCTION public.platform_invite_accept(TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Announcements and maintenance notices to schools
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 150),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  kind TEXT NOT NULL DEFAULT 'notice' CHECK (kind IN ('notice', 'maintenance', 'update')),
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'school_admins', 'teachers', 'students', 'parents')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_announcements FROM PUBLIC, anon, authenticated;

-- Roles reached by each audience.
CREATE OR REPLACE FUNCTION public.announcement_roles(_audience TEXT) RETURNS public.member_role[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _audience
    WHEN 'school_admins' THEN ARRAY['school_admin']::public.member_role[]
    WHEN 'teachers' THEN ARRAY['teacher']::public.member_role[]
    WHEN 'students' THEN ARRAY['student']::public.member_role[]
    WHEN 'parents' THEN ARRAY['parent']::public.member_role[]
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.platform_announcements_list()
RETURNS TABLE (id UUID, title TEXT, body TEXT, kind TEXT, audience TEXT, status TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
               created_at TIMESTAMPTZ, published_at TIMESTAMPTZ, created_by_email TEXT, reach BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('announcements.manage');
  RETURN QUERY
    SELECT a.id, a.title, a.body, a.kind, a.audience, a.status, a.starts_at, a.ends_at, a.created_at, a.published_at, u.email::text,
      (SELECT count(*) FROM public.school_memberships m JOIN public.schools s ON s.id = m.school_id
        WHERE m.status = 'active' AND (public.announcement_roles(a.audience) IS NULL OR m.role = ANY (public.announcement_roles(a.audience))))
    FROM public.platform_announcements a LEFT JOIN auth.users u ON u.id = a.created_by
    ORDER BY a.created_at DESC LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.platform_announcement_save(_id UUID, _title TEXT, _body TEXT, _kind TEXT, _audience TEXT, _starts TIMESTAMPTZ, _ends TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  PERFORM public.platform_require('announcements.manage');
  IF _id IS NULL THEN
    INSERT INTO public.platform_announcements (title, body, kind, audience, starts_at, ends_at, created_by)
    VALUES (btrim(_title), btrim(_body), _kind, _audience, _starts, _ends, auth.uid()) RETURNING id INTO rid;
    PERFORM public.platform_log('announcements', 'created', btrim(_title));
  ELSE
    UPDATE public.platform_announcements SET title = btrim(_title), body = btrim(_body), kind = _kind, audience = _audience, starts_at = _starts, ends_at = _ends
    WHERE id = _id AND status <> 'archived' RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'that announcement cannot be edited' USING ERRCODE = 'P0002'; END IF;
    PERFORM public.platform_log('announcements', 'edited', btrim(_title));
  END IF;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.platform_announcement_set_status(_id UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t TEXT;
BEGIN
  PERFORM public.platform_require('announcements.manage');
  IF _status NOT IN ('draft', 'published', 'archived') THEN RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023'; END IF;
  UPDATE public.platform_announcements SET status = _status, published_at = CASE WHEN _status = 'published' THEN COALESCE(published_at, now()) ELSE published_at END
  WHERE id = _id RETURNING title INTO t;
  IF t IS NULL THEN RAISE EXCEPTION 'no such announcement' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_log('announcements', _status, t);
END $$;

-- What a school person sees: published, inside its window, for their role.
CREATE OR REPLACE FUNCTION public.my_platform_announcements(_school UUID)
RETURNS TABLE (id UUID, title TEXT, body TEXT, kind TEXT, published_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, a.body, a.kind, a.published_at
  FROM public.platform_announcements a
  WHERE a.status = 'published' AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now())
    AND EXISTS (
      SELECT 1 FROM public.school_memberships m JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
      WHERE m.school_id = _school AND p.user_id = auth.uid() AND m.status = 'active'
        AND (public.announcement_roles(a.audience) IS NULL OR m.role = ANY (public.announcement_roles(a.audience))))
  ORDER BY (a.kind = 'maintenance') DESC, a.published_at DESC LIMIT 5
$$;

-- ---------------------------------------------------------------------------------------------
-- 5. Reports, onboarding, school administrators, usage, receipts, export, support assignment
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_report(_from DATE, _to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  PERFORM public.platform_require('billing.view');
  IF _from IS NULL OR _to IS NULL OR _to < _from OR _to - _from > 1100 THEN RAISE EXCEPTION 'choose a valid date range (up to three years)' USING ERRCODE = '22023'; END IF;
  SELECT jsonb_build_object(
    'schools_registered', (SELECT count(*) FROM public.schools WHERE created_at >= _from AND created_at < _to + 1),
    'orders_paid', (SELECT count(*) FROM public.billing_orders WHERE status = 'paid' AND gateway <> 'demo' AND paid_at >= _from AND paid_at < _to + 1),
    'orders_failed', (SELECT count(*) FROM public.billing_orders WHERE status IN ('failed', 'abandoned', 'mismatch') AND created_at >= _from AND created_at < _to + 1),
    'orders_pending', (SELECT count(*) FROM public.billing_orders WHERE status IN ('created', 'pending') AND created_at >= _from AND created_at < _to + 1),
    'revenue', COALESCE((SELECT jsonb_agg(jsonb_build_object('currency', currency, 'total_minor', t, 'orders', n)) FROM (
        SELECT currency, sum(total_minor) t, count(*) n FROM public.billing_orders
        WHERE status = 'paid' AND gateway <> 'demo' AND paid_at >= _from AND paid_at < _to + 1 GROUP BY currency) x), '[]'),
    'revenue_by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'currency', currency, 'total_minor', t) ORDER BY m) FROM (
        SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') m, currency, sum(total_minor) t FROM public.billing_orders
        WHERE status = 'paid' AND gateway <> 'demo' AND paid_at >= _from AND paid_at < _to + 1 GROUP BY 1, 2) x), '[]'),
    'revenue_by_package', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan', plan_name, 'currency', currency, 'total_minor', t, 'orders', n) ORDER BY t DESC) FROM (
        SELECT plan_name, currency, sum(total_minor) t, count(*) n FROM public.billing_orders
        WHERE status = 'paid' AND gateway <> 'demo' AND paid_at >= _from AND paid_at < _to + 1 GROUP BY 1, 2) x), '[]'),
    'registrations_by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', m, 'schools', n) ORDER BY m) FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*) n FROM public.schools
        WHERE created_at >= _from AND created_at < _to + 1 GROUP BY 1) x), '[]'),
    'purposes', COALESCE((SELECT jsonb_agg(jsonb_build_object('purpose', purpose, 'orders', n)) FROM (
        SELECT purpose, count(*) n FROM public.billing_orders WHERE status = 'paid' AND gateway <> 'demo' AND paid_at >= _from AND paid_at < _to + 1 GROUP BY 1) x), '[]')
  ) INTO r;
  PERFORM public.platform_log('data', 'report_viewed', _from::text || ' to ' || _to::text);
  RETURN r;
END $$;

-- How far each school has got with setting itself up, from real records.
CREATE OR REPLACE FUNCTION public.platform_onboarding()
RETURNS TABLE (school_id UUID, school_name TEXT, registered_at TIMESTAMPTZ, status TEXT, admin_joined BOOLEAN, classes BIGINT, teachers BIGINT, students BIGINT, steps_done INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('clients.view');
  RETURN QUERY
    SELECT s.id, s.name, s.created_at, s.status::text,
      EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.school_id = s.id AND m.role = 'school_admin' AND m.status = 'active'),
      (SELECT count(*) FROM public.classes c WHERE c.school_id = s.id),
      (SELECT count(*) FROM public.school_memberships m WHERE m.school_id = s.id AND m.role = 'teacher' AND m.status = 'active'),
      (SELECT count(*) FROM public.school_memberships m WHERE m.school_id = s.id AND m.role = 'student' AND m.status = 'active'),
      0
    FROM public.schools s ORDER BY s.created_at DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.platform_school_admins(_search TEXT DEFAULT NULL, _limit INT DEFAULT 25, _offset INT DEFAULT 0)
RETURNS TABLE (profile_id UUID, school_id UUID, school_name TEXT, school_status TEXT, name TEXT, email TEXT, membership_status TEXT, last_sign_in TIMESTAMPTZ, total_rows BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('clients.view');
  RETURN QUERY
    SELECT p.id, s.id, s.name, s.status::text, p.full_name, p.email::text, m.status::text,
      (SELECT max(l.created_at) FROM public.audit_logs l WHERE l.school_id = s.id AND l.actor_id = p.id AND l.action::text = 'login'),
      count(*) OVER ()
    FROM public.school_memberships m
    JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
    JOIN public.schools s ON s.id = m.school_id
    WHERE m.role = 'school_admin'
      AND (_search IS NULL OR p.full_name ILIKE '%' || _search || '%' OR p.email ILIKE '%' || _search || '%' OR s.name ILIKE '%' || _search || '%')
    ORDER BY s.name, p.full_name LIMIT least(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0);
END $$;

CREATE OR REPLACE FUNCTION public.platform_usage()
RETURNS TABLE (school_id UUID, school_name TEXT, status TEXT, active_people BIGINT, students BIGINT, staff BIGINT, events_30d BIGINT, sign_ins_30d BIGINT, last_activity TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('clients.view');
  RETURN QUERY
    SELECT s.id, s.name, s.status::text,
      (SELECT count(*) FROM public.school_memberships m WHERE m.school_id = s.id AND m.status = 'active'),
      (SELECT count(*) FROM public.school_memberships m WHERE m.school_id = s.id AND m.status = 'active' AND m.role = 'student'),
      (SELECT count(*) FROM public.school_memberships m WHERE m.school_id = s.id AND m.status = 'active' AND m.role NOT IN ('student', 'parent')),
      (SELECT count(*) FROM public.audit_logs l WHERE l.school_id = s.id AND l.created_at > now() - interval '30 days'),
      (SELECT count(*) FROM public.audit_logs l WHERE l.school_id = s.id AND l.action::text = 'login' AND l.created_at > now() - interval '30 days'),
      (SELECT max(l.created_at) FROM public.audit_logs l WHERE l.school_id = s.id)
    FROM public.schools s ORDER BY s.name;
END $$;

-- A receipt for one verified payment (the same fields the school's own receipt uses).
CREATE OR REPLACE FUNCTION public.platform_receipt(_reference TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  PERFORM public.platform_require('billing.view');
  SELECT jsonb_build_object('reference', o.reference, 'status', o.status, 'school', sc.name, 'plan', o.plan_name, 'interval', o.billing_interval,
    'currency', o.currency, 'base_minor', o.base_minor, 'tax_minor', o.tax_minor, 'total_minor', o.total_minor, 'tax_label', o.tax_label,
    'channel', o.channel, 'paid_at', o.paid_at, 'period_start', o.period_start, 'period_end', o.period_end, 'demo', o.gateway = 'demo')
  INTO r FROM public.billing_orders o LEFT JOIN public.schools sc ON sc.id = o.school_id WHERE o.reference = _reference AND o.status = 'paid';
  IF r IS NULL THEN RAISE EXCEPTION 'a receipt exists only for a verified payment' USING ERRCODE = 'P0002'; END IF;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.platform_export_transactions(_status TEXT, _search TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  PERFORM public.platform_require('billing.export');
  PERFORM public.platform_require('billing.view');
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]') INTO r FROM public.platform_transactions(_status, _search, NULL, 5000, 0) t;
  PERFORM public.platform_log('data', 'transactions_exported', NULL, jsonb_build_object('status', _status, 'search', _search));
  RETURN r;
END $$;

ALTER TABLE public.support_requests ADD COLUMN IF NOT EXISTS assigned_to UUID;
CREATE OR REPLACE FUNCTION public.support_assign(_request UUID, _user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('support.manage');
  IF _user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user AND disabled_at IS NULL) THEN
    RAISE EXCEPTION 'assign to an active platform administrator' USING ERRCODE = '22023';
  END IF;
  UPDATE public.support_requests SET assigned_to = _user, updated_at = clock_timestamp() WHERE id = _request;
  IF NOT FOUND THEN RAISE EXCEPTION 'no such request' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.platform_log('support', 'assigned', _request::text, jsonb_build_object('to', (SELECT email::text FROM auth.users WHERE id = _user)));
END $$;

CREATE OR REPLACE FUNCTION public.support_assignments()
RETURNS TABLE (request_id UUID, assignee_id UUID, assignee_email TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_require('support.view');
  RETURN QUERY SELECT r.id, r.assigned_to, u.email::text FROM public.support_requests r JOIN auth.users u ON u.id = r.assigned_to WHERE r.assigned_to IS NOT NULL;
END $$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'platform_log_signin()', 'platform_events_list(TEXT, TEXT, DATE, DATE, BOOLEAN, INT, INT)', 'platform_announcements_list()',
    'platform_announcement_save(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)', 'platform_announcement_set_status(UUID, TEXT)',
    'my_platform_announcements(UUID)', 'platform_report(DATE, DATE)', 'platform_onboarding()', 'platform_school_admins(TEXT, INT, INT)',
    'platform_usage()', 'platform_receipt(TEXT)', 'platform_export_transactions(TEXT, TEXT)', 'support_assign(UUID, UUID)', 'support_assignments()']
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
