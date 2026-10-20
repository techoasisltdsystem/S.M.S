-- Phase 4: subscription billing with Paystack.
--
-- Payment is decided on the server only. The browser can ask for an order and read its status;
-- it cannot set an amount, a plan price, a status, or mark anything paid. Settling an order is a
-- server-only function (no grant to the API roles) called by the billing backend after it has
-- verified the transaction with Paystack. Orders keep a snapshot of the price they were sold at,
-- so later price changes never rewrite history.

-- ---------------------------------------------------------------------------
-- Package pricing fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.plans
  ADD COLUMN annual_price NUMERIC(10,2) CHECK (annual_price IS NULL OR annual_price >= 0),
  ADD COLUMN trial_days INT NOT NULL DEFAULT 0 CHECK (trial_days BETWEEN 0 AND 90),
  ADD COLUMN storage_limit_mb INT CHECK (storage_limit_mb IS NULL OR storage_limit_mb > 0),
  ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN highlights JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(highlights) = 'array');

UPDATE public.plans SET is_public = TRUE, annual_price = monthly_price * 10,
  highlights = '["Student and staff records","Attendance","Notices and calendar","Email support"]' WHERE code = 'starter';
UPDATE public.plans SET is_public = TRUE, annual_price = monthly_price * 10, is_recommended = TRUE, trial_days = 30,
  highlights = '["Everything in Starter","Exams and report cards","Assignments and messaging","Fees and payments","Parent and student sign-in"]' WHERE code = 'school';
UPDATE public.plans SET is_public = TRUE, annual_price = monthly_price * 10,
  highlights = '["Everything in School","Audit log and custom roles","Priority support","Onboarding help"]' WHERE code = 'campus';

-- ---------------------------------------------------------------------------
-- Platform billing settings (one row) and the history of billing changes
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_settings (
  id BOOLEAN NOT NULL PRIMARY KEY DEFAULT TRUE CHECK (id),
  business_name TEXT NOT NULL DEFAULT 'Tech Oasis',
  support_email TEXT,
  support_phone TEXT,
  terms_url TEXT,
  privacy_url TEXT,
  tax_rate_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate_percent BETWEEN 0 AND 50),
  tax_label TEXT NOT NULL DEFAULT 'VAT',
  grace_days INT NOT NULL DEFAULT 7 CHECK (grace_days BETWEEN 0 AND 60),
  reminder_days INT[] NOT NULL DEFAULT '{7,3,1,0,-3}',
  cancellation_text TEXT NOT NULL DEFAULT 'You can cancel any time. Access continues until the end of the period you paid for. Renewals are not charged automatically: we remind you before your plan ends and you renew with one click.',
  refund_text TEXT NOT NULL DEFAULT 'Payments are refundable only as set out in the Terms and Conditions. Contact support to ask for a refund.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.billing_settings DEFAULT VALUES;

CREATE TABLE public.billing_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_label TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT,
  before JSONB,
  after JSONB,
  reason TEXT
);

-- ---------------------------------------------------------------------------
-- Orders, payment events, subscription periods and reminders
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  claim_hash BYTEA NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('new_school', 'renewal', 'change_plan')),
  school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  plan_code TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  currency TEXT NOT NULL,
  base_minor BIGINT NOT NULL CHECK (base_minor > 0),
  tax_minor BIGINT NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor BIGINT NOT NULL CHECK (total_minor > 0),
  tax_label TEXT,
  draft JSONB NOT NULL DEFAULT '{}',
  customer_email TEXT NOT NULL,
  requested_by UUID,
  gateway TEXT NOT NULL DEFAULT 'paystack' CHECK (gateway IN ('paystack', 'demo')),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'paid', 'failed', 'abandoned', 'mismatch', 'refunded')),
  access_code TEXT,
  channel TEXT,
  gateway_response TEXT,
  gateway_transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  initialized_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  period_start DATE,
  period_end DATE,
  invite_token TEXT,
  invite_claimed_at TIMESTAMPTZ,
  CHECK (total_minor = base_minor + tax_minor),
  CHECK (purpose = 'new_school' OR school_id IS NOT NULL)
);
CREATE INDEX idx_billing_orders_school ON public.billing_orders (school_id, created_at DESC);
CREATE INDEX idx_billing_orders_status ON public.billing_orders (status, created_at DESC);

