-- Phase E: the Super Admin console.
--
--   * Subscription plans and per-school subscriptions with entitlements and limits,
--     enforced in the database (student and staff limits, feature switches, expiry
--     with a grace period that turns a school read-only).
--   * Support requests between a school administrator and the platform.
--   * Time-limited, read-only, audited support access to a school, approved by that
--     school's administrator, visible in the school's own audit log, and limited to
--     school configuration and staff accounts (never pupils, parents, marks,
--     attendance or messages).
--   * A platform activity log with filters. Personal data is redacted: target names
--     for people and records are hidden and details are an allow-list.
--   * Disabling a compromised school administrator account.
-- Platform administrators never gain a school role; everything is a narrow function.

-- ---------------------------------------------------------------------------
-- Plans and subscriptions
-- ---------------------------------------------------------------------------
ALTER TABLE public.schools ADD COLUMN suspended_by_subscription BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]{2,30}$'),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  description TEXT,
  student_limit INT CHECK (student_limit IS NULL OR student_limit > 0),
  staff_limit INT CHECK (staff_limit IS NULL OR staff_limit > 0),
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  currency TEXT NOT NULL DEFAULT 'GHS',
  entitlements JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.plans (code, name, description, student_limit, staff_limit, monthly_price, entitlements, sort_order) VALUES
  ('unlimited', 'Unlimited (existing schools)', 'Every feature, no limits. Given to schools created before plans existed.', NULL, NULL, 0,
   '{"attendance":true,"exams":true,"assignments":true,"messaging":true,"exports":true,"fees":true,"role_permissions":true,"audit_log":true,"parent_portal":true,"timetable":true}', 0),
  ('starter', 'Starter', 'Small schools getting records off paper.', 200, 25, 450,
   '{"attendance":true,"exams":false,"assignments":false,"messaging":false,"exports":false,"fees":false,"role_permissions":false,"audit_log":false,"parent_portal":false,"timetable":false}', 10),
  ('school', 'School', 'Everything a growing school runs on.', 800, 100, 1200,
   '{"attendance":true,"exams":true,"assignments":true,"messaging":true,"exports":true,"fees":true,"role_permissions":false,"audit_log":false,"parent_portal":true,"timetable":true}', 20),
  ('campus', 'Campus', 'Large or multi-site schools.', NULL, NULL, 2300,
   '{"attendance":true,"exams":true,"assignments":true,"messaging":true,"exports":true,"fees":true,"role_permissions":true,"audit_log":true,"parent_portal":true,"timetable":true}', 30);

CREATE TABLE public.school_subscriptions (
  school_id UUID NOT NULL PRIMARY KEY REFERENCES public.schools(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'expired', 'cancelled')),
  started_on DATE NOT NULL DEFAULT current_date,
  trial_ends_on DATE,
  current_period_end DATE,
  grace_days INT NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 60),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_label TEXT NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_subscription_events ON public.subscription_events (school_id, at DESC);

-- Existing schools keep working: they get the unlimited plan.
INSERT INTO public.school_subscriptions (school_id, plan_id, status)
SELECT s.id, (SELECT id FROM public.plans WHERE code = 'unlimited'), 'active' FROM public.schools s;
INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
SELECT s.id, 'system', 'plan_assigned', 'Existing school moved to the unlimited plan.', '{"plan":"unlimited"}' FROM public.schools s;

-- New schools start a 30-day trial of the School plan.
CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.school_subscriptions (school_id, plan_id, status, trial_ends_on, current_period_end)
  VALUES (NEW.id, (SELECT id FROM public.plans WHERE code = 'school'), 'trial', current_date + 30, current_date + 30)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
  VALUES (NEW.id, 'system', 'plan_assigned', '30-day trial started.', jsonb_build_object('plan', 'school', 'status', 'trial'));
  RETURN NEW;
END $$;
CREATE TRIGGER schools_start_trial AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION public.start_trial();

-- A school suspended by its subscription is marked so only a renewal restores it.
CREATE OR REPLACE FUNCTION public.schools_subscription_flag()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.suspended_by_subscription := (NEW.status = 'suspended' AND current_setting('app.subscription_enforce', true) = 'on');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER schools_subscription_flag BEFORE UPDATE OF status ON public.schools FOR EACH ROW EXECUTE FUNCTION public.schools_subscription_flag();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plans, public.school_subscriptions, public.subscription_events FROM anon, authenticated;

-- ok | grace (full access, renewal due) | blocked (read-only)
CREATE OR REPLACE FUNCTION public.subscription_state(_school UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN ss.status IN ('expired', 'cancelled') THEN 'blocked'
      WHEN ss.status = 'past_due' THEN
        CASE WHEN ss.current_period_end IS NOT NULL AND ss.current_period_end + ss.grace_days < current_date THEN 'blocked' ELSE 'grace' END
      WHEN COALESCE(CASE WHEN ss.status = 'trial' THEN ss.trial_ends_on ELSE ss.current_period_end END, 'infinity'::date) >= current_date THEN 'ok'
      WHEN COALESCE(CASE WHEN ss.status = 'trial' THEN ss.trial_ends_on ELSE ss.current_period_end END, 'infinity'::date) + ss.grace_days >= current_date THEN 'grace'
      ELSE 'blocked' END
    FROM public.school_subscriptions ss WHERE ss.school_id = _school), 'ok')
$$;

CREATE OR REPLACE FUNCTION public.has_feature(_school UUID, _key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT COALESCE((p.entitlements ->> _key)::boolean, false)
                     FROM public.school_subscriptions ss JOIN public.plans p ON p.id = ss.plan_id WHERE ss.school_id = _school), true)
