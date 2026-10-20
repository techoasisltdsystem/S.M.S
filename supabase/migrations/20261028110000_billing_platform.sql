-- Phase 4 (continued): what the Super Admin and the School Admin can read and do about billing,
-- and the scheduled reminder/expiry job. All of it is narrow functions; the tables stay closed.

-- ---------------------------------------------------------------------------
-- Settings and packages
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_billing_settings()
RETURNS public.billing_settings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.billing_settings;
BEGIN
  PERFORM public.platform_only();
  SELECT * INTO s FROM public.billing_settings;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_billing_settings(
  _business_name TEXT, _support_email TEXT, _support_phone TEXT, _terms_url TEXT, _privacy_url TEXT,
  _tax_rate NUMERIC, _tax_label TEXT, _grace_days INT, _reminder_days INT[], _cancellation TEXT, _refund TEXT, _reason TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old public.billing_settings;
BEGIN
  PERFORM public.platform_only();
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'say why the settings are changing' USING ERRCODE = '22023'; END IF;
  IF _reminder_days IS NULL OR cardinality(_reminder_days) = 0 OR cardinality(_reminder_days) > 8
     OR EXISTS (SELECT 1 FROM unnest(_reminder_days) d WHERE d < -30 OR d > 90) THEN
    RAISE EXCEPTION 'reminders: give up to 8 days between -30 (after expiry) and 90 (before)' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO old FROM public.billing_settings;
  UPDATE public.billing_settings SET business_name = btrim(_business_name), support_email = NULLIF(btrim(COALESCE(_support_email, '')), ''),
      support_phone = NULLIF(btrim(COALESCE(_support_phone, '')), ''), terms_url = NULLIF(btrim(COALESCE(_terms_url, '')), ''),
      privacy_url = NULLIF(btrim(COALESCE(_privacy_url, '')), ''), tax_rate_percent = _tax_rate, tax_label = btrim(_tax_label),
      grace_days = _grace_days, reminder_days = (SELECT array_agg(DISTINCT d ORDER BY d DESC) FROM unnest(_reminder_days) d),
      cancellation_text = _cancellation, refund_text = _refund, updated_at = now();
  INSERT INTO public.billing_changes (actor_label, kind, subject, before, after, reason)
  VALUES (public.audit_actor_label(auth.uid()), 'settings_saved', 'billing settings', to_jsonb(old), to_jsonb((SELECT s FROM public.billing_settings s)), btrim(_reason));
END $$;

CREATE OR REPLACE FUNCTION public.platform_save_plan(
  _code TEXT, _name TEXT, _description TEXT, _monthly NUMERIC, _annual NUMERIC, _currency TEXT, _trial_days INT,
  _student_limit INT, _staff_limit INT, _storage_mb INT, _entitlements JSONB, _highlights JSONB,
  _public BOOLEAN, _recommended BOOLEAN, _active BOOLEAN, _reason TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old public.plans;
  pid UUID;
  c TEXT := lower(btrim(COALESCE(_code, '')));
BEGIN
  PERFORM public.platform_only();
  IF c !~ '^[a-z0-9_]{2,30}$' THEN RAISE EXCEPTION 'the code must be 2 to 30 letters, numbers or underscores' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_name, ''))) = 0 THEN RAISE EXCEPTION 'enter a package name' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 5 THEN RAISE EXCEPTION 'say why the package is changing' USING ERRCODE = '22023'; END IF;
  IF COALESCE(_monthly, -1) < 0 OR (_annual IS NOT NULL AND _annual < 0) THEN RAISE EXCEPTION 'prices cannot be negative' USING ERRCODE = '22023'; END IF;
  IF upper(COALESCE(_currency, '')) !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'use a 3-letter currency code such as GHS' USING ERRCODE = '22023'; END IF;
  IF jsonb_typeof(COALESCE(_entitlements, '{}')) <> 'object' OR jsonb_typeof(COALESCE(_highlights, '[]')) <> 'array' THEN
    RAISE EXCEPTION 'entitlements must be on/off switches and highlights a list' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO old FROM public.plans WHERE code = c;
  INSERT INTO public.plans (code, name, description, monthly_price, annual_price, currency, trial_days, student_limit, staff_limit,
      storage_limit_mb, entitlements, highlights, is_public, is_recommended, is_active)
  VALUES (c, btrim(_name), NULLIF(btrim(COALESCE(_description, '')), ''), _monthly, _annual, upper(_currency), COALESCE(_trial_days, 0), _student_limit,
      _staff_limit, _storage_mb, COALESCE(_entitlements, '{}'), COALESCE(_highlights, '[]'), COALESCE(_public, false), COALESCE(_recommended, false), COALESCE(_active, true))
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, monthly_price = EXCLUDED.monthly_price,
      annual_price = EXCLUDED.annual_price, currency = EXCLUDED.currency, trial_days = EXCLUDED.trial_days, student_limit = EXCLUDED.student_limit,
      staff_limit = EXCLUDED.staff_limit, storage_limit_mb = EXCLUDED.storage_limit_mb, entitlements = EXCLUDED.entitlements,
      highlights = EXCLUDED.highlights, is_public = EXCLUDED.is_public, is_recommended = EXCLUDED.is_recommended, is_active = EXCLUDED.is_active,
      updated_at = now()
  RETURNING id INTO pid;
  IF _recommended THEN UPDATE public.plans SET is_recommended = FALSE WHERE id <> pid; END IF;
  INSERT INTO public.billing_changes (actor_label, kind, subject, before, after, reason)
  VALUES (public.audit_actor_label(auth.uid()), CASE WHEN old.id IS NULL THEN 'plan_created' ELSE 'plan_saved' END, c, to_jsonb(old),
          to_jsonb((SELECT p FROM public.plans p WHERE p.id = pid)), btrim(_reason));
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.platform_billing_changes()
RETURNS SETOF public.billing_changes LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY SELECT * FROM public.billing_changes ORDER BY at DESC LIMIT 100;
END $$;

