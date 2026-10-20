-- A reset request gets one token, once. A second call (a double click, a retry) must not mint another.
CREATE OR REPLACE FUNCTION public.recovery_issue(_request UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.password_reset_requests;
  tok TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  SELECT * INTO r FROM public.password_reset_requests WHERE id = _request FOR UPDATE;
  IF NOT FOUND OR r.state <> 'requested' OR r.token_hash IS NOT NULL THEN RETURN NULL; END IF;
  UPDATE public.password_reset_requests SET token_hash = sha256(convert_to(tok, 'UTF8')), expires_at = now() + interval '1 hour' WHERE id = r.id;
  RETURN jsonb_build_object('email', r.email, 'token', tok);
END $$;
REVOKE EXECUTE ON FUNCTION public.recovery_issue(UUID) FROM PUBLIC, anon, authenticated;