$$;

CREATE OR REPLACE FUNCTION public.require_feature(_school UUID, _key TEXT, _label TEXT)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_feature(_school, _key) THEN
    RAISE EXCEPTION 'Your school''s plan does not include %. Ask the platform to change your plan.', _label USING ERRCODE = '42501';
  END IF;
END $$;

-- Student and staff limits of the plan.
CREATE OR REPLACE FUNCTION public.enforce_member_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  lim_students INT;
  lim_staff INT;
  n INT;
BEGIN
  IF NEW.status NOT IN ('invited', 'active') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('invited', 'active') AND OLD.role = NEW.role THEN RETURN NEW; END IF;
  SELECT p.student_limit, p.staff_limit INTO lim_students, lim_staff
    FROM public.school_subscriptions ss JOIN public.plans p ON p.id = ss.plan_id WHERE ss.school_id = NEW.school_id;
  IF NEW.role = 'student' AND lim_students IS NOT NULL THEN
    SELECT count(DISTINCT m.profile_id) INTO n FROM public.school_memberships m
     WHERE m.school_id = NEW.school_id AND m.role = 'student' AND m.status IN ('invited', 'active') AND m.id IS DISTINCT FROM NEW.id;
    IF n + 1 > lim_students THEN
      RAISE EXCEPTION 'Your plan allows up to % students. Ask the platform to move you to a larger plan.', lim_students USING ERRCODE = '54000';
    END IF;
  ELSIF NEW.role NOT IN ('student', 'parent') AND lim_staff IS NOT NULL THEN
    SELECT count(DISTINCT m.profile_id) INTO n FROM public.school_memberships m
     WHERE m.school_id = NEW.school_id AND m.role NOT IN ('student', 'parent') AND m.status IN ('invited', 'active') AND m.id IS DISTINCT FROM NEW.id;
    IF n + 1 > lim_staff THEN
      RAISE EXCEPTION 'Your plan allows up to % staff accounts. Ask the platform to move you to a larger plan.', lim_staff USING ERRCODE = '54000';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_member_limits BEFORE INSERT OR UPDATE OF status, role ON public.school_memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_member_limits();

-- Feature switches, checked where the feature is used.
CREATE OR REPLACE FUNCTION public.feature_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'conversations' THEN
    PERFORM public.require_feature(NEW.school_id, 'messaging', 'messaging');
  ELSIF TG_TABLE_NAME = 'assessments' THEN
    IF NEW.released_at IS NOT NULL AND OLD.released_at IS NULL AND NEW.submission_format <> 'none' THEN
      PERFORM public.require_feature(NEW.school_id, 'assignments', 'assignments and online exams');
    END IF;
  ELSIF TG_TABLE_NAME = 'school_role_permissions' THEN
    PERFORM public.require_feature(NEW.school_id, 'role_permissions', 'role permissions');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER feature_guard_conversations BEFORE INSERT ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.feature_guard();
CREATE TRIGGER feature_guard_assessments BEFORE UPDATE OF released_at ON public.assessments FOR EACH ROW EXECUTE FUNCTION public.feature_guard();
CREATE TRIGGER feature_guard_role_permissions BEFORE INSERT ON public.school_role_permissions FOR EACH ROW EXECUTE FUNCTION public.feature_guard();

