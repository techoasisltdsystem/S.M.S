-- A school whose subscription lapsed is read-only, but its administrator must still be able to see the
-- subscription and pay to restore access. has_permission() treats a suspended school as read-only, so
-- billing uses its own check: an active school administrator of that school, suspended or not.
CREATE OR REPLACE FUNCTION public.billing_can_manage(_school UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.my_roles(_school) r WHERE r = 'school_admin')
$$;

CREATE OR REPLACE FUNCTION public.billing_start_order(_school UUID, _plan TEXT, _interval TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur TEXT;
  prof public.profiles;
BEGIN
  IF NOT public.billing_can_manage(_school) THEN RAISE EXCEPTION 'you cannot manage this school''s subscription' USING ERRCODE = '42501'; END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = public.my_profile_id(_school);
  SELECT p.code INTO cur FROM public.school_subscriptions ss JOIN public.plans p ON p.id = ss.plan_id WHERE ss.school_id = _school;
  RETURN public.billing_make_order(CASE WHEN cur = _plan THEN 'renewal' ELSE 'change_plan' END, _school, _plan, _interval, '{}', prof.email, prof.id);
END $$;

CREATE OR REPLACE FUNCTION public.my_billing(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.billing_can_manage(_school) THEN RAISE EXCEPTION 'you cannot view billing' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object('reference', o.reference, 'status', o.status, 'purpose', o.purpose, 'plan', o.plan_name,
        'interval', o.billing_interval, 'currency', o.currency, 'base_minor', o.base_minor, 'tax_minor', o.tax_minor, 'total_minor', o.total_minor,
        'tax_label', o.tax_label, 'channel', o.channel, 'demo', o.gateway = 'demo', 'created_at', o.created_at, 'paid_at', o.paid_at,
        'period_start', o.period_start, 'period_end', o.period_end) ORDER BY o.created_at DESC)
        FROM (SELECT * FROM public.billing_orders WHERE school_id = _school ORDER BY created_at DESC LIMIT 50) o), '[]'),
    'school', (SELECT name FROM public.schools WHERE id = _school),
    'settings', (SELECT jsonb_build_object('business_name', business_name, 'support_email', support_email, 'support_phone', support_phone,
        'terms_url', terms_url, 'privacy_url', privacy_url, 'cancellation_text', cancellation_text, 'refund_text', refund_text) FROM public.billing_settings),
    'label', public.subscription_label(_school),
    'school_status', (SELECT status FROM public.schools WHERE id = _school));
END $$;

-- The administrator's own view of the plan, now including the dates and the reason for any restriction.
CREATE OR REPLACE FUNCTION public.my_subscription(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ss public.school_subscriptions;
  p public.plans;
BEGIN
  IF NOT public.billing_can_manage(_school) THEN RAISE EXCEPTION 'you cannot view the subscription' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ss FROM public.school_subscriptions WHERE school_id = _school;
  IF NOT FOUND THEN RETURN jsonb_build_object('managed', false); END IF;
  SELECT * INTO p FROM public.plans WHERE id = ss.plan_id;
  RETURN jsonb_build_object('managed', true, 'plan', jsonb_build_object('code', p.code, 'name', p.name, 'description', p.description,
      'student_limit', p.student_limit, 'staff_limit', p.staff_limit, 'monthly_price', p.monthly_price, 'annual_price', p.annual_price,
      'currency', p.currency, 'entitlements', p.entitlements),
    'status', ss.status, 'label', public.subscription_label(_school), 'state', public.subscription_state(_school), 'started_on', ss.started_on,
    'trial_ends_on', ss.trial_ends_on, 'current_period_end', ss.current_period_end, 'grace_days', ss.grace_days,
    'grace_ends_on', ss.current_period_end + ss.grace_days, 'school_status', (SELECT status FROM public.schools WHERE id = _school),
    'usage', jsonb_build_object(
      'students', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.role = 'student' AND m.status IN ('invited', 'active')),
      'staff', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.role NOT IN ('student', 'parent') AND m.status IN ('invited', 'active'))));
END $$;

REVOKE EXECUTE ON FUNCTION public.billing_can_manage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_can_manage(UUID) TO authenticated;
