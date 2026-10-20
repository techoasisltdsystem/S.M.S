-- gen_random_bytes() lives in the pgcrypto extension, which hosted Postgres keeps in a schema that these
-- functions do not search. gen_random_uuid() is built in everywhere and is also random from the
-- operating system's secure source, so references, claim codes and reset tokens use it instead.
CREATE OR REPLACE FUNCTION public.billing_make_order(
  _purpose TEXT, _school UUID, _plan_code TEXT, _interval TEXT, _draft JSONB, _email TEXT, _requested_by UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.plans;
  q RECORD;
  ref TEXT := 'TOS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 14));
  claim TEXT := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  SELECT * INTO p FROM public.plans WHERE code = _plan_code AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'that package is not available' USING ERRCODE = '22023'; END IF;
  IF _purpose = 'new_school' AND NOT p.is_public THEN RAISE EXCEPTION 'that package is not available' USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM public.billing_price(p, _interval);
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

CREATE OR REPLACE FUNCTION public.recovery_issue(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.password_reset_requests;
  tok TEXT := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  SELECT * INTO r FROM public.password_reset_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND OR r.state <> 'requested' OR r.token_hash IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE public.password_reset_requests SET token_hash = sha256(convert_to(tok, 'UTF8')), expires_at = now() + interval '1 hour' WHERE id = r.id;
  RETURN jsonb_build_object('email', r.email, 'token', tok);
END $$;

CREATE OR REPLACE FUNCTION public.recovery_issue_for_email(_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  addr TEXT := lower(btrim(COALESCE(_email, '')));
  uid UUID;
  rid UUID;
  tok TEXT := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = addr;
  IF uid IS NULL THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.password_reset_requests WHERE email = addr AND created_at > now() - interval '1 hour') >= 3 THEN RETURN NULL; END IF;
  INSERT INTO public.password_reset_requests (source, email, requested_by_label, token_hash, expires_at)
  VALUES ('self', addr, 'the account holder', sha256(convert_to(tok, 'UTF8')), now() + interval '1 hour') RETURNING id INTO rid;
  RETURN jsonb_build_object('id', rid, 'email', addr, 'token', tok);
END $$;

REVOKE EXECUTE ON FUNCTION public.billing_make_order(TEXT, UUID, TEXT, TEXT, JSONB, TEXT, UUID),
  public.recovery_issue(UUID), public.recovery_issue_for_email(TEXT) FROM PUBLIC, anon, authenticated;
