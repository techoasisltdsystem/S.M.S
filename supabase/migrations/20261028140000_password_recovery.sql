-- Account recovery. A reset is a single-use link, valid for one hour, sent only to the address on the
-- account; nobody (including platform staff) ever sees a password or a token. The platform can start
-- a reset for a School Admin and sees its status; the link itself goes to the admin's inbox.
-- Only the digest of the token is stored.
CREATE TABLE public.password_reset_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('self', 'platform')),
  email TEXT NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT,
  target_profile_id UUID,
  requested_by_label TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'sent', 'failed', 'used', 'expired')),
  error TEXT,
  token_hash BYTEA,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
);
CREATE INDEX idx_reset_requests_email ON public.password_reset_requests (email, created_at DESC);
CREATE INDEX idx_reset_requests_school ON public.password_reset_requests (school_id, created_at DESC);
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_reset_requests FROM anon, authenticated;

-- Platform: start a reset for one School Admin of one school.
CREATE OR REPLACE FUNCTION public.platform_request_admin_reset(_school UUID, _profile UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  rid UUID;
BEGIN
  PERFORM public.platform_only();
  SELECT pr.* INTO p FROM public.profiles pr JOIN public.school_memberships m ON m.profile_id = pr.id AND m.school_id = pr.school_id
   WHERE pr.id = _profile AND pr.school_id = _school AND m.role = 'school_admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'that is not a School Admin of this school' USING ERRCODE = '22023'; END IF;
  IF p.user_id IS NULL THEN RAISE EXCEPTION 'this administrator has not created a login yet; resend their sign-up invitation instead' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.password_reset_requests WHERE email = lower(p.email) AND created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'too many reset requests for this account; try again in an hour' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.password_reset_requests (source, email, school_id, target_profile_id, requested_by_label)
  VALUES ('platform', lower(p.email), _school, p.id, public.audit_actor_label(auth.uid())) RETURNING id INTO rid;
  PERFORM public.write_audit(_school, 'password_reset_requested', 'user', p.id, p.full_name, jsonb_build_object('request', rid, 'by', 'platform'));
  RETURN jsonb_build_object('id', rid, 'email', lower(p.email));
END $$;

-- Platform, hosted providers only: the provider's own recovery email was triggered from the browser;
-- record how it went. (Local sign-in sends through the billing backend and records it there.)
CREATE OR REPLACE FUNCTION public.platform_mark_reset(_request UUID, _sent BOOLEAN, _error TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  UPDATE public.password_reset_requests SET state = CASE WHEN _sent THEN 'sent' ELSE 'failed' END,
      error = CASE WHEN _sent THEN NULL ELSE left(COALESCE(_error, 'The email could not be sent.'), 200) END,
      sent_at = CASE WHEN _sent THEN now() END
   WHERE id = _request AND source = 'platform' AND state = 'requested';
END $$;

CREATE OR REPLACE FUNCTION public.platform_reset_requests(_school UUID)
RETURNS TABLE (id UUID, at TIMESTAMPTZ, email TEXT, state TEXT, error TEXT, by TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT r.id, r.created_at,
         r.email,
         CASE WHEN r.state = 'sent' AND r.expires_at < now() THEN 'expired' ELSE r.state END, r.error, r.requested_by_label
    FROM public.password_reset_requests r WHERE r.school_id = _school ORDER BY r.created_at DESC LIMIT 20;
END $$;

-- Server-only: turn a request into a token (returned to the backend, never to a browser).
CREATE OR REPLACE FUNCTION public.recovery_issue(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.password_reset_requests;
  tok TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  SELECT * INTO r FROM public.password_reset_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND OR r.state <> 'requested' THEN RETURN NULL; END IF;
  UPDATE public.password_reset_requests SET token_hash = sha256(convert_to(tok, 'UTF8')), expires_at = now() + interval '1 hour' WHERE id = r.id;
  RETURN jsonb_build_object('email', r.email, 'token', tok);
END $$;

-- Server-only: "I forgot my password" for any account. Unknown addresses return NULL and the caller
-- gives the same answer either way.
CREATE OR REPLACE FUNCTION public.recovery_issue_for_email(_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  addr TEXT := lower(btrim(COALESCE(_email, '')));
  uid UUID;
  rid UUID;
  tok TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email) = addr;
  IF uid IS NULL THEN RETURN NULL; END IF;
  IF (SELECT count(*) FROM public.password_reset_requests WHERE email = addr AND created_at > now() - interval '1 hour') >= 3 THEN RETURN NULL; END IF;
  INSERT INTO public.password_reset_requests (source, email, requested_by_label, token_hash, expires_at)
  VALUES ('self', addr, 'the account holder', sha256(convert_to(tok, 'UTF8')), now() + interval '1 hour') RETURNING id INTO rid;
  RETURN jsonb_build_object('id', rid, 'email', addr, 'token', tok);
END $$;

CREATE OR REPLACE FUNCTION public.recovery_mark(_request UUID, _sent BOOLEAN, _error TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.password_reset_requests SET state = CASE WHEN _sent THEN 'sent' ELSE 'failed' END,
      error = CASE WHEN _sent THEN NULL ELSE left(COALESCE(_error, 'The email could not be sent.'), 200) END,
      sent_at = CASE WHEN _sent THEN now() END,
      token_hash = CASE WHEN _sent THEN token_hash ELSE NULL END
   WHERE id = _request
$$;

REVOKE EXECUTE ON FUNCTION public.recovery_issue(UUID), public.recovery_issue_for_email(TEXT), public.recovery_mark(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_request_admin_reset(UUID, UUID), public.platform_mark_reset(UUID, BOOLEAN, TEXT), public.platform_reset_requests(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_request_admin_reset(UUID, UUID), public.platform_mark_reset(UUID, BOOLEAN, TEXT), public.platform_reset_requests(UUID) TO authenticated;
