-- Phase D: assignments and online exams, student submissions, secure files.
--
-- One source of truth: the existing `assessments` table is extended (instructions,
-- window, deadline, format, rules, rubric, release). Marks, approval, publication,
-- corrections and downloads all keep working on the same records. A student
-- submission is a separate record that leads to the teacher's mark.
--
-- Files are kept in the database (no public URLs) and are read only through
-- functions that re-check who is asking. Size, type, name and file signature are
-- checked on upload; nothing executable is accepted.

-- ---------------------------------------------------------------------------
-- Assessment fields
-- ---------------------------------------------------------------------------
ALTER TABLE public.assessments
  ADD COLUMN description TEXT CHECK (description IS NULL OR length(description) <= 4000),
  ADD COLUMN instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 8000),
  ADD COLUMN starts_at TIMESTAMPTZ,
  ADD COLUMN deadline_at TIMESTAMPTZ,
  ADD COLUMN duration_minutes INT CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600),
  ADD COLUMN submission_format TEXT NOT NULL DEFAULT 'none'
    CHECK (submission_format IN ('none', 'file', 'text', 'file_or_text', 'online')),
  ADD COLUMN allowed_file_types TEXT[] NOT NULL DEFAULT ARRAY['pdf', 'docx', 'png', 'jpg', 'txt'],
  ADD COLUMN max_file_mb INT NOT NULL DEFAULT 5 CHECK (max_file_mb BETWEEN 1 AND 10),
  ADD COLUMN max_files INT NOT NULL DEFAULT 3 CHECK (max_files BETWEEN 1 AND 10),
  ADD COLUMN late_policy TEXT NOT NULL DEFAULT 'not_allowed' CHECK (late_policy IN ('not_allowed', 'allow', 'penalty')),
  ADD COLUMN late_penalty_percent NUMERIC(5,2) CHECK (late_penalty_percent IS NULL OR (late_penalty_percent >= 0 AND late_penalty_percent <= 100)),
  ADD COLUMN attempts_allowed INT NOT NULL DEFAULT 1 CHECK (attempts_allowed BETWEEN 1 AND 5),
  ADD COLUMN rubric JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN released_at TIMESTAMPTZ,
  ADD COLUMN released_by UUID,
  ADD CONSTRAINT assessments_window_check CHECK (starts_at IS NULL OR deadline_at IS NULL OR deadline_at > starts_at),
  ADD CONSTRAINT assessments_file_types_check CHECK (allowed_file_types <@ ARRAY['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg']);

-- Release and the release stamp change only through release_assessment().
CREATE OR REPLACE FUNCTION public.guard_assessment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'draft';
      NEW.submitted_at := NULL; NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.published_at := NULL;
      NEW.released_at := NULL; NEW.released_by := NULL;
      NEW.created_by := public.my_profile_id(NEW.school_id);
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.released_at IS DISTINCT FROM OLD.released_at OR NEW.released_by IS DISTINCT FROM OLD.released_by
       OR NEW.class_id <> OLD.class_id OR NEW.subject_id <> OLD.subject_id OR NEW.school_id <> OLD.school_id THEN
      RAISE EXCEPTION 'use submit, approve, publish, release or reopen to change an assessment''s status' USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only a draft assessment can be edited' USING ERRCODE = '42501';
    END IF;
    -- Once students have started, the format and the file rules stay fixed.
    IF OLD.released_at IS NOT NULL AND EXISTS (SELECT 1 FROM public.submissions s WHERE s.assessment_id = OLD.id)
       AND (NEW.submission_format <> OLD.submission_format OR NEW.max_file_mb <> OLD.max_file_mb OR NEW.max_files <> OLD.max_files
            OR NEW.allowed_file_types <> OLD.allowed_file_types OR NEW.attempts_allowed < OLD.attempts_allowed
            OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes) THEN
      RAISE EXCEPTION 'students have already started; only the deadline, instructions and late rules can change' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Submissions and files
