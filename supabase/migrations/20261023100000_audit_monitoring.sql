-- Phase C: audit failure detection, incidents, Super Admin alerts, integrity checks.
--
-- How it fits together
--   * audit_logs becomes tamper-evident: every row is chained to the one before it
--     (per school) with a SHA-256 hash, rows can never be updated or deleted, and
--     audit_verify_chain() finds altered, missing or truncated records.
--   * write_audit() no longer fails silently. A sensitive action (results, roles,
--     permissions, parent links, attendance corrections...) is refused if its audit
--     record cannot be written, so the change and its record commit together. A
--     routine action is queued for durable retry, an incident is raised at once, and
--     the retry never creates duplicates (event_key).
--   * A health check (probe write, retry queue, hash chain, reconciliation of
--     sensitive changes against their audit records) opens deduplicated incidents
--     and in-app alerts for platform administrators, plus an outbox for an urgent
--     channel. Closing an incident needs a passing verification run.
--   * Alerts and diagnostics hold references and error codes only: never passwords,
--     tokens, error text that could echo row values, or student/parent details.

-- ---------------------------------------------------------------------------
-- Tamper-evident audit log
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN chain_key TEXT,
  ADD COLUMN chain_seq BIGINT,
  ADD COLUMN prev_hash BYTEA,
  ADD COLUMN row_hash BYTEA,
  ADD COLUMN event_key TEXT;

CREATE TABLE public.audit_chain_heads (
  chain_key TEXT NOT NULL PRIMARY KEY,
  last_seq BIGINT NOT NULL,
  last_hash BYTEA NOT NULL
);

CREATE OR REPLACE FUNCTION public.audit_genesis(_chain TEXT)
RETURNS BYTEA LANGUAGE sql IMMUTABLE AS $$ SELECT sha256(convert_to('genesis:' || _chain, 'UTF8')) $$;

CREATE OR REPLACE FUNCTION public.audit_row_hash(_prev BYTEA, r public.audit_logs)
RETURNS BYTEA LANGUAGE sql STABLE AS $$
  SELECT sha256(_prev || convert_to(concat_ws('|',
    r.id::text, COALESCE(r.school_id::text, ''), COALESCE(r.actor_id::text, ''), COALESCE(r.actor_user_id::text, ''),
    COALESCE(r.actor_name, ''), COALESCE(r.actor_role, ''), r.action::text, r.target_type,
    COALESCE(r.target_id::text, ''), COALESCE(r.target_name, ''), COALESCE(r.details::text, ''),
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')), 'UTF8'))
$$;

-- Give every existing record its place in the chain (oldest first, per school).
DO $$
DECLARE
  r public.audit_logs;
  ck TEXT;
  head public.audit_chain_heads;
  h BYTEA;
BEGIN
  FOR r IN SELECT * FROM public.audit_logs ORDER BY COALESCE(school_id::text, 'platform'), created_at, id LOOP
    ck := COALESCE(r.school_id::text, 'platform');
    INSERT INTO public.audit_chain_heads VALUES (ck, 0, public.audit_genesis(ck)) ON CONFLICT DO NOTHING;
    SELECT * INTO head FROM public.audit_chain_heads WHERE chain_key = ck;
    r.chain_key := ck;
    r.chain_seq := head.last_seq + 1;
    r.prev_hash := head.last_hash;
    h := public.audit_row_hash(head.last_hash, r);
    UPDATE public.audit_logs SET chain_key = ck, chain_seq = r.chain_seq, prev_hash = head.last_hash, row_hash = h WHERE id = r.id;
    UPDATE public.audit_chain_heads SET last_seq = r.chain_seq, last_hash = h WHERE chain_key = ck;
  END LOOP;
END $$;

ALTER TABLE public.audit_logs
  ALTER COLUMN chain_key SET NOT NULL, ALTER COLUMN chain_seq SET NOT NULL,
  ALTER COLUMN prev_hash SET NOT NULL, ALTER COLUMN row_hash SET NOT NULL;
CREATE UNIQUE INDEX audit_logs_chain_key ON public.audit_logs (chain_key, chain_seq);
CREATE UNIQUE INDEX audit_logs_event_key ON public.audit_logs (event_key) WHERE event_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_chain_fill()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ck TEXT := COALESCE(NEW.school_id::text, 'platform');
  head public.audit_chain_heads;
BEGIN
  INSERT INTO public.audit_chain_heads VALUES (ck, 0, public.audit_genesis(ck)) ON CONFLICT DO NOTHING;
  SELECT * INTO head FROM public.audit_chain_heads WHERE chain_key = ck FOR UPDATE;
  NEW.chain_key := ck;
  NEW.chain_seq := head.last_seq + 1;
  NEW.prev_hash := head.last_hash;
  NEW.row_hash := public.audit_row_hash(head.last_hash, NEW);
  UPDATE public.audit_chain_heads SET last_seq = NEW.chain_seq, last_hash = NEW.row_hash WHERE chain_key = ck;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_chain_fill BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_chain_fill();

CREATE OR REPLACE FUNCTION public.audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit records cannot be changed or deleted' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER audit_immutable_row BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_immutable();
CREATE TRIGGER audit_immutable_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.audit_immutable();

-- Finds altered, missing or truncated records. One row per chain.
CREATE OR REPLACE FUNCTION public.audit_verify_chain(_chain TEXT DEFAULT NULL)
RETURNS TABLE (chain_key TEXT, rows_checked BIGINT, ok BOOLEAN, problem TEXT, first_bad_seq BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ck TEXT;
  r public.audit_logs;
  expected BIGINT;
  prev BYTEA;
  n BIGINT;
  bad TEXT;
  bad_seq BIGINT;
  head public.audit_chain_heads;
BEGIN
  FOR ck IN
    SELECT k FROM (SELECT h.chain_key AS k FROM public.audit_chain_heads h UNION SELECT DISTINCT a.chain_key FROM public.audit_logs a) x
     WHERE _chain IS NULL OR k = _chain ORDER BY k
  LOOP
    expected := 1; prev := public.audit_genesis(ck); n := 0; bad := NULL; bad_seq := NULL;
    FOR r IN SELECT * FROM public.audit_logs a WHERE a.chain_key = ck ORDER BY a.chain_seq LOOP
      n := n + 1;
      IF r.chain_seq <> expected THEN bad := 'a record is missing from the sequence'; bad_seq := expected; EXIT; END IF;
      IF r.prev_hash <> prev THEN bad := 'the chain link is broken'; bad_seq := r.chain_seq; EXIT; END IF;
      IF r.row_hash <> public.audit_row_hash(r.prev_hash, r) THEN bad := 'a record was altered'; bad_seq := r.chain_seq; EXIT; END IF;
      prev := r.row_hash; expected := expected + 1;
    END LOOP;
    IF bad IS NULL THEN
      SELECT * INTO head FROM public.audit_chain_heads h WHERE h.chain_key = ck;
      IF FOUND AND (head.last_seq <> expected - 1 OR head.last_hash <> prev) THEN
        bad := 'records at the end of the log are missing'; bad_seq := expected;
      END IF;
    END IF;
    RETURN QUERY SELECT ck, n, bad IS NULL, bad, bad_seq;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Settings, state, queue, incidents, alerts
-- ---------------------------------------------------------------------------
CREATE TABLE public.audit_settings (
  id BOOLEAN NOT NULL PRIMARY KEY DEFAULT TRUE CHECK (id),
  failure_threshold INT NOT NULL DEFAULT 3 CHECK (failure_threshold BETWEEN 1 AND 100),
  window_minutes INT NOT NULL DEFAULT 60 CHECK (window_minutes BETWEEN 1 AND 1440),
  stale_minutes INT NOT NULL DEFAULT 15 CHECK (stale_minutes BETWEEN 1 AND 1440),
  webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  monitoring_since TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.audit_settings DEFAULT VALUES;

CREATE TABLE public.audit_monitor_state (
  id BOOLEAN NOT NULL PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_tick_at TIMESTAMPTZ,
  last_ok_at TIMESTAMPTZ,
  last_status TEXT
);
INSERT INTO public.audit_monitor_state DEFAULT VALUES;

CREATE TABLE public.audit_failure_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  event_key TEXT NOT NULL UNIQUE,
  school_id UUID,
  actor_id UUID,
  actor_user_id UUID,
  actor_name TEXT,
  actor_role TEXT,
  action public.audit_action NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  target_name TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'recovered')),
  attempts INT NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_attempt_at TIMESTAMPTZ,
  recovered_at TIMESTAMPTZ
);
CREATE INDEX idx_audit_queue_pending ON public.audit_failure_queue (created_at) WHERE status = 'pending';

CREATE SEQUENCE public.audit_incident_seq;

CREATE TABLE public.audit_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  occurrences INT NOT NULL DEFAULT 1,
  school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT,
  module TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('write_failure', 'validation_failure', 'missing_event', 'retrieval_failure',
                                             'integrity_violation', 'service_unavailable', 'repeated_failures', 'queue_backlog')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'investigating', 'resolved', 'closed')),
  operation TEXT,
  event_ref TEXT,
  business_outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (business_outcome IN ('succeeded', 'failed', 'unknown')),
  summary TEXT NOT NULL,
  recommended_steps TEXT NOT NULL,
  diagnostics JSONB NOT NULL DEFAULT '{}',
  assigned_to UUID,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  verified_at TIMESTAMPTZ,
  verified_ok BOOLEAN,
  closed_by UUID,
  closed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX audit_incident_one_active ON public.audit_incidents (fingerprint) WHERE status <> 'closed';