-- ---------------------------------------------------------------------------
-- Overview with statistics and chart data (all from the tables)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_billing_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN jsonb_build_object(
    'clients', (SELECT count(*) FROM public.schools),
    'active', (SELECT count(*) FROM public.school_subscriptions WHERE status = 'active'),
    'expiring_soon', (SELECT count(*) FROM public.school_subscriptions WHERE status IN ('active', 'trial') AND COALESCE(CASE WHEN status = 'trial' THEN trial_ends_on ELSE current_period_end END, 'infinity'::date) BETWEEN current_date + 1 AND current_date + 7),
    'expiring_today', (SELECT count(*) FROM public.school_subscriptions WHERE status IN ('active', 'trial') AND COALESCE(CASE WHEN status = 'trial' THEN trial_ends_on ELSE current_period_end END, 'infinity'::date) = current_date),
    'expired', (SELECT count(*) FROM public.school_subscriptions WHERE status = 'expired'),
    'past_due', (SELECT count(*) FROM public.school_subscriptions WHERE status = 'past_due'),
    'cancelled', (SELECT count(*) FROM public.school_subscriptions WHERE status = 'cancelled'),
    'trials', (SELECT count(*) FROM public.school_subscriptions WHERE status = 'trial'),
    'suspended', (SELECT count(*) FROM public.schools WHERE status = 'suspended'),
    'awaiting_payment', (SELECT count(*) FROM public.billing_orders WHERE status IN ('created', 'pending') AND created_at > now() - interval '2 days'),
    'failed_payments', (SELECT count(*) FROM public.billing_orders WHERE status IN ('failed', 'abandoned', 'mismatch') AND created_at > now() - interval '30 days'),
    'revenue', COALESCE((SELECT jsonb_agg(jsonb_build_object('currency', currency, 'total_minor', t, 'orders', n)) FROM
        (SELECT currency, sum(total_minor) AS t, count(*) AS n FROM public.billing_orders WHERE status = 'paid' AND gateway <> 'demo' GROUP BY currency) x), '[]'),
    'pending', COALESCE((SELECT jsonb_agg(jsonb_build_object('currency', currency, 'total_minor', t)) FROM
        (SELECT currency, sum(total_minor) AS t FROM public.billing_orders WHERE status IN ('created', 'pending') AND created_at > now() - interval '2 days' GROUP BY currency) x), '[]'),
    'refunded', COALESCE((SELECT jsonb_agg(jsonb_build_object('currency', currency, 'total_minor', t)) FROM
        (SELECT currency, sum(total_minor) AS t FROM public.billing_orders WHERE status = 'refunded' AND gateway <> 'demo' GROUP BY currency) x), '[]'),
    'demo_paid', (SELECT count(*) FROM public.billing_orders WHERE status = 'paid' AND gateway = 'demo'),
    'growth', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'schools', (SELECT count(*) FROM public.schools s WHERE date_trunc('month', s.created_at) = m)) ORDER BY m)
        FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m), '[]'),
    'revenue_by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'total_minor', COALESCE((SELECT sum(o.total_minor) FROM public.billing_orders o WHERE o.status = 'paid' AND o.gateway <> 'demo' AND date_trunc('month', o.paid_at) = m), 0)) ORDER BY m)
        FROM generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m), '[]'),
    'by_package', (SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', n) ORDER BY sort_order), '[]')
        FROM (SELECT p.name, p.sort_order, count(ss.school_id) AS n FROM public.plans p LEFT JOIN public.school_subscriptions ss ON ss.plan_id = p.id GROUP BY p.id) x WHERE n > 0),
    'renewals', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
          'renewals', (SELECT count(*) FROM public.subscription_periods sp WHERE sp.kind = 'renewal' AND NOT sp.is_demo AND date_trunc('month', sp.created_at) = m),
          'expiries', (SELECT count(*) FROM public.school_subscriptions ss WHERE date_trunc('month', ss.current_period_end) = m)) ORDER BY m)
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()) + interval '2 months', interval '1 month') m), '[]'));
END $$;

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_clients(
  _search TEXT DEFAULT NULL, _status TEXT DEFAULT NULL, _plan TEXT DEFAULT NULL, _sort TEXT DEFAULT 'name', _limit INT DEFAULT 20, _offset INT DEFAULT 0
) RETURNS TABLE (
  school_id UUID, school_name TEXT, slug TEXT, registered_at TIMESTAMPTZ, admin_name TEXT, admin_email TEXT, admin_status TEXT,
  plan_code TEXT, plan_name TEXT, label TEXT, started_on DATE, period_end DATE, days_left INT, paid_minor BIGINT, currency TEXT, total_rows BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  WITH c AS (
    SELECT s.id, s.name, s.slug, s.created_at,
           a.full_name AS an, a.email AS ae, a.status::text AS ast,
           p.code AS pc, p.name AS pn, public.subscription_label(s.id) AS lbl, ss.started_on AS so,
           CASE WHEN ss.status = 'trial' THEN ss.trial_ends_on ELSE ss.current_period_end END AS pe,
           COALESCE((SELECT sum(o.total_minor) FROM public.billing_orders o WHERE o.school_id = s.id AND o.status = 'paid' AND o.gateway <> 'demo'), 0)::bigint AS paid,
           p.currency AS cur
      FROM public.schools s
      LEFT JOIN public.school_subscriptions ss ON ss.school_id = s.id
      LEFT JOIN public.plans p ON p.id = ss.plan_id
      LEFT JOIN LATERAL (
        SELECT pr.full_name, pr.email, m.status FROM public.school_memberships m JOIN public.profiles pr ON pr.id = m.profile_id
         WHERE m.school_id = s.id AND m.role = 'school_admin' ORDER BY (m.status = 'active') DESC, m.created_at LIMIT 1) a ON TRUE
     WHERE (_search IS NULL OR btrim(_search) = '' OR s.name ILIKE '%' || btrim(_search) || '%' OR a.email ILIKE '%' || btrim(_search) || '%' OR a.full_name ILIKE '%' || btrim(_search) || '%')
       AND (_plan IS NULL OR _plan = '' OR p.code = _plan)
       AND (_status IS NULL OR _status = '' OR public.subscription_label(s.id) = _status))
  SELECT c.id, c.name, c.slug, c.created_at, c.an, c.ae, c.ast, c.pc, c.pn, c.lbl, c.so, c.pe, (c.pe - current_date)::int, c.paid, c.cur, count(*) OVER ()
    FROM c
   ORDER BY CASE WHEN _sort = 'expiry' THEN c.pe END ASC NULLS LAST,
            CASE WHEN _sort = 'newest' THEN c.created_at END DESC,
            CASE WHEN _sort = 'revenue' THEN c.paid END DESC,
            c.name
   LIMIT least(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0);
END $$;

CREATE OR REPLACE FUNCTION public.platform_client(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = _school) THEN RAISE EXCEPTION 'school not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object(
    'school', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'status', s.status, 'registered_at', s.created_at,
                 'country', c.country, 'currency', c.currency) FROM public.schools s LEFT JOIN public.school_config c ON c.school_id = s.id WHERE s.id = _school),
    'admins', COALESCE((SELECT jsonb_agg(jsonb_build_object('profile_id', pr.id, 'name', pr.full_name, 'email', pr.email, 'status', m.status,
                 'signed_in', pr.user_id IS NOT NULL) ORDER BY m.created_at)
                 FROM public.school_memberships m JOIN public.profiles pr ON pr.id = m.profile_id WHERE m.school_id = _school AND m.role = 'school_admin'), '[]'),
    'subscription', (SELECT jsonb_build_object('plan_code', p.code, 'plan_name', p.name, 'monthly_price', p.monthly_price, 'annual_price', p.annual_price,
                 'currency', p.currency, 'student_limit', p.student_limit, 'staff_limit', p.staff_limit, 'entitlements', p.entitlements,
                 'status', ss.status, 'label', public.subscription_label(_school), 'state', public.subscription_state(_school),
                 'started_on', ss.started_on, 'trial_ends_on', ss.trial_ends_on, 'period_end', ss.current_period_end, 'grace_days', ss.grace_days,
                 'grace_ends_on', ss.current_period_end + ss.grace_days, 'days_left', ss.current_period_end - current_date, 'notes', ss.notes)
                 FROM public.school_subscriptions ss JOIN public.plans p ON p.id = ss.plan_id WHERE ss.school_id = _school),
    'periods', COALESCE((SELECT jsonb_agg(to_jsonb(sp) - 'school_id' ORDER BY sp.starts_on DESC) FROM public.subscription_periods sp WHERE sp.school_id = _school), '[]'),
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object('reference', o.reference, 'status', o.status, 'purpose', o.purpose, 'plan', o.plan_name,
                 'interval', o.billing_interval, 'currency', o.currency, 'total_minor', o.total_minor, 'channel', o.channel, 'demo', o.gateway = 'demo',
                 'created_at', o.created_at, 'paid_at', o.paid_at, 'gateway_response', o.gateway_response) ORDER BY o.created_at DESC)
                 FROM (SELECT * FROM public.billing_orders WHERE school_id = _school ORDER BY created_at DESC LIMIT 50) o), '[]'),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object('at', e.at, 'actor', e.actor_label, 'kind', e.kind, 'note', e.note, 'details', e.details) ORDER BY e.at DESC)
                 FROM (SELECT * FROM public.subscription_events WHERE school_id = _school ORDER BY at DESC LIMIT 100) e), '[]'),
    'reminders', COALESCE((SELECT jsonb_agg(jsonb_build_object('at', r.created_at, 'audience', r.audience, 'channel', r.channel, 'interval_days', r.interval_days,
                 'period_end', r.period_end, 'state', r.state, 'attempts', r.attempts, 'error', r.last_error) ORDER BY r.created_at DESC)
                 FROM (SELECT * FROM public.reminder_log WHERE school_id = _school ORDER BY created_at DESC LIMIT 40) r), '[]'),
    'support', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', q.id, 'subject', q.subject, 'status', q.status, 'priority', q.priority, 'updated_at', q.updated_at) ORDER BY q.updated_at DESC)
                 FROM (SELECT * FROM public.support_requests WHERE school_id = _school ORDER BY updated_at DESC LIMIT 10) q), '[]'),
    'usage', jsonb_build_object(
      'students', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.role = 'student' AND m.status IN ('invited', 'active')),
      'staff', (SELECT count(DISTINCT m.profile_id) FROM public.school_memberships m WHERE m.school_id = _school AND m.role NOT IN ('student', 'parent') AND m.status IN ('invited', 'active'))));