CREATE TABLE public.payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reference TEXT,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'verify', 'demo', 'reconcile')),
  event_type TEXT NOT NULL,
  external_id TEXT,
  signature_valid BOOLEAN,
  outcome TEXT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX idx_payment_events_external ON public.payment_events (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_payment_events_ref ON public.payment_events (reference, received_at DESC);

CREATE TABLE public.subscription_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  order_id UUID UNIQUE REFERENCES public.billing_orders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('purchase', 'renewal', 'plan_change')),
  plan_code TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  amount_minor BIGINT NOT NULL,
  currency TEXT NOT NULL,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_subscription_periods ON public.subscription_periods (school_id, starts_on DESC);

CREATE TABLE public.reminder_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  audience TEXT NOT NULL CHECK (audience IN ('platform', 'school')),
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
  interval_days INT NOT NULL,
  period_end DATE NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sent', 'failed', 'retried')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (school_id, audience, channel, interval_days, period_end)
);

ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_settings, public.billing_changes, public.billing_orders, public.payment_events,
  public.subscription_periods, public.reminder_log FROM anon, authenticated;

-- Payment records are written once and then only settle forward; they are never deleted.
CREATE OR REPLACE FUNCTION public.billing_records_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payment records cannot be deleted' USING ERRCODE = '42501'; END IF;
  IF TG_TABLE_NAME = 'billing_orders' THEN
    IF NEW.reference <> OLD.reference OR NEW.total_minor <> OLD.total_minor OR NEW.base_minor <> OLD.base_minor
       OR NEW.currency <> OLD.currency OR NEW.plan_id <> OLD.plan_id OR NEW.purpose <> OLD.purpose OR NEW.gateway <> OLD.gateway
       OR NEW.customer_email <> OLD.customer_email THEN
      RAISE EXCEPTION 'an order''s amount, plan and owner cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'paid' AND NEW.status NOT IN ('paid', 'refunded') THEN
      RAISE EXCEPTION 'a paid order cannot be reversed' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'these records cannot be edited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER billing_orders_guard BEFORE UPDATE OR DELETE ON public.billing_orders FOR EACH ROW EXECUTE FUNCTION public.billing_records_guard();
CREATE TRIGGER payment_events_guard BEFORE UPDATE OR DELETE ON public.payment_events FOR EACH ROW EXECUTE FUNCTION public.billing_records_guard();
CREATE TRIGGER subscription_periods_guard BEFORE UPDATE OR DELETE ON public.subscription_periods FOR EACH ROW EXECUTE FUNCTION public.billing_records_guard();

