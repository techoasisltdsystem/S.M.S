-- Phase 1: schools (tenants), per-school people and roles, explicit permissions,
-- invitations, append-only audit log, and Row-Level Security on every table.
--
-- Every school-owned row carries school_id. Access is decided in the database
-- from the signed-in user (auth.uid()) and their active membership; nothing the
-- browser sends about role, school or permissions is trusted.
--
-- Existing data is kept: each school_config row becomes a school, legacy
-- profiles and user_roles move into that school, and user_roles is renamed
-- legacy_user_roles (no API access) rather than dropped.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
CREATE TYPE public.member_role AS ENUM (
  'school_admin', 'teacher', 'student', 'parent', 'finance_officer', 'auditor'
);
CREATE TYPE public.membership_status AS ENUM ('invited', 'active', 'suspended');
CREATE TYPE public.school_status AS ENUM ('active', 'suspended');

-- New audit actions. Not used by this migration's own data changes (Postgres
-- does not allow using a new enum value in the transaction that adds it).
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'school_created';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'school_updated';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'member_invited';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'invitation_accepted';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Suspension is reversible and never deletes school data.
  status school_status NOT NULL DEFAULT 'active',
  country TEXT NOT NULL DEFAULT 'GH',
  currency TEXT NOT NULL DEFAULT 'GHS',
  timezone TEXT NOT NULL DEFAULT 'Africa/Accra',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  address TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- Platform (Tech Oasis) super admins. Rows are added by an operator with
-- database access, never through the API.
CREATE TABLE public.platform_admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A profile is one person inside one school. The same login (auth user) can
-- have a profile in several schools, so no school can see another's copy.
ALTER TABLE public.profiles
  ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT,
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE public.school_memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  profile_id UUID NOT NULL,
  role member_role NOT NULL,
  status membership_status NOT NULL DEFAULT 'invited',
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, profile_id, role)
);

