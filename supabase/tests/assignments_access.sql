-- Tests for assignments, online exams, submissions and secure files.
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

CREATE FUNCTION pg_temp.b64(_text TEXT) RETURNS TEXT LANGUAGE sql AS $$ SELECT encode(convert_to(_text, 'UTF8'), 'base64') $$;
GRANT EXECUTE ON FUNCTION pg_temp.b64(TEXT) TO anon, authenticated;

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
  PERFORM pg_temp.member('school_a', 'teacher-other', 'teacher');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-bea', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_b', 'student-b', 'student');
END $$;

DO $$
DECLARE
  y UUID; c1 UUID; c2 UUID; m UUID; e UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_current)
  VALUES (pg_temp.id('school_a'), '2026/2027', '2026-09-01', '2027-07-31', true) RETURNING id INTO y;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1A') RETURNING id INTO c1;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1B') RETURNING id INTO c2;
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'Mathematics') RETURNING id INTO m;
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'English') RETURNING id INTO e;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id)
  VALUES (pg_temp.id('school_a'), c1, m, pg_temp.id('teacher-math')), (pg_temp.id('school_a'), c2, e, pg_temp.id('teacher-other'));
  INSERT INTO ids VALUES ('class_1a', c1), ('class_1b', c2), ('maths', m), ('english', e);
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c1, pg_temp.id('student-bea'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
END $$;

-- A teacher builds an assignment; students see nothing until it is released.
DO $$
DECLARE
  aid UUID; draft UUID;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, instructions, starts_at, deadline_at,
                                  submission_format, allowed_file_types, max_file_mb, max_files, late_policy, attempts_allowed, rubric)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Algebra homework', 'homework', 100, 'Solve all questions.',
          now() - interval '1 hour', now() + interval '7 days', 'file_or_text', ARRAY['pdf', 'txt'], 1, 2, 'not_allowed', 1,
          '[{"criterion":"Method","points":60},{"criterion":"Accuracy","points":40}]')
  RETURNING id INTO aid;
  INSERT INTO ids VALUES ('hw', aid);
  PERFORM pg_temp.ok((SELECT submission_format = 'file_or_text' AND rubric -> 0 ->> 'criterion' = 'Method' FROM public.assessments WHERE id = aid), 'the assignment keeps its instructions, rules and rubric');

  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, submission_format)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'No deadline', 'homework', 10, 'file') RETURNING id INTO draft;
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.release_assessment(%L)$q$, draft)), 'an assignment cannot be released without a deadline');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.assessments SET released_at = now() WHERE id = %L$q$, aid)) = -1, 'a teacher cannot set the release stamp directly');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.assessments$q$) = 0, 'a draft assignment is invisible to students');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_submission(%L)$q$, aid)), 'a student cannot start an unreleased assignment');

  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.release_assessment(%L)$q$, aid)), 'another teacher cannot release it');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_assessment_file(%L, 'run.exe', %L)$q$, aid, pg_temp.b64('MZ'))), 'attachments cannot be programs');
  INSERT INTO ids VALUES ('att', public.add_assessment_file(aid, 'worksheet.pdf', pg_temp.b64('%PDF-1.4 worksheet')));
  PERFORM public.release_assessment(aid);
END $$;

DO $$
DECLARE
  aid UUID := pg_temp.id('hw');
BEGIN
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.assessments$q$) = 1, 'a released assignment is visible to its class');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_assignments(pg_temp.id('school_a'))$q$) = 1, 'it appears in the student''s assignment list');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'assignment_released'$q$) = 1, 'the student is notified');
  PERFORM pg_temp.ok((public.get_file(pg_temp.id('att')) ->> 'name') = 'worksheet.pdf', 'the student can download the teacher''s attachment');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.assessments SET title = 'hacked' WHERE id = %L$q$, aid)) <= 0, 'a student cannot edit an assignment');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'assignment_released'$q$) = 1, 'a verified parent is told too');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_assignments(pg_temp.id('school_a'))$q$) = 0, 'but a parent has no submission list');

  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.assessments$q$) = 0, 'a student in another class does not see it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_submission(%L)$q$, aid)), 'and cannot submit to it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_file(%L)$q$, pg_temp.id('att'))), 'or download its attachment');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'assignment_released'$q$) = 0, 'or hear about it');

  PERFORM pg_temp.act_as('student-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_assignment(%L)$q$, aid)), 'a student from another school cannot open it');
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_file(%L)$q$, pg_temp.id('att'))), 'a teacher outside the subject cannot open its attachment');
END $$;

-- ---------------------------------------------------------------------------
-- Student works and submits
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID := pg_temp.id('hw');
  sid UUID;
  r JSONB;
  f UUID;