-- ---------------------------------------------------------------------------
-- Lifecycle: which status changes are allowed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_transition_ok(_old TEXT, _new TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _old IS NULL OR _old = _new OR CASE _old
    WHEN 'trial' THEN _new IN ('active', 'past_due', 'expired', 'cancelled')
    WHEN 'active' THEN _new IN ('past_due', 'expired', 'cancelled')
    WHEN 'past_due' THEN _new IN ('active', 'expired', 'cancelled')
    WHEN 'expired' THEN _new IN ('active', 'cancelled')
    WHEN 'cancelled' THEN _new IN ('active')
    ELSE FALSE END
$$;

-- The label the platform shows: the stored status, plus renewal_due and suspended.
CREATE OR REPLACE FUNCTION public.subscription_label(_school UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.status = 'suspended' THEN 'suspended'
    WHEN ss.school_id IS NULL THEN 'none'
    WHEN ss.status = 'active' AND ss.current_period_end IS NOT NULL AND ss.current_period_end BETWEEN current_date AND current_date + 14 THEN 'renewal_due'
    ELSE ss.status END
    FROM public.schools s LEFT JOIN public.school_subscriptions ss ON ss.school_id = s.id WHERE s.id = _school
$$;

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
  IF NOT public.subscription_transition_ok(old.status, _status) THEN
    RAISE EXCEPTION 'a % subscription cannot be changed to %', old.status, _status USING ERRCODE = '22023';
  END IF;
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

-- Extend (or give a complimentary extension to) a subscription. This is an administrative
-- adjustment: it never creates a payment record and never counts as revenue.
CREATE OR REPLACE FUNCTION public.platform_extend_subscription(_school UUID, _days INT, _complimentary BOOLEAN, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ss public.school_subscriptions;
  base DATE;
  newend DATE;
  who TEXT := public.audit_actor_label(auth.uid());
BEGIN
  PERFORM public.platform_only();
  IF _days IS NULL OR _days < 1 OR _days > 366 THEN RAISE EXCEPTION 'extend by 1 to 366 days' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) < 10 THEN RAISE EXCEPTION 'give a reason of at least 10 characters' USING ERRCODE = '22023'; END IF;
  SELECT * INTO ss FROM public.school_subscriptions WHERE school_id = _school FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'this school has no subscription' USING ERRCODE = '22023'; END IF;
  IF ss.status = 'cancelled' THEN RAISE EXCEPTION 'a cancelled subscription must be reactivated first' USING ERRCODE = '22023'; END IF;
  base := greatest(COALESCE(CASE WHEN ss.status = 'trial' THEN ss.trial_ends_on ELSE ss.current_period_end END, current_date), current_date);
  newend := base + _days;
  UPDATE public.school_subscriptions SET
      current_period_end = newend,
      trial_ends_on = CASE WHEN ss.status = 'trial' THEN newend ELSE ss.trial_ends_on END,
      status = CASE WHEN ss.status IN ('past_due', 'expired') THEN 'active' ELSE ss.status END,
      updated_at = now()
    WHERE school_id = _school;
  INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
  VALUES (_school, who, CASE WHEN _complimentary THEN 'complimentary_extension' ELSE 'extended' END, btrim(_reason),
          jsonb_build_object('days', _days, 'before', jsonb_build_object('status', ss.status, 'period_end', ss.current_period_end),
                             'after', jsonb_build_object('period_end', newend), 'payment', false));
  PERFORM public.write_audit(_school, 'billing_adjusted', 'school', _school, NULL,
    jsonb_build_object('kind', CASE WHEN _complimentary THEN 'complimentary_extension' ELSE 'extension' END, 'days', _days, 'new_end', newend, 'reason', btrim(_reason)));
  RETURN public.subscriptions_enforce() || jsonb_build_object('period_end', newend);
END $$;

-- ---------------------------------------------------------------------------
-- Public pricing and the browser-facing order functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_public_pricing()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'description', p.description, 'currency', p.currency,
        'monthly_price', p.monthly_price, 'annual_price', p.annual_price, 'student_limit', p.student_limit,
        'staff_limit', p.staff_limit, 'storage_limit_mb', p.storage_limit_mb, 'trial_days', p.trial_days,
        'recommended', p.is_recommended, 'highlights', p.highlights, 'entitlements', p.entitlements) ORDER BY p.sort_order)
      FROM public.plans p WHERE p.is_active AND p.is_public AND p.monthly_price > 0), '[]'),
    'settings', (SELECT jsonb_build_object('business_name', business_name, 'support_email', support_email, 'support_phone', support_phone,
        'terms_url', terms_url, 'privacy_url', privacy_url, 'tax_rate_percent', tax_rate_percent, 'tax_label', tax_label,
        'cancellation_text', cancellation_text, 'refund_text', refund_text) FROM public.billing_settings))
$$;

-- Internal: the amount for a plan and interval, from the stored price only.
CREATE OR REPLACE FUNCTION public.billing_price(_plan public.plans, _interval TEXT)
RETURNS TABLE (base_minor BIGINT, tax_minor BIGINT, total_minor BIGINT, tax_label TEXT)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  price NUMERIC;
  s public.billing_settings;