-- Report exports need the "exports" feature.
CREATE OR REPLACE FUNCTION public.student_report(_student UUID, _term UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  rows JSONB;
  cls TEXT;
  yr TEXT;
  term_name TEXT;
  result JSONB;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _student;
  IF NOT FOUND OR NOT public.can_see_student(_student) THEN
    RAISE EXCEPTION 'you cannot view this student''s report' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_feature(p.school_id, 'exports', 'report downloads');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'subject', s.name, 'assessment', a.title, 'kind', a.kind, 'date', COALESCE(a.published_at::date, a.due_on),
           'score', m.score, 'max_score', a.max_score, 'percent', round(m.score / a.max_score * 100, 1),
           'grade', public.grade_for(p.school_id, m.score / a.max_score * 100), 'comment', m.comment)
         ORDER BY s.name, a.published_at, a.title), '[]')
    INTO rows
    FROM public.marks m
    JOIN public.assessments a ON a.id = m.assessment_id AND a.status = 'published'
    JOIN public.subjects s ON s.id = a.subject_id
   WHERE m.student_id = _student AND m.score IS NOT NULL
     AND (_term IS NULL OR a.term_id = _term)
     AND (public.is_self_student(_student) OR public.is_guardian_of(_student)
          OR public.has_permission(p.school_id, 'grades.view') OR public.can_enter_marks(a.id));

  SELECT c.name, y.name INTO cls, yr
    FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id JOIN public.academic_years y ON y.id = c.academic_year_id
   WHERE e.student_id = _student AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1;
  IF _term IS NOT NULL THEN SELECT name INTO term_name FROM public.terms WHERE id = _term AND school_id = p.school_id; END IF;

  result := jsonb_build_object(
    'school', jsonb_build_object('name', (SELECT name FROM public.schools WHERE id = p.school_id),
                                 'logo_url', (SELECT logo_url FROM public.school_config WHERE school_id = p.school_id)),
    'student', jsonb_build_object('name', p.full_name, 'admission_number', p.admission_number, 'class', cls, 'academic_year', yr),
    'term', term_name,
    'rows', rows,
    'bands', (SELECT COALESCE(jsonb_agg(jsonb_build_object('min_percent', b.min_percent, 'grade', b.grade, 'remark', b.remark) ORDER BY b.min_percent DESC), '[]')
                FROM public.grade_bands b WHERE b.school_id = p.school_id),
    'issued_at', now());
  PERFORM public.write_audit(p.school_id, 'report_exported', 'report', _student, p.full_name,
    jsonb_build_object('kind', 'student_report', 'term', _term, 'rows', jsonb_array_length(rows)));
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.class_results(_class UUID, _term UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.classes;
  rows JSONB;
  all_subjects BOOLEAN;
  result JSONB;
BEGIN
  SELECT * INTO c FROM public.classes WHERE id = _class;
  IF NOT FOUND OR NOT (public.has_permission(c.school_id, 'grades.view') OR public.teaches_class(_class)) THEN
    RAISE EXCEPTION 'you cannot view this class''s results' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_feature(c.school_id, 'exports', 'report downloads');
  all_subjects := public.has_permission(c.school_id, 'grades.view');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'student', p.full_name, 'admission_number', p.admission_number, 'subject', s.name, 'assessment', a.title,
           'kind', a.kind, 'score', m.score, 'max_score', a.max_score, 'percent', round(m.score / a.max_score * 100, 1),
           'grade', public.grade_for(c.school_id, m.score / a.max_score * 100), 'comment', m.comment)
         ORDER BY p.full_name, s.name, a.title), '[]')
    INTO rows
    FROM public.assessments a
    JOIN public.subjects s ON s.id = a.subject_id
    JOIN public.marks m ON m.assessment_id = a.id AND m.score IS NOT NULL
    JOIN public.profiles p ON p.id = m.student_id
   WHERE a.class_id = _class AND a.status = 'published' AND (_term IS NULL OR a.term_id = _term)
     AND (all_subjects OR public.can_enter_marks(a.id));

  result := jsonb_build_object(
    'school', jsonb_build_object('name', (SELECT name FROM public.schools WHERE id = c.school_id),
                                 'logo_url', (SELECT logo_url FROM public.school_config WHERE school_id = c.school_id)),
    'class', c.name,
    'academic_year', (SELECT name FROM public.academic_years WHERE id = c.academic_year_id),
    'term', (SELECT name FROM public.terms WHERE id = _term AND school_id = c.school_id),
    'rows', rows,
    'issued_at', now());
  PERFORM public.write_audit(c.school_id, 'report_exported', 'report', _class, c.name,
    jsonb_build_object('kind', 'class_results', 'term', _term, 'rows', jsonb_array_length(rows)));
  RETURN result;
END $$;

-- Expiry: a school whose subscription lapsed past its grace period is suspended
-- (read-only) and restored when it is renewed. Runs from the monitor job and
-- immediately when the platform changes a subscription.
CREATE OR REPLACE FUNCTION public.subscriptions_enforce()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s RECORD;
  st TEXT;
  suspended INT := 0;
  restored INT := 0;
BEGIN
  PERFORM set_config('app.subscription_enforce', 'on', true);
  FOR s IN SELECT id, status, suspended_by_subscription FROM public.schools LOOP
    st := public.subscription_state(s.id);
    IF st = 'blocked' AND s.status = 'active' THEN
      UPDATE public.schools SET status = 'suspended' WHERE id = s.id;
      INSERT INTO public.subscription_events (school_id, actor_label, kind, note) VALUES (s.id, 'system', 'suspended', 'Suspended because the subscription lapsed.');
      suspended := suspended + 1;
    ELSIF st <> 'blocked' AND s.status = 'suspended' AND s.suspended_by_subscription THEN
      UPDATE public.schools SET status = 'active' WHERE id = s.id;
      INSERT INTO public.subscription_events (school_id, actor_label, kind, note) VALUES (s.id, 'system', 'restored', 'Restored after the subscription was renewed.');
      restored := restored + 1;
    END IF;
  END LOOP;
  PERFORM set_config('app.subscription_enforce', 'off', true);
  RETURN jsonb_build_object('suspended', suspended, 'restored', restored);
END $$;

CREATE OR REPLACE FUNCTION public.audit_monitor_tick()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.subscriptions_enforce();
  RETURN public.audit_run_health_check('scheduled', NULL);
END $$;