-- ---------------------------------------------------------------------------
CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  student_id UUID NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'late', 'returned', 'marked')),
  text_answer TEXT CHECK (text_answer IS NULL OR length(text_answer) <= 20000),
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  due_by TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  return_note TEXT,
  returned_at TIMESTAMPTZ,
  returned_by UUID,
  marked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (assessment_id, student_id, attempt),
  UNIQUE (school_id, id)
);
CREATE INDEX idx_submissions_student ON public.submissions (student_id);

CREATE TABLE public.stored_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  submission_id UUID,
  student_id UUID,
  uploaded_by UUID NOT NULL,
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INT NOT NULL CHECK (size_bytes > 0),
  sha256 BYTEA NOT NULL,
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, submission_id) REFERENCES public.submissions (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_files_assessment ON public.stored_files (assessment_id) WHERE submission_id IS NULL;
CREATE INDEX idx_files_submission ON public.stored_files (submission_id);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;
-- No policies and no grants: the tables are reached only through the functions below.
REVOKE ALL ON public.submissions, public.stored_files FROM anon, authenticated;

-- Assessments are visible to the class once released (results still need publication).
DROP POLICY IF EXISTS assessments_select ON public.assessments;
CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'grades.view') OR public.teaches_class(class_id)
         OR (status = 'published' AND public.belongs_to_class(class_id))
         OR (released_at IS NOT NULL AND public.belongs_to_class(class_id)));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- The caller's own student profile, if they are an active student in this class.