CREATE TABLE public.audit_incident_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.audit_incidents(id) ON DELETE RESTRICT,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_user_id UUID,
  actor_label TEXT,
  kind TEXT NOT NULL,
  note TEXT,
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_incident_events ON public.audit_incident_events (incident_id, at);

CREATE TABLE public.audit_health_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ran_by UUID,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
  checks JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE public.platform_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  incident_id UUID REFERENCES public.audit_incidents(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE public.platform_alert_reads (
  alert_id UUID NOT NULL REFERENCES public.platform_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_id, user_id)
);
CREATE TABLE public.audit_alert_outbox (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id UUID NOT NULL REFERENCES public.platform_alerts(id) ON DELETE RESTRICT,
  channel TEXT NOT NULL DEFAULT 'webhook',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  sent_at TIMESTAMPTZ
);

-- No direct access from the API: platform administrators use the functions below.
ALTER TABLE public.audit_chain_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_monitor_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_failure_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_alert_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_alert_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_chain_heads, public.audit_settings, public.audit_monitor_state, public.audit_failure_queue,
  public.audit_incidents, public.audit_incident_events, public.audit_health_checks, public.platform_alerts,
  public.platform_alert_reads, public.audit_alert_outbox FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Incident helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_severity_rank(_s TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$ SELECT CASE _s WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END $$;

CREATE OR REPLACE FUNCTION public.audit_is_high_risk(_action public.audit_action)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _action::text IN ('role_changed', 'permission_changed', 'user_banned', 'user_suspended', 'user_activated',
    'results_approved', 'results_published', 'results_reopened', 'results_corrected', 'correction_rejected',
    'guardian_linked', 'attendance_corrected', 'school_updated', 'config_updated', 'grading_scale_changed', 'message_hidden')
$$;

CREATE OR REPLACE FUNCTION public.audit_module_of(_action TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _action LIKE 'result%' OR _action LIKE 'correction%' OR _action = 'grading_scale_changed' THEN 'Examinations and results'
    WHEN _action IN ('role_changed', 'permission_changed') OR _action LIKE 'user_%' THEN 'Users and permissions'
    WHEN _action LIKE 'guardian%' THEN 'Parent-child links'
    WHEN _action LIKE 'attendance%' THEN 'Attendance'
    WHEN _action LIKE 'message%' OR _action LIKE 'conversation%' THEN 'Messaging'
    WHEN _action LIKE 'school%' OR _action = 'config_updated' THEN 'School settings'
    WHEN _action LIKE 'record%' THEN 'Academic records'
    ELSE 'Audit service' END
$$;

CREATE OR REPLACE FUNCTION public.audit_steps_for(_category TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _category
    WHEN 'write_failure' THEN 'Check database availability, free disk space and any constraint or trigger on the audit_logs table. Run a health check; when the write probe passes, verify and close this incident.'
    WHEN 'validation_failure' THEN 'An audit record was rejected as invalid. Check recent changes to audit_logs constraints and the code that builds audit events, then run a health check.'
    WHEN 'missing_event' THEN 'A sensitive change has no audit record. Use the event reference to find the operation, find out why the audit call did not run, record the missing event from backups or application logs if required, then verify.'
    WHEN 'retrieval_failure' THEN 'An audit record could not be read back. Check database health and permissions, then run a health check.'
    WHEN 'integrity_violation' THEN 'Treat as possible tampering. Preserve a backup now, identify the affected chain and sequence in the diagnostics, review database access logs and credentials, and restore from a verified backup if records were removed. Never edit audit rows.'
    WHEN 'service_unavailable' THEN 'The audit monitor has stopped reporting. Restart the monitoring job (npm run audit:monitor) on its host, check its scheduler and database connection, then verify.'
    WHEN 'repeated_failures' THEN 'Audit writes keep failing. Treat as an outage of the audit service: check the database first, then recent deployments and constraints on audit_logs. Sensitive actions are being refused until it is fixed.'
    WHEN 'queue_backlog' THEN 'Audit events are waiting in the retry queue. Run a health check to retry them; if they stay pending, look at the error codes in the diagnostics and fix the cause.'
    ELSE 'Investigate using the diagnostics, then verify and close.' END
$$;

-- Internal: open a new incident, or count another occurrence of an active one.
-- Alerts the platform administrators when an incident opens or becomes more severe.
CREATE OR REPLACE FUNCTION public.audit_raise_incident(
  _fingerprint TEXT, _school UUID, _module TEXT, _category TEXT, _severity TEXT, _operation TEXT,
  _event_ref TEXT, _outcome TEXT, _summary TEXT, _diagnostics JSONB DEFAULT '{}', _actor UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inc public.audit_incidents;
  cfg public.audit_settings;
  sev TEXT := _severity;
  recent INT;
  newly BOOLEAN := FALSE;
  escalated BOOLEAN := FALSE;
BEGIN
  SELECT * INTO cfg FROM public.audit_settings;
  SELECT * INTO inc FROM public.audit_incidents WHERE fingerprint = _fingerprint AND status <> 'closed' FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.audit_incidents
      (ref, fingerprint, school_id, module, category, severity, operation, event_ref, business_outcome, summary, recommended_steps, diagnostics)
    VALUES
      ('AUD-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.audit_incident_seq')::text, 5, '0'),
       _fingerprint, _school, _module, _category, sev, _operation, _event_ref, _outcome, _summary,
       public.audit_steps_for(_category), COALESCE(_diagnostics, '{}'))
    RETURNING * INTO inc;
    INSERT INTO public.audit_incident_events (incident_id, actor_user_id, actor_label, kind, note, details)
    VALUES (inc.id, _actor, CASE WHEN _actor IS NULL THEN 'system' END, 'detected', _summary, COALESCE(_diagnostics, '{}'));
    newly := TRUE;
  ELSE
    -- Repeated failures inside the window escalate to critical.
    SELECT count(*) INTO recent FROM public.audit_incident_events
     WHERE incident_id = inc.id AND kind IN ('detected', 'occurrence') AND at > now() - make_interval(mins => cfg.window_minutes);
    IF recent + 1 >= cfg.failure_threshold AND public.audit_severity_rank(sev) < 4 THEN sev := 'critical'; END IF;
    IF public.audit_severity_rank(sev) > public.audit_severity_rank(inc.severity) THEN escalated := TRUE; END IF;
    UPDATE public.audit_incidents
       SET occurrences = occurrences + 1, last_seen_at = clock_timestamp(),
           severity = CASE WHEN public.audit_severity_rank(sev) > public.audit_severity_rank(severity) THEN sev ELSE severity END,
           business_outcome = CASE WHEN _outcome = 'failed' THEN 'failed' ELSE business_outcome END,
           status = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
           resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END,
           verified_ok = NULL, verified_at = NULL,
           diagnostics = CASE WHEN _diagnostics IS NULL OR _diagnostics = '{}' THEN diagnostics ELSE _diagnostics END
     WHERE id = inc.id RETURNING * INTO inc;
    INSERT INTO public.audit_incident_events (incident_id, actor_user_id, actor_label, kind, note, details)
    VALUES (inc.id, _actor, CASE WHEN _actor IS NULL THEN 'system' END, 'occurrence', _summary,
            jsonb_build_object('severity', sev) || COALESCE(_diagnostics, '{}'));
  END IF;

  IF newly OR escalated THEN
    DECLARE
      alert UUID;
      school_name TEXT := (SELECT name FROM public.schools WHERE id = inc.school_id);
    BEGIN
      INSERT INTO public.platform_alerts (incident_id, kind, severity, title, body)
      VALUES (inc.id, CASE WHEN newly THEN 'new' ELSE 'escalated' END, inc.severity,
        '[' || initcap(inc.severity) || '] ' || CASE WHEN newly THEN 'Audit incident ' ELSE 'Audit incident escalated ' END || inc.ref,
        'Reference ' || inc.ref || E'\n' ||
        'Detected: ' || to_char(inc.detected_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"') || E'\n' ||
        'School: ' || COALESCE(school_name, 'platform-wide') || E'\n' ||
        'Module: ' || inc.module || E'\n' ||
        'Category: ' || replace(inc.category, '_', ' ') || E'\n' ||
        'Severity: ' || inc.severity || E'\n' ||
        'Operation/event: ' || COALESCE(inc.operation, '-') || ' ' || COALESCE(inc.event_ref, '') || E'\n' ||
        'Business operation: ' || CASE inc.business_outcome WHEN 'failed' THEN 'did not complete' WHEN 'succeeded' THEN 'completed' ELSE 'unknown' END || E'\n' ||
        'Status: ' || inc.status || E'\n' ||
        'Next steps: ' || inc.recommended_steps)
      RETURNING id INTO alert;
      IF cfg.webhook_enabled AND public.audit_severity_rank(inc.severity) >= 3 THEN
        INSERT INTO public.audit_alert_outbox (alert_id, channel) VALUES (alert, 'webhook');
      END IF;
    END;
  END IF;
  RETURN inc.id;
END $$;

-- ---------------------------------------------------------------------------
-- write_audit: never silent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_audit(
  _school UUID, _action audit_action, _target_type TEXT, _target_id UUID,
  _target_name TEXT, _details JSONB DEFAULT '{}'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor RECORD;
  ev_key TEXT := gen_random_uuid()::text;
  who TEXT;
  roles TEXT;
  state TEXT;
  cname TEXT;
  tname TEXT;
BEGIN
  SELECT p.id, p.full_name,
         (SELECT string_agg(r::text, ',') FROM public.my_roles(_school) r) AS roles
    INTO actor
    FROM public.profiles p
   WHERE p.school_id = _school AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL;
  who := COALESCE(actor.full_name, CASE WHEN public.is_platform_admin() THEN 'Platform admin' ELSE 'System' END);
  roles := COALESCE(actor.roles, CASE WHEN public.is_platform_admin() THEN 'platform_admin' END);

  BEGIN
    INSERT INTO public.audit_logs
      (school_id, actor_id, actor_user_id, actor_name, actor_role, action, target_type, target_id, target_name, details, event_key)
    VALUES
      (_school, actor.id, auth.uid(), who, roles, _action, _target_type, _target_id, _target_name, COALESCE(_details, '{}'), ev_key);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE, cname = CONSTRAINT_NAME, tname = TABLE_NAME;
    IF public.audit_is_high_risk(_action) THEN
      -- The change and its record commit together, or neither does.
      RAISE EXCEPTION 'This change was not saved because its audit record could not be written. Platform administrators have been alerted. (code AU001)'
        USING ERRCODE = 'AU001', HINT = public.audit_module_of(_action::text);
    END IF;
    BEGIN
      INSERT INTO public.audit_failure_queue
        (event_key, school_id, actor_id, actor_user_id, actor_name, actor_role, action, target_type, target_id, target_name, details, attempts, last_error_code, last_attempt_at)
      VALUES (ev_key, _school, actor.id, auth.uid(), who, roles, _action, _target_type, _target_id, _target_name, COALESCE(_details, '{}'), 1, state, clock_timestamp());
      PERFORM public.audit_raise_incident(
        'write:' || _action::text, _school, public.audit_module_of(_action::text), 'write_failure', 'medium', _action::text,
        ev_key, 'succeeded', 'An audit record could not be written and was queued for retry.',
        jsonb_build_object('sqlstate', state, 'constraint', cname, 'table', tname));
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'This change was not saved because its audit record could not be written or queued. (code AU002)' USING ERRCODE = 'AU002';
    END;
  END;
END $$;

-- Retries queued events. A record that was already written is recognised by its
-- event key, so a retry never creates a duplicate.
CREATE OR REPLACE FUNCTION public.audit_retry_queue(_limit INT DEFAULT 200)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q public.audit_failure_queue;
  recovered INT := 0;
  failed INT := 0;
  state TEXT;
BEGIN
  FOR q IN SELECT * FROM public.audit_failure_queue WHERE status = 'pending' ORDER BY created_at LIMIT _limit FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      INSERT INTO public.audit_logs
        (school_id, actor_id, actor_user_id, actor_name, actor_role, action, target_type, target_id, target_name, details, created_at, event_key)
      VALUES (q.school_id, q.actor_id, q.actor_user_id, q.actor_name, q.actor_role, q.action, q.target_type, q.target_id, q.target_name,
              q.details, q.created_at, q.event_key);
      UPDATE public.audit_failure_queue SET status = 'recovered', recovered_at = clock_timestamp(), attempts = attempts + 1, last_attempt_at = clock_timestamp() WHERE id = q.id;
      recovered := recovered + 1;
    EXCEPTION
      WHEN unique_violation THEN
        UPDATE public.audit_failure_queue SET status = 'recovered', recovered_at = clock_timestamp(), last_attempt_at = clock_timestamp() WHERE id = q.id;
        recovered := recovered + 1;
      WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE;
        UPDATE public.audit_failure_queue SET attempts = attempts + 1, last_error_code = state, last_attempt_at = clock_timestamp() WHERE id = q.id;
        failed := failed + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('recovered', recovered, 'failed', failed);
END $$;

-- ---------------------------------------------------------------------------
-- Health check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_run_health_check(_kind TEXT DEFAULT 'scheduled', _by UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cfg public.audit_settings;
  checks JSONB := '{}';
  probe_ok BOOLEAN := FALSE;
  state TEXT;
  pid UUID;
  readback BYTEA;
  retry JSONB;
  pend INT;
  oldest TIMESTAMPTZ;
  v RECORD;
  chain_ok BOOLEAN := TRUE;
  bad_chains INT := 0;
  n INT;
  sample JSONB;
  all_ok BOOLEAN;
  hc UUID;
  recon_ok BOOLEAN := TRUE;
BEGIN
  SELECT * INTO cfg FROM public.audit_settings;

  -- 1. Write and read back one record (rolled back, so nothing is left in the log).
  BEGIN
    INSERT INTO public.audit_logs (school_id, action, target_type, target_name, details)
    VALUES (NULL, 'login', 'health_probe', 'probe', '{}') RETURNING id INTO pid;
    SELECT row_hash INTO readback FROM public.audit_logs WHERE id = pid;
    IF readback IS NULL THEN RAISE EXCEPTION 'probe record could not be read back' USING ERRCODE = 'AU003'; END IF;
    RAISE EXCEPTION 'probe finished' USING ERRCODE = 'AUPRB';
  EXCEPTION
    WHEN SQLSTATE 'AUPRB' THEN probe_ok := TRUE;
    WHEN OTHERS THEN GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE; probe_ok := FALSE;
  END;
  checks := checks || jsonb_build_object('write_probe', jsonb_build_object('ok', probe_ok, 'code', state));
  IF NOT probe_ok THEN
    PERFORM public.audit_raise_incident('probe:write', NULL, 'Audit service', 'write_failure', 'critical', 'health_probe', NULL, 'unknown',
      'The audit log could not be written or read back during a health check.', jsonb_build_object('sqlstate', state));
  END IF;

  -- 2. Retry the queue, then look at what is left.
  retry := public.audit_retry_queue();
  SELECT count(*), min(created_at) INTO pend, oldest FROM public.audit_failure_queue WHERE status = 'pending';
  checks := checks || jsonb_build_object('queue', jsonb_build_object('ok', pend = 0, 'pending', pend, 'retry', retry));
  IF pend > 0 THEN
    PERFORM public.audit_raise_incident('queue:backlog', NULL, 'Audit service', 'queue_backlog',
      CASE WHEN oldest < now() - interval '60 minutes' THEN 'critical' ELSE 'high' END, NULL, NULL, 'unknown',
      pend || ' audit event(s) are still waiting for retry.',
      jsonb_build_object('pending', pend, 'oldest', oldest,
        'error_codes', (SELECT COALESCE(jsonb_agg(DISTINCT last_error_code), '[]') FROM public.audit_failure_queue WHERE status = 'pending')));
  END IF;

  -- 3. Integrity of every chain.
  FOR v IN SELECT * FROM public.audit_verify_chain() LOOP
    IF NOT v.ok THEN
      chain_ok := FALSE; bad_chains := bad_chains + 1;
      PERFORM public.audit_raise_incident('integrity:' || v.chain_key, CASE WHEN v.chain_key = 'platform' THEN NULL ELSE v.chain_key::uuid END,
        'Audit service', 'integrity_violation', 'critical', 'audit_verify_chain', NULL, 'unknown',
        'The audit log failed its integrity check: ' || v.problem || '.',
        jsonb_build_object('chain', v.chain_key, 'sequence', v.first_bad_seq, 'problem', v.problem));
    END IF;
  END LOOP;
  checks := checks || jsonb_build_object('chain', jsonb_build_object('ok', chain_ok, 'bad_chains', bad_chains));

  -- 4. Reconciliation: sensitive changes must have their audit record.
  FOR v IN
    SELECT 'results_published' AS kind, 'Examinations and results' AS module,
           (SELECT count(*) FROM public.assessments a WHERE a.status = 'published' AND a.published_at > cfg.monitoring_since + interval '5 seconds'
              AND NOT EXISTS (SELECT 1 FROM public.audit_logs l WHERE l.action = 'results_published' AND l.target_id = a.id AND l.created_at >= a.published_at - interval '1 minute')) AS n,
           (SELECT COALESCE(jsonb_agg(a.id), '[]') FROM (SELECT a2.id FROM public.assessments a2 WHERE a2.status = 'published' AND a2.published_at > cfg.monitoring_since + interval '5 seconds'
              AND NOT EXISTS (SELECT 1 FROM public.audit_logs l WHERE l.action = 'results_published' AND l.target_id = a2.id AND l.created_at >= a2.published_at - interval '1 minute') LIMIT 5) a) AS sample
    UNION ALL
    SELECT 'results_corrected', 'Examinations and results',
           (SELECT count(*) FROM public.result_corrections c WHERE c.applied_at IS NOT NULL AND c.applied_at > cfg.monitoring_since + interval '5 seconds'
              AND NOT EXISTS (SELECT 1 FROM public.audit_logs l WHERE l.action = 'results_corrected' AND l.details ->> 'correction_id' = c.id::text)),
           (SELECT COALESCE(jsonb_agg(c.id), '[]') FROM (SELECT c2.id FROM public.result_corrections c2 WHERE c2.applied_at IS NOT NULL AND c2.applied_at > cfg.monitoring_since + interval '5 seconds'
              AND NOT EXISTS (SELECT 1 FROM public.audit_logs l WHERE l.action = 'results_corrected' AND l.details ->> 'correction_id' = c2.id::text) LIMIT 5) c)
    UNION ALL
    SELECT 'message_hidden', 'Messaging',
           (SELECT count(*) FROM public.messages m WHERE m.hidden_at IS NOT NULL AND m.hidden_at > cfg.monitoring_since + interval '5 seconds'
              AND NOT EXISTS (SELECT 1 FROM public.audit_logs l WHERE l.action = 'message_hidden' AND l.target_id = m.id)),
           (SELECT COALESCE(jsonb_agg(m.id), '[]') FROM (SELECT m2.id FROM public.messages m2 WHERE m2.hidden_at IS NOT NULL AND m2.hidden_at > cfg.monitoring_since + interval '5 seconds'
              AND NOT EXISTS (SELECT 1 FROM public.audit_logs l WHERE l.action = 'message_hidden' AND l.target_id = m2.id) LIMIT 5) m)
  LOOP
    IF v.n > 0 THEN
      recon_ok := FALSE;
      PERFORM public.audit_raise_incident('missing:' || v.kind, NULL, v.module, 'missing_event', 'high', v.kind, NULL, 'succeeded',
        v.n || ' ' || replace(v.kind, '_', ' ') || ' change(s) have no audit record.',
        jsonb_build_object('count', v.n, 'record_ids', v.sample));
    END IF;
  END LOOP;
  checks := checks || jsonb_build_object('reconcile', jsonb_build_object('ok', recon_ok));

  all_ok := probe_ok AND pend = 0 AND chain_ok AND recon_ok;
  INSERT INTO public.audit_health_checks (ran_by, kind, status, checks)
  VALUES (_by, _kind, CASE WHEN all_ok THEN 'passed' ELSE 'failed' END, checks) RETURNING id INTO hc;

  UPDATE public.audit_monitor_state
     SET last_tick_at = clock_timestamp(), last_status = CASE WHEN all_ok THEN 'passed' ELSE 'failed' END,
         last_ok_at = CASE WHEN all_ok THEN clock_timestamp() ELSE last_ok_at END;

  -- The monitor is running again: note it on any open "monitor stopped" incident.
  INSERT INTO public.audit_incident_events (incident_id, actor_label, kind, note)
  SELECT i.id, 'system', 'check_passed', 'The audit monitor reported again.'
    FROM public.audit_incidents i WHERE i.category = 'service_unavailable' AND i.status NOT IN ('closed')
     AND NOT EXISTS (SELECT 1 FROM public.audit_incident_events e WHERE e.incident_id = i.id AND e.kind = 'check_passed' AND e.at > i.last_seen_at);

  RETURN jsonb_build_object('id', hc, 'status', CASE WHEN all_ok THEN 'passed' ELSE 'failed' END, 'checks', checks);
END $$;

-- The job that runs on a schedule outside the web app (see scripts/audit-monitor.mjs).
CREATE OR REPLACE FUNCTION public.audit_monitor_tick()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.audit_run_health_check('scheduled', NULL)
$$;

-- Raised when the monitor has stopped reporting (called by the watchdog, or by the
-- dashboard when it finds the heartbeat stale).
CREATE OR REPLACE FUNCTION public.audit_flag_monitor_stale()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st public.audit_monitor_state;
  cfg public.audit_settings;
BEGIN
  SELECT * INTO st FROM public.audit_monitor_state;
  SELECT * INTO cfg FROM public.audit_settings;
  IF st.last_tick_at IS NULL OR st.last_tick_at < now() - make_interval(mins => cfg.stale_minutes) THEN
    PERFORM public.audit_raise_incident('monitor:stale', NULL, 'Audit service', 'service_unavailable', 'critical', 'audit_monitor', NULL, 'unknown',
      'The audit monitor has not reported for more than ' || cfg.stale_minutes || ' minutes.',
      jsonb_build_object('last_tick_at', st.last_tick_at, 'stale_after_minutes', cfg.stale_minutes));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Failures reported by the app when a sensitive change was refused (AU001)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_audit_failure(_school UUID, _operation TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  op TEXT := CASE WHEN _operation ~ '^[a-z0-9_.]{1,60}$' THEN _operation ELSE 'unspecified' END;
  me UUID := auth.uid();
  n INT;
BEGIN
  IF me IS NULL OR NOT public.is_member(_school) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO n FROM public.audit_incident_events WHERE actor_user_id = me AND at > now() - interval '1 hour';
  IF n >= 20 THEN RAISE EXCEPTION 'too many reports; try again later' USING ERRCODE = '54000'; END IF;
  PERFORM public.audit_raise_incident('client:' || op || ':' || _school::text, _school, public.audit_module_of(op), 'write_failure', 'medium', op, NULL, 'failed',
    'A change was refused because its audit record could not be written.', jsonb_build_object('reported_by', 'application'), me);
END $$;

-- ---------------------------------------------------------------------------
-- Super Admin console
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_actor_label(_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT email FROM auth.users WHERE id = _user), 'platform administrator')
$$;

CREATE OR REPLACE FUNCTION public.audit_monitoring_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st public.audit_monitor_state;
  cfg public.audit_settings;
  stale BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO st FROM public.audit_monitor_state;
  SELECT * INTO cfg FROM public.audit_settings;
  stale := st.last_tick_at IS NULL OR st.last_tick_at < now() - make_interval(mins => cfg.stale_minutes);
  IF stale THEN PERFORM public.audit_flag_monitor_stale(); END IF;
  RETURN jsonb_build_object(
    'last_tick_at', st.last_tick_at, 'last_ok_at', st.last_ok_at, 'last_status', st.last_status, 'stale', stale,
    'settings', to_jsonb(cfg),
    'open', (SELECT COALESCE(jsonb_object_agg(severity, n), '{}') FROM (
               SELECT severity, count(*) AS n FROM public.audit_incidents WHERE status <> 'closed' GROUP BY severity) x),
    'unresolved', (SELECT count(*) FROM public.audit_incidents WHERE status NOT IN ('resolved', 'closed')),
    'queue_pending', (SELECT count(*) FROM public.audit_failure_queue WHERE status = 'pending'),
    'unread_alerts', (SELECT count(*) FROM public.platform_alerts a WHERE NOT EXISTS (SELECT 1 FROM public.platform_alert_reads r WHERE r.alert_id = a.id AND r.user_id = auth.uid())),
    'recent_checks', (SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.ran_at DESC), '[]') FROM (
               SELECT id, ran_at, kind, status, checks FROM public.audit_health_checks ORDER BY ran_at DESC LIMIT 8) h));
END $$;

CREATE OR REPLACE FUNCTION public.run_audit_health_check()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN public.audit_run_health_check('manual', auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.list_audit_incidents(_scope TEXT DEFAULT 'active')
RETURNS TABLE (
  id UUID, ref TEXT, detected_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, school_name TEXT, module TEXT, category TEXT,
  severity TEXT, status TEXT, operation TEXT, occurrences INT, business_outcome TEXT, assigned_to_label TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT i.id, i.ref, i.detected_at, i.last_seen_at, s.name, i.module, i.category, i.severity, i.status, i.operation,
         i.occurrences, i.business_outcome, CASE WHEN i.assigned_to IS NULL THEN NULL ELSE public.audit_actor_label(i.assigned_to) END
    FROM public.audit_incidents i LEFT JOIN public.schools s ON s.id = i.school_id
   WHERE (_scope = 'all') OR (_scope = 'active' AND i.status <> 'closed') OR (_scope = 'closed' AND i.status = 'closed')
   ORDER BY (i.status = 'closed'), public.audit_severity_rank(i.severity) DESC, i.detected_at DESC
   LIMIT 200;
END $$;

CREATE OR REPLACE FUNCTION public.get_audit_incident(_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.audit_incidents;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.audit_incidents WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident not found' USING ERRCODE = '22023'; END IF;
  RETURN jsonb_build_object(
    'incident', to_jsonb(i) || jsonb_build_object('school_name', (SELECT name FROM public.schools WHERE id = i.school_id),
        'assigned_to_label', CASE WHEN i.assigned_to IS NULL THEN NULL ELSE public.audit_actor_label(i.assigned_to) END),
    'events', (SELECT COALESCE(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'note', e.note, 'details', e.details,
                 'actor', COALESCE(e.actor_label, CASE WHEN e.actor_user_id IS NULL THEN 'system' ELSE public.audit_actor_label(e.actor_user_id) END)) ORDER BY e.at), '[]')
                 FROM public.audit_incident_events e WHERE e.incident_id = i.id));
END $$;

CREATE OR REPLACE FUNCTION public.audit_incident_action(_id UUID, _action TEXT, _note TEXT DEFAULT NULL, _assignee UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.audit_incidents;
  me UUID := auth.uid();
  clean TEXT := NULLIF(btrim(COALESCE(_note, '')), '');
  vr JSONB;
  check_name TEXT;
  passed BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.audit_incidents WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'incident not found' USING ERRCODE = '22023'; END IF;
  IF i.status = 'closed' THEN RAISE EXCEPTION 'this incident is closed' USING ERRCODE = '22023'; END IF;

  IF _action = 'acknowledge' THEN
    IF i.status <> 'open' THEN RAISE EXCEPTION 'only an open incident can be acknowledged' USING ERRCODE = '22023'; END IF;
    UPDATE public.audit_incidents SET status = 'acknowledged', acknowledged_by = me, acknowledged_at = clock_timestamp() WHERE id = i.id;
  ELSIF _action = 'assign' THEN
    IF _assignee IS NULL OR NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _assignee) THEN
      RAISE EXCEPTION 'choose a platform administrator' USING ERRCODE = '22023';
    END IF;
    UPDATE public.audit_incidents SET assigned_to = _assignee, status = CASE WHEN status IN ('open', 'acknowledged') THEN 'investigating' ELSE status END,
      acknowledged_by = COALESCE(acknowledged_by, me), acknowledged_at = COALESCE(acknowledged_at, clock_timestamp()) WHERE id = i.id;
    clean := COALESCE(clean, 'Assigned to ' || public.audit_actor_label(_assignee));
  ELSIF _action = 'note' THEN
    IF clean IS NULL THEN RAISE EXCEPTION 'write a note' USING ERRCODE = '22023'; END IF;
  ELSIF _action = 'resolve' THEN
    IF clean IS NULL THEN RAISE EXCEPTION 'describe what was fixed' USING ERRCODE = '22023'; END IF;
    IF i.status = 'resolved' THEN RAISE EXCEPTION 'already marked resolved; verify it, then close it' USING ERRCODE = '22023'; END IF;
    UPDATE public.audit_incidents SET status = 'resolved', resolved_at = clock_timestamp(), resolution_note = clean, verified_ok = NULL, verified_at = NULL WHERE id = i.id;
  ELSIF _action = 'verify' THEN
    vr := public.audit_run_health_check('verification', me);
    check_name := CASE i.category WHEN 'write_failure' THEN 'write_probe' WHEN 'validation_failure' THEN 'write_probe' WHEN 'retrieval_failure' THEN 'write_probe'
      WHEN 'queue_backlog' THEN 'queue' WHEN 'integrity_violation' THEN 'chain' WHEN 'missing_event' THEN 'reconcile'
      WHEN 'repeated_failures' THEN 'write_probe' ELSE NULL END;
    passed := CASE WHEN check_name IS NULL THEN (vr ->> 'status') = 'passed' ELSE COALESCE((vr -> 'checks' -> check_name ->> 'ok')::boolean, false) END;
    -- A failure that was reported by the app also needs a clean probe and a clean queue.
    IF i.category = 'write_failure' THEN passed := passed AND COALESCE((vr -> 'checks' -> 'queue' ->> 'ok')::boolean, false); END IF;
    -- Re-running the check may have counted a new occurrence of this very incident.
    UPDATE public.audit_incidents SET verified_at = clock_timestamp(), verified_ok = passed WHERE id = i.id;
    clean := CASE WHEN passed THEN 'Verification passed.' ELSE 'Verification failed: the problem is still present.' END;
  ELSIF _action = 'close' THEN
    IF i.status <> 'resolved' THEN RAISE EXCEPTION 'resolve the incident first' USING ERRCODE = '22023'; END IF;
    IF i.verified_ok IS NOT TRUE OR i.verified_at IS NULL OR i.verified_at < i.resolved_at OR i.verified_at < i.last_seen_at THEN
      RAISE EXCEPTION 'run a verification that passes after the fix before closing' USING ERRCODE = '22023';
    END IF;
    IF clean IS NULL THEN clean := 'Closed after a passing verification.'; END IF;
    UPDATE public.audit_incidents SET status = 'closed', closed_by = me, closed_at = clock_timestamp() WHERE id = i.id;
  ELSE
    RAISE EXCEPTION 'unknown action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_incident_events (incident_id, actor_user_id, kind, note, details)
  VALUES (i.id, me, CASE _action WHEN 'verify' THEN CASE WHEN passed THEN 'verification_passed' ELSE 'verification_failed' END ELSE
           CASE _action WHEN 'acknowledge' THEN 'acknowledged' WHEN 'assign' THEN 'assigned' WHEN 'resolve' THEN 'resolved' WHEN 'close' THEN 'closed' ELSE 'note' END END,
          clean, CASE WHEN _action = 'verify' THEN jsonb_build_object('checks', vr -> 'checks') ELSE '{}' END);
  RETURN jsonb_build_object('status', (SELECT status FROM public.audit_incidents WHERE id = i.id), 'verified', passed);
END $$;

CREATE OR REPLACE FUNCTION public.set_audit_settings(_threshold INT, _window INT, _stale INT, _webhook BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  UPDATE public.audit_settings SET failure_threshold = _threshold, window_minutes = _window, stale_minutes = _stale,
    webhook_enabled = _webhook, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.platform_admin_list()
RETURNS TABLE (user_id UUID, email TEXT) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT a.user_id, u.email::text FROM public.platform_admins a JOIN auth.users u ON u.id = a.user_id ORDER BY u.email;
END $$;

CREATE OR REPLACE FUNCTION public.list_platform_alerts(_limit INT DEFAULT 30)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, incident_id UUID, kind TEXT, severity TEXT, title TEXT, body TEXT, read BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.id, a.created_at, a.incident_id, a.kind, a.severity, a.title, a.body,
         EXISTS (SELECT 1 FROM public.platform_alert_reads r WHERE r.alert_id = a.id AND r.user_id = auth.uid())
    FROM public.platform_alerts a ORDER BY a.created_at DESC LIMIT LEAST(GREATEST(_limit, 1), 100);
END $$;

CREATE OR REPLACE FUNCTION public.mark_platform_alerts_read(_id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.platform_alert_reads (alert_id, user_id)
  SELECT a.id, auth.uid() FROM public.platform_alerts a WHERE _id IS NULL OR a.id = _id
  ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Urgent channel outbox (used by scripts/audit-monitor.mjs; not callable from the API)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_outbox_claim(_limit INT DEFAULT 10)
RETURNS TABLE (outbox_id UUID, title TEXT, body TEXT, severity TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH c AS (
    SELECT o.id FROM public.audit_alert_outbox o WHERE o.status = 'pending' OR (o.status = 'failed' AND o.attempts < 5)
     ORDER BY o.created_at LIMIT _limit FOR UPDATE SKIP LOCKED)
  SELECT o.id, a.title, a.body, a.severity, a.created_at
    FROM public.audit_alert_outbox o JOIN c ON c.id = o.id JOIN public.platform_alerts a ON a.id = o.alert_id
$$;

CREATE OR REPLACE FUNCTION public.audit_outbox_mark(_id UUID, _status TEXT, _error TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.audit_alert_outbox
     SET status = _status, attempts = attempts + 1, last_error = left(_error, 200),
         sent_at = CASE WHEN _status = 'sent' THEN clock_timestamp() END
   WHERE id = _id
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.audit_genesis(TEXT), public.audit_row_hash(BYTEA, public.audit_logs), public.audit_chain_fill(), public.audit_immutable(),
  public.audit_verify_chain(TEXT), public.audit_severity_rank(TEXT), public.audit_is_high_risk(public.audit_action),
  public.audit_module_of(TEXT), public.audit_steps_for(TEXT),
  public.audit_raise_incident(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID),
  public.audit_retry_queue(INT), public.audit_run_health_check(TEXT, UUID), public.audit_monitor_tick(),
  public.audit_flag_monitor_stale(), public.audit_actor_label(UUID), public.audit_outbox_claim(INT), public.audit_outbox_mark(UUID, TEXT, TEXT),
  public.report_audit_failure(UUID, TEXT), public.audit_monitoring_status(), public.run_audit_health_check(),
  public.list_audit_incidents(TEXT), public.get_audit_incident(UUID), public.audit_incident_action(UUID, TEXT, TEXT, UUID),
  public.set_audit_settings(INT, INT, INT, BOOLEAN), public.platform_admin_list(), public.list_platform_alerts(INT),
  public.mark_platform_alerts_read(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.report_audit_failure(UUID, TEXT), public.audit_monitoring_status(), public.run_audit_health_check(),
  public.list_audit_incidents(TEXT), public.get_audit_incident(UUID), public.audit_incident_action(UUID, TEXT, TEXT, UUID),
  public.set_audit_settings(INT, INT, INT, BOOLEAN), public.platform_admin_list(), public.list_platform_alerts(INT),
  public.mark_platform_alerts_read(UUID)
TO authenticated;