-- ---------------------------------------------------------------------------
-- Platform: plans and subscriptions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_only()
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_plans()
RETURNS SETOF public.plans LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY SELECT * FROM public.plans ORDER BY sort_order, name;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_plan(
  _code TEXT, _name TEXT, _description TEXT, _student_limit INT, _staff_limit INT, _price NUMERIC, _entitlements JSONB, _active BOOLEAN
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pid UUID;
BEGIN
  PERFORM public.platform_only();
  IF jsonb_typeof(COALESCE(_entitlements, '{}')) <> 'object' THEN RAISE EXCEPTION 'entitlements must be a set of on/off switches' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.plans (code, name, description, student_limit, staff_limit, monthly_price, entitlements, is_active)
  VALUES (lower(btrim(_code)), btrim(_name), NULLIF(btrim(COALESCE(_description, '')), ''), _student_limit, _staff_limit, COALESCE(_price, 0), COALESCE(_entitlements, '{}'), COALESCE(_active, true))
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, student_limit = EXCLUDED.student_limit,
    staff_limit = EXCLUDED.staff_limit, monthly_price = EXCLUDED.monthly_price, entitlements = EXCLUDED.entitlements,
    is_active = EXCLUDED.is_active, updated_at = now()
  RETURNING id INTO pid;
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.set_school_subscription(
  _school UUID, _plan TEXT, _status TEXT, _period_end DATE, _trial_end DATE, _grace INT, _note TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old RECORD;
  p public.plans;
  who TEXT := public.audit_actor_label(auth.uid());
BEGIN
  PERFORM public.platform_only();
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = _school) THEN RAISE EXCEPTION 'school not found' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.plans WHERE code = _plan;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown plan' USING ERRCODE = '22023'; END IF;
  IF _status NOT IN ('trial', 'active', 'past_due', 'expired', 'cancelled') THEN RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_note, ''))) = 0 THEN RAISE EXCEPTION 'add a note explaining the change' USING ERRCODE = '22023'; END IF;

  SELECT ss.*, pl.code AS plan_code INTO old FROM public.school_subscriptions ss JOIN public.plans pl ON pl.id = ss.plan_id WHERE ss.school_id = _school;
  INSERT INTO public.school_subscriptions (school_id, plan_id, status, trial_ends_on, current_period_end, grace_days, notes)
  VALUES (_school, p.id, _status, _trial_end, _period_end, COALESCE(_grace, 7), btrim(_note))
  ON CONFLICT (school_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, trial_ends_on = EXCLUDED.trial_ends_on,
    current_period_end = EXCLUDED.current_period_end, grace_days = EXCLUDED.grace_days, notes = EXCLUDED.notes, updated_at = now();

  INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
  VALUES (_school, who, 'plan_changed', btrim(_note), jsonb_build_object(
    'before', jsonb_build_object('plan', old.plan_code, 'status', old.status, 'period_end', old.current_period_end, 'trial_end', old.trial_ends_on),
    'after', jsonb_build_object('plan', p.code, 'status', _status, 'period_end', _period_end, 'trial_end', _trial_end)));
  PERFORM public.write_audit(_school, 'subscription_changed', 'school', _school, NULL,
    jsonb_build_object('old_plan', old.plan_code, 'new_plan', p.code, 'old_status', old.status, 'new_status', _status, 'reason', btrim(_note)));
  RETURN public.subscriptions_enforce();
END $$;

CREATE OR REPLACE FUNCTION public.platform_subscriptions()
RETURNS TABLE (
  school_id UUID, school_name TEXT, school_status school_status, plan_code TEXT, plan_name TEXT, status TEXT, state TEXT,
  trial_ends_on DATE, current_period_end DATE, students BIGINT, student_limit INT, staff BIGINT, staff_limit INT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT s.id, s.name, s.status, p.code, p.name, ss.status, public.subscription_state(s.id), ss.trial_ends_on, ss.current_period_end,
         (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = s.id AND m.role = 'student' AND m.status IN ('invited', 'active')),
         p.student_limit,
         (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = s.id AND m.role NOT IN ('student', 'parent') AND m.status IN ('invited', 'active')),
         p.staff_limit, s.created_at
    FROM public.schools s
    LEFT JOIN public.school_subscriptions ss ON ss.school_id = s.id
    LEFT JOIN public.plans p ON p.id = ss.plan_id
   ORDER BY s.name;
END $$;

CREATE OR REPLACE FUNCTION public.platform_commercial_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN jsonb_build_object(
    'by_status', (SELECT COALESCE(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) AS n FROM public.school_subscriptions GROUP BY status) x),
    'by_plan', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'count', n) ORDER BY sort_order), '[]')
                  FROM (SELECT p.code, p.name, p.sort_order, count(ss.school_id) AS n FROM public.plans p LEFT JOIN public.school_subscriptions ss ON ss.plan_id = p.id GROUP BY p.id) x),
    'on_trial', (SELECT count(*) FROM public.school_subscriptions WHERE status = 'trial'),
    'expiring_14d', (SELECT count(*) FROM public.school_subscriptions WHERE status IN ('trial', 'active') AND COALESCE(CASE WHEN status = 'trial' THEN trial_ends_on ELSE current_period_end END, 'infinity'::date) BETWEEN current_date AND current_date + 14),
    'in_grace', (SELECT count(*) FROM public.schools s WHERE public.subscription_state(s.id) = 'grace'),
    'blocked', (SELECT count(*) FROM public.schools s WHERE public.subscription_state(s.id) = 'blocked'),
    'new_30d', (SELECT count(*) FROM public.schools WHERE created_at > now() - interval '30 days'),
    'open_support', (SELECT count(*) FROM public.support_requests WHERE status IN ('open', 'in_progress', 'waiting')),
    'access_pending', (SELECT count(*) FROM public.support_access_grants WHERE status = 'requested'));
END $$;

CREATE OR REPLACE FUNCTION public.subscription_history(_school UUID)
RETURNS TABLE (at TIMESTAMPTZ, actor_label TEXT, kind TEXT, note TEXT, details JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_platform_admin() OR public.has_permission(_school, 'staff.manage')) THEN
    RAISE EXCEPTION 'you cannot view this history' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT e.at, e.actor_label, e.kind, e.note, e.details FROM public.subscription_events e WHERE e.school_id = _school ORDER BY e.at DESC LIMIT 100;
END $$;