BEGIN
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  sid := public.start_submission(aid);
  INSERT INTO ids VALUES ('sub_ama', sid);
  PERFORM pg_temp.ok(public.start_submission(aid) = sid, 'starting again continues the same draft');
  PERFORM public.save_submission(sid, 'My working is in the file.');

  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'virus.exe', %L)$q$, sid, pg_temp.b64('MZ90'))), 'a program cannot be uploaded');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'work.xlsx', %L)$q$, sid, pg_temp.b64('PK'))), 'a type the teacher did not allow is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'fake.pdf', %L)$q$, sid, pg_temp.b64('this is not a pdf'))), 'a file whose content does not match its type is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'work.pdf.exe', %L)$q$, sid, pg_temp.b64('%PDF-1.4'))), 'a double extension is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'big.pdf', %L)$q$, sid, repeat('QUFB', 400000))), 'a file over the size limit is refused');
  f := public.add_submission_file(sid, 'C:\Users\ama\work.pdf', pg_temp.b64('%PDF-1.4 my answers'));
  INSERT INTO ids VALUES ('file_ama', f);
  PERFORM pg_temp.ok((public.get_file(f) ->> 'name') = 'work.pdf', 'a path in the file name is stripped');
  PERFORM public.add_submission_file(sid, 'notes.txt', pg_temp.b64('some notes'));
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'third.txt', %L)$q$, sid, pg_temp.b64('x'))), 'the file count limit is enforced');

  PERFORM pg_temp.act_as('student-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_submission(%L)$q$, sid)), 'another student cannot read this submission');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_file(%L)$q$, f)), 'or its file');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_submission(%L, 'overwritten')$q$, sid)), 'or change it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.submit_submission(%L)$q$, sid)), 'or submit it for the other student');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.remove_file(%L)$q$, f)), 'or delete its files');
  PERFORM pg_temp.ok(pg_temp.rows($q$SELECT 1 FROM public.submissions$q$) = -1, 'the submissions table is not readable directly');
  PERFORM pg_temp.ok(pg_temp.rows($q$SELECT 1 FROM public.stored_files$q$) = -1, 'and neither is the file store');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  r := public.submit_submission(sid);
  PERFORM pg_temp.ok(r ->> 'status' = 'submitted' AND r ->> 'receipt' LIKE 'SUB-%' AND (r ->> 'files')::int = 2, 'a submission returns a receipt');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'submission_received'$q$) = 1, 'and the student gets a confirmation');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.save_submission(%L, 'changed after submitting')$q$, sid)), 'handed-in work cannot be edited');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'more.txt', %L)$q$, sid, pg_temp.b64('x'))), 'or get more files');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_submission(%L)$q$, aid)), 'with one attempt allowed there is no second go');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'submission_new'$q$) = 1, 'the teacher is told there is work to mark');
  PERFORM pg_temp.ok((SELECT string_agg(status, ',' ORDER BY student_name) FROM public.assessment_submissions(aid)) = 'submitted,not_started', 'the teacher sees who has and has not handed in');
  PERFORM pg_temp.ok(public.get_submission(sid) ->> 'text_answer' = 'My working is in the file.', 'the teacher can read the answer');
  PERFORM pg_temp.ok((public.get_file(f) ->> 'size')::int = length(convert_to('%PDF-1.4 my answers', 'UTF8')), 'and download the file');

  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_submission(%L)$q$, sid)), 'a teacher outside the subject cannot read it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_file(%L)$q$, f)), 'or its file');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_submission(%L)$q$, sid)), 'a parent cannot read the student''s submission');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count(format($q$SELECT 1 FROM public.assessment_submissions(%L)$q$, aid)) = 2, 'the school administrator sees submission status');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.get_submission(%L)$q$, sid)), 'but not the student''s answer');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.assessment_submissions(%L)$q$, aid)), 'another school''s administrator sees nothing');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'submission_received'$q$) = 0, 'and not the audit entries');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'submission_received'$q$) = 1, 'the school''s audit log records the submission');
END $$;

-- ---------------------------------------------------------------------------
-- Marking, returning for resubmission, then results as before
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID := pg_temp.id('hw');
  sid UUID := pg_temp.id('sub_ama');
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.return_submission(%L, '')$q$, sid)), 'returning work needs a note');
  PERFORM public.return_submission(sid, 'Show your working for question 2.');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(public.get_submission(sid) ->> 'status' = 'returned' AND public.get_submission(sid) ->> 'return_note' LIKE 'Show your working%', 'the student sees it was returned with the note');
  PERFORM public.save_submission(sid, 'Revised answer with working.');
  PERFORM pg_temp.ok(public.submit_submission(sid) ->> 'status' = 'submitted', 'the student can resubmit returned work');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.marks (school_id, assessment_id, student_id, score, comment) VALUES (pg_temp.id('school_a'), aid, pg_temp.id('student-ama'), 85, 'Good, clear working');
  PERFORM pg_temp.ok(public.get_submission(sid) ->> 'status' = 'marked', 'entering a mark moves the submission to marked');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.marks SET score = 105 WHERE assessment_id = %L$q$, aid)) = -1, 'a score above the maximum is still rejected');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'the mark stays hidden from the student until results are published');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.move_assessment(aid, 'submitted');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.move_assessment(aid, 'approved');
  PERFORM public.move_assessment(aid, 'published');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'once published, the student sees the score');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'and so does the linked parent');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.return_submission(%L, 'too late')$q$, sid)), 'work cannot be returned once results are published');
