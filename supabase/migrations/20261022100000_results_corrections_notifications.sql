-- Phase B1: result corrections with history, per-school approval settings, grading
-- scales, notifications, and authorised report data for downloads.
--
-- One source of truth: `marks` stays the only place a current score lives. Published
-- values are copied (never overwritten) into result_versions, so every earlier
-- value stays inspectable. A published mark can only change through an approved
-- correction (request_correction / decide_correction).

-- ---------------------------------------------------------------------------
-- School policy and student identity
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_config
  ADD COLUMN results_approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN correction_approval_required BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.profiles ADD COLUMN admission_number TEXT CHECK (admission_number IS NULL OR length(btrim(admission_number)) > 0);
CREATE UNIQUE INDEX profiles_admission_number_key ON public.profiles (school_id, lower(admission_number)) WHERE admission_number IS NOT NULL;

INSERT INTO public.role_permissions (role, permission) VALUES ('school_admin', 'grades.correct') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grading scale (a grade is only ever shown if the school has configured one)
-- ---------------------------------------------------------------------------
CREATE TABLE public.grade_bands (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  min_percent NUMERIC(5,2) NOT NULL CHECK (min_percent >= 0 AND min_percent <= 100),
  grade TEXT NOT NULL CHECK (length(btrim(grade)) BETWEEN 1 AND 10),
  remark TEXT,
  PRIMARY KEY (school_id, min_percent)
);

CREATE OR REPLACE FUNCTION public.grade_for(_school UUID, _percent NUMERIC)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.grade FROM public.grade_bands b
   WHERE b.school_id = _school AND b.min_percent <= _percent
   ORDER BY b.min_percent DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.set_grade_bands(_school UUID, _bands JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b JSONB;
  n INT := 0;
BEGIN
  IF NOT public.has_permission(_school, 'school.settings.manage') THEN
    RAISE EXCEPTION 'you cannot change the grading scale' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_bands) <> 'array' THEN RAISE EXCEPTION 'send the grading scale as a list' USING ERRCODE = '22023'; END IF;
  IF jsonb_array_length(_bands) > 0 AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(_bands) x WHERE (x ->> 'min_percent')::numeric = 0) THEN
    RAISE EXCEPTION 'the scale must include a grade that starts at 0%%' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.grade_bands WHERE school_id = _school;
  FOR b IN SELECT * FROM jsonb_array_elements(_bands) LOOP
    INSERT INTO public.grade_bands (school_id, min_percent, grade, remark)
    VALUES (_school, (b ->> 'min_percent')::numeric, btrim(b ->> 'grade'), NULLIF(btrim(COALESCE(b ->> 'remark', '')), ''));
    n := n + 1;
  END LOOP;
  PERFORM public.write_audit(_school, 'grading_scale_changed', 'grading_scale', NULL, NULL, jsonb_build_object('bands', _bands));
END $$;

-- ---------------------------------------------------------------------------
-- Version history and corrections
-- ---------------------------------------------------------------------------
CREATE TABLE public.result_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  student_id UUID NOT NULL,
  version INT NOT NULL,
  score NUMERIC(6,2),
  max_score NUMERIC(6,2) NOT NULL,
  grade TEXT,
  comment TEXT,
  changed_by UUID,
  changed_role TEXT,
  reason TEXT,
  correction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (assessment_id, student_id, version)
);

CREATE TABLE public.result_corrections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  student_id UUID NOT NULL,
  old_score NUMERIC(6,2),
  new_score NUMERIC(6,2),
  old_comment TEXT,
  new_comment TEXT,
  old_grade TEXT,
  new_grade TEXT,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID NOT NULL,
  requested_role TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  decision_note TEXT,
  applied_at TIMESTAMPTZ,
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX one_pending_correction ON public.result_corrections (assessment_id, student_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  recipient_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  read_at TIMESTAMPTZ,
  FOREIGN KEY (school_id, recipient_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_notifications_recipient ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.grade_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY grade_bands_select ON public.grade_bands FOR SELECT TO authenticated
  USING (public.is_member(school_id));
CREATE POLICY result_versions_select ON public.result_versions FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'grades.view') OR public.can_enter_marks(assessment_id));
CREATE POLICY result_corrections_select ON public.result_corrections FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'grades.view') OR public.can_enter_marks(assessment_id));
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = public.my_profile_id(school_id));