CREATE OR REPLACE FUNCTION public.my_student_in_class(_class UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.student_id FROM public.enrollments e
  JOIN public.profiles p ON p.id = e.student_id AND p.school_id = e.school_id
  WHERE e.class_id = _class AND e.status = 'active' AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL
    AND p.status = 'active' AND public.has_role_in(e.school_id, 'student')
  LIMIT 1
$$;

-- Teachers of the class, or staff with results access, may look at submissions.
CREATE OR REPLACE FUNCTION public.can_mark_submissions(_assessment UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_enter_marks(_assessment)
$$;

-- Checks one upload and returns its clean name and canonical type.
CREATE OR REPLACE FUNCTION public.check_upload(_name TEXT, _data BYTEA, _allowed TEXT[], _max_mb INT)
RETURNS TABLE (clean_name TEXT, mime TEXT) LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  base TEXT := regexp_replace(COALESCE(_name, ''), '^.*[\\/]', '');
  ext TEXT;
  head BYTEA;
BEGIN
  base := btrim(regexp_replace(base, '[^A-Za-z0-9._() -]', '_', 'g'));
  IF length(base) = 0 OR length(base) > 120 OR base !~ '\.[A-Za-z0-9]{2,5}$' THEN
    RAISE EXCEPTION 'give the file a name with an extension, up to 120 characters' USING ERRCODE = '22023';
  END IF;
  ext := lower(substring(base FROM '\.([A-Za-z0-9]+)$'));
  IF ext = 'jpeg' THEN ext := 'jpg'; END IF;
  IF ext IS NULL OR NOT (ext = ANY (_allowed)) THEN
    RAISE EXCEPTION 'this file type is not allowed here (allowed: %)', array_to_string(_allowed, ', ') USING ERRCODE = '22023';
  END IF;
  IF _data IS NULL OR length(_data) = 0 THEN RAISE EXCEPTION 'the file is empty' USING ERRCODE = '22023'; END IF;
  IF length(_data) > _max_mb * 1024 * 1024 THEN
    RAISE EXCEPTION 'the file is larger than % MB', _max_mb USING ERRCODE = '54000';
  END IF;
  head := substring(_data FROM 1 FOR 8);
  IF (ext = 'pdf' AND substring(head FROM 1 FOR 5) <> '\x255044462d')
     OR (ext = 'png' AND substring(head FROM 1 FOR 4) <> '\x89504e47')
     OR (ext = 'jpg' AND substring(head FROM 1 FOR 3) <> '\xffd8ff')
     OR (ext IN ('docx', 'xlsx', 'pptx') AND substring(head FROM 1 FOR 4) <> '\x504b0304')
     OR (ext IN ('txt', 'csv') AND position('\x00'::bytea IN substring(_data FROM 1 FOR 4096)) > 0) THEN
    RAISE EXCEPTION 'the file content does not match its type' USING ERRCODE = '22023';
  END IF;
  clean_name := base;
  mime := CASE ext
    WHEN 'pdf' THEN 'application/pdf' WHEN 'png' THEN 'image/png' WHEN 'jpg' THEN 'image/jpeg'
    WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    WHEN 'pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    WHEN 'csv' THEN 'text/csv' ELSE 'text/plain' END;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.decode_upload(_b64 TEXT, _max_mb INT)
RETURNS BYTEA LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _b64 IS NULL OR length(_b64) > (_max_mb * 1024 * 1024 * 4 / 3) + 16 THEN
    RAISE EXCEPTION 'the file is larger than % MB', _max_mb USING ERRCODE = '54000';
  END IF;
  RETURN decode(_b64, 'base64');
EXCEPTION WHEN invalid_parameter_value OR data_exception THEN
  RAISE EXCEPTION 'the file could not be read' USING ERRCODE = '22023';
END $$;

-- ---------------------------------------------------------------------------
-- Teacher: release, attach files
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_assessment(_assessment UUID, _release BOOLEAN DEFAULT TRUE)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  label TEXT;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment FOR UPDATE;
  IF NOT FOUND OR NOT public.can_enter_marks(a.id) THEN
    RAISE EXCEPTION 'you cannot release this assessment' USING ERRCODE = '42501';
  END IF;
  label := a.title || ' (' || (SELECT name FROM public.subjects WHERE id = a.subject_id) || ')';
  IF _release THEN
    IF a.released_at IS NOT NULL THEN RAISE EXCEPTION 'already released' USING ERRCODE = '22023'; END IF;
    IF a.status <> 'draft' THEN RAISE EXCEPTION 'only a draft assessment can be released' USING ERRCODE = '22023'; END IF;
    IF a.submission_format <> 'none' AND a.deadline_at IS NULL THEN
      RAISE EXCEPTION 'set a submission deadline before releasing' USING ERRCODE = '22023';
    END IF;
    IF a.submission_format = 'online' AND a.duration_minutes IS NULL THEN
      RAISE EXCEPTION 'set how long an online exam lasts before releasing' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assessments SET released_at = clock_timestamp(), released_by = public.my_profile_id(a.school_id) WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'assessment_released', 'assessment', a.id, label, '{}');
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT DISTINCT a.school_id, r.pid, 'assignment_released', 'New assignment', label, '/assignments'
      FROM (
        SELECT e.student_id AS pid FROM public.enrollments e WHERE e.class_id = a.class_id AND e.status = 'active'
        UNION
        SELECT g.guardian_id FROM public.guardian_links g JOIN public.enrollments e ON e.student_id = g.student_id AND e.class_id = a.class_id AND e.status = 'active'
         WHERE g.status = 'verified'
      ) r JOIN public.profiles p ON p.id = r.pid AND p.school_id = a.school_id AND p.status = 'active';
  ELSE
    IF a.released_at IS NULL THEN RAISE EXCEPTION 'not released' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.submissions s WHERE s.assessment_id = a.id) THEN
      RAISE EXCEPTION 'students have already started, so it cannot be withdrawn' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assessments SET released_at = NULL, released_by = NULL WHERE id = a.id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.add_assessment_file(_assessment UUID, _name TEXT, _b64 TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  data BYTEA;
  chk RECORD;
  fid UUID;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  IF NOT FOUND OR NOT public.can_enter_marks(a.id) THEN RAISE EXCEPTION 'you cannot attach files here' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'draft' THEN RAISE EXCEPTION 'files can only be changed while the assessment is a draft' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.stored_files WHERE assessment_id = a.id AND submission_id IS NULL) >= 5 THEN
    RAISE EXCEPTION 'an assessment can have up to 5 attachments' USING ERRCODE = '54000';
  END IF;
  data := public.decode_upload(_b64, 10);
  SELECT * INTO chk FROM public.check_upload(_name, data, ARRAY['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg'], 10);
  INSERT INTO public.stored_files (school_id, assessment_id, uploaded_by, file_name, mime, size_bytes, sha256, content)
  VALUES (a.school_id, a.id, public.my_profile_id(a.school_id), chk.clean_name, chk.mime, length(data), sha256(data), data) RETURNING id INTO fid;
  RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.remove_file(_file UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.stored_files;
  s public.submissions;
  a public.assessments;
BEGIN
  SELECT * INTO f FROM public.stored_files WHERE id = _file FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'file not found' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.assessments WHERE id = f.assessment_id;
  IF f.submission_id IS NULL THEN
    IF NOT public.can_enter_marks(a.id) OR a.status <> 'draft' THEN RAISE EXCEPTION 'you cannot remove this file' USING ERRCODE = '42501'; END IF;
  ELSE
    SELECT * INTO s FROM public.submissions WHERE id = f.submission_id;
    IF s.student_id IS DISTINCT FROM public.my_student_in_class(a.class_id) OR s.status NOT IN ('draft', 'returned') THEN
      RAISE EXCEPTION 'you cannot remove this file' USING ERRCODE = '42501';
    END IF;
  END IF;
  DELETE FROM public.stored_files WHERE id = f.id;
END $$;

-- ---------------------------------------------------------------------------
-- Student: start, save, upload, submit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_submission(_assessment UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  me UUID;
  s public.submissions;
  used INT;
  due TIMESTAMPTZ;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = '42501'; END IF;
  me := public.my_student_in_class(a.class_id);
  IF me IS NULL OR a.released_at IS NULL THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = '42501'; END IF;
  IF a.submission_format = 'none' THEN RAISE EXCEPTION 'this assessment does not take submissions' USING ERRCODE = '22023'; END IF;
  IF (SELECT status FROM public.schools WHERE id = a.school_id) <> 'active' THEN
    RAISE EXCEPTION 'the school account is suspended' USING ERRCODE = '42501';
  END IF;
  IF a.starts_at IS NOT NULL AND clock_timestamp() < a.starts_at THEN RAISE EXCEPTION 'this assignment has not opened yet' USING ERRCODE = '22023'; END IF;

  -- Carry on with an open attempt.
  SELECT * INTO s FROM public.submissions WHERE assessment_id = a.id AND student_id = me AND status IN ('draft', 'returned')
   ORDER BY attempt DESC LIMIT 1;
  IF FOUND THEN RETURN s.id; END IF;

  SELECT count(*) INTO used FROM public.submissions WHERE assessment_id = a.id AND student_id = me;
  IF used >= a.attempts_allowed THEN RAISE EXCEPTION 'you have used all your attempts' USING ERRCODE = '22023'; END IF;
  IF a.deadline_at IS NOT NULL AND clock_timestamp() > a.deadline_at AND a.late_policy = 'not_allowed' THEN
    RAISE EXCEPTION 'the deadline has passed' USING ERRCODE = '22023';
  END IF;

  due := a.deadline_at;
  IF a.duration_minutes IS NOT NULL THEN
    due := LEAST(COALESCE(a.deadline_at, 'infinity'::timestamptz), clock_timestamp() + make_interval(mins => a.duration_minutes));
    IF due = 'infinity' THEN due := NULL; END IF;
  END IF;
  INSERT INTO public.submissions (school_id, assessment_id, student_id, attempt, due_by)
  VALUES (a.school_id, a.id, me, used + 1, due) RETURNING * INTO s;
  RETURN s.id;
END $$;

-- Shared check for every change a student makes to their own open submission.
CREATE OR REPLACE FUNCTION public.open_own_submission(_submission UUID)
RETURNS public.submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions;
  a public.assessments;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id = _submission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.assessments WHERE id = s.assessment_id;
  IF s.student_id IS DISTINCT FROM public.my_student_in_class(a.class_id) THEN
    RAISE EXCEPTION 'submission not found' USING ERRCODE = '42501';
  END IF;
  IF s.status NOT IN ('draft', 'returned') THEN RAISE EXCEPTION 'this submission has already been handed in' USING ERRCODE = '22023'; END IF;
  IF (SELECT status FROM public.schools WHERE id = s.school_id) <> 'active' THEN
    RAISE EXCEPTION 'the school account is suspended' USING ERRCODE = '42501';
  END IF;
  RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.save_submission(_submission UUID, _text TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions;
  a public.assessments;
BEGIN
  s := public.open_own_submission(_submission);
  SELECT * INTO a FROM public.assessments WHERE id = s.assessment_id;
  IF a.submission_format = 'file' THEN RAISE EXCEPTION 'this assignment takes files, not typed answers' USING ERRCODE = '22023'; END IF;
  IF length(COALESCE(_text, '')) > 20000 THEN RAISE EXCEPTION 'the answer is too long (20,000 characters at most)' USING ERRCODE = '54000'; END IF;
  UPDATE public.submissions SET text_answer = _text, updated_at = clock_timestamp() WHERE id = s.id;
END $$;

CREATE OR REPLACE FUNCTION public.add_submission_file(_submission UUID, _name TEXT, _b64 TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions;
  a public.assessments;
  data BYTEA;
  chk RECORD;
  fid UUID;
BEGIN
  s := public.open_own_submission(_submission);
  SELECT * INTO a FROM public.assessments WHERE id = s.assessment_id;
  IF a.submission_format IN ('text', 'online') THEN RAISE EXCEPTION 'this assignment does not take files' USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.stored_files WHERE submission_id = s.id) >= a.max_files THEN
    RAISE EXCEPTION 'you can upload at most % file(s)', a.max_files USING ERRCODE = '54000';
  END IF;
  data := public.decode_upload(_b64, a.max_file_mb);
  SELECT * INTO chk FROM public.check_upload(_name, data, a.allowed_file_types, a.max_file_mb);
  INSERT INTO public.stored_files (school_id, assessment_id, submission_id, student_id, uploaded_by, file_name, mime, size_bytes, sha256, content)
  VALUES (s.school_id, s.assessment_id, s.id, s.student_id, s.student_id, chk.clean_name, chk.mime, length(data), sha256(data), data) RETURNING id INTO fid;
  UPDATE public.submissions SET updated_at = clock_timestamp() WHERE id = s.id;
  RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.submit_submission(_submission UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions;
  a public.assessments;
  late BOOLEAN;
  nfiles INT;
  label TEXT;
  receipt TEXT;
BEGIN
  s := public.open_own_submission(_submission);
  SELECT * INTO a FROM public.assessments WHERE id = s.assessment_id;
  SELECT count(*) INTO nfiles FROM public.stored_files WHERE submission_id = s.id;
  IF a.submission_format = 'file' AND nfiles = 0 THEN RAISE EXCEPTION 'upload your file before submitting' USING ERRCODE = '22023'; END IF;
  IF a.submission_format IN ('text', 'online') AND length(btrim(COALESCE(s.text_answer, ''))) = 0 THEN
    RAISE EXCEPTION 'write your answer before submitting' USING ERRCODE = '22023';
  END IF;
  IF a.submission_format = 'file_or_text' AND nfiles = 0 AND length(btrim(COALESCE(s.text_answer, ''))) = 0 THEN
    RAISE EXCEPTION 'add a file or write an answer before submitting' USING ERRCODE = '22023';
  END IF;

  late := s.due_by IS NOT NULL AND clock_timestamp() > s.due_by;
  IF late AND a.late_policy = 'not_allowed' THEN
    RAISE EXCEPTION 'the deadline has passed and late work is not accepted' USING ERRCODE = '22023';
  END IF;

  UPDATE public.submissions
     SET status = CASE WHEN late THEN 'late' ELSE 'submitted' END, is_late = late, submitted_at = clock_timestamp(), updated_at = clock_timestamp()
   WHERE id = s.id RETURNING * INTO s;

  label := a.title || ' (' || (SELECT name FROM public.subjects WHERE id = a.subject_id) || ')';
  receipt := 'SUB-' || upper(substr(replace(s.id::text, '-', ''), 1, 8));
  PERFORM public.write_audit(s.school_id, 'submission_received', 'submission', s.id, label,
    jsonb_build_object('assessment_id', a.id, 'attempt', s.attempt, 'late', late, 'files', nfiles));
  PERFORM public.notify(s.school_id, s.student_id, 'submission_received', 'Submission received', label || ' (' || receipt || ')', '/assignments');
  IF a.created_by IS NOT NULL THEN
    PERFORM public.notify(s.school_id, a.created_by, 'submission_new', 'New submission to mark', label, '/exams');
  END IF;
  RETURN jsonb_build_object('receipt', receipt, 'status', s.status, 'submitted_at', s.submitted_at, 'late', late, 'files', nfiles,
                            'penalty_percent', CASE WHEN late AND a.late_policy = 'penalty' THEN a.late_penalty_percent END);
END $$;

-- ---------------------------------------------------------------------------
-- Teacher: return for resubmission; a mark moves a submission to "marked"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_submission(_submission UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions;
  a public.assessments;
  label TEXT;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id = _submission FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.assessments WHERE id = s.assessment_id;
  IF NOT public.can_mark_submissions(a.id) THEN RAISE EXCEPTION 'you cannot return this submission' USING ERRCODE = '42501'; END IF;
  IF a.status <> 'draft' THEN RAISE EXCEPTION 'the results are no longer a draft' USING ERRCODE = '22023'; END IF;
  IF s.status NOT IN ('submitted', 'late', 'marked') THEN RAISE EXCEPTION 'only handed-in work can be returned' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_note, ''))) = 0 THEN RAISE EXCEPTION 'tell the student what to improve' USING ERRCODE = '22023'; END IF;
  UPDATE public.submissions
     SET status = 'returned', return_note = btrim(_note), returned_at = clock_timestamp(), returned_by = public.my_profile_id(s.school_id),
         submitted_at = NULL, is_late = FALSE, marked_at = NULL, due_by = GREATEST(COALESCE(due_by, clock_timestamp()), clock_timestamp() + interval '1 day'),
         updated_at = clock_timestamp()
   WHERE id = s.id;
  label := a.title || ' (' || (SELECT name FROM public.subjects WHERE id = a.subject_id) || ')';
  PERFORM public.write_audit(s.school_id, 'submission_returned', 'submission', s.id, label, jsonb_build_object('assessment_id', a.id));
  PERFORM public.notify(s.school_id, s.student_id, 'submission_returned', 'Your work was returned', label, '/assignments');
END $$;

CREATE OR REPLACE FUNCTION public.mark_submission_marked()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.score IS NOT NULL THEN
    UPDATE public.submissions SET status = 'marked', marked_at = clock_timestamp()
     WHERE id = (SELECT id FROM public.submissions WHERE assessment_id = NEW.assessment_id AND student_id = NEW.student_id ORDER BY attempt DESC LIMIT 1)
       AND status IN ('submitted', 'late');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marks_mark_submission AFTER INSERT OR UPDATE OF score ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.mark_submission_marked();

-- ---------------------------------------------------------------------------
-- Reading: assignments, submissions, files
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_assignments(_school UUID)
RETURNS TABLE (
  assessment_id UUID, title TEXT, subject_name TEXT, class_name TEXT, kind assessment_kind, submission_format TEXT,
  starts_at TIMESTAMPTZ, deadline_at TIMESTAMPTZ, duration_minutes INT, max_score NUMERIC, attempts_allowed INT,
  attempts_used INT, submission_id UUID, submission_status TEXT, submitted_at TIMESTAMPTZ, is_late BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.title, s.name, c.name, a.kind, a.submission_format, a.starts_at, a.deadline_at, a.duration_minutes, a.max_score,
         a.attempts_allowed,
         (SELECT count(*)::int FROM public.submissions x WHERE x.assessment_id = a.id AND x.student_id = me.id),
         sub.id, sub.status, sub.submitted_at, COALESCE(sub.is_late, FALSE)
  FROM public.assessments a
  JOIN public.classes c ON c.id = a.class_id
  JOIN public.subjects s ON s.id = a.subject_id
  JOIN LATERAL (SELECT public.my_student_in_class(a.class_id) AS id) me ON me.id IS NOT NULL
  LEFT JOIN LATERAL (SELECT * FROM public.submissions x WHERE x.assessment_id = a.id AND x.student_id = me.id ORDER BY x.attempt DESC LIMIT 1) sub ON TRUE
  WHERE a.school_id = _school AND a.released_at IS NOT NULL AND a.submission_format <> 'none' AND public.is_member(_school)
  ORDER BY COALESCE(a.deadline_at, a.created_at) DESC
$$;

CREATE OR REPLACE FUNCTION public.get_assignment(_assessment UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  me UUID;
  teacher BOOLEAN;
  sub public.submissions;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  IF NOT FOUND THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = '42501'; END IF;
  teacher := public.can_mark_submissions(a.id) OR public.has_permission(a.school_id, 'grades.view');
  me := public.my_student_in_class(a.class_id);
  IF NOT (teacher OR (me IS NOT NULL AND a.released_at IS NOT NULL)) THEN RAISE EXCEPTION 'assignment not found' USING ERRCODE = '42501'; END IF;
  IF me IS NOT NULL THEN
    SELECT * INTO sub FROM public.submissions WHERE assessment_id = a.id AND student_id = me ORDER BY attempt DESC LIMIT 1;
  END IF;
  RETURN jsonb_build_object(
    'assessment', jsonb_build_object('id', a.id, 'title', a.title, 'kind', a.kind, 'description', a.description, 'instructions', a.instructions,
      'max_score', a.max_score, 'starts_at', a.starts_at, 'deadline_at', a.deadline_at, 'duration_minutes', a.duration_minutes,
      'submission_format', a.submission_format, 'allowed_file_types', a.allowed_file_types, 'max_file_mb', a.max_file_mb, 'max_files', a.max_files,
      'late_policy', a.late_policy, 'late_penalty_percent', a.late_penalty_percent, 'attempts_allowed', a.attempts_allowed, 'rubric', a.rubric,
      'released_at', a.released_at, 'subject', (SELECT name FROM public.subjects WHERE id = a.subject_id), 'class', (SELECT name FROM public.classes WHERE id = a.class_id)),
    'files', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.file_name, 'mime', f.mime, 'size', f.size_bytes) ORDER BY f.created_at), '[]')
                FROM public.stored_files f WHERE f.assessment_id = a.id AND f.submission_id IS NULL),
    'submission', CASE WHEN sub.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', sub.id, 'attempt', sub.attempt, 'status', sub.status, 'text_answer', sub.text_answer, 'due_by', sub.due_by, 'submitted_at', sub.submitted_at,
      'is_late', sub.is_late, 'return_note', sub.return_note, 'receipt', 'SUB-' || upper(substr(replace(sub.id::text, '-', ''), 1, 8)),
      'files', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.file_name, 'mime', f.mime, 'size', f.size_bytes) ORDER BY f.created_at), '[]')
                  FROM public.stored_files f WHERE f.submission_id = sub.id)) END);