END $$;

-- ---------------------------------------------------------------------------
-- Deadlines, late rules, windows
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  a_strict UUID; a_len UUID; a_pen UUID; a_future UUID; sid UUID; r JSONB;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, starts_at, deadline_at, submission_format, late_policy, max_files)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Strict', 'homework', 10, now() - interval '2 days', now() - interval '1 day', 'text', 'not_allowed', 1) RETURNING id INTO a_strict;
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, starts_at, deadline_at, submission_format, late_policy)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Lenient', 'homework', 10, now() - interval '2 days', now() - interval '1 day', 'text', 'allow') RETURNING id INTO a_len;
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, starts_at, deadline_at, submission_format, late_policy, late_penalty_percent)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Penalty', 'homework', 10, now() - interval '2 days', now() - interval '1 day', 'text', 'penalty', 10) RETURNING id INTO a_pen;
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, starts_at, deadline_at, submission_format)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Not yet', 'homework', 10, now() + interval '1 day', now() + interval '2 days', 'text') RETURNING id INTO a_future;
  PERFORM public.release_assessment(a_strict); PERFORM public.release_assessment(a_len); PERFORM public.release_assessment(a_pen); PERFORM public.release_assessment(a_future);

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_submission(%L)$q$, a_strict)), 'after the deadline, with late work not allowed, a student cannot start');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_submission(%L)$q$, a_future)), 'before the assignment opens a student cannot start');
  sid := public.start_submission(a_len);
  PERFORM public.save_submission(sid, 'Late but allowed');
  r := public.submit_submission(sid);
  PERFORM pg_temp.ok(r ->> 'status' = 'late' AND (r ->> 'late')::boolean, 'late work is accepted when the teacher allows it, and flagged late');
  sid := public.start_submission(a_pen);
  PERFORM public.save_submission(sid, 'Late with penalty');
  r := public.submit_submission(sid);
  PERFORM pg_temp.ok((r ->> 'penalty_percent')::numeric = 10 AND r ->> 'status' = 'late', 'a penalty rule is shown but the score is never changed automatically');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'a.pdf', %L)$q$, sid, pg_temp.b64('%PDF-1.4'))), 'a typed-answer assignment refuses files');
END $$;

-- ---------------------------------------------------------------------------
-- Timed online exam
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ex UUID; sid UUID; due TIMESTAMPTZ;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, starts_at, deadline_at, duration_minutes, submission_format, late_policy, attempts_allowed)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Online exam', 'exam', 50, now() - interval '1 hour', now() + interval '1 day', 30, 'online', 'not_allowed', 1) RETURNING id INTO ex;
  INSERT INTO ids VALUES ('exam', ex);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.release_assessment(%L)$q$, pg_temp.id('hw'))), 'a published assessment cannot be released again');
  PERFORM public.release_assessment(ex);

  PERFORM pg_temp.act_as('student-bea@test.invalid');
  sid := public.start_submission(ex);
  INSERT INTO ids VALUES ('exam_bea', sid);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.add_submission_file(%L, 'a.txt', %L)$q$, sid, pg_temp.b64('x'))), 'an online exam takes typed answers only');
  PERFORM public.save_submission(sid, 'Answer 1');

  PERFORM set_config('role', 'none', true);
  SELECT due_by INTO due FROM public.submissions WHERE id = sid;
  PERFORM pg_temp.ok(due BETWEEN now() + interval '29 minutes' AND now() + interval '31 minutes', 'the clock starts at the student''s start time and lasts the set duration');
  UPDATE public.submissions SET due_by = now() - interval '1 minute' WHERE id = sid;

  PERFORM pg_temp.act_as('student-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.submit_submission(%L)$q$, sid)), 'once the time is up the exam can no longer be submitted');
END $$;

-- ---------------------------------------------------------------------------
-- Rules that protect running assignments; suspended schools
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score, starts_at, deadline_at, submission_format)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Locked rules', 'homework', 10, now() - interval '1 hour', now() + interval '3 days', 'text') RETURNING id INTO aid;
  PERFORM public.release_assessment(aid);
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM public.save_submission(public.start_submission(aid), 'in progress');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.release_assessment(%L, false)$q$, aid)), 'an assignment cannot be withdrawn once a student has started');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.assessments SET submission_format = 'file' WHERE id = %L$q$, aid)) = -1, 'the format cannot change once a student has started');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.assessments SET deadline_at = now() + interval '10 days', instructions = 'Extended' WHERE id = %L$q$, aid)) = 1, 'but the deadline and instructions can be extended');

  PERFORM set_config('role', 'none', true);
  UPDATE public.schools SET status = 'suspended' WHERE id = pg_temp.id('school_a');
  PERFORM pg_temp.act_as('student-bea@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_submission(%L)$q$, aid)), 'a suspended school''s students cannot start work');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
END $$;

ROLLBACK;
