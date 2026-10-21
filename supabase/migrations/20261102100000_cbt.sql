-- Computer-based testing: a question bank, timed tests for a class, server-side marking, live monitoring with
-- integrity alerts, essay grading and released results. The server keeps the clock and the answer key; the browser never sees either.

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'cbt.manage'), ('headteacher', 'cbt.manage'), ('academic_coordinator', 'cbt.manage')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_manage_cbt(_school UUID, _class UUID, _subject UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_school, 'cbt.manage') OR EXISTS (
    SELECT 1 FROM public.teaching_assignments ta WHERE ta.school_id = _school AND ta.teacher_id = public.my_profile_id(_school)
      AND (_class IS NULL OR ta.class_id = _class) AND (_subject IS NULL OR ta.subject_id = _subject))
$$;

CREATE TABLE public.cbt_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('mcq', 'true_false', 'short', 'essay')),
  prompt TEXT NOT NULL CHECK (length(btrim(prompt)) BETWEEN 3 AND 3000),
  options JSONB NOT NULL DEFAULT '[]',
  correct JSONB,
  marks NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (marks > 0 AND marks <= 100),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.cbt_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 150),
  instructions TEXT CHECK (instructions IS NULL OR length(instructions) <= 2000),
  duration_min INT NOT NULL CHECK (duration_min BETWEEN 1 AND 300),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  shuffle BOOLEAN NOT NULL DEFAULT TRUE,
  max_violations INT NOT NULL DEFAULT 5 CHECK (max_violations BETWEEN 0 AND 50),
  results_released BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX cbt_tests_school ON public.cbt_tests (school_id, starts_at DESC);

-- A test keeps its own copy of each question, so editing the bank later never changes a test already set.
CREATE TABLE public.cbt_test_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.cbt_tests (id) ON DELETE CASCADE,
  question_id UUID,
  position INT NOT NULL,
  kind TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]',
  correct JSONB,
  marks NUMERIC(6,2) NOT NULL
);
CREATE INDEX cbt_test_questions_test ON public.cbt_test_questions (test_id, position);

