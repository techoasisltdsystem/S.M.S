-- Tests for audit-log integrity, failure handling, incidents and Super Admin alerts.
-- One transaction, rolled back; PASS or stop with FAIL.
--   Laptop:   npm run db:test
BEGIN;

CREATE FUNCTION pg_temp.ok(_cond BOOLEAN, _label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', _label; END IF;
  RAISE NOTICE 'PASS: %', _label;
END $$;

CREATE FUNCTION pg_temp.act_as(_email TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  uid UUID;
BEGIN
  PERFORM set_config('role', 'none', true);
  IF _email IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
    PERFORM set_config('role', 'anon', true);
    RETURN;
  END IF;
  SELECT id INTO uid FROM auth.users WHERE email = _email;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', uid, 'email', _email, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE FUNCTION pg_temp.rows(_sql TEXT) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  EXECUTE _sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN OTHERS THEN
  RETURN -1;
END $$;

CREATE FUNCTION pg_temp.fails(_sql TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN FALSE;
EXCEPTION WHEN OTHERS THEN
  RETURN TRUE;
END $$;

CREATE FUNCTION pg_temp.count(_sql TEXT) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || _sql || ') x' INTO n;
  RETURN n;
END $$;

CREATE TEMP TABLE ids (name TEXT PRIMARY KEY, id UUID);
GRANT SELECT, INSERT, UPDATE ON pg_temp.ids TO anon, authenticated;
CREATE FUNCTION pg_temp.id(_name TEXT) RETURNS UUID LANGUAGE sql AS $$ SELECT id FROM ids WHERE name = _name $$;

-- An active member with a login (set up directly as the database owner).
CREATE FUNCTION pg_temp.member(_school TEXT, _key TEXT, _role member_role, _gender TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  uid UUID;
  pid UUID;
BEGIN
  INSERT INTO auth.users (email) VALUES (_key || '@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.profiles (school_id, full_name, email, user_id, gender, status)
  VALUES (pg_temp.id(_school), initcap(replace(_key, '-', ' ')), _key || '@test.invalid', uid, _gender, 'active')
  RETURNING id INTO pid;
  INSERT INTO public.school_memberships (school_id, profile_id, role, status) VALUES (pg_temp.id(_school), pid, _role, 'active');
  INSERT INTO ids VALUES (_key, pid);
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- A sentinel that ends a sub-block and rolls back everything it did.
CREATE FUNCTION pg_temp.sentinel() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'end of scenario' USING ERRCODE = 'AUPRB'; END $$;
GRANT EXECUTE ON FUNCTION pg_temp.sentinel() TO anon, authenticated;

DO $$
DECLARE
  a JSONB := public.bootstrap_school('Test School A', 'test-school-a', 'Admin A', 'admin-a@test.invalid');
  b JSONB := public.bootstrap_school('Test School B', 'test-school-b', 'Admin B', 'admin-b@test.invalid');
  uid UUID;
BEGIN
  INSERT INTO ids VALUES ('school_a', (a ->> 'school_id')::uuid), ('school_b', (b ->> 'school_id')::uuid);
  INSERT INTO auth.users (email) VALUES ('admin-a@test.invalid') RETURNING id INTO uid;
  PERFORM public.accept_invitation_for(uid, 'admin-a@test.invalid', a ->> 'token');
  INSERT INTO auth.users (email) VALUES ('admin-b@test.invalid') RETURNING id INTO uid;
  PERFORM public.accept_invitation_for(uid, 'admin-b@test.invalid', b ->> 'token');
  PERFORM pg_temp.member('school_a', 'teacher-math', 'teacher');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
  INSERT INTO ids VALUES ('platform_1', uid);
  INSERT INTO auth.users (email) VALUES ('platform2@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
  INSERT INTO ids VALUES ('platform_2', uid);
END $$;

-- A published-ready assessment in school A.
DO $$
DECLARE
  y UUID; c1 UUID; m UUID; aid UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_current)
  VALUES (pg_temp.id('school_a'), '2026/2027', '2026-09-01', '2027-07-31', true) RETURNING id INTO y;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1A') RETURNING id INTO c1;
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'Mathematics') RETURNING id INTO m;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id)
  VALUES (pg_temp.id('school_a'), c1, m, pg_temp.id('teacher-math'));
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score)
  VALUES (pg_temp.id('school_a'), c1, m, 'Test 1', 'test', 100) RETURNING id INTO aid;
  INSERT INTO ids VALUES ('test1', aid), ('class_1a', c1), ('maths', m);
  INSERT INTO public.marks (school_id, assessment_id, student_id, score) VALUES (pg_temp.id('school_a'), aid, pg_temp.id('student-ama'), 70);
  PERFORM public.move_assessment(aid, 'submitted');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.move_assessment(aid, 'approved');
END $$;

-- ---------------------------------------------------------------------------
-- The log is chained, and cannot be edited, deleted or truncated
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as(NULL);
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_verify_chain() WHERE NOT ok), 'every audit chain verifies');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs WHERE row_hash IS NULL OR chain_seq IS NULL) = 0, 'every audit record carries its hash and position');
  PERFORM pg_temp.ok(pg_temp.fails($q$UPDATE public.audit_logs SET details = '{"x":1}'$q$), 'an audit record cannot be updated, even by the owner');
  PERFORM pg_temp.ok(pg_temp.fails($q$DELETE FROM public.audit_logs$q$), 'an audit record cannot be deleted');
  PERFORM pg_temp.ok(pg_temp.fails($q$TRUNCATE public.audit_logs$q$), 'the audit log cannot be truncated');