-- The school administrator's own view of the plan, limits and usage.
CREATE OR REPLACE FUNCTION public.my_subscription(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ss public.school_subscriptions;
  p public.plans;
BEGIN
  IF NOT public.has_permission(_school, 'staff.manage') THEN RAISE EXCEPTION 'you cannot view the subscription' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ss FROM public.school_subscriptions WHERE school_id = _school;
  IF NOT FOUND THEN RETURN jsonb_build_object('managed', false); END IF;
  SELECT * INTO p FROM public.plans WHERE id = ss.plan_id;
  RETURN jsonb_build_object('managed', true, 'plan', jsonb_build_object('code', p.code, 'name', p.name, 'description', p.description,
      'student_limit', p.student_limit, 'staff_limit', p.staff_limit, 'monthly_price', p.monthly_price, 'currency', p.currency, 'entitlements', p.entitlements),
    'status', ss.status, 'state', public.subscription_state(_school), 'trial_ends_on', ss.trial_ends_on, 'current_period_end', ss.current_period_end, 'grace_days', ss.grace_days,
    'usage', jsonb_build_object(
      'students', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.role = 'student' AND m.status IN ('invited', 'active')),
      'staff', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.role NOT IN ('student', 'parent') AND m.status IN ('invited', 'active'))));
END $$;

-- ---------------------------------------------------------------------------
-- Support requests
-- ---------------------------------------------------------------------------
CREATE TABLE public.support_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  created_by UUID,
  subject TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 150),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, created_by) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.support_requests(id) ON DELETE RESTRICT,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('school', 'platform')),
  author_label TEXT NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_support_messages ON public.support_messages (request_id, created_at);
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_requests, public.support_messages FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_support_request(_school UUID, _subject TEXT, _body TEXT, _priority TEXT DEFAULT 'normal')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rid UUID;
  me UUID := public.my_profile_id(_school);
BEGIN
  IF me IS NULL OR NOT public.has_permission(_school, 'staff.manage') THEN RAISE EXCEPTION 'only a school administrator can contact platform support' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_body, ''))) = 0 THEN RAISE EXCEPTION 'describe the problem' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.support_requests (school_id, created_by, subject, priority) VALUES (_school, me, btrim(_subject), COALESCE(_priority, 'normal')) RETURNING id INTO rid;
  INSERT INTO public.support_messages (request_id, author_kind, author_label, body)
  VALUES (rid, 'school', (SELECT full_name FROM public.profiles WHERE id = me), btrim(_body));
  PERFORM public.write_audit(_school, 'support_request_created', 'support_request', rid, left(btrim(_subject), 80), '{}');
  INSERT INTO public.platform_alerts (kind, severity, title, body)
  VALUES ('support', CASE WHEN _priority = 'urgent' THEN 'high' ELSE 'low' END, 'Support request: ' || left(btrim(_subject), 80),
          'School: ' || (SELECT name FROM public.schools WHERE id = _school) || E'\nPriority: ' || COALESCE(_priority, 'normal') || E'\nOpen Support in the platform console.');
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.list_support_requests(_school UUID DEFAULT NULL, _status TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, school_id UUID, school_name TEXT, subject TEXT, priority TEXT, status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, messages BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin() THEN NULL;
  ELSIF _school IS NULL OR NOT public.has_permission(_school, 'staff.manage') THEN RAISE EXCEPTION 'you cannot view support requests' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.school_id, s.name, r.subject, r.priority, r.status, r.created_at, r.updated_at,
         (SELECT count(*) FROM public.support_messages m WHERE m.request_id = r.id)
    FROM public.support_requests r JOIN public.schools s ON s.id = r.school_id
   WHERE (_school IS NULL OR r.school_id = _school) AND (_status IS NULL OR r.status = _status OR (_status = 'active' AND r.status IN ('open', 'in_progress', 'waiting')))
   ORDER BY (r.status IN ('resolved', 'closed')), r.updated_at DESC LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.get_support_request(_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.support_requests;
BEGIN
  SELECT * INTO r FROM public.support_requests WHERE id = _id;
  IF NOT FOUND OR NOT (public.is_platform_admin() OR public.has_permission(r.school_id, 'staff.manage')) THEN
    RAISE EXCEPTION 'support request not found' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object('id', r.id, 'subject', r.subject, 'priority', r.priority, 'status', r.status, 'created_at', r.created_at,
    'school_name', (SELECT name FROM public.schools WHERE id = r.school_id),
    'messages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('author_kind', m.author_kind, 'author', m.author_label, 'body', m.body, 'at', m.created_at) ORDER BY m.created_at), '[]')
                   FROM public.support_messages m WHERE m.request_id = r.id));
END $$;

CREATE OR REPLACE FUNCTION public.reply_support_request(_id UUID, _body TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.support_requests;
  platform BOOLEAN := public.is_platform_admin();
BEGIN
  SELECT * INTO r FROM public.support_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT (platform OR public.has_permission(r.school_id, 'staff.manage')) THEN RAISE EXCEPTION 'support request not found' USING ERRCODE = '42501'; END IF;
  IF r.status = 'closed' THEN RAISE EXCEPTION 'this request is closed' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_body, ''))) = 0 THEN RAISE EXCEPTION 'write a message' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.support_messages (request_id, author_kind, author_label, body)
  VALUES (r.id, CASE WHEN platform THEN 'platform' ELSE 'school' END,
          CASE WHEN platform THEN 'Tech Oasis support' ELSE COALESCE((SELECT full_name FROM public.profiles WHERE id = public.my_profile_id(r.school_id)), 'School administrator') END, btrim(_body));
  UPDATE public.support_requests SET updated_at = clock_timestamp(),
    status = CASE WHEN platform THEN 'waiting' WHEN status IN ('waiting', 'resolved') THEN 'open' ELSE status END WHERE id = r.id;
  IF platform THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT r.school_id, sm.profile_id, 'support_reply', 'Platform support replied', left(r.subject, 80), '/support'
      FROM public.school_memberships sm WHERE sm.school_id = r.school_id AND sm.role = 'school_admin' AND sm.status = 'active';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_support_status(_id UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.support_requests;
BEGIN
  SELECT * INTO r FROM public.support_requests WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'support request not found' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('open', 'in_progress', 'waiting', 'resolved', 'closed') THEN RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_platform_admin() THEN
    -- A school can only close or reopen its own request.
    IF NOT public.has_permission(r.school_id, 'staff.manage') OR _status NOT IN ('open', 'closed') THEN RAISE EXCEPTION 'you cannot change this request' USING ERRCODE = '42501'; END IF;
  END IF;
  UPDATE public.support_requests SET status = _status, updated_at = clock_timestamp() WHERE id = r.id;
END $$;

-- ---------------------------------------------------------------------------
-- Support access: time-limited, read-only, approved by the school, audited
-- ---------------------------------------------------------------------------
CREATE TABLE public.support_access_grants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL,
  requested_label TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) >= 20),
  request_id UUID REFERENCES public.support_requests(id) ON DELETE RESTRICT,
  hours INT NOT NULL CHECK (hours BETWEEN 1 AND 24),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'denied', 'revoked', 'ended')),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  uses INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, decided_by) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_access_grants FROM anon, authenticated;