BEGIN
  IF _interval NOT IN ('monthly', 'yearly') THEN RAISE EXCEPTION 'choose monthly or yearly billing' USING ERRCODE = '22023'; END IF;
  price := CASE _interval WHEN 'monthly' THEN _plan.monthly_price ELSE _plan.annual_price END;
  IF price IS NULL OR price <= 0 THEN RAISE EXCEPTION 'this package is not available with % billing', _interval USING ERRCODE = '22023'; END IF;
  SELECT * INTO s FROM public.billing_settings;
  base_minor := round(price * 100)::bigint;
  tax_minor := round(base_minor * s.tax_rate_percent / 100)::bigint;
  total_minor := base_minor + tax_minor;
  tax_label := CASE WHEN s.tax_rate_percent > 0 THEN s.tax_label END;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.billing_slugify(_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(NULLIF(left(trim(both '-' from regexp_replace(lower(COALESCE(_name, '')), '[^a-z0-9]+', '-', 'g')), 40), ''), 'school')
$$;

CREATE OR REPLACE FUNCTION public.billing_make_order(
  _purpose TEXT, _school UUID, _plan_code TEXT, _interval TEXT, _draft JSONB, _email TEXT, _requested_by UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.plans;
  q RECORD;
  ref TEXT := 'TOS-' || upper(encode(gen_random_bytes(7), 'hex'));
  claim TEXT := encode(gen_random_bytes(24), 'hex');
BEGIN
  SELECT * INTO p FROM public.plans WHERE code = _plan_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'that package is not available' USING ERRCODE = '22023'; END IF;
  IF _purpose = 'new_school' AND NOT p.is_public THEN RAISE EXCEPTION 'that package is not available' USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM public.billing_price(p, _interval);
  -- Basic abuse limit: unfinished orders for one email.
  IF (SELECT count(*) FROM public.billing_orders WHERE customer_email = _email AND status IN ('created', 'pending') AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'too many unfinished checkouts for this email; wait a little and try again' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.billing_orders (reference, claim_hash, purpose, school_id, plan_id, plan_code, plan_name, billing_interval, currency,
      base_minor, tax_minor, total_minor, tax_label, draft, customer_email, requested_by)
  VALUES (ref, sha256(convert_to(claim, 'UTF8')), _purpose, _school, p.id, p.code, p.name, _interval, p.currency,
      q.base_minor, q.tax_minor, q.total_minor, q.tax_label, COALESCE(_draft, '{}'), _email, _requested_by);
  RETURN jsonb_build_object('reference', ref, 'claim', claim, 'plan', p.name, 'interval', _interval, 'currency', p.currency,
    'base_minor', q.base_minor, 'tax_minor', q.tax_minor, 'total_minor', q.total_minor, 'tax_label', q.tax_label);
END $$;

-- A new school buys a package. Nothing is created until the payment is verified.
CREATE OR REPLACE FUNCTION public.billing_start_signup(
  _plan TEXT, _interval TEXT, _school_name TEXT, _admin_name TEXT, _admin_email TEXT, _phone TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  addr TEXT := lower(btrim(COALESCE(_admin_email, '')));
  nm TEXT := btrim(COALESCE(_school_name, ''));
BEGIN
  IF length(nm) < 3 OR length(nm) > 100 THEN RAISE EXCEPTION 'enter the school''s name (3 to 100 characters)' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_admin_name, ''))) < 2 THEN RAISE EXCEPTION 'enter the administrator''s name' USING ERRCODE = '22023'; END IF;
  IF addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.schools WHERE lower(name) = lower(nm)) THEN
    RAISE EXCEPTION 'a school with this name is already registered; sign in to renew instead' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.billing_orders WHERE purpose = 'new_school' AND status = 'paid' AND lower(draft ->> 'school_name') = lower(nm)) THEN
    RAISE EXCEPTION 'a school with this name is already registered; sign in to renew instead' USING ERRCODE = '23505';
  END IF;
  RETURN public.billing_make_order('new_school', NULL, _plan, _interval,
    jsonb_build_object('school_name', nm, 'admin_name', btrim(_admin_name), 'admin_email', addr, 'phone', NULLIF(btrim(COALESCE(_phone, '')), '')), addr, NULL);