END $$;

-- ---------------------------------------------------------------------------
-- Transactions and reconciliation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_transactions(
  _status TEXT DEFAULT NULL, _search TEXT DEFAULT NULL, _school UUID DEFAULT NULL, _limit INT DEFAULT 25, _offset INT DEFAULT 0
) RETURNS TABLE (
  reference TEXT, school_id UUID, school_name TEXT, plan TEXT, billing_interval TEXT, purpose TEXT, currency TEXT, total_minor BIGINT, status TEXT,
  channel TEXT, demo BOOLEAN, created_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, verified_at TIMESTAMPTZ, gateway_response TEXT, customer_email TEXT, total_rows BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT o.reference, o.school_id, COALESCE(s.name, o.draft ->> 'school_name'), o.plan_name, o.billing_interval, o.purpose, o.currency, o.total_minor, o.status,
         o.channel, o.gateway = 'demo', o.created_at, o.paid_at, o.verified_at, o.gateway_response, o.customer_email, count(*) OVER ()
    FROM public.billing_orders o LEFT JOIN public.schools s ON s.id = o.school_id
   WHERE (_status IS NULL OR _status = '' OR o.status = _status)
     AND (_school IS NULL OR o.school_id = _school)
     AND (_search IS NULL OR btrim(_search) = '' OR o.reference ILIKE '%' || btrim(_search) || '%' OR o.customer_email ILIKE '%' || btrim(_search) || '%'
          OR COALESCE(s.name, o.draft ->> 'school_name') ILIKE '%' || btrim(_search) || '%')
   ORDER BY o.created_at DESC
   LIMIT least(GREATEST(_limit, 1), 200) OFFSET GREATEST(_offset, 0);
END $$;

-- Things that do not add up. Each row is a problem someone should look at.
CREATE OR REPLACE FUNCTION public.platform_reconciliation()
RETURNS TABLE (issue TEXT, reference TEXT, school_name TEXT, detail TEXT, at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT 'paid_without_period'::text, o.reference, s.name, 'Order is paid but has no subscription period.', o.paid_at
    FROM public.billing_orders o JOIN public.schools s ON s.id = o.school_id
   WHERE o.status = 'paid' AND NOT EXISTS (SELECT 1 FROM public.subscription_periods sp WHERE sp.order_id = o.id)
  UNION ALL
  SELECT 'amount_mismatch', o.reference, COALESCE(s.name, o.draft ->> 'school_name'), 'The gateway reported a different amount or currency than the order. No access was granted.', o.verified_at
    FROM public.billing_orders o LEFT JOIN public.schools s ON s.id = o.school_id WHERE o.status = 'mismatch'
  UNION ALL
  SELECT 'stuck_pending', o.reference, COALESCE(s.name, o.draft ->> 'school_name'), 'Payment started more than an hour ago and is still unconfirmed.', o.created_at
    FROM public.billing_orders o LEFT JOIN public.schools s ON s.id = o.school_id
   WHERE o.status = 'pending' AND o.created_at < now() - interval '1 hour'
  UNION ALL
  SELECT 'event_without_order', e.reference, NULL, 'A payment event arrived for a reference we do not have.', e.received_at
    FROM public.payment_events e WHERE e.reference IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_orders o WHERE o.reference = e.reference)
  UNION ALL
  SELECT 'bad_signature', e.reference, NULL, 'A webhook with an invalid signature was rejected.', e.received_at
    FROM public.payment_events e WHERE e.signature_valid IS FALSE AND e.received_at > now() - interval '7 days'
  ORDER BY 5 DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.platform_payment_events(_reference TEXT)
RETURNS TABLE (received_at TIMESTAMPTZ, source TEXT, event_type TEXT, signature_valid BOOLEAN, outcome TEXT, summary JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY SELECT e.received_at, e.source, e.event_type, e.signature_valid, e.outcome, e.summary FROM public.payment_events e WHERE e.reference = _reference ORDER BY e.received_at;
END $$;

-- ---------------------------------------------------------------------------
-- The School Admin's own billing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_billing(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'staff.manage') THEN RAISE EXCEPTION 'you cannot view billing' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object('reference', o.reference, 'status', o.status, 'purpose', o.purpose, 'plan', o.plan_name,
        'interval', o.billing_interval, 'currency', o.currency, 'base_minor', o.base_minor, 'tax_minor', o.tax_minor, 'total_minor', o.total_minor,
        'tax_label', o.tax_label, 'channel', o.channel, 'demo', o.gateway = 'demo', 'created_at', o.created_at, 'paid_at', o.paid_at,
        'period_start', o.period_start, 'period_end', o.period_end) ORDER BY o.created_at DESC)
        FROM (SELECT * FROM public.billing_orders WHERE school_id = _school ORDER BY created_at DESC LIMIT 50) o), '[]'),
    'school', (SELECT name FROM public.schools WHERE id = _school),
    'settings', (SELECT jsonb_build_object('business_name', business_name, 'support_email', support_email, 'support_phone', support_phone,
        'terms_url', terms_url, 'privacy_url', privacy_url, 'cancellation_text', cancellation_text, 'refund_text', refund_text) FROM public.billing_settings),
    'label', public.subscription_label(_school));