-- Internal: write one notification. Not callable through the API.
CREATE OR REPLACE FUNCTION public.notify(_school UUID, _recipient UUID, _kind TEXT, _title TEXT, _body TEXT, _link TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT _school, p.id, _kind, _title, _body, _link
    FROM public.profiles p WHERE p.id = _recipient AND p.school_id = _school AND p.status = 'active'
$$;

-- Everyone who should hear about an assessment's results: the pupils who have a
-- score, their verified guardians, the teacher who set it, and school administrators.
-- Messages carry no scores; they link to the signed-in results page.
CREATE OR REPLACE FUNCTION public.notify_assessment_people(_assessment UUID, _only_student UUID, _kind TEXT, _title TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  body TEXT;
  actor UUID;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  actor := public.my_profile_id(a.school_id);
  body := (SELECT name FROM public.subjects WHERE id = a.subject_id) || ': ' || a.title;
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT DISTINCT a.school_id, r.pid, _kind, _title, body, '/exams'
  FROM (
    SELECT m.student_id AS pid FROM public.marks m
     WHERE m.assessment_id = a.id AND m.score IS NOT NULL AND (_only_student IS NULL OR m.student_id = _only_student)
    UNION
    SELECT g.guardian_id FROM public.guardian_links g JOIN public.marks m ON m.student_id = g.student_id
     WHERE m.assessment_id = a.id AND m.score IS NOT NULL AND g.status = 'verified' AND (_only_student IS NULL OR m.student_id = _only_student)
    UNION
    SELECT a.created_by WHERE a.created_by IS NOT NULL
    UNION
    SELECT sm.profile_id FROM public.school_memberships sm
     WHERE sm.school_id = a.school_id AND sm.role = 'school_admin' AND sm.status = 'active'
  ) r
  JOIN public.profiles p ON p.id = r.pid AND p.school_id = a.school_id AND p.status = 'active'
  WHERE r.pid IS NOT NULL AND r.pid IS DISTINCT FROM actor;
END $$;

-- ---------------------------------------------------------------------------
-- Snapshots and the guard that lets only an approved correction touch a published mark
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_marks(_assessment UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  me UUID;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  me := public.my_profile_id(a.school_id);
  INSERT INTO public.result_versions (school_id, assessment_id, student_id, version, score, max_score, grade, comment, changed_by, changed_role, reason)
  SELECT m.school_id, m.assessment_id, m.student_id,
         COALESCE((SELECT max(v.version) FROM public.result_versions v WHERE v.assessment_id = m.assessment_id AND v.student_id = m.student_id), 0) + 1,
         m.score, a.max_score, public.grade_for(a.school_id, m.score / a.max_score * 100), m.comment,
         me, (SELECT string_agg(r::text, ',') FROM public.my_roles(a.school_id) r), _reason
    FROM public.marks m
   WHERE m.assessment_id = a.id AND m.score IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.result_versions v
        WHERE v.assessment_id = m.assessment_id AND v.student_id = m.student_id
          AND v.version = (SELECT max(v2.version) FROM public.result_versions v2 WHERE v2.assessment_id = m.assessment_id AND v2.student_id = m.student_id)
          AND v.score IS NOT DISTINCT FROM m.score AND v.comment IS NOT DISTINCT FROM m.comment);
END $$;

CREATE OR REPLACE FUNCTION public.check_mark()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  corr TEXT := NULLIF(current_setting('app.correction_id', true), '');
  via_correction BOOLEAN := FALSE;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = NEW.assessment_id;
  IF a.school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'assessment belongs to another school' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'draft' THEN
    -- A published mark may change only while an approved correction for exactly this change is being applied.
    IF a.status = 'published' AND corr IS NOT NULL AND TG_OP = 'UPDATE' THEN
      via_correction := EXISTS (
        SELECT 1 FROM public.result_corrections c
         WHERE c.id = corr::uuid AND c.assessment_id = a.id AND c.student_id = NEW.student_id
           AND c.status = 'approved' AND c.applied_at IS NULL AND c.new_score IS NOT DISTINCT FROM NEW.score);
    END IF;
    IF NOT via_correction THEN
      RAISE EXCEPTION 'marks can only be changed while the assessment is a draft; request a correction instead' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF NEW.score IS NOT NULL AND NEW.score > a.max_score THEN
    RAISE EXCEPTION 'score % is above the maximum of %', NEW.score, a.max_score USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = a.class_id AND e.student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'this student is not in the class' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.student_id <> OLD.student_id OR NEW.assessment_id <> OLD.assessment_id) THEN
    RAISE EXCEPTION 'student and assessment cannot be changed' USING ERRCODE = '42501';
  END IF;
  IF NOT via_correction THEN
    NEW.entered_by := COALESCE(public.my_profile_id(NEW.school_id), NEW.entered_by);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Workflow: submit -> (approve) -> publish. Approval is a school setting.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_assessment(_assessment UUID, _to assessment_status, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  label TEXT;
  needs_approval BOOLEAN;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE = '42501'; END IF;
  label := a.title || ' (' || (SELECT name FROM public.classes WHERE id = a.class_id) || ', '
           || (SELECT name FROM public.subjects WHERE id = a.subject_id) || ')';
  needs_approval := COALESCE((SELECT results_approval_required FROM public.school_config WHERE school_id = a.school_id), TRUE);

  IF _to = 'submitted' THEN
    IF NOT public.can_enter_marks(a.id) THEN
      RAISE EXCEPTION 'only the subject teacher can submit these results' USING ERRCODE = '42501';
    END IF;
    IF a.status <> 'draft' THEN RAISE EXCEPTION 'only a draft can be submitted' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.marks m WHERE m.assessment_id = a.id AND m.score IS NOT NULL) THEN
      RAISE EXCEPTION 'enter at least one mark before submitting' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assessments SET status = 'submitted', submitted_at = now() WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_submitted', 'assessment', a.id, label, '{}');
  ELSIF _to = 'approved' THEN
    IF NOT public.has_permission(a.school_id, 'grades.approve') THEN
      RAISE EXCEPTION 'you cannot approve results' USING ERRCODE = '42501';
    END IF;
    IF a.status <> 'submitted' THEN RAISE EXCEPTION 'only submitted results can be approved' USING ERRCODE = '22023'; END IF;
    UPDATE public.assessments SET status = 'approved', approved_by = public.my_profile_id(a.school_id), approved_at = now() WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_approved', 'assessment', a.id, label, '{}');
  ELSIF _to = 'published' THEN
    IF a.status = 'submitted' AND NOT needs_approval AND (public.can_enter_marks(a.id) OR public.has_permission(a.school_id, 'grades.publish')) THEN
      NULL; -- the school lets the subject teacher publish without a separate approval step
    ELSE
      IF NOT public.has_permission(a.school_id, 'grades.publish') THEN
        RAISE EXCEPTION 'you cannot publish results' USING ERRCODE = '42501';
      END IF;
      IF a.status <> 'approved' THEN RAISE EXCEPTION 'results must be approved before publishing' USING ERRCODE = '22023'; END IF;
    END IF;
    UPDATE public.assessments SET status = 'published', published_at = now() WHERE id = a.id;
    PERFORM public.snapshot_marks(a.id, 'Published');
    PERFORM public.write_audit(a.school_id, 'results_published', 'assessment', a.id, label, '{}');
    PERFORM public.notify_assessment_people(a.id, NULL, 'result_published', 'New results published');
  ELSIF _to = 'draft' THEN
    IF NOT public.has_permission(a.school_id, 'grades.reopen') THEN
      RAISE EXCEPTION 'you cannot reopen results' USING ERRCODE = '42501';
    END IF;
    IF a.status = 'draft' THEN RAISE EXCEPTION 'these results are already a draft' USING ERRCODE = '22023'; END IF;
    IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'give a reason for reopening' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assessments
       SET status = 'draft', submitted_at = NULL, approved_by = NULL, approved_at = NULL, published_at = NULL
     WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_reopened', 'assessment', a.id, label,
      jsonb_build_object('reason', btrim(_reason), 'was', a.status));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Corrections to published results