-- Anything that records access to a school's data must be recorded, or not happen.
CREATE OR REPLACE FUNCTION public.audit_is_high_risk(_action public.audit_action)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _action::text IN ('role_changed', 'permission_changed', 'user_banned', 'user_suspended', 'user_activated',
    'results_approved', 'results_published', 'results_reopened', 'results_corrected', 'correction_rejected',
    'guardian_linked', 'attendance_corrected', 'school_updated', 'config_updated', 'grading_scale_changed', 'message_hidden',
    'subscription_changed', 'support_access_requested', 'support_access_approved', 'support_access_denied', 'support_access_used',
    'support_access_ended', 'admin_access_changed')
$$;

CREATE OR REPLACE FUNCTION public.request_support_access(_school UUID, _reason TEXT, _hours INT DEFAULT 2, _request UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gid UUID;
  who TEXT := public.audit_actor_label(auth.uid());
BEGIN
  PERFORM public.platform_only();
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = _school) THEN RAISE EXCEPTION 'school not found' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 20 THEN RAISE EXCEPTION 'explain why access is needed (at least 20 characters); the school will see it' USING ERRCODE = '22023'; END IF;
  IF _hours < 1 OR _hours > 24 THEN RAISE EXCEPTION 'access can last from 1 to 24 hours' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.support_access_grants WHERE school_id = _school AND requested_by = auth.uid() AND status = 'requested') THEN
    RAISE EXCEPTION 'you already have a request waiting for this school' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.support_access_grants (school_id, requested_by, requested_label, reason, request_id, hours)
  VALUES (_school, auth.uid(), who, btrim(_reason), _request, _hours) RETURNING id INTO gid;
  PERFORM public.write_audit(_school, 'support_access_requested', 'support_access', gid, NULL,
    jsonb_build_object('hours', _hours, 'reason', btrim(_reason), 'requested_by', who));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT _school, sm.profile_id, 'support_access_requested', 'Platform support asks to view your school settings', 'Review and approve or deny the request.', '/support'
    FROM public.school_memberships sm WHERE sm.school_id = _school AND sm.role = 'school_admin' AND sm.status = 'active';
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.decide_support_access(_grant UUID, _approve BOOLEAN, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.support_access_grants;
  me UUID;
BEGIN
  SELECT * INTO g FROM public.support_access_grants WHERE id = _grant FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(g.school_id, 'school.settings.manage') THEN RAISE EXCEPTION 'request not found' USING ERRCODE = '42501'; END IF;
  IF g.status <> 'requested' THEN RAISE EXCEPTION 'this request has already been answered' USING ERRCODE = '22023'; END IF;
  me := public.my_profile_id(g.school_id);
  IF _approve THEN
    UPDATE public.support_access_grants SET status = 'approved', decided_by = me, decided_at = clock_timestamp(), decision_note = NULLIF(btrim(COALESCE(_note, '')), ''),
      starts_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(hours => g.hours) WHERE id = g.id;
    PERFORM public.write_audit(g.school_id, 'support_access_approved', 'support_access', g.id, NULL, jsonb_build_object('hours', g.hours));
  ELSE
    UPDATE public.support_access_grants SET status = 'denied', decided_by = me, decided_at = clock_timestamp(), decision_note = NULLIF(btrim(COALESCE(_note, '')), '') WHERE id = g.id;
    PERFORM public.write_audit(g.school_id, 'support_access_denied', 'support_access', g.id, NULL, '{}');
  END IF;
END $$;

-- The school can withdraw access at any time; the platform can end it when done.
CREATE OR REPLACE FUNCTION public.end_support_access(_grant UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.support_access_grants;
  by_school BOOLEAN;
BEGIN
  SELECT * INTO g FROM public.support_access_grants WHERE id = _grant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found' USING ERRCODE = '42501'; END IF;
  by_school := public.has_permission(g.school_id, 'school.settings.manage');
  IF NOT (by_school OR (public.is_platform_admin() AND g.requested_by = auth.uid())) THEN RAISE EXCEPTION 'request not found' USING ERRCODE = '42501'; END IF;
  IF g.status NOT IN ('requested', 'approved') THEN RAISE EXCEPTION 'this access has already ended' USING ERRCODE = '22023'; END IF;
  UPDATE public.support_access_grants SET status = CASE WHEN by_school THEN 'revoked' ELSE 'ended' END, ended_at = clock_timestamp() WHERE id = g.id;
  PERFORM public.write_audit(g.school_id, 'support_access_ended', 'support_access', g.id, NULL, jsonb_build_object('by', CASE WHEN by_school THEN 'school' ELSE 'platform' END, 'uses', g.uses));
END $$;

CREATE OR REPLACE FUNCTION public.list_support_access(_school UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID, school_id UUID, school_name TEXT, requested_label TEXT, reason TEXT, hours INT, status TEXT, effective_status TEXT,
  created_at TIMESTAMPTZ, decided_at TIMESTAMPTZ, decision_note TEXT, starts_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, uses INT, mine BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_platform_admin() THEN NULL;
  ELSIF _school IS NULL OR NOT public.has_permission(_school, 'staff.manage') THEN RAISE EXCEPTION 'you cannot view access requests' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT g.id, g.school_id, s.name, g.requested_label, g.reason, g.hours, g.status,
         CASE WHEN g.status = 'approved' AND g.expires_at < clock_timestamp() THEN 'expired' ELSE g.status END,
         g.created_at, g.decided_at, g.decision_note, g.starts_at, g.expires_at, g.uses, g.requested_by = auth.uid()
    FROM public.support_access_grants g JOIN public.schools s ON s.id = g.school_id
   WHERE (_school IS NULL OR g.school_id = _school) ORDER BY g.created_at DESC LIMIT 100;
END $$;

-- What support may see: the school's configuration and staff accounts. Not pupils,
-- parents, results, attendance or messages. Every call is written to the school's audit log.
CREATE OR REPLACE FUNCTION public.support_view_school(_grant UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.support_access_grants;
  s public.schools;
BEGIN
  PERFORM public.platform_only();
  SELECT * INTO g FROM public.support_access_grants WHERE id = _grant FOR UPDATE;
  IF NOT FOUND OR g.requested_by <> auth.uid() OR g.status <> 'approved' OR g.expires_at < clock_timestamp() THEN
    RAISE EXCEPTION 'there is no active approved access for this school' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.schools WHERE id = g.school_id;
  UPDATE public.support_access_grants SET uses = uses + 1, last_used_at = clock_timestamp() WHERE id = g.id;
  PERFORM public.write_audit(g.school_id, 'support_access_used', 'support_access', g.id, NULL, jsonb_build_object('scope', 'settings_and_staff', 'reason', g.reason));
  RETURN jsonb_build_object(
    'expires_at', g.expires_at,
    'school', jsonb_build_object('name', s.name, 'slug', s.slug, 'status', s.status, 'country', s.country, 'currency', s.currency, 'timezone', s.timezone, 'created_at', s.created_at),
    'settings', (SELECT jsonb_build_object('setup_completed', c.setup_completed, 'grading_system', c.grading_system, 'academic_year_format', c.academic_year_format,
                   'results_approval_required', c.results_approval_required, 'correction_approval_required', c.correction_approval_required, 'students_can_message', c.students_can_message)
                   FROM public.school_config c WHERE c.school_id = s.id),
    'subscription', (SELECT jsonb_build_object('plan', p.name, 'status', ss.status, 'state', public.subscription_state(s.id), 'period_end', ss.current_period_end)
                       FROM public.school_subscriptions ss JOIN public.plans p ON p.id = ss.plan_id WHERE ss.school_id = s.id),
    'people_counts', (SELECT COALESCE(jsonb_object_agg(role || ':' || status, n), '{}') FROM (SELECT m.role, m.status, count(*) AS n FROM public.school_memberships m WHERE m.school_id = s.id GROUP BY 1, 2) x),
    'staff_accounts', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.full_name, 'email', p.email, 'role', m.role, 'status', m.status) ORDER BY p.full_name), '[]')
                         FROM public.school_memberships m JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
                        WHERE m.school_id = s.id AND m.role NOT IN ('student', 'parent')),
    'recent_activity', (SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]') FROM (
                          SELECT l.created_at, l.actor_role, l.action, l.target_type, public.platform_safe_details(l.details) AS details
                            FROM public.audit_logs l WHERE l.school_id = s.id ORDER BY l.created_at DESC LIMIT 30) a));