CREATE TABLE public.role_permissions (
  role member_role NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE public.school_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  membership_id UUID NOT NULL REFERENCES public.school_memberships(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  -- Only a SHA-256 digest of the single-use token is stored.
  token_hash BYTEA NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_config
  ADD COLUMN school_id UUID UNIQUE REFERENCES public.schools(id) ON DELETE RESTRICT;

ALTER TABLE public.audit_logs
  ADD COLUMN school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT,
  ADD COLUMN actor_user_id UUID,
  ADD COLUMN actor_role TEXT;

-- ---------------------------------------------------------------------------
-- Permissions (PDF section 12.2)
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'school.settings.manage'),
  ('school_admin', 'users.manage'),
  ('school_admin', 'staff.manage'),
  ('school_admin', 'audit.view'),
  ('school_admin', 'students.view'),
  ('school_admin', 'students.create'),
  ('school_admin', 'students.update'),
  ('school_admin', 'students.transfer'),
  ('school_admin', 'attendance.record'),
  ('school_admin', 'attendance.correct'),
  ('school_admin', 'grades.approve'),
  ('school_admin', 'grades.publish'),
  ('school_admin', 'grades.reopen'),
  ('school_admin', 'fees.invoice'),
  ('teacher', 'students.view'),
  ('teacher', 'attendance.record'),
  ('teacher', 'grades.enter'),
  ('finance_officer', 'fees.invoice'),
  ('finance_officer', 'payments.refund'),
  ('finance_officer', 'students.view'),
  ('auditor', 'audit.view'),
  ('auditor', 'students.view');

-- ---------------------------------------------------------------------------
-- Move existing single-school data into a school
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cfg RECORD;
  new_school UUID;
  first_school UUID;
  n INT := 0;
BEGIN
  FOR cfg IN SELECT * FROM public.school_config ORDER BY created_at LOOP
    n := n + 1;
    INSERT INTO public.schools (name, slug, currency)
    VALUES (
      COALESCE(NULLIF(btrim(cfg.school_name), ''), 'My school'),
      COALESCE(NULLIF(btrim(regexp_replace(lower(cfg.school_name), '[^a-z0-9]+', '-', 'g'), '-'), ''), 'school') || '-' || n,
      'GHS'
    )
    RETURNING id INTO new_school;
    UPDATE public.school_config SET school_id = new_school WHERE id = cfg.id;
    first_school := COALESCE(first_school, new_school);
  END LOOP;

  IF first_school IS NULL AND EXISTS (SELECT 1 FROM public.profiles) THEN
    INSERT INTO public.schools (name, slug) VALUES ('My school', 'my-school') RETURNING id INTO first_school;
    INSERT INTO public.school_config (school_name, school_id) VALUES ('My school', first_school);
  END IF;

  IF first_school IS NOT NULL THEN
    UPDATE public.profiles SET school_id = first_school WHERE school_id IS NULL;
    UPDATE public.audit_logs SET school_id = first_school WHERE school_id IS NULL;

    INSERT INTO public.school_memberships (school_id, profile_id, role, status)
    SELECT first_school, ur.user_id,
           CASE ur.role WHEN 'admin' THEN 'school_admin'::member_role ELSE ur.role::text::member_role END,
           -- No legacy profile has a login yet; they become active once invited and accepted.
           CASE p.status WHEN 'active' THEN 'invited'::membership_status ELSE 'suspended'::membership_status END
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- The app used USD as a placeholder default; schools in this launch use cedis.
UPDATE public.school_config SET currency = 'GHS' WHERE currency = 'USD';
ALTER TABLE public.school_config ALTER COLUMN currency SET DEFAULT 'GHS';
ALTER TABLE public.school_config ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.school_config DROP CONSTRAINT IF EXISTS school_config_academic_year_format_check;
ALTER TABLE public.school_config ADD CONSTRAINT school_config_academic_year_format_check
  CHECK (academic_year_format IN ('term', 'semester', 'trimester', 'quarter', 'annual'));
ALTER TABLE public.school_config ALTER COLUMN academic_year_format SET DEFAULT 'term';

ALTER TABLE public.profiles ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
CREATE UNIQUE INDEX profiles_school_email_key ON public.profiles (school_id, lower(email));
CREATE UNIQUE INDEX profiles_school_user_key ON public.profiles (school_id, user_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_school_id_id_key UNIQUE (school_id, id);

-- A membership's profile must belong to the same school.
ALTER TABLE public.school_memberships
  ADD CONSTRAINT school_memberships_profile_fkey
  FOREIGN KEY (school_id, profile_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT;

-- Keep the old table for reference only; memberships replace it.
DROP POLICY IF EXISTS "User roles are publicly readable" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can manage user roles" ON public.user_roles;
ALTER TABLE public.user_roles RENAME TO legacy_user_roles;
DROP FUNCTION IF EXISTS public.has_role(UUID, app_role);

CREATE INDEX idx_profiles_school ON public.profiles (school_id);
CREATE INDEX idx_profiles_user ON public.profiles (user_id);
CREATE INDEX idx_memberships_school ON public.school_memberships (school_id);
CREATE INDEX idx_memberships_profile ON public.school_memberships (profile_id);
CREATE INDEX idx_audit_logs_school ON public.audit_logs (school_id, created_at DESC);
CREATE INDEX idx_invitations_school ON public.school_invitations (school_id);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies can consult memberships
-- without recursing into their own RLS. Each answers only about the caller.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;

-- The caller's active membership roles in a school (empty when suspended).
CREATE OR REPLACE FUNCTION public.my_roles(_school UUID)
RETURNS SETOF member_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role
  FROM public.school_memberships m
  JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
  WHERE m.school_id = _school
    AND p.user_id = auth.uid()
    AND auth.uid() IS NOT NULL
    AND m.status = 'active'
    AND p.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_member(_school UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.my_roles(_school))
$$;

-- Permissions that need a second sign-in factor. Supabase Auth puts
-- "aal":"aal2" in the token once the user has passed MFA; a password-only
-- session is "aal1" and is refused these. (Laptop tokens carry no aal claim;
-- MFA for the laptop database is not built.)
CREATE OR REPLACE FUNCTION public.mfa_satisfied(_permission TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT _permission NOT IN ('users.manage', 'staff.manage', 'school.settings.manage', 'payments.refund')
      OR COALESCE(auth.jwt() ->> 'aal', '') <> 'aal1'
$$;

-- True when the caller holds the permission in that school. A suspended
-- school keeps read-only (*.view) access so nothing is lost or locked away.
CREATE OR REPLACE FUNCTION public.has_permission(_school UUID, _permission TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mfa_satisfied(_permission) AND EXISTS (
    SELECT 1
    FROM public.my_roles(_school) r
    JOIN public.role_permissions rp ON rp.role = r AND rp.permission = _permission
    JOIN public.schools s ON s.id = _school
    WHERE s.status = 'active' OR _permission LIKE '%.view'
  )
$$;

CREATE OR REPLACE FUNCTION public.my_profile_id(_school UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.profiles WHERE school_id = _school AND user_id = auth.uid() AND auth.uid() IS NOT NULL
$$;

-- ---------------------------------------------------------------------------
-- Audit log: written only by these server-side functions and triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit(
  _school UUID, _action audit_action, _target_type TEXT, _target_id UUID,
  _target_name TEXT, _details JSONB DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor RECORD;
BEGIN
  SELECT p.id, p.full_name,
         (SELECT string_agg(r::text, ',') FROM public.my_roles(_school) r) AS roles
    INTO actor
    FROM public.profiles p
   WHERE p.school_id = _school AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL;

  INSERT INTO public.audit_logs
    (school_id, actor_id, actor_user_id, actor_name, actor_role, action, target_type, target_id, target_name, details)
  VALUES
    (_school, actor.id, auth.uid(),
     COALESCE(actor.full_name, CASE WHEN public.is_platform_admin() THEN 'Platform admin' ELSE 'System' END),
     COALESCE(actor.roles, CASE WHEN public.is_platform_admin() THEN 'platform_admin' END),
     _action, _target_type, _target_id, _target_name, COALESCE(_details, '{}'));
END $$;

-- Sign-in and sign-out events reported by the app. The actor comes from the
-- session, so a client cannot log events for someone else.
CREATE OR REPLACE FUNCTION public.log_session_event(_school UUID, _action TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _action NOT IN ('login', 'logout') THEN RAISE EXCEPTION 'unsupported action'; END IF;
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member of this school' USING ERRCODE = '42501'; END IF;
  PERFORM public.write_audit(_school, _action::audit_action, 'session', public.my_profile_id(_school), NULL, '{}');
END $$;

-- Names of changed columns only: values are not copied into the log.
CREATE OR REPLACE FUNCTION public.changed_columns(_old JSONB, _new JSONB)
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_agg(k ORDER BY k), '{}')
  FROM jsonb_object_keys(_new) k
  WHERE k NOT IN ('updated_at') AND _old -> k IS DISTINCT FROM _new -> k
$$;

CREATE OR REPLACE FUNCTION public.audit_profiles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols TEXT[] := public.changed_columns(to_jsonb(OLD), to_jsonb(NEW));
  act audit_action := 'user_updated';
BEGIN
  IF cardinality(cols) = 0 THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    act := CASE NEW.status WHEN 'active' THEN 'user_activated' WHEN 'banned' THEN 'user_banned'
                           WHEN 'suspended' THEN 'user_suspended' ELSE 'user_updated' END;
  END IF;
  PERFORM public.write_audit(NEW.school_id, act, 'user', NEW.id, NEW.full_name,
    jsonb_build_object('changed', cols, 'old_status', OLD.status, 'new_status', NEW.status));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_memberships()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  who TEXT;
BEGIN
  SELECT full_name INTO who FROM public.profiles WHERE id = NEW.profile_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(NEW.school_id, 'member_invited', 'membership', NEW.profile_id, who,
      jsonb_build_object('role', NEW.role, 'status', NEW.status));
  ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM public.write_audit(NEW.school_id, 'role_changed', 'membership', NEW.profile_id, who,
      jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.write_audit(NEW.school_id,
      (CASE NEW.status WHEN 'active' THEN 'user_activated' WHEN 'suspended' THEN 'user_suspended' ELSE 'user_updated' END)::audit_action,
      'membership', NEW.profile_id, who,
      jsonb_build_object('role', NEW.role, 'old_status', OLD.status, 'new_status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_school_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cols TEXT[] := public.changed_columns(to_jsonb(OLD), to_jsonb(NEW));
BEGIN
  IF cardinality(cols) > 0 THEN
    PERFORM public.write_audit(NEW.school_id, 'config_updated', 'school_config', NEW.id, NEW.school_name,
      jsonb_build_object('changed', cols));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_schools()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(NEW.id, 'school_created', 'school', NEW.id, NEW.name, '{}');
  ELSE
    PERFORM public.write_audit(NEW.id, 'school_updated', 'school', NEW.id, NEW.name,
      jsonb_build_object('changed', public.changed_columns(to_jsonb(OLD), to_jsonb(NEW)),
                         'old_status', OLD.status, 'new_status', NEW.status));
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Guards on columns ordinary users must never change through the API
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_tenant_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'school_id cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'login link cannot be changed here' USING ERRCODE = '42501';
    END IF;
    -- Status and email are managed by school administrators, not by the person
    -- (an administrator cannot suspend or re-address their own account either).
    IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.email IS DISTINCT FROM OLD.email)
       AND (NOT public.has_permission(NEW.school_id, 'users.manage') OR OLD.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'only a school administrator can change status or email' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.guard_membership_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
    RAISE EXCEPTION 'profile cannot be changed' USING ERRCODE = '42501';
  END IF;
  -- Accepting an invitation is the only way to become active from invited.
  IF current_user IN ('anon', 'authenticated') AND OLD.status = 'invited' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'an invited member becomes active by accepting the invitation' USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER guard_school_config_tenant BEFORE UPDATE ON public.school_config
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_profiles_tenant BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_profiles_columns BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_columns();
CREATE TRIGGER guard_memberships_tenant BEFORE UPDATE ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_memberships_columns BEFORE UPDATE ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.guard_membership_columns();
CREATE TRIGGER guard_campuses_tenant BEFORE UPDATE ON public.campuses
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_profiles AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profiles();
CREATE TRIGGER audit_memberships AFTER INSERT OR UPDATE ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_memberships();
CREATE TRIGGER audit_school_config AFTER UPDATE ON public.school_config
  FOR EACH ROW EXECUTE FUNCTION public.audit_school_config();
CREATE TRIGGER audit_schools AFTER INSERT OR UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.audit_schools();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "School config is publicly readable" ON public.school_config;
DROP POLICY IF EXISTS "Anyone can create school config" ON public.school_config;
DROP POLICY IF EXISTS "Anyone can update school config" ON public.school_config;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can create profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Audit logs are readable" ON public.audit_logs;
DROP POLICY IF EXISTS "Anyone can create audit logs" ON public.audit_logs;

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_user_roles ENABLE ROW LEVEL SECURITY;

-- Schools: members see their school; only platform admins create or change schools.
-- No DELETE policy anywhere: school records are never deleted through the API.
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (public.is_member(id) OR public.is_platform_admin());
CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE POLICY campuses_select ON public.campuses FOR SELECT TO authenticated
  USING (public.is_member(school_id));
CREATE POLICY campuses_insert ON public.campuses FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(school_id, 'school.settings.manage'));
CREATE POLICY campuses_update ON public.campuses FOR UPDATE TO authenticated
  USING (public.has_permission(school_id, 'school.settings.manage'))
  WITH CHECK (public.has_permission(school_id, 'school.settings.manage'));

CREATE POLICY platform_admins_select_self ON public.platform_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY school_config_select ON public.school_config FOR SELECT TO authenticated
  USING (public.is_member(school_id) OR public.is_platform_admin());
CREATE POLICY school_config_insert ON public.school_config FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(school_id, 'school.settings.manage'));
CREATE POLICY school_config_update ON public.school_config FOR UPDATE TO authenticated
  USING (public.has_permission(school_id, 'school.settings.manage'))
  WITH CHECK (public.has_permission(school_id, 'school.settings.manage'));

-- Profiles: your own, or every profile in a school you administer.
-- New people are added through invite_member(); nobody deletes profiles.
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING ((user_id = auth.uid() AND public.is_member(school_id)) OR public.has_permission(school_id, 'users.manage'));
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND public.is_member(school_id)) OR public.has_permission(school_id, 'users.manage'))
  WITH CHECK ((user_id = auth.uid() AND public.is_member(school_id)) OR public.has_permission(school_id, 'users.manage'));

-- Memberships: see your own; administrators manage others but not themselves,
-- so nobody can raise or remove their own access.
CREATE POLICY memberships_select ON public.school_memberships FOR SELECT TO authenticated
  USING (profile_id = public.my_profile_id(school_id) OR public.has_permission(school_id, 'users.manage'));
CREATE POLICY memberships_update ON public.school_memberships FOR UPDATE TO authenticated
  USING (public.has_permission(school_id, 'users.manage') AND profile_id IS DISTINCT FROM public.my_profile_id(school_id))
  WITH CHECK (public.has_permission(school_id, 'users.manage') AND profile_id IS DISTINCT FROM public.my_profile_id(school_id));

CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY invitations_select ON public.school_invitations FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'users.manage'));

-- Audit logs: read with audit.view in that school; nobody writes, edits or deletes through the API.
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'audit.view'));

-- ---------------------------------------------------------------------------
-- Server-side actions (RPC)
-- ---------------------------------------------------------------------------

-- Adds a person to a school with a role and returns a single-use invitation
-- token (shown once; only its digest is stored). Re-inviting replaces any
-- earlier unused token.
CREATE OR REPLACE FUNCTION public.invite_member(
  _school UUID, _full_name TEXT, _email TEXT, _role member_role
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  addr TEXT := lower(btrim(_email));
  prof public.profiles;
  mem public.school_memberships;
  token TEXT;
  expires TIMESTAMPTZ := now() + interval '7 days';
BEGIN
  IF NOT public.has_permission(_school, 'users.manage') THEN
    RAISE EXCEPTION 'you cannot add people to this school' USING ERRCODE = '42501';
  END IF;
  IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_full_name, ''))) = 0 THEN
    RAISE EXCEPTION 'enter the person''s name' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE school_id = _school AND lower(email) = addr;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (school_id, full_name, email)
    VALUES (_school, btrim(_full_name), addr) RETURNING * INTO prof;
  END IF;

  SELECT * INTO mem FROM public.school_memberships
   WHERE school_id = _school AND profile_id = prof.id AND role = _role;
  IF FOUND AND mem.status = 'active' THEN
    RAISE EXCEPTION 'this person already has that role' USING ERRCODE = '23505';
  ELSIF NOT FOUND THEN
    INSERT INTO public.school_memberships (school_id, profile_id, role, status, created_by)
    VALUES (_school, prof.id, _role, 'invited', public.my_profile_id(_school)) RETURNING * INTO mem;
  ELSIF mem.status = 'suspended' THEN
    RAISE EXCEPTION 'this role is suspended; reactivate it instead' USING ERRCODE = '22023';
  END IF;

  UPDATE public.school_invitations SET revoked_at = now()
   WHERE membership_id = mem.id AND accepted_at IS NULL AND revoked_at IS NULL;

  token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.school_invitations (school_id, membership_id, email, token_hash, expires_at, created_by)
  VALUES (_school, mem.id, addr, sha256(convert_to(token, 'UTF8')), expires, public.my_profile_id(_school));

  RETURN jsonb_build_object('profile_id', prof.id, 'membership_id', mem.id, 'token', token, 'expires_at', expires);