END $$;

-- ---------------------------------------------------------------------------
-- Tampering is detected, raised as a critical incident and alerted
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  victim public.audit_logs;
  r JSONB;
BEGIN
  BEGIN
    PERFORM set_config('role', 'none', true);
    SELECT * INTO victim FROM public.audit_logs WHERE school_id = pg_temp.id('school_a') ORDER BY chain_seq OFFSET 2 LIMIT 1;
    ALTER TABLE public.audit_logs DISABLE TRIGGER audit_immutable_row;

    UPDATE public.audit_logs SET target_name = 'tampered' WHERE id = victim.id;
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_verify_chain() WHERE NOT ok AND problem = 'a record was altered'), 'an altered record is detected');
    r := public.audit_run_health_check('manual');
    PERFORM pg_temp.ok(r ->> 'status' = 'failed', 'the health check fails when the log was altered');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_incidents WHERE category = 'integrity_violation' AND severity = 'critical' AND status = 'open' AND ref LIKE 'AUD-%'),
      'a critical integrity incident with a reference is opened');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.platform_alerts WHERE severity = 'critical' AND title LIKE '[Critical]%' AND body LIKE '%Next steps:%' AND body LIKE '%Reference AUD-%'),
      'platform administrators get an alert with reference, severity and next steps');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_alerts WHERE body ~* '(@|password|token)'), 'the alert contains no email, password or token');
    UPDATE public.audit_logs SET target_name = victim.target_name WHERE id = victim.id;
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_verify_chain() WHERE NOT ok), 'restoring the original value restores the chain');

    DELETE FROM public.audit_logs WHERE id = victim.id;
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_verify_chain() WHERE NOT ok AND problem = 'a record is missing from the sequence'), 'a deleted record is detected as a gap');
    PERFORM pg_temp.sentinel();
  EXCEPTION WHEN SQLSTATE 'AUPRB' THEN NULL;
  END;

  -- The last record of a chain removed: detected as a truncated end.
  BEGIN
    ALTER TABLE public.audit_logs DISABLE TRIGGER audit_immutable_row;
    DELETE FROM public.audit_logs WHERE id = (SELECT id FROM public.audit_logs WHERE school_id = pg_temp.id('school_a') ORDER BY chain_seq DESC LIMIT 1);
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_verify_chain() WHERE NOT ok AND problem = 'records at the end of the log are missing'), 'removing the newest record is detected');
    PERFORM pg_temp.sentinel();
  EXCEPTION WHEN SQLSTATE 'AUPRB' THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- A routine audit write fails: the action succeeds, the event is queued, an incident opens
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  keys TEXT[];
BEGIN
  BEGIN
    PERFORM set_config('role', 'none', true);
    ALTER TABLE public.audit_logs ADD CONSTRAINT inject_fail CHECK (action <> 'conversation_started') NOT VALID;

    PERFORM pg_temp.act_as('admin-a@test.invalid');
    PERFORM public.start_conversation(sa, ARRAY[pg_temp.id('teacher-math')], 'one', 'first');
    PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_conversations(pg_temp.id('school_a'))$q$) = 1, 'a routine action still succeeds when its audit write fails');
    PERFORM set_config('role', 'none', true);
    PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_failure_queue WHERE status = 'pending') = 1, 'the failed audit event is queued, not dropped');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_incidents WHERE category = 'write_failure' AND business_outcome = 'succeeded' AND severity = 'medium' AND occurrences = 1),
      'an incident records the failure and that the business action succeeded');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_incidents i WHERE i.diagnostics::text ~* '(first|Admin A|admin-a)'), 'the diagnostics contain codes only, never content or names');

    PERFORM pg_temp.act_as('admin-a@test.invalid');
    PERFORM public.start_conversation(sa, ARRAY[pg_temp.id('teacher-math')], 'two', 'second');
    PERFORM set_config('role', 'none', true);
    PERFORM pg_temp.ok((SELECT occurrences FROM public.audit_incidents WHERE category = 'write_failure' AND operation = 'conversation_started') = 2, 'repeats are counted on one incident, not duplicated');
    PERFORM pg_temp.act_as('admin-a@test.invalid');
    PERFORM public.start_conversation(sa, ARRAY[pg_temp.id('teacher-math')], 'three', 'third');
    PERFORM set_config('role', 'none', true);
    PERFORM pg_temp.ok((SELECT severity FROM public.audit_incidents WHERE operation = 'conversation_started' AND category = 'write_failure') = 'critical', 'repeated failures past the threshold escalate to critical');
    PERFORM pg_temp.ok((SELECT count(*) FROM public.platform_alerts WHERE kind = 'escalated') = 1, 'the escalation sends a new alert');

    -- The cause is fixed; the retry restores the records exactly once.
    ALTER TABLE public.audit_logs DROP CONSTRAINT inject_fail;
    SELECT array_agg(event_key) INTO keys FROM public.audit_failure_queue WHERE status = 'pending';
    PERFORM public.audit_retry_queue();
    PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_failure_queue WHERE status = 'pending') = 0, 'the retry clears the queue');
    PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs WHERE event_key = ANY (keys)) = 3, 'each queued event is written once');
    PERFORM public.audit_retry_queue();
    PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs WHERE event_key = ANY (keys)) = 3, 'a second retry creates no duplicates');
    PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_verify_chain() WHERE NOT ok), 'the chain still verifies after the retry');
    PERFORM pg_temp.sentinel();
  EXCEPTION WHEN SQLSTATE 'AUPRB' THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- A sensitive action is refused when its audit record cannot be written
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID := pg_temp.id('test1');
BEGIN
  BEGIN
    PERFORM set_config('role', 'none', true);
    ALTER TABLE public.audit_logs ADD CONSTRAINT inject_fail CHECK (action <> 'results_published') NOT VALID;

    PERFORM pg_temp.act_as('admin-a@test.invalid');
    PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.move_assessment(%L, 'published')$q$, aid)), 'publishing results is refused when the audit record cannot be written');
    PERFORM set_config('role', 'none', true);
    PERFORM pg_temp.ok((SELECT status FROM public.assessments WHERE id = aid) = 'approved', 'the business change was rolled back with it');
    PERFORM pg_temp.act_as('student-ama@test.invalid');
    PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'and nothing became visible to the student');

    -- What the app does on seeing that refusal (error code AU001):
    PERFORM pg_temp.act_as('admin-a@test.invalid');
    BEGIN
      PERFORM public.move_assessment(aid, 'published');
    EXCEPTION WHEN SQLSTATE 'AU001' THEN
      PERFORM pg_temp.ok(SQLERRM LIKE '%audit record could not be written%' AND SQLERRM NOT LIKE '%70%', 'the refusal says why and carries no student data');
    END;
    PERFORM public.report_audit_failure(pg_temp.id('school_a'), 'results_published');
    PERFORM public.report_audit_failure(pg_temp.id('school_a'), 'results_published');
    PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.report_audit_failure(%L, 'results_published')$q$, pg_temp.id('school_b'))), 'a person outside the school cannot report for it');
    PERFORM pg_temp.act_as('admin-b@test.invalid');
    PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.report_audit_failure(%L, 'results_published')$q$, pg_temp.id('school_a'))), 'another school''s administrator cannot report for this school');
    PERFORM pg_temp.act_as('platform@test.invalid');
    PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.list_audit_incidents('active') WHERE operation = 'results_published' AND business_outcome = 'failed'$q$) = 1,
      'the platform administrator sees one incident saying the change did not complete');

    PERFORM set_config('role', 'none', true);
    ALTER TABLE public.audit_logs DROP CONSTRAINT inject_fail;
    PERFORM pg_temp.sentinel();
  EXCEPTION WHEN SQLSTATE 'AUPRB' THEN NULL;
  END;

  -- With audit writing healthy, the same action works and is recorded.
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.move_assessment(aid, 'published');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'results_published'$q$) = 1, 'once audit writing works the change and its record are both saved');
END $$;