END $$;

-- Staff view: one row per enrolled student with the state of their work.
CREATE OR REPLACE FUNCTION public.assessment_submissions(_assessment UUID)
RETURNS TABLE (
  student_id UUID, student_name TEXT, submission_id UUID, attempt INT, status TEXT, submitted_at TIMESTAMPTZ, is_late BOOLEAN,
  files INT, has_text BOOLEAN, attempts_used INT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment;
  IF NOT FOUND OR NOT (public.can_mark_submissions(a.id) OR public.has_permission(a.school_id, 'grades.view')) THEN
    RAISE EXCEPTION 'you cannot view these submissions' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, sub.id, sub.attempt, COALESCE(sub.status, 'not_started'), sub.submitted_at, COALESCE(sub.is_late, FALSE),
         (SELECT count(*)::int FROM public.stored_files f WHERE f.submission_id = sub.id),
         length(btrim(COALESCE(sub.text_answer, ''))) > 0,
         (SELECT count(*)::int FROM public.submissions x WHERE x.assessment_id = a.id AND x.student_id = p.id)
  FROM public.enrollments e
  JOIN public.profiles p ON p.id = e.student_id AND p.school_id = e.school_id
  LEFT JOIN LATERAL (SELECT * FROM public.submissions x WHERE x.assessment_id = a.id AND x.student_id = p.id ORDER BY x.attempt DESC LIMIT 1) sub ON TRUE
  WHERE e.class_id = a.class_id AND e.status = 'active'
  ORDER BY p.full_name;
END $$;

-- A student's work, for the student and for the teacher who marks it.
CREATE OR REPLACE FUNCTION public.get_submission(_submission UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.submissions;
  a public.assessments;
BEGIN
  SELECT * INTO s FROM public.submissions WHERE id = _submission;
  IF NOT FOUND THEN RAISE EXCEPTION 'submission not found' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.assessments WHERE id = s.assessment_id;
  IF NOT (s.student_id IS NOT DISTINCT FROM public.my_student_in_class(a.class_id) OR public.can_mark_submissions(a.id)) THEN
    RAISE EXCEPTION 'submission not found' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'id', s.id, 'attempt', s.attempt, 'status', s.status, 'student', (SELECT full_name FROM public.profiles WHERE id = s.student_id),
    'text_answer', s.text_answer, 'submitted_at', s.submitted_at, 'is_late', s.is_late, 'due_by', s.due_by, 'return_note', s.return_note,
    'late_policy', a.late_policy, 'late_penalty_percent', a.late_penalty_percent, 'rubric', a.rubric,
    'files', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.file_name, 'mime', f.mime, 'size', f.size_bytes) ORDER BY f.created_at), '[]')
                FROM public.stored_files f WHERE f.submission_id = s.id));