END $$;

-- Shared by both sign-in backends: links an invitation to an auth user.
CREATE OR REPLACE FUNCTION public.accept_invitation_for(_user UUID, _email TEXT, _token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv public.school_invitations;
  mem public.school_memberships;
  prof public.profiles;
BEGIN
  SELECT * INTO inv FROM public.school_invitations
   WHERE token_hash = sha256(convert_to(COALESCE(_token, ''), 'UTF8'))
   FOR UPDATE;
  IF NOT FOUND OR inv.accepted_at IS NOT NULL OR inv.revoked_at IS NOT NULL OR inv.expires_at < now() THEN
    RAISE EXCEPTION 'this invitation link is invalid or has expired' USING ERRCODE = '22023';
  END IF;
  IF lower(COALESCE(_email, '')) <> inv.email THEN
    RAISE EXCEPTION 'this invitation was sent to a different email address' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO mem FROM public.school_memberships WHERE id = inv.membership_id;
  SELECT * INTO prof FROM public.profiles WHERE id = mem.profile_id;
  IF prof.user_id IS NOT NULL AND prof.user_id <> _user THEN
    RAISE EXCEPTION 'this profile is already linked to another login' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET user_id = _user WHERE id = prof.id;
  UPDATE public.school_memberships SET status = 'active' WHERE id = mem.id AND status = 'invited';
  UPDATE public.school_invitations SET accepted_at = now() WHERE id = inv.id;
  PERFORM public.write_audit(inv.school_id, 'invitation_accepted', 'membership', prof.id, prof.full_name,
    jsonb_build_object('role', mem.role));
  RETURN jsonb_build_object('school_id', inv.school_id, 'role', mem.role);
END $$;

-- Called by a signed-in user (hosted Supabase Auth) to accept an invitation.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in first' USING ERRCODE = '42501'; END IF;
  RETURN public.accept_invitation_for(auth.uid(), auth.jwt() ->> 'email', _token);
END $$;

-- What the signed-in user can do, per school. The app builds its menus from
-- this; the database still checks every request on its own.
CREATE OR REPLACE FUNCTION public.my_memberships()
RETURNS TABLE (
  school_id UUID, school_name TEXT, school_status school_status, profile_id UUID,
  full_name TEXT, email TEXT, avatar_url TEXT, role member_role, permissions TEXT[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.status, p.id, p.full_name, p.email, p.avatar_url, m.role,
         COALESCE(ARRAY(SELECT rp.permission FROM public.role_permissions rp
                         WHERE rp.role = m.role
                           AND (s.status = 'active' OR rp.permission LIKE '%.view')
                         ORDER BY rp.permission), '{}')
  FROM public.school_memberships m
  JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
  JOIN public.schools s ON s.id = m.school_id
  WHERE p.user_id = auth.uid() AND auth.uid() IS NOT NULL
    AND m.status = 'active' AND p.status = 'active'
  ORDER BY s.name, m.role
$$;

-- Operator-only: creates a school and its first administrator invitation.
-- Run from the database console or scripts/local-db; not callable through the API.
CREATE OR REPLACE FUNCTION public.bootstrap_school(_name TEXT, _slug TEXT, _admin_name TEXT, _admin_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid UUID;
  prof public.profiles;
  mem public.school_memberships;
  token TEXT := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  expires TIMESTAMPTZ := now() + interval '7 days';
BEGIN
  INSERT INTO public.schools (name, slug) VALUES (btrim(_name), _slug) RETURNING id INTO sid;
  INSERT INTO public.school_config (school_id, school_name, country, currency)
  VALUES (sid, btrim(_name), 'Ghana', 'GHS');
  INSERT INTO public.profiles (school_id, full_name, email)
  VALUES (sid, btrim(_admin_name), lower(btrim(_admin_email))) RETURNING * INTO prof;
  INSERT INTO public.school_memberships (school_id, profile_id, role, status)
  VALUES (sid, prof.id, 'school_admin', 'invited') RETURNING * INTO mem;
  INSERT INTO public.school_invitations (school_id, membership_id, email, token_hash, expires_at)
  VALUES (sid, mem.id, prof.email, sha256(convert_to(token, 'UTF8')), expires);
  RETURN jsonb_build_object('school_id', sid, 'token', token, 'expires_at', expires);
END $$;

-- ---------------------------------------------------------------------------
-- Grants. Tables are reachable only by signed-in users, through RLS.
-- New functions are executable by PUBLIC by default, so internal ones are
-- revoked explicitly.
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
REVOKE DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE INSERT, UPDATE ON public.audit_logs FROM authenticated;
REVOKE ALL ON public.legacy_user_roles FROM authenticated;
REVOKE INSERT, UPDATE ON public.school_invitations, public.platform_admins, public.role_permissions FROM authenticated;
-- Profiles and memberships are created by invite_member() only.
REVOKE INSERT ON public.profiles, public.school_memberships FROM authenticated;

REVOKE EXECUTE ON FUNCTION
  public.write_audit(UUID, audit_action, TEXT, UUID, TEXT, JSONB),
  public.accept_invitation_for(UUID, TEXT, TEXT),
  public.bootstrap_school(TEXT, TEXT, TEXT, TEXT),
  public.audit_profiles(), public.audit_memberships(), public.audit_school_config(), public.audit_schools(),
  public.guard_tenant_columns(), public.guard_profile_columns(), public.guard_membership_columns()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.is_platform_admin(), public.my_roles(UUID), public.is_member(UUID),
  public.has_permission(UUID, TEXT), public.my_profile_id(UUID),
  public.log_session_event(UUID, TEXT), public.invite_member(UUID, TEXT, TEXT, member_role),
  public.accept_invitation(TEXT), public.my_memberships()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.is_platform_admin(), public.my_roles(UUID), public.is_member(UUID),
  public.has_permission(UUID, TEXT), public.my_profile_id(UUID),
  public.log_session_event(UUID, TEXT), public.invite_member(UUID, TEXT, TEXT, member_role),
  public.accept_invitation(TEXT), public.my_memberships()
TO authenticated;

-- ---------------------------------------------------------------------------
-- School assets (logos, banners) are public by nature, so the bucket stays
-- publicly readable; only a school's administrators may write, and only under
-- their school's folder (<school_id>/...). Private buckets for student
-- documents arrive with those records.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can upload school assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update school assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete school assets" ON storage.objects;

CREATE OR REPLACE FUNCTION public.can_manage_asset(_name TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  folder TEXT := split_part(COALESCE(_name, ''), '/', 1);
BEGIN
  IF folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN FALSE; END IF;
  RETURN public.has_permission(folder::uuid, 'school.settings.manage');
END $$;
REVOKE EXECUTE ON FUNCTION public.can_manage_asset(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_asset(TEXT) TO authenticated;

CREATE POLICY school_assets_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'school-assets' AND public.can_manage_asset(name));
CREATE POLICY school_assets_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'school-assets' AND public.can_manage_asset(name))
  WITH CHECK (bucket_id = 'school-assets' AND public.can_manage_asset(name));
CREATE POLICY school_assets_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'school-assets' AND public.can_manage_asset(name));