-- ---------------------------------------------------------------------------
-- The write probe itself failing
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r JSONB;
BEGIN
  BEGIN
    PERFORM set_config('role', 'none', true);
    ALTER TABLE public.audit_logs ADD CONSTRAINT inject_fail CHECK (false) NOT VALID;
    r := public.audit_run_health_check('manual');
    PERFORM pg_temp.ok((r -> 'checks' -> 'write_probe' ->> 'ok')::boolean = false, 'the health check notices that the audit log cannot be written');
    PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_incidents WHERE fingerprint = 'probe:write' AND severity = 'critical'), 'and opens a critical incident');
    ALTER TABLE public.audit_logs DROP CONSTRAINT inject_fail;
    r := public.audit_run_health_check('manual');
    PERFORM pg_temp.ok((r -> 'checks' -> 'write_probe' ->> 'ok')::boolean = true, 'a later check passes the probe');
    PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs WHERE target_type = 'health_probe') = 0, 'the probe leaves nothing in the log');
    PERFORM pg_temp.sentinel();
  EXCEPTION WHEN SQLSTATE 'AUPRB' THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- A sensitive change with no audit record is found by reconciliation, and the
-- incident cannot be closed without a passing verification
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID;
  iid UUID;
  r JSONB;
BEGIN
  PERFORM set_config('role', 'none', true);
  -- A change made behind the application's back: published, but never audited.
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, status)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Ghost test', 'test', 50, 'draft') RETURNING id INTO aid;
  UPDATE public.assessments SET status = 'published', published_at = clock_timestamp() WHERE id = aid;
  INSERT INTO ids VALUES ('ghost', aid);

  r := public.audit_run_health_check('scheduled');
  PERFORM pg_temp.ok((r -> 'checks' -> 'reconcile' ->> 'ok')::boolean = false, 'reconciliation finds a published result with no audit record');
  SELECT id INTO iid FROM public.audit_incidents WHERE fingerprint = 'missing:results_published';
  INSERT INTO ids VALUES ('incident', iid);
  PERFORM pg_temp.ok((SELECT severity || '/' || business_outcome FROM public.audit_incidents WHERE id = iid) = 'high/succeeded', 'the incident is high severity and says the change itself succeeded');
  PERFORM pg_temp.ok((SELECT diagnostics -> 'record_ids' ->> 0 FROM public.audit_incidents WHERE id = iid) = aid::text, 'it points at the record by id');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.platform_alerts WHERE incident_id = iid AND body ILIKE '%ghost%'), 'the alert names no record content');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.list_audit_incidents()$q$), 'a teacher cannot list incidents');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'acknowledge')$q$, iid)), 'a school administrator cannot act on platform incidents');
  PERFORM pg_temp.ok(pg_temp.rows($q$SELECT 1 FROM public.audit_incidents$q$) = -1, 'the incident table is not readable through the API');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.audit_monitoring_status()$q$), 'nor is the monitoring status');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM public.audit_incident_action(iid, 'acknowledge');
  PERFORM pg_temp.ok((public.get_audit_incident(iid) -> 'incident' ->> 'status') = 'acknowledged', 'the incident can be acknowledged');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'assign', NULL, %L)$q$, iid, pg_temp.id('teacher-math'))), 'it can only be assigned to a platform administrator');
  PERFORM public.audit_incident_action(iid, 'assign', NULL, pg_temp.id('platform_2'));
  PERFORM pg_temp.ok((public.get_audit_incident(iid) -> 'incident' ->> 'status') = 'investigating', 'assigning starts the investigation');
  PERFORM public.audit_incident_action(iid, 'note', 'Looking at the publish function logs');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'resolve', '')$q$, iid)), 'resolving needs a note');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'close')$q$, iid)), 'an incident cannot be closed before it is resolved');
  PERFORM public.audit_incident_action(iid, 'resolve', 'Re-recorded the missing event');

  -- Clicking "resolve" is not enough: verification still sees the gap, and the incident reopens.
  r := public.audit_incident_action(iid, 'verify');
  PERFORM pg_temp.ok((r ->> 'verified')::boolean = false, 'verification fails while the audit record is still missing');
  PERFORM pg_temp.ok((public.get_audit_incident(iid) -> 'incident' ->> 'status') = 'open', 'and the recurrence reopens the incident');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'close')$q$, iid)), 'it cannot be closed');

  -- The real fix: record the missing event.
  PERFORM set_config('role', 'none', true);
  PERFORM public.write_audit(pg_temp.id('school_a'), 'results_published', 'assessment', aid, 'Ghost test', '{"restored":true}');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'close')$q$, iid)), 'closing still needs resolve and verification');
  PERFORM public.audit_incident_action(iid, 'resolve', 'Recorded the missing audit event from application logs');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'close')$q$, iid)), 'resolved but unverified incidents cannot be closed');
  r := public.audit_incident_action(iid, 'verify');
  PERFORM pg_temp.ok((r ->> 'verified')::boolean = true, 'verification passes once the record exists');
  PERFORM public.audit_incident_action(iid, 'close', 'Verified by health check');
  PERFORM pg_temp.ok((public.get_audit_incident(iid) -> 'incident' ->> 'status') = 'closed', 'the incident closes after a passing verification');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audit_incident_action(%L, 'note', 'late')$q$, iid)), 'a closed incident cannot be changed');
  PERFORM pg_temp.ok((SELECT string_agg(t.e ->> 'kind', ',' ORDER BY t.ord) FROM jsonb_array_elements(public.get_audit_incident(iid) -> 'events') WITH ORDINALITY AS t(e, ord))
    LIKE 'detected,acknowledged,assigned,note,resolved,occurrence,verification_failed,%resolved,verification_passed,closed',
    'the history keeps every step in order');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.get_audit_incident(%L) WHERE true$q$, iid)) = 1, 'the full incident record can be opened');