CREATE TABLE public.cbt_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.cbt_tests (id) ON DELETE RESTRICT,
  school_id UUID NOT NULL,
  student_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  deadline TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  submitted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'auto_submitted', 'terminated')),
  question_order UUID[] NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  essay_scores JSONB NOT NULL DEFAULT '{}',
  auto_score NUMERIC(8,2),
  score NUMERIC(8,2),
  max_score NUMERIC(8,2),
  needs_grading BOOLEAN NOT NULL DEFAULT FALSE,
  violations INT NOT NULL DEFAULT 0,
  UNIQUE (test_id, student_id),
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.cbt_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.cbt_attempts (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tab_switch', 'window_blur', 'copy', 'paste', 'fullscreen_exit', 'right_click')),
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.cbt_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_test_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_violations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cbt_questions, public.cbt_tests, public.cbt_test_questions, public.cbt_attempts, public.cbt_violations FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cbt_check_question(_kind TEXT, _options JSONB, _correct JSONB)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _kind = 'mcq' THEN
    IF jsonb_typeof(_options) <> 'array' OR jsonb_array_length(_options) NOT BETWEEN 2 AND 8 THEN RAISE EXCEPTION 'a multiple-choice question needs 2 to 8 options' USING ERRCODE = '22023'; END IF;
    IF jsonb_typeof(_correct) <> 'number' OR (_correct)::int < 0 OR (_correct)::int >= jsonb_array_length(_options) THEN RAISE EXCEPTION 'choose which option is correct' USING ERRCODE = '22023'; END IF;
  ELSIF _kind = 'true_false' THEN
    IF jsonb_typeof(_correct) <> 'boolean' THEN RAISE EXCEPTION 'choose true or false as the answer' USING ERRCODE = '22023'; END IF;
  ELSIF _kind = 'short' THEN
    IF jsonb_typeof(_correct) <> 'array' OR jsonb_array_length(_correct) = 0 THEN RAISE EXCEPTION 'give at least one accepted answer' USING ERRCODE = '22023'; END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_question_save(_school UUID, _id UUID, _subject UUID, _kind TEXT, _prompt TEXT, _options JSONB, _correct JSONB, _marks NUMERIC, _difficulty TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rid UUID;
BEGIN
  IF NOT public.can_manage_cbt(_school, NULL, _subject) THEN RAISE EXCEPTION 'you cannot write questions for this subject' USING ERRCODE = '42501'; END IF;
  IF _kind NOT IN ('mcq', 'true_false', 'short', 'essay') THEN RAISE EXCEPTION 'unknown question type' USING ERRCODE = '22023'; END IF;
  PERFORM public.cbt_check_question(_kind, COALESCE(_options, '[]'), _correct);
  IF _id IS NULL THEN
    INSERT INTO public.cbt_questions (school_id, subject_id, kind, prompt, options, correct, marks, difficulty, created_by)
    VALUES (_school, _subject, _kind, btrim(_prompt), COALESCE(_options, '[]'), CASE WHEN _kind = 'essay' THEN NULL ELSE _correct END, COALESCE(_marks, 1), COALESCE(_difficulty, 'medium'), public.my_profile_id(_school))
    RETURNING id INTO rid;
  ELSE
    UPDATE public.cbt_questions SET subject_id = _subject, kind = _kind, prompt = btrim(_prompt), options = COALESCE(_options, '[]'),
      correct = CASE WHEN _kind = 'essay' THEN NULL ELSE _correct END, marks = COALESCE(_marks, 1), difficulty = COALESCE(_difficulty, 'medium')
    WHERE id = _id AND school_id = _school AND (created_by = public.my_profile_id(_school) OR public.has_permission(_school, 'cbt.manage')) RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'you cannot edit this question' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_question_archive(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.cbt_questions;
BEGIN
  SELECT * INTO q FROM public.cbt_questions WHERE id = _id;
  IF NOT FOUND OR NOT (q.created_by = public.my_profile_id(q.school_id) OR public.has_permission(q.school_id, 'cbt.manage')) THEN RAISE EXCEPTION 'you cannot remove this question' USING ERRCODE = '42501'; END IF;
  UPDATE public.cbt_questions SET archived = TRUE WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_questions_list(_school UUID, _subject UUID DEFAULT NULL, _search TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, subject_id UUID, subject TEXT, kind TEXT, prompt TEXT, options JSONB, correct JSONB, marks NUMERIC, difficulty TEXT, created_by TEXT, mine BOOLEAN, used INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_cbt(_school, NULL, NULL) THEN RAISE EXCEPTION 'question banks are for teachers' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT q.id, q.subject_id, s.name, q.kind, q.prompt, q.options, q.correct, q.marks, q.difficulty, p.full_name, q.created_by = public.my_profile_id(_school),
      (SELECT count(*)::int FROM public.cbt_test_questions tq WHERE tq.question_id = q.id)
    FROM public.cbt_questions q JOIN public.subjects s ON s.id = q.subject_id LEFT JOIN public.profiles p ON p.id = q.created_by
    WHERE q.school_id = _school AND NOT q.archived AND (_subject IS NULL OR q.subject_id = _subject)
      AND public.can_manage_cbt(_school, NULL, q.subject_id)
      AND (_search IS NULL OR q.prompt ILIKE '%' || _search || '%')
    ORDER BY q.created_at DESC LIMIT 500;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Tests
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cbt_test_save(_school UUID, _id UUID, _class UUID, _subject UUID, _title TEXT, _instructions TEXT, _duration INT,
  _starts TIMESTAMPTZ, _ends TIMESTAMPTZ, _shuffle BOOLEAN, _max_violations INT, _questions UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.cbt_tests; rid UUID; i INT := 0; qid UUID; q public.cbt_questions;
BEGIN
  IF NOT public.can_manage_cbt(_school, _class, _subject) THEN RAISE EXCEPTION 'you can set tests only for a class and subject you teach' USING ERRCODE = '42501'; END IF;
  IF _starts IS NULL OR _ends IS NULL OR _ends <= _starts THEN RAISE EXCEPTION 'the window must end after it opens' USING ERRCODE = '22023'; END IF;
  IF _duration IS NULL OR _duration < 1 OR _duration > 300 THEN RAISE EXCEPTION 'the duration must be between 1 and 300 minutes' USING ERRCODE = '22023'; END IF;
  IF _questions IS NULL OR cardinality(_questions) = 0 THEN RAISE EXCEPTION 'add at least one question' USING ERRCODE = '22023'; END IF;
  IF _id IS NOT NULL THEN
    SELECT * INTO t FROM public.cbt_tests WHERE id = _id AND school_id = _school;
    IF NOT FOUND THEN RAISE EXCEPTION 'no such test' USING ERRCODE = 'P0002'; END IF;
    IF t.status <> 'draft' THEN RAISE EXCEPTION 'a published test cannot be edited; close it and make a new one' USING ERRCODE = '22023'; END IF;
    UPDATE public.cbt_tests SET class_id = _class, subject_id = _subject, title = btrim(_title), instructions = NULLIF(btrim(COALESCE(_instructions, '')), ''), duration_min = _duration,
      starts_at = _starts, ends_at = _ends, shuffle = COALESCE(_shuffle, TRUE), max_violations = COALESCE(_max_violations, 5) WHERE id = _id;
    DELETE FROM public.cbt_test_questions WHERE test_id = _id;
    rid := _id;
  ELSE
    INSERT INTO public.cbt_tests (school_id, class_id, subject_id, title, instructions, duration_min, starts_at, ends_at, shuffle, max_violations, created_by)
    VALUES (_school, _class, _subject, btrim(_title), NULLIF(btrim(COALESCE(_instructions, '')), ''), _duration, _starts, _ends, COALESCE(_shuffle, TRUE), COALESCE(_max_violations, 5), public.my_profile_id(_school))
    RETURNING id INTO rid;
  END IF;
  FOREACH qid IN ARRAY _questions LOOP
    SELECT * INTO q FROM public.cbt_questions WHERE id = qid AND school_id = _school AND NOT archived;
    IF NOT FOUND THEN RAISE EXCEPTION 'a chosen question no longer exists' USING ERRCODE = '22023'; END IF;
    IF q.subject_id <> _subject THEN RAISE EXCEPTION 'every question must belong to the test''s subject' USING ERRCODE = '22023'; END IF;
    i := i + 1;
    INSERT INTO public.cbt_test_questions (test_id, question_id, position, kind, prompt, options, correct, marks) VALUES (rid, q.id, i, q.kind, q.prompt, q.options, q.correct, q.marks);
  END LOOP;
  PERFORM public.write_audit(_school, 'cbt_test_saved', 'cbt_test', rid, left(btrim(_title), 80), jsonb_build_object('questions', i));
  RETURN rid;
END $$;

-- Mark one attempt from its stored answers. Objective questions are marked here; essays wait for a teacher.
CREATE OR REPLACE FUNCTION public.cbt_mark(_attempt UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts; q RECORD; ans JSONB; auto NUMERIC := 0; essays NUMERIC := 0; total NUMERIC := 0; pending BOOLEAN := FALSE;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = _attempt;
  FOR q IN SELECT * FROM public.cbt_test_questions WHERE test_id = a.test_id LOOP
    total := total + q.marks;
    ans := a.answers -> q.id::text;
    IF q.kind = 'essay' THEN
      IF a.essay_scores ? q.id::text THEN essays := essays + LEAST((a.essay_scores ->> q.id::text)::numeric, q.marks);
      ELSIF ans IS NOT NULL AND btrim(ans #>> '{}') <> '' THEN pending := TRUE; END IF;
    ELSIF ans IS NULL THEN CONTINUE;
    ELSIF q.kind = 'mcq' AND jsonb_typeof(ans) = 'number' AND ans::int = (q.correct)::int THEN auto := auto + q.marks;
    ELSIF q.kind = 'true_false' AND jsonb_typeof(ans) = 'boolean' AND ans = q.correct THEN auto := auto + q.marks;
    ELSIF q.kind = 'short' AND jsonb_typeof(ans) = 'string' AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(q.correct) c WHERE lower(btrim(c)) = lower(btrim(ans #>> '{}'))) THEN auto := auto + q.marks;
    END IF;
  END LOOP;
  UPDATE public.cbt_attempts SET auto_score = auto, score = auto + essays, max_score = total, needs_grading = pending WHERE id = a.id;
END $$;

-- Close an attempt (submitted by the student, by the clock, by the teacher, or for too many violations).
CREATE OR REPLACE FUNCTION public.cbt_finish(_attempt UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cbt_attempts SET status = _status, submitted_at = LEAST(clock_timestamp(), deadline) WHERE id = _attempt AND status = 'in_progress';
  IF FOUND THEN PERFORM public.cbt_mark(_attempt); END IF;
END $$;

-- Attempts whose time ran out are submitted with what was saved.
CREATE OR REPLACE FUNCTION public.cbt_finalize_expired(_test UUID DEFAULT NULL)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN SELECT id FROM public.cbt_attempts WHERE status = 'in_progress' AND deadline <= clock_timestamp() AND (_test IS NULL OR test_id = _test) LOOP
    PERFORM public.cbt_finish(r.id, 'auto_submitted'); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.cbt_test_set_status(_test UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.cbt_tests; r RECORD;
BEGIN
  SELECT * INTO t FROM public.cbt_tests WHERE id = _test;
  IF NOT FOUND OR NOT public.can_manage_cbt(t.school_id, t.class_id, t.subject_id) THEN RAISE EXCEPTION 'you cannot change this test' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('published', 'closed', 'draft') THEN RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023'; END IF;
  IF _status = 'draft' AND EXISTS (SELECT 1 FROM public.cbt_attempts WHERE test_id = t.id) THEN RAISE EXCEPTION 'students have already started; close it instead' USING ERRCODE = '22023'; END IF;
  IF _status = 'published' AND t.status = 'closed' THEN RAISE EXCEPTION 'a closed test cannot be reopened' USING ERRCODE = '22023'; END IF;
  UPDATE public.cbt_tests SET status = _status, ends_at = CASE WHEN _status = 'closed' AND ends_at > now() THEN now() ELSE ends_at END WHERE id = t.id;
  IF _status = 'closed' THEN
    FOR r IN SELECT id FROM public.cbt_attempts WHERE test_id = t.id AND status = 'in_progress' LOOP PERFORM public.cbt_finish(r.id, 'auto_submitted'); END LOOP;
  END IF;
  IF _status = 'published' THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT t.school_id, e.student_id, 'cbt_published', 'A test has been scheduled', format('%s opens %s', t.title, to_char(t.starts_at, 'DD Mon HH24:MI')), '/cbt'
    FROM public.enrollments e WHERE e.class_id = t.class_id AND e.status = 'active';
  END IF;
  PERFORM public.write_audit(t.school_id, 'cbt_test_status', 'cbt_test', t.id, left(t.title, 80), jsonb_build_object('status', _status));
END $$;

CREATE OR REPLACE FUNCTION public.cbt_release_results(_test UUID, _release BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.cbt_tests;
BEGIN
  SELECT * INTO t FROM public.cbt_tests WHERE id = _test;
  IF NOT FOUND OR NOT public.can_manage_cbt(t.school_id, t.class_id, t.subject_id) THEN RAISE EXCEPTION 'you cannot change this test' USING ERRCODE = '42501'; END IF;
  IF _release AND EXISTS (SELECT 1 FROM public.cbt_attempts WHERE test_id = t.id AND needs_grading) THEN RAISE EXCEPTION 'grade every essay first' USING ERRCODE = '22023'; END IF;
  UPDATE public.cbt_tests SET results_released = _release WHERE id = t.id;
  IF _release THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT t.school_id, a.student_id, 'cbt_results', 'Test results are out', t.title, '/cbt' FROM public.cbt_attempts a WHERE a.test_id = t.id;
  END IF;
END $$;

-- Tests the caller should see: their class's published tests (students), their own child's (parents), or the ones they run (staff).
CREATE OR REPLACE FUNCTION public.cbt_tests_list(_school UUID)
RETURNS TABLE (id UUID, title TEXT, class_name TEXT, subject TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, duration_min INT, status TEXT, phase TEXT, questions BIGINT,
               total_marks NUMERIC, results_released BOOLEAN, can_manage BOOLEAN, attempts BIGINT, submitted BIGINT, class_size BIGINT, avg_pct NUMERIC, needs_grading BIGINT,
               my_attempt UUID, my_status TEXT, my_score NUMERIC, my_max NUMERIC, my_deadline TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school);
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  PERFORM public.cbt_finalize_expired(NULL);
  RETURN QUERY
    SELECT t.id, t.title, c.name, s.name, t.starts_at, t.ends_at, t.duration_min, t.status,
      CASE WHEN t.status = 'draft' THEN 'draft' WHEN t.status = 'closed' OR now() >= t.ends_at THEN 'closed' WHEN now() >= t.starts_at THEN 'live' ELSE 'upcoming' END,
      (SELECT count(*) FROM public.cbt_test_questions q WHERE q.test_id = t.id),
      (SELECT COALESCE(sum(q.marks), 0) FROM public.cbt_test_questions q WHERE q.test_id = t.id),
      t.results_released, public.can_manage_cbt(_school, t.class_id, t.subject_id),
      (SELECT count(*) FROM public.cbt_attempts a WHERE a.test_id = t.id),
      (SELECT count(*) FROM public.cbt_attempts a WHERE a.test_id = t.id AND a.status <> 'in_progress'),
      (SELECT count(*) FROM public.enrollments e WHERE e.class_id = t.class_id AND e.status = 'active'),
      (SELECT round(avg(100 * a.score / NULLIF(a.max_score, 0)), 1) FROM public.cbt_attempts a WHERE a.test_id = t.id AND a.status <> 'in_progress' AND NOT a.needs_grading),
      (SELECT count(*) FROM public.cbt_attempts a WHERE a.test_id = t.id AND a.needs_grading),
      my.id, my.status, CASE WHEN t.results_released THEN my.score END, CASE WHEN t.results_released THEN my.max_score END, my.deadline
    FROM public.cbt_tests t JOIN public.classes c ON c.id = t.class_id JOIN public.subjects s ON s.id = t.subject_id
    LEFT JOIN LATERAL (
      SELECT a.* FROM public.cbt_attempts a WHERE a.test_id = t.id AND (a.student_id = me OR public.is_guardian_of(a.student_id)) LIMIT 1) my ON TRUE
    WHERE t.school_id = _school AND (
      public.can_manage_cbt(_school, t.class_id, t.subject_id)
      OR (t.status <> 'draft' AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = t.class_id AND e.status = 'active' AND (public.is_self_student(e.student_id) OR public.is_guardian_of(e.student_id)))))
    ORDER BY t.starts_at DESC LIMIT 200;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Taking a test
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cbt_attempt_payload(_attempt UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'attempt_id', a.id, 'status', a.status, 'deadline', a.deadline, 'server_now', clock_timestamp(), 'answers', a.answers, 'violations', a.violations,
    'test', jsonb_build_object('id', t.id, 'title', t.title, 'instructions', t.instructions, 'duration_min', t.duration_min, 'max_violations', t.max_violations,
      'subject', (SELECT name FROM public.subjects WHERE id = t.subject_id), 'class', (SELECT name FROM public.classes WHERE id = t.class_id)),
    -- Never the answer key.
    'questions', (SELECT jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'options', q.options, 'marks', q.marks) ORDER BY array_position(a.question_order, q.id))
                  FROM public.cbt_test_questions q WHERE q.test_id = t.id))
  FROM public.cbt_attempts a JOIN public.cbt_tests t ON t.id = a.test_id WHERE a.id = _attempt
$$;

CREATE OR REPLACE FUNCTION public.cbt_attempt_start(_test UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.cbt_tests; me UUID; a public.cbt_attempts; ord UUID[];
BEGIN
  SELECT * INTO t FROM public.cbt_tests WHERE id = _test;
  IF NOT FOUND THEN RAISE EXCEPTION 'test not found' USING ERRCODE = '42501'; END IF;
  me := public.my_profile_id(t.school_id);
  IF me IS NULL OR NOT public.has_role_in(t.school_id, 'student') OR NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = t.class_id AND e.student_id = me AND e.status = 'active') THEN
    RAISE EXCEPTION 'this test is not for you' USING ERRCODE = '42501';
  END IF;
  PERFORM public.cbt_finalize_expired(t.id);
  SELECT * INTO a FROM public.cbt_attempts WHERE test_id = t.id AND student_id = me;
  IF FOUND THEN
    IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'you have already finished this test' USING ERRCODE = '22023'; END IF;
    UPDATE public.cbt_attempts SET last_seen = clock_timestamp() WHERE id = a.id;
    RETURN public.cbt_attempt_payload(a.id);
  END IF;
  IF t.status <> 'published' OR now() < t.starts_at THEN RAISE EXCEPTION 'this test has not opened yet' USING ERRCODE = '22023'; END IF;
  IF now() >= t.ends_at THEN RAISE EXCEPTION 'this test has closed' USING ERRCODE = '22023'; END IF;
  SELECT array_agg(id ORDER BY CASE WHEN t.shuffle THEN random() ELSE position END) INTO ord FROM public.cbt_test_questions WHERE test_id = t.id;
  INSERT INTO public.cbt_attempts (test_id, school_id, student_id, deadline, question_order)
  VALUES (t.id, t.school_id, me, LEAST(clock_timestamp() + make_interval(mins => t.duration_min), t.ends_at), ord) RETURNING * INTO a;
  RETURN public.cbt_attempt_payload(a.id);
END $$;

CREATE OR REPLACE FUNCTION public.cbt_my_attempt(_attempt UUID)
RETURNS public.cbt_attempts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = _attempt FOR UPDATE;
  IF NOT FOUND OR a.student_id IS DISTINCT FROM public.my_profile_id(a.school_id) THEN RAISE EXCEPTION 'attempt not found' USING ERRCODE = '42501'; END IF;
  RETURN a;
END $$;

-- Autosave. After the deadline the attempt is submitted with what was last saved, and the new answers are refused.
CREATE OR REPLACE FUNCTION public.cbt_attempt_save(_attempt UUID, _answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts := public.cbt_my_attempt(_attempt); clean JSONB;
BEGIN
  IF a.status <> 'in_progress' THEN RETURN jsonb_build_object('status', a.status); END IF;
  IF clock_timestamp() > a.deadline THEN PERFORM public.cbt_finish(a.id, 'auto_submitted'); RETURN jsonb_build_object('status', 'auto_submitted'); END IF;
  -- Keep only answers to this test's questions.
  SELECT COALESCE(jsonb_object_agg(k, v), '{}') INTO clean FROM jsonb_each(COALESCE(_answers, '{}')) e(k, v)
  WHERE k::uuid = ANY (a.question_order) AND (jsonb_typeof(v) <> 'string' OR length(v #>> '{}') <= 5000);
  UPDATE public.cbt_attempts SET answers = clean, last_seen = clock_timestamp() WHERE id = a.id;
  RETURN jsonb_build_object('status', 'in_progress', 'saved', jsonb_object_length(clean), 'deadline', a.deadline, 'server_now', clock_timestamp());
END $$;

CREATE OR REPLACE FUNCTION public.cbt_attempt_submit(_attempt UUID, _answers JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts := public.cbt_my_attempt(_attempt);
BEGIN
  IF a.status = 'in_progress' AND clock_timestamp() <= a.deadline + interval '15 seconds' AND _answers IS NOT NULL THEN
    PERFORM public.cbt_attempt_save(_attempt, _answers);
  END IF;
  PERFORM public.cbt_finish(a.id, CASE WHEN clock_timestamp() > a.deadline THEN 'auto_submitted' ELSE 'submitted' END);
  RETURN jsonb_build_object('status', (SELECT status FROM public.cbt_attempts WHERE id = a.id));
END $$;

CREATE OR REPLACE FUNCTION public.cbt_attempt_violation(_attempt UUID, _kind TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts := public.cbt_my_attempt(_attempt); t public.cbt_tests; n INT;
BEGIN
  IF a.status <> 'in_progress' THEN RETURN jsonb_build_object('status', a.status, 'violations', a.violations); END IF;
  SELECT * INTO t FROM public.cbt_tests WHERE id = a.test_id;
  INSERT INTO public.cbt_violations (attempt_id, kind) VALUES (a.id, _kind);
  UPDATE public.cbt_attempts SET violations = violations + 1, last_seen = clock_timestamp() WHERE id = a.id RETURNING violations INTO n;
  IF t.max_violations > 0 AND n > t.max_violations THEN
    PERFORM public.cbt_finish(a.id, 'terminated');
    PERFORM public.write_audit(a.school_id, 'cbt_attempt_terminated', 'cbt_attempt', a.id, left(t.title, 80), jsonb_build_object('violations', n));
    RETURN jsonb_build_object('status', 'terminated', 'violations', n);
  END IF;
  RETURN jsonb_build_object('status', 'in_progress', 'violations', n, 'max', t.max_violations);
END $$;

-- Live roster for the teacher: every student of the class, how far they are and their integrity alerts.
CREATE OR REPLACE FUNCTION public.cbt_test_live(_test UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.cbt_tests; total INT;
BEGIN
  SELECT * INTO t FROM public.cbt_tests WHERE id = _test;
  IF NOT FOUND OR NOT public.can_manage_cbt(t.school_id, t.class_id, t.subject_id) THEN RAISE EXCEPTION 'you cannot monitor this test' USING ERRCODE = '42501'; END IF;
  PERFORM public.cbt_finalize_expired(t.id);
  SELECT count(*) INTO total FROM public.cbt_test_questions WHERE test_id = t.id;
  RETURN jsonb_build_object('server_now', clock_timestamp(), 'questions', total, 'ends_at', t.ends_at, 'status', t.status,
    'roster', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'student_id', e.student_id, 'name', p.full_name, 'attempt_id', a.id, 'status', COALESCE(a.status, 'not_started'),
        'answered', COALESCE((SELECT count(*) FROM jsonb_object_keys(a.answers)), 0), 'deadline', a.deadline, 'last_seen', a.last_seen,
        'violations', COALESCE(a.violations, 0), 'score', a.score, 'max_score', a.max_score, 'needs_grading', COALESCE(a.needs_grading, FALSE),
        'recent_violations', (SELECT jsonb_agg(v.kind ORDER BY v.at DESC) FROM (SELECT kind, at FROM public.cbt_violations WHERE attempt_id = a.id ORDER BY at DESC LIMIT 3) v)
      ) ORDER BY p.full_name)
      FROM public.enrollments e JOIN public.profiles p ON p.id = e.student_id LEFT JOIN public.cbt_attempts a ON a.test_id = t.id AND a.student_id = e.student_id
      WHERE e.class_id = t.class_id AND e.status = 'active'), '[]'));
END $$;

-- Grading: the teacher sees one attempt with its answers and the key, and scores essays.
CREATE OR REPLACE FUNCTION public.cbt_attempt_review(_attempt UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts; t public.cbt_tests;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = _attempt;
  SELECT * INTO t FROM public.cbt_tests WHERE id = a.test_id;
  IF NOT FOUND OR NOT public.can_manage_cbt(t.school_id, t.class_id, t.subject_id) THEN RAISE EXCEPTION 'you cannot review this attempt' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('attempt_id', a.id, 'student', (SELECT full_name FROM public.profiles WHERE id = a.student_id), 'status', a.status, 'score', a.score, 'max_score', a.max_score,
    'violations', a.violations, 'essay_scores', a.essay_scores,
    'questions', (SELECT jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'prompt', q.prompt, 'options', q.options, 'correct', q.correct, 'marks', q.marks, 'answer', a.answers -> q.id::text) ORDER BY q.position)
                  FROM public.cbt_test_questions q WHERE q.test_id = t.id));
END $$;

CREATE OR REPLACE FUNCTION public.cbt_grade_essay(_attempt UUID, _question UUID, _score NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.cbt_attempts; t public.cbt_tests; q public.cbt_test_questions;
BEGIN
  SELECT * INTO a FROM public.cbt_attempts WHERE id = _attempt FOR UPDATE;
  SELECT * INTO t FROM public.cbt_tests WHERE id = a.test_id;
  IF NOT FOUND OR NOT public.can_manage_cbt(t.school_id, t.class_id, t.subject_id) THEN RAISE EXCEPTION 'you cannot grade this attempt' USING ERRCODE = '42501'; END IF;
  IF a.status = 'in_progress' THEN RAISE EXCEPTION 'the student has not finished yet' USING ERRCODE = '22023'; END IF;
  SELECT * INTO q FROM public.cbt_test_questions WHERE id = _question AND test_id = t.id AND kind = 'essay';
  IF NOT FOUND THEN RAISE EXCEPTION 'that is not an essay question of this test' USING ERRCODE = '22023'; END IF;
  IF _score IS NULL OR _score < 0 OR _score > q.marks THEN RAISE EXCEPTION 'the score must be between 0 and %', q.marks USING ERRCODE = '22023'; END IF;
  UPDATE public.cbt_attempts SET essay_scores = essay_scores || jsonb_build_object(q.id::text, _score) WHERE id = a.id;
  PERFORM public.cbt_mark(a.id);
  PERFORM public.write_audit(t.school_id, 'cbt_graded', 'cbt_attempt', a.id, left(t.title, 80), jsonb_build_object('question', q.position, 'score', _score));
  RETURN jsonb_build_object('score', (SELECT score FROM public.cbt_attempts WHERE id = a.id), 'needs_grading', (SELECT needs_grading FROM public.cbt_attempts WHERE id = a.id));
END $$;

-- Headline figures for the CBT dashboard (staff: tests they run; administrators: the whole school).
CREATE OR REPLACE FUNCTION public.cbt_dashboard(_school UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_manage_cbt(_school, NULL, NULL) THEN RAISE EXCEPTION 'CBT figures are for teachers' USING ERRCODE = '42501'; END IF;
  PERFORM public.cbt_finalize_expired(NULL);
  RETURN (WITH t AS (SELECT * FROM public.cbt_tests x WHERE x.school_id = _school AND public.can_manage_cbt(_school, x.class_id, x.subject_id)),
    a AS (SELECT y.* FROM public.cbt_attempts y JOIN t ON t.id = y.test_id),
    expected AS (SELECT COALESCE(sum((SELECT count(*) FROM public.enrollments e WHERE e.class_id = t.class_id AND e.status = 'active')), 0) n FROM t WHERE t.status <> 'draft' AND t.starts_at <= now())
  SELECT jsonb_build_object(
    'tests', (SELECT count(*) FROM t),
    'upcoming', (SELECT count(*) FROM t WHERE t.status = 'published' AND t.starts_at > now()),
    'live', (SELECT count(*) FROM t WHERE t.status = 'published' AND now() BETWEEN t.starts_at AND t.ends_at),
    'attempts', (SELECT count(*) FROM a),
    'in_progress', (SELECT count(*) FROM a WHERE a.status = 'in_progress'),
    'pending_grading', (SELECT count(*) FROM a WHERE a.needs_grading),
    'violations', (SELECT COALESCE(sum(a.violations), 0) FROM a WHERE a.status = 'in_progress'),
    'avg_pct', (SELECT round(avg(100 * a.score / NULLIF(a.max_score, 0)), 1) FROM a WHERE a.status <> 'in_progress' AND NOT a.needs_grading),
    'completion_pct', (SELECT CASE WHEN (SELECT n FROM expected) > 0 THEN round(100.0 * (SELECT count(*) FROM a WHERE a.status <> 'in_progress') / (SELECT n FROM expected), 1) END),
    'by_class', COALESCE((SELECT jsonb_agg(jsonb_build_object('class', cn, 'avg', av) ORDER BY cn) FROM (
        SELECT c.name cn, round(avg(100 * a.score / NULLIF(a.max_score, 0)), 1) av FROM a JOIN t ON t.id = a.test_id JOIN public.classes c ON c.id = t.class_id
        WHERE a.status <> 'in_progress' AND NOT a.needs_grading GROUP BY c.name) x), '[]')));
END $$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY['cbt_check_question(TEXT, JSONB, JSONB)', 'cbt_mark(UUID)', 'cbt_finish(UUID, TEXT)', 'cbt_finalize_expired(UUID)', 'cbt_attempt_payload(UUID)', 'cbt_my_attempt(UUID)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
  FOREACH fn IN ARRAY ARRAY['can_manage_cbt(UUID, UUID, UUID)', 'cbt_question_save(UUID, UUID, UUID, TEXT, TEXT, JSONB, JSONB, NUMERIC, TEXT)', 'cbt_question_archive(UUID)',
    'cbt_questions_list(UUID, UUID, TEXT)', 'cbt_test_save(UUID, UUID, UUID, UUID, TEXT, TEXT, INT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, INT, UUID[])', 'cbt_test_set_status(UUID, TEXT)',
    'cbt_release_results(UUID, BOOLEAN)', 'cbt_tests_list(UUID)', 'cbt_attempt_start(UUID)', 'cbt_attempt_save(UUID, JSONB)', 'cbt_attempt_submit(UUID, JSONB)',
    'cbt_attempt_violation(UUID, TEXT)', 'cbt_test_live(UUID)', 'cbt_attempt_review(UUID)', 'cbt_grade_essay(UUID, UUID, NUMERIC)', 'cbt_dashboard(UUID)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