-- ---------------------------------------------------------------------------
-- Internal: apply an approved correction, keep the history, audit it, notify people.
CREATE OR REPLACE FUNCTION public.apply_correction(_correction UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.result_corrections;
  a public.assessments;
  label TEXT;
BEGIN
  SELECT * INTO c FROM public.result_corrections WHERE id = _correction FOR UPDATE;
  IF c.status <> 'approved' OR c.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'this correction cannot be applied' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO a FROM public.assessments WHERE id = c.assessment_id;
  label := a.title || ' (' || (SELECT name FROM public.subjects WHERE id = a.subject_id) || ')';

  PERFORM set_config('app.correction_id', _correction::text, true);
  UPDATE public.marks SET score = c.new_score, comment = c.new_comment
   WHERE assessment_id = c.assessment_id AND student_id = c.student_id;
  PERFORM set_config('app.correction_id', '', true);

  INSERT INTO public.result_versions (school_id, assessment_id, student_id, version, score, max_score, grade, comment, changed_by, changed_role, reason, correction_id)
  VALUES (c.school_id, c.assessment_id, c.student_id,
          COALESCE((SELECT max(v.version) FROM public.result_versions v WHERE v.assessment_id = c.assessment_id AND v.student_id = c.student_id), 0) + 1,
          c.new_score, a.max_score, c.new_grade, c.new_comment, c.requested_by, c.requested_role, c.reason, c.id);
  UPDATE public.result_corrections SET applied_at = clock_timestamp() WHERE id = c.id;

  PERFORM public.write_audit(c.school_id, 'results_corrected', 'result', c.student_id, label,
    jsonb_build_object('correction_id', c.id, 'assessment_id', c.assessment_id, 'student_id', c.student_id,
      'old_score', c.old_score, 'new_score', c.new_score, 'old_grade', c.old_grade, 'new_grade', c.new_grade,
      'old_comment', c.old_comment, 'new_comment', c.new_comment, 'reason', c.reason,
      'requested_by', c.requested_by, 'approved_by', c.decided_by));
  PERFORM public.notify_assessment_people(c.assessment_id, c.student_id, 'result_corrected', 'A published result was updated');
END $$;

CREATE OR REPLACE FUNCTION public.request_correction(
  _assessment UUID, _student UUID, _new_score NUMERIC, _new_comment TEXT, _reason TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  m public.marks;
  me UUID;
  cid UUID;
  teacher_ok BOOLEAN;
  auto BOOLEAN;
  needs_approval BOOLEAN;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE = '42501'; END IF;
  teacher_ok := public.can_enter_marks(a.id);
  IF NOT (teacher_ok OR public.has_permission(a.school_id, 'grades.correct')) THEN
    RAISE EXCEPTION 'you cannot correct these results' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'published' THEN
    RAISE EXCEPTION 'only published results need a correction; edit drafts directly' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'give a reason for the correction' USING ERRCODE = '22023';
  END IF;
  IF _new_score IS NULL OR _new_score < 0 OR _new_score > a.max_score THEN
    RAISE EXCEPTION 'the score must be a number from 0 to %', a.max_score USING ERRCODE = '23514';
  END IF;
  SELECT * INTO m FROM public.marks WHERE assessment_id = a.id AND student_id = _student;
  IF NOT FOUND OR m.score IS NULL THEN
    RAISE EXCEPTION 'this student has no published mark to correct' USING ERRCODE = '22023';
  END IF;
  IF m.score = _new_score AND m.comment IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(_new_comment, '')), '') THEN
    RAISE EXCEPTION 'nothing would change' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.result_corrections WHERE assessment_id = a.id AND student_id = _student AND status = 'pending') THEN
    RAISE EXCEPTION 'a correction for this result is already waiting for approval' USING ERRCODE = '23505';
  END IF;

  me := public.my_profile_id(a.school_id);
  needs_approval := COALESCE((SELECT correction_approval_required FROM public.school_config WHERE school_id = a.school_id), TRUE);
  auto := public.has_permission(a.school_id, 'grades.approve') OR (teacher_ok AND NOT needs_approval);

  INSERT INTO public.result_corrections
    (school_id, assessment_id, student_id, old_score, new_score, old_comment, new_comment, old_grade, new_grade, reason, requested_by, requested_role)
  VALUES
    (a.school_id, a.id, _student, m.score, _new_score, m.comment, NULLIF(btrim(COALESCE(_new_comment, '')), ''),
     public.grade_for(a.school_id, m.score / a.max_score * 100), public.grade_for(a.school_id, _new_score / a.max_score * 100),
     btrim(_reason), me, (SELECT string_agg(r::text, ',') FROM public.my_roles(a.school_id) r))
  RETURNING id INTO cid;

  PERFORM public.write_audit(a.school_id, 'result_correction_requested', 'result', _student, a.title,
    jsonb_build_object('correction_id', cid, 'old_score', m.score, 'new_score', _new_score, 'reason', btrim(_reason), 'auto_approved', auto));

  IF auto THEN
    UPDATE public.result_corrections SET status = 'approved', decided_by = me, decided_at = clock_timestamp() WHERE id = cid;
    PERFORM public.apply_correction(cid);
  ELSE
    -- Tell the people who can approve it.
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT a.school_id, sm.profile_id, 'correction_pending', 'A result correction needs approval', a.title, '/exams'
      FROM public.school_memberships sm
     WHERE sm.school_id = a.school_id AND sm.role = 'school_admin' AND sm.status = 'active';
  END IF;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.decide_correction(_correction UUID, _approve BOOLEAN, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.result_corrections;
  me UUID;
BEGIN
  SELECT * INTO c FROM public.result_corrections WHERE id = _correction FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'correction not found' USING ERRCODE = '42501'; END IF;
  IF NOT public.has_permission(c.school_id, 'grades.approve') THEN
    RAISE EXCEPTION 'you cannot decide corrections' USING ERRCODE = '42501';
  END IF;
  IF c.status <> 'pending' THEN RAISE EXCEPTION 'this correction has already been decided' USING ERRCODE = '22023'; END IF;
  me := public.my_profile_id(c.school_id);
  IF NOT _approve AND length(btrim(COALESCE(_note, ''))) = 0 THEN
    RAISE EXCEPTION 'say why the correction is rejected' USING ERRCODE = '22023';
  END IF;

  UPDATE public.result_corrections
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         decided_by = me, decided_at = clock_timestamp(), decision_note = NULLIF(btrim(COALESCE(_note, '')), '')
   WHERE id = c.id;
  IF _approve THEN
    PERFORM public.apply_correction(c.id);
  ELSE
    PERFORM public.write_audit(c.school_id, 'correction_rejected', 'result', c.student_id, NULL,
      jsonb_build_object('correction_id', c.id, 'note', btrim(_note)));
    PERFORM public.notify(c.school_id, c.requested_by, 'correction_rejected', 'A result correction was rejected',
      (SELECT title FROM public.assessments WHERE id = c.assessment_id), '/exams');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Notification access
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_notifications(_school UUID, _limit INT DEFAULT 50)
RETURNS TABLE (id UUID, kind TEXT, title TEXT, body TEXT, link TEXT, created_at TIMESTAMPTZ, read_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.kind, n.title, n.body, n.link, n.created_at, n.read_at
    FROM public.notifications n
   WHERE n.school_id = _school AND n.recipient_id = public.my_profile_id(_school) AND public.is_member(_school)
   ORDER BY n.created_at DESC
   LIMIT LEAST(GREATEST(COALESCE(_limit, 50), 1), 200)
$$;

CREATE OR REPLACE FUNCTION public.unread_notification_count(_school UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.notifications n
   WHERE n.school_id = _school AND n.recipient_id = public.my_profile_id(_school)
     AND public.is_member(_school) AND n.read_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_school UUID, _id UUID DEFAULT NULL)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.notifications SET read_at = clock_timestamp()
   WHERE school_id = _school AND recipient_id = public.my_profile_id(_school) AND public.is_member(_school)
     AND read_at IS NULL AND (_id IS NULL OR id = _id)
$$;

-- ---------------------------------------------------------------------------
-- Authorised data for downloads. The browser turns these rows into PDF, Excel or
-- CSV; every call re-checks who is asking and writes an audit entry. Only
-- published marks are ever returned.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.grade_bands, public.result_versions, public.result_corrections, public.notifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.grade_bands, public.result_versions, public.result_corrections, public.notifications FROM authenticated;
GRANT SELECT ON public.grade_bands, public.result_versions, public.result_corrections, public.notifications TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.grade_for(UUID, NUMERIC), public.set_grade_bands(UUID, JSONB),
  public.notify(UUID, UUID, TEXT, TEXT, TEXT, TEXT), public.notify_assessment_people(UUID, UUID, TEXT, TEXT),
  public.snapshot_marks(UUID, TEXT), public.apply_correction(UUID),
  public.request_correction(UUID, UUID, NUMERIC, TEXT, TEXT), public.decide_correction(UUID, BOOLEAN, TEXT),
  public.my_notifications(UUID, INT), public.unread_notification_count(UUID), public.mark_notifications_read(UUID, UUID),
  public.student_report(UUID, UUID), public.class_results(UUID, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_grade_bands(UUID, JSONB),
  public.request_correction(UUID, UUID, NUMERIC, TEXT, TEXT), public.decide_correction(UUID, BOOLEAN, TEXT),
  public.my_notifications(UUID, INT), public.unread_notification_count(UUID), public.mark_notifications_read(UUID, UUID),
  public.student_report(UUID, UUID), public.class_results(UUID, UUID)
TO authenticated;
-- grade_for, notify, notify_assessment_people, snapshot_marks and apply_correction run only inside the functions above.