END $$;

-- A school administrator renews or changes the package.
CREATE OR REPLACE FUNCTION public.billing_start_order(_school UUID, _plan TEXT, _interval TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur TEXT;
  prof public.profiles;
BEGIN
  IF NOT public.has_permission(_school, 'staff.manage') THEN RAISE EXCEPTION 'you cannot manage this school''s subscription' USING ERRCODE = '42501'; END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = public.my_profile_id(_school);
  SELECT p.code INTO cur FROM public.school_subscriptions ss JOIN public.plans p ON p.id = ss.plan_id WHERE ss.school_id = _school;
  RETURN public.billing_make_order(CASE WHEN cur = _plan THEN 'renewal' ELSE 'change_plan' END, _school, _plan, _interval, '{}', prof.email, prof.id);
END $$;

-- What the browser may see about an order, proved by the claim code it was given.
CREATE OR REPLACE FUNCTION public.billing_order_status(_reference TEXT, _claim TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.billing_orders;
BEGIN
  SELECT * INTO o FROM public.billing_orders WHERE reference = _reference AND claim_hash = sha256(convert_to(COALESCE(_claim, ''), 'UTF8'));
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('reference', o.reference, 'status', o.status, 'purpose', o.purpose, 'plan', o.plan_name, 'interval', o.billing_interval,
    'currency', o.currency, 'base_minor', o.base_minor, 'tax_minor', o.tax_minor, 'total_minor', o.total_minor, 'tax_label', o.tax_label,
    'school', COALESCE((SELECT name FROM public.schools WHERE id = o.school_id), o.draft ->> 'school_name'),
    'admin_email', CASE WHEN o.purpose = 'new_school' THEN o.customer_email END,
    'channel', o.channel, 'demo', o.gateway = 'demo', 'paid_at', o.paid_at, 'period_start', o.period_start, 'period_end', o.period_end,
    'gateway_response', o.gateway_response, 'invite_ready', o.invite_token IS NOT NULL AND o.invite_claimed_at IS NULL);
END $$;

-- Hands the new administrator their one-time sign-up link, once, to whoever holds the claim code.
CREATE OR REPLACE FUNCTION public.billing_claim_invite(_reference TEXT, _claim TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.billing_orders;
  t TEXT;
BEGIN
  SELECT * INTO o FROM public.billing_orders WHERE reference = _reference AND claim_hash = sha256(convert_to(COALESCE(_claim, ''), 'UTF8')) FOR UPDATE;
  IF NOT FOUND OR o.status <> 'paid' OR o.invite_token IS NULL OR o.invite_claimed_at IS NOT NULL THEN RETURN NULL; END IF;
  t := o.invite_token;
  UPDATE public.billing_orders SET invite_token = NULL, invite_claimed_at = now() WHERE id = o.id;
  RETURN t;
END $$;

-- ---------------------------------------------------------------------------
-- Server-only functions (called by the billing backend after talking to Paystack)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_gateway_order(_reference TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.billing_orders;
BEGIN
  SELECT * INTO o FROM public.billing_orders WHERE reference = _reference;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('reference', o.reference, 'status', o.status, 'gateway', o.gateway, 'total_minor', o.total_minor, 'currency', o.currency,
    'email', o.customer_email, 'plan', o.plan_name, 'access_code', o.access_code);
END $$;

CREATE OR REPLACE FUNCTION public.billing_mark_initialized(_reference TEXT, _gateway TEXT, _access_code TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.billing_orders SET gateway = CASE WHEN status = 'created' THEN _gateway ELSE gateway END,
      status = CASE WHEN status = 'created' THEN 'pending' ELSE status END, access_code = COALESCE(_access_code, access_code),
      initialized_at = COALESCE(initialized_at, now())
   WHERE reference = _reference
$$;

CREATE OR REPLACE FUNCTION public.billing_record_event(
  _reference TEXT, _source TEXT, _event_type TEXT, _external_id TEXT, _signature_valid BOOLEAN, _outcome TEXT, _summary JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.payment_events (reference, source, event_type, external_id, signature_valid, outcome, summary)
  VALUES (_reference, _source, _event_type, _external_id, _signature_valid, _outcome, COALESCE(_summary, '{}'));
  RETURN TRUE;
EXCEPTION WHEN unique_violation THEN
  RETURN FALSE;   -- the same event was delivered twice
END $$;

CREATE OR REPLACE FUNCTION public.billing_add_interval(_from DATE, _interval TEXT)
RETURNS DATE LANGUAGE sql IMMUTABLE AS $$
  SELECT (_from + CASE _interval WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END)::date
$$;

-- Settle an order from a transaction the backend has verified with the gateway.
-- _verified = {status, amount_minor, currency, channel, paid_at, transaction_id, gateway_response}
-- Idempotent: settling a paid order again returns the same result and changes nothing.
CREATE OR REPLACE FUNCTION public.billing_settle(_reference TEXT, _verified JSONB, _allow_demo BOOLEAN DEFAULT FALSE)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.billing_orders;
  p public.plans;
  ss public.school_subscriptions;
  gw_status TEXT := lower(COALESCE(_verified ->> 'status', ''));
  sid UUID;
  boot JSONB;
  base_slug TEXT;
  cand TEXT;
  n INT := 0;
  pstart DATE;
  pend DATE;
  kind TEXT;
  demo BOOLEAN;
BEGIN
  SELECT * INTO o FROM public.billing_orders WHERE reference = _reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown order' USING ERRCODE = 'P0002'; END IF;
  demo := o.gateway = 'demo';
  IF o.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'status', 'paid', 'school_id', o.school_id);
  END IF;
  IF demo AND NOT COALESCE(_allow_demo, FALSE) THEN
    RAISE EXCEPTION 'demo payments are switched off on this server' USING ERRCODE = '42501';
  END IF;

  IF gw_status <> 'success' THEN
    UPDATE public.billing_orders SET verified_at = now(),
        status = CASE WHEN gw_status IN ('failed', 'reversed') THEN 'failed' WHEN gw_status = 'abandoned' THEN 'abandoned' ELSE status END,
        gateway_response = left(COALESCE(_verified ->> 'gateway_response', gw_status), 200)
      WHERE id = o.id;
    RETURN jsonb_build_object('ok', false, 'status', CASE WHEN gw_status IN ('failed', 'reversed') THEN 'failed' WHEN gw_status = 'abandoned' THEN 'abandoned' ELSE o.status END);
  END IF;

  IF (_verified ->> 'amount_minor')::bigint IS DISTINCT FROM o.total_minor OR upper(COALESCE(_verified ->> 'currency', '')) <> upper(o.currency) THEN
    UPDATE public.billing_orders SET status = 'mismatch', verified_at = now(),
        gateway_response = 'amount or currency did not match the order' WHERE id = o.id;
    RETURN jsonb_build_object('ok', false, 'status', 'mismatch');
  END IF;

  SELECT * INTO p FROM public.plans WHERE id = o.plan_id;
  IF o.purpose = 'new_school' THEN
    base_slug := public.billing_slugify(o.draft ->> 'school_name');
    cand := base_slug;
    WHILE EXISTS (SELECT 1 FROM public.schools s WHERE s.slug = cand) LOOP n := n + 1; cand := base_slug || '-' || n; END LOOP;
    boot := public.bootstrap_school(o.draft ->> 'school_name', cand, o.draft ->> 'admin_name', o.draft ->> 'admin_email');
    sid := (boot ->> 'school_id')::uuid;
    kind := 'purchase';
    pstart := current_date;
  ELSE
    sid := o.school_id;
    SELECT * INTO ss FROM public.school_subscriptions WHERE school_id = sid FOR UPDATE;
    kind := CASE o.purpose WHEN 'renewal' THEN 'renewal' ELSE 'plan_change' END;
    -- A renewal continues from the end of the current period; a lapsed one starts today.
    pstart := CASE WHEN o.purpose = 'renewal' AND ss.status IN ('active', 'trial') AND COALESCE(ss.current_period_end, current_date) >= current_date
                   THEN COALESCE(ss.current_period_end, current_date) ELSE current_date END;
  END IF;
  pend := public.billing_add_interval(pstart, o.billing_interval);

  INSERT INTO public.school_subscriptions (school_id, plan_id, status, started_on, trial_ends_on, current_period_end, grace_days)
  VALUES (sid, p.id, 'active', current_date, NULL, pend, (SELECT grace_days FROM public.billing_settings))
  ON CONFLICT (school_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', trial_ends_on = NULL,
      current_period_end = EXCLUDED.current_period_end, updated_at = now(),
      started_on = CASE WHEN public.school_subscriptions.status = 'trial' THEN current_date ELSE public.school_subscriptions.started_on END;

  UPDATE public.billing_orders SET status = 'paid', school_id = sid, verified_at = now(),
      paid_at = COALESCE(NULLIF(_verified ->> 'paid_at', '')::timestamptz, now()), period_start = pstart, period_end = pend,
      channel = left(_verified ->> 'channel', 40), gateway_transaction_id = left(_verified ->> 'transaction_id', 60),
      gateway_response = left(COALESCE(_verified ->> 'gateway_response', 'Successful'), 200),
      invite_token = CASE WHEN o.purpose = 'new_school' THEN boot ->> 'token' END
    WHERE id = o.id;
  INSERT INTO public.subscription_periods (school_id, order_id, kind, plan_code, starts_on, ends_on, amount_minor, currency, is_demo)
  VALUES (sid, o.id, kind, p.code, pstart, pend, o.total_minor, o.currency, demo);
  INSERT INTO public.subscription_events (school_id, actor_label, kind, note, details)
  VALUES (sid, CASE WHEN demo THEN 'demo payment' ELSE 'Paystack' END,
          CASE kind WHEN 'purchase' THEN 'payment_verified' WHEN 'renewal' THEN 'renewed' ELSE 'plan_changed' END,
          o.plan_name || ' ' || o.billing_interval || ' · ' || o.reference,
          jsonb_build_object('reference', o.reference, 'plan', p.code, 'period_start', pstart, 'period_end', pend, 'demo', demo, 'payment', true));
  PERFORM public.write_audit(sid, (CASE kind WHEN 'renewal' THEN 'subscription_renewed' ELSE 'payment_verified' END)::audit_action, 'school', sid, NULL,
    jsonb_build_object('reference', o.reference, 'plan', p.code, 'interval', o.billing_interval, 'demo', demo));
  PERFORM public.subscriptions_enforce();
  RETURN jsonb_build_object('ok', true, 'already', false, 'status', 'paid', 'school_id', sid, 'period_start', pstart, 'period_end', pend);
END $$;

REVOKE EXECUTE ON FUNCTION
  public.billing_gateway_order(TEXT), public.billing_mark_initialized(TEXT, TEXT, TEXT),
  public.billing_record_event(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB),
  public.billing_settle(TEXT, JSONB, BOOLEAN), public.billing_make_order(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, UUID),
  public.billing_price(public.plans, TEXT), public.billing_add_interval(DATE, TEXT), public.billing_records_guard()
FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.billing_public_pricing(), public.billing_start_signup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.billing_order_status(TEXT, TEXT), public.billing_claim_invite(TEXT, TEXT), public.billing_start_order(UUID, TEXT, TEXT),
  public.subscription_label(UUID), public.platform_extend_subscription(UUID, INT, BOOLEAN, TEXT), public.subscription_transition_ok(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_public_pricing(), public.billing_start_signup(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT),
  public.billing_order_status(TEXT, TEXT), public.billing_claim_invite(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_start_order(UUID, TEXT, TEXT), public.subscription_label(UUID),
  public.platform_extend_subscription(UUID, INT, BOOLEAN, TEXT) TO authenticated;