END $$;

-- ---------------------------------------------------------------------------
-- Monitoring watches itself; alerts, settings and the urgent channel
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  st JSONB;
  n INT;
  sent_before INT;
BEGIN
  PERFORM set_config('role', 'none', true);
  UPDATE public.audit_monitor_state SET last_tick_at = now() - interval '2 hours';
  PERFORM pg_temp.act_as('platform@test.invalid');
  st := public.audit_monitoring_status();
  PERFORM pg_temp.ok((st ->> 'stale')::boolean, 'a silent monitor is shown as stale');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.list_audit_incidents() WHERE category = 'service_unavailable' AND severity = 'critical'$q$) = 1,
    'and raises a critical "monitor stopped" incident');
  PERFORM set_config('role', 'none', true);
  PERFORM public.audit_monitor_tick();
  PERFORM pg_temp.act_as('platform@test.invalid');
  st := public.audit_monitoring_status();
  PERFORM pg_temp.ok(NOT (st ->> 'stale')::boolean, 'a new tick clears the stale state');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_incident_events e JOIN public.audit_incidents i ON i.id = e.incident_id WHERE i.category = 'service_unavailable' AND e.kind = 'check_passed'),
    'and notes the recovery on the incident');
  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(st -> 'recent_checks') >= 1, 'recent health checks are listed');

  PERFORM pg_temp.ok((st ->> 'unread_alerts')::int > 0, 'there are unread alerts');
  PERFORM public.mark_platform_alerts_read();
  PERFORM pg_temp.ok((public.audit_monitoring_status() ->> 'unread_alerts')::int = 0, 'marking them read clears the count for this administrator');
  PERFORM pg_temp.act_as('platform2@test.invalid');
  PERFORM pg_temp.ok((public.audit_monitoring_status() ->> 'unread_alerts')::int > 0, 'but not for the other administrator');

  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_audit_settings(0, 60, 15, false)$q$), 'a threshold of zero is refused');
  PERFORM public.set_audit_settings(3, 60, 15, true);
  PERFORM set_config('role', 'none', true);
  PERFORM public.audit_raise_incident('test:urgent', NULL, 'Audit service', 'write_failure', 'critical', 'test', NULL, 'unknown', 'Urgent channel test.');
  SELECT count(*) INTO sent_before FROM public.audit_alert_outbox WHERE status = 'sent';
  SELECT count(*) INTO n FROM public.audit_outbox_claim(10);
  PERFORM pg_temp.ok(n >= 1, 'a critical incident queues an urgent-channel message');
  PERFORM public.audit_outbox_mark((SELECT id FROM public.audit_alert_outbox WHERE status = 'pending' LIMIT 1), 'sent');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_alert_outbox WHERE status = 'sent') = sent_before + 1, 'a delivered message is marked sent and not sent again');
END $$;

ROLLBACK;