END $$;

-- One file, re-checked on every request. Returned as base64; there is no stored link to share.
CREATE OR REPLACE FUNCTION public.get_file(_file UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  f public.stored_files;
  a public.assessments;
  ok BOOLEAN;
BEGIN
  SELECT * INTO f FROM public.stored_files WHERE id = _file;
  IF NOT FOUND THEN RAISE EXCEPTION 'file not found' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.assessments WHERE id = f.assessment_id;
  IF f.submission_id IS NULL THEN
    -- Teacher attachments: the teachers and the released class.
    ok := public.can_mark_submissions(a.id) OR public.has_permission(a.school_id, 'grades.view')
          OR (a.released_at IS NOT NULL AND public.belongs_to_class(a.class_id));
  ELSE
    -- A student's own file, or the teacher who marks it. Parents and other students never.
    ok := f.student_id IS NOT DISTINCT FROM public.my_student_in_class(a.class_id) OR public.can_mark_submissions(a.id);
  END IF;
  IF NOT ok THEN RAISE EXCEPTION 'file not found' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('name', f.file_name, 'mime', f.mime, 'size', f.size_bytes, 'content', encode(f.content, 'base64'));
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION
  public.my_student_in_class(UUID), public.can_mark_submissions(UUID), public.check_upload(TEXT, BYTEA, TEXT[], INT),
  public.decode_upload(TEXT, INT), public.open_own_submission(UUID), public.mark_submission_marked(),
  public.release_assessment(UUID, BOOLEAN), public.add_assessment_file(UUID, TEXT, TEXT), public.remove_file(UUID),
  public.start_submission(UUID), public.save_submission(UUID, TEXT), public.add_submission_file(UUID, TEXT, TEXT),
  public.submit_submission(UUID), public.return_submission(UUID, TEXT), public.my_assignments(UUID), public.get_assignment(UUID),
  public.assessment_submissions(UUID), public.get_submission(UUID), public.get_file(UUID)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.release_assessment(UUID, BOOLEAN), public.add_assessment_file(UUID, TEXT, TEXT), public.remove_file(UUID),
  public.start_submission(UUID), public.save_submission(UUID, TEXT), public.add_submission_file(UUID, TEXT, TEXT),
  public.submit_submission(UUID), public.return_submission(UUID, TEXT), public.my_assignments(UUID), public.get_assignment(UUID),
  public.assessment_submissions(UUID), public.get_submission(UUID), public.get_file(UUID)
TO authenticated;