END $$;

-- ---------------------------------------------------------------------------
-- Platform activity log (personal data redacted)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_safe_details(_details JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(t.k, t.v) FILTER (WHERE t.k IN
    ('changed', 'old_status', 'new_status', 'role', 'old_role', 'new_role', 'permission', 'granted', 'default', 'kind', 'rows', 'old_plan', 'new_plan', 'hours', 'scope', 'by', 'uses', 'participants', 'late', 'files')), '{}')
  FROM jsonb_each(COALESCE(_details, '{}')) AS t(k, v)
$$;

CREATE OR REPLACE FUNCTION public.platform_activity_log(
  _school UUID DEFAULT NULL, _actor TEXT DEFAULT NULL, _action TEXT DEFAULT NULL, _from TIMESTAMPTZ DEFAULT NULL, _to TIMESTAMPTZ DEFAULT NULL,
  _target_type TEXT DEFAULT NULL, _admins_only BOOLEAN DEFAULT TRUE, _limit INT DEFAULT 50, _offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, school_id UUID, school_name TEXT, actor_name TEXT, actor_role TEXT, action TEXT, target_type TEXT,
  target_name TEXT, details JSONB, total BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT l.id, l.created_at, l.school_id, s.name, l.actor_name, l.actor_role, l.action::text, l.target_type,
         CASE WHEN l.target_type IN ('user', 'membership', 'result', 'submission', 'conversation', 'message', 'report', 'attendance', 'session', 'support_request') THEN NULL ELSE l.target_name END,
         public.platform_safe_details(l.details),
         count(*) OVER ()
    FROM public.audit_logs l LEFT JOIN public.schools s ON s.id = l.school_id
   WHERE l.action::text NOT IN ('login', 'logout')
     AND (_school IS NULL OR l.school_id = _school)
     AND (_actor IS NULL OR l.actor_name ILIKE '%' || _actor || '%')
     AND (_action IS NULL OR l.action::text = _action)
     AND (_target_type IS NULL OR l.target_type = _target_type)
     AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
     AND (NOT _admins_only OR l.actor_role ILIKE '%school_admin%' OR l.actor_role ILIKE '%platform_admin%' OR l.actor_role ILIKE '%headteacher%')
   ORDER BY l.created_at DESC
   LIMIT LEAST(GREATEST(_limit, 1), 200) OFFSET GREATEST(_offset, 0);
END $$;

-- ---------------------------------------------------------------------------
-- Disabling a compromised school administrator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_school_admins(_school UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, email TEXT, status membership_status, last_sign_in TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT p.id, p.full_name, p.email, m.status,
         (SELECT max(l.created_at) FROM public.audit_logs l WHERE l.school_id = _school AND l.actor_id = p.id AND l.action = 'login')
    FROM public.school_memberships m JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
   WHERE m.school_id = _school AND m.role = 'school_admin' ORDER BY p.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.platform_set_admin_status(_school UUID, _profile UUID, _suspend BOOLEAN, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  active_admins INT;
BEGIN
  PERFORM public.platform_only();
  IF length(btrim(COALESCE(_reason, ''))) < 10 THEN RAISE EXCEPTION 'give a reason (at least 10 characters); it is kept in the audit log' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships WHERE school_id = _school AND profile_id = _profile AND role = 'school_admin') THEN
    RAISE EXCEPTION 'that person is not an administrator of this school' USING ERRCODE = '22023';
  END IF;
  UPDATE public.school_memberships SET status = CASE WHEN _suspend THEN 'suspended'::membership_status ELSE 'active'::membership_status END
   WHERE school_id = _school AND profile_id = _profile AND role = 'school_admin'
     AND status = CASE WHEN _suspend THEN 'active'::membership_status ELSE 'suspended'::membership_status END;
  IF NOT FOUND THEN RAISE EXCEPTION 'nothing to change: the account is already in that state or has not been activated' USING ERRCODE = '22023'; END IF;
  PERFORM public.write_audit(_school, 'admin_access_changed', 'membership', _profile, NULL,
    jsonb_build_object('role', 'school_admin', 'new_status', CASE WHEN _suspend THEN 'suspended' ELSE 'active' END, 'reason', btrim(_reason)));
  SELECT count(*) INTO active_admins FROM public.school_memberships WHERE school_id = _school AND role = 'school_admin' AND status = 'active';
  IF active_admins = 0 AND _suspend THEN
    INSERT INTO public.platform_alerts (kind, severity, title, body)
    VALUES ('access', 'medium', 'School has no active administrator', 'School: ' || (SELECT name FROM public.schools WHERE id = _school) || E'\nInvite a new administrator from the school list.');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.start_trial(), public.schools_subscription_flag(), public.subscription_state(UUID), public.has_feature(UUID, TEXT),
  public.require_feature(UUID, TEXT, TEXT), public.enforce_member_limits(), public.feature_guard(), public.subscriptions_enforce(),
  public.platform_only(), public.platform_plans(), public.upsert_plan(TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB, BOOLEAN),
  public.set_school_subscription(UUID, TEXT, TEXT, DATE, DATE, INT, TEXT), public.platform_subscriptions(), public.platform_commercial_overview(),
  public.subscription_history(UUID), public.my_subscription(UUID), public.create_support_request(UUID, TEXT, TEXT, TEXT),
  public.list_support_requests(UUID, TEXT), public.get_support_request(UUID), public.reply_support_request(UUID, TEXT), public.set_support_status(UUID, TEXT),
  public.request_support_access(UUID, TEXT, INT, UUID), public.decide_support_access(UUID, BOOLEAN, TEXT), public.end_support_access(UUID),
  public.list_support_access(UUID), public.support_view_school(UUID), public.platform_safe_details(JSONB),
  public.platform_activity_log(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN, INT, INT),
  public.platform_school_admins(UUID), public.platform_set_admin_status(UUID, UUID, BOOLEAN, TEXT)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.platform_plans(), public.upsert_plan(TEXT, TEXT, TEXT, INT, INT, NUMERIC, JSONB, BOOLEAN),
  public.set_school_subscription(UUID, TEXT, TEXT, DATE, DATE, INT, TEXT), public.platform_subscriptions(), public.platform_commercial_overview(),
  public.subscription_history(UUID), public.my_subscription(UUID), public.create_support_request(UUID, TEXT, TEXT, TEXT),
  public.list_support_requests(UUID, TEXT), public.get_support_request(UUID), public.reply_support_request(UUID, TEXT), public.set_support_status(UUID, TEXT),
  public.request_support_access(UUID, TEXT, INT, UUID), public.decide_support_access(UUID, BOOLEAN, TEXT), public.end_support_access(UUID),
  public.list_support_access(UUID), public.support_view_school(UUID),
  public.platform_activity_log(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN, INT, INT),
  public.platform_school_admins(UUID), public.platform_set_admin_status(UUID, UUID, BOOLEAN, TEXT)
TO authenticated;
-- student_report and class_results keep their existing grants (CREATE OR REPLACE preserves them).