END $$;

-- ---------------------------------------------------------------------------
-- Expiry processing and reminders (runs from the monitor job)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_reminder_tick()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.billing_settings;
  s RECORD;
  d INT;
  made INT := 0;
  moved INT := 0;
  pe DATE;
  title TEXT;
  adm UUID;
  ins INT;
BEGIN
  SELECT * INTO cfg FROM public.billing_settings;
  -- Lifecycle: unpaid periods move to past_due, then to expired after the grace period.
  FOR s IN SELECT ss.*, sc.name AS school_name FROM public.school_subscriptions ss JOIN public.schools sc ON sc.id = ss.school_id
            WHERE ss.status IN ('trial', 'active', 'past_due') LOOP
    pe := CASE WHEN s.status = 'trial' THEN s.trial_ends_on ELSE s.current_period_end END;
    CONTINUE WHEN pe IS NULL;
    IF s.status IN ('trial', 'active') AND pe < current_date THEN
      UPDATE public.school_subscriptions SET status = 'past_due', current_period_end = pe, updated_at = now() WHERE school_id = s.school_id;
      INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
      VALUES (s.school_id, 'system', 'past_due', 'The period ended without a verified renewal.', jsonb_build_object('period_end', pe, 'previous', s.status));
      moved := moved + 1;
    ELSIF s.status = 'past_due' AND pe + s.grace_days < current_date THEN
      UPDATE public.school_subscriptions SET status = 'expired', updated_at = now() WHERE school_id = s.school_id;
      INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
      VALUES (s.school_id, 'system', 'expired', 'The grace period ended without a verified renewal.', jsonb_build_object('period_end', pe));
      moved := moved + 1;
    END IF;
  END LOOP;

  -- Reminders: one per school, audience, channel, interval and period; never repeated.
  FOR s IN SELECT ss.*, sc.name AS school_name, p.name AS plan_name, p.monthly_price FROM public.school_subscriptions ss
             JOIN public.schools sc ON sc.id = ss.school_id JOIN public.plans p ON p.id = ss.plan_id
            WHERE ss.status IN ('trial', 'active', 'past_due', 'expired') AND p.monthly_price > 0 LOOP
    pe := CASE WHEN s.status = 'trial' THEN s.trial_ends_on ELSE s.current_period_end END;
    CONTINUE WHEN pe IS NULL;
    d := pe - current_date;                       -- positive: days left, negative: days since expiry
    CONTINUE WHEN NOT (d = ANY (cfg.reminder_days));
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.subscription_periods sp WHERE sp.school_id = s.school_id AND sp.ends_on > pe);  -- already renewed
    title := CASE WHEN d > 0 THEN 'Subscription ends in ' || d || CASE WHEN d = 1 THEN ' day' ELSE ' days' END
                  WHEN d = 0 THEN 'Subscription ends today' ELSE 'Subscription ended ' || (-d) || CASE WHEN d = -1 THEN ' day ago' ELSE ' days ago' END END;
    -- platform + school in-app reminders (the school's administrators are notified once, when the row is new)
    INSERT INTO public.reminder_log (school_id, audience, channel, interval_days, period_end, state)
    VALUES (s.school_id, 'platform', 'in_app', d, pe, 'sent') ON CONFLICT DO NOTHING;
    INSERT INTO public.reminder_log (school_id, audience, channel, interval_days, period_end, state)
    VALUES (s.school_id, 'school', 'in_app', d, pe, 'sent') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS ins = ROW_COUNT;
    IF ins > 0 THEN
      FOR adm IN SELECT m.profile_id FROM public.school_memberships m WHERE m.school_id = s.school_id AND m.role = 'school_admin' AND m.status = 'active' LOOP
        PERFORM public.notify(s.school_id, adm, 'subscription_reminder', title, 'Renew from Subscription to keep every feature available.', '/subscription');
      END LOOP;
      made := made + 1;
    END IF;
    -- email is only queued: nothing here sends mail, and it is shown as queued until a mailer is connected
    INSERT INTO public.reminder_log (school_id, audience, channel, interval_days, period_end, state)
    VALUES (s.school_id, 'platform', 'email', d, pe, 'queued'), (s.school_id, 'school', 'email', d, pe, 'queued') ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN jsonb_build_object('status_changes', moved, 'reminders', made);
END $$;

CREATE OR REPLACE FUNCTION public.audit_monitor_tick()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.billing_reminder_tick();
  PERFORM public.subscriptions_enforce();
  RETURN public.audit_run_health_check('scheduled', NULL);
END $$;

CREATE OR REPLACE FUNCTION public.platform_reminders(_unacknowledged_only BOOLEAN DEFAULT FALSE)
RETURNS TABLE (id UUID, at TIMESTAMPTZ, school_id UUID, school_name TEXT, plan TEXT, interval_days INT, period_end DATE, status TEXT, label TEXT, acknowledged BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT r.id, r.created_at, r.school_id, s.name, p.name, r.interval_days, r.period_end, ss.status, public.subscription_label(r.school_id), r.acknowledged_at IS NOT NULL
    FROM public.reminder_log r JOIN public.schools s ON s.id = r.school_id
    LEFT JOIN public.school_subscriptions ss ON ss.school_id = r.school_id LEFT JOIN public.plans p ON p.id = ss.plan_id
   WHERE r.audience = 'platform' AND r.channel = 'in_app' AND (NOT _unacknowledged_only OR r.acknowledged_at IS NULL)
   ORDER BY r.created_at DESC LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.platform_ack_reminders()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  PERFORM public.platform_only();
  UPDATE public.reminder_log SET acknowledged_at = now() WHERE audience = 'platform' AND channel = 'in_app' AND acknowledged_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.billing_reminder_tick() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION
  public.platform_billing_settings(), public.platform_save_billing_settings(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, INT, INT[], TEXT, TEXT, TEXT),
  public.platform_save_plan(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INT, INT, INT, INT, JSONB, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, TEXT),
  public.platform_billing_changes(), public.platform_billing_overview(),
  public.platform_clients(TEXT, TEXT, TEXT, TEXT, INT, INT), public.platform_client(UUID),
  public.platform_transactions(TEXT, TEXT, UUID, INT, INT), public.platform_reconciliation(), public.platform_payment_events(TEXT),
  public.my_billing(UUID), public.platform_reminders(BOOLEAN), public.platform_ack_reminders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.platform_billing_settings(), public.platform_save_billing_settings(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, TEXT, INT, INT[], TEXT, TEXT, TEXT),
  public.platform_save_plan(TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INT, INT, INT, INT, JSONB, JSONB, BOOLEAN, BOOLEAN, BOOLEAN, TEXT),
  public.platform_billing_changes(), public.platform_billing_overview(),
  public.platform_clients(TEXT, TEXT, TEXT, TEXT, INT, INT), public.platform_client(UUID),
  public.platform_transactions(TEXT, TEXT, UUID, INT, INT), public.platform_reconciliation(), public.platform_payment_events(TEXT),
  public.my_billing(UUID), public.platform_reminders(BOOLEAN), public.platform_ack_reminders() TO authenticated;
