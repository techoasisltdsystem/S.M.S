-- Access tests for result corrections, approval settings, notifications, grading
-- scales and report downloads. One transaction, rolled back; PASS or stop with FAIL.
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
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-unverified', 'parent');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
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
  VALUES (pg_temp.id('school_a'), c1, m, pg_temp.id('teacher-math')),
         (pg_temp.id('school_a'), c2, e, pg_temp.id('teacher-other'));
  INSERT INTO ids VALUES ('class_1a', c1), ('class_1b', c2), ('maths', m), ('english', e);
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  PERFORM public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-unverified'), 'uncle');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
END $$;

-- ---------------------------------------------------------------------------
-- Marking, validation and hidden drafts
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Algebra test', 'test', 100) RETURNING id INTO aid;
  INSERT INTO ids VALUES ('test1', aid);
  INSERT INTO public.marks (school_id, assessment_id, student_id, score, comment)
  VALUES (pg_temp.id('school_a'), aid, pg_temp.id('student-ama'), 85, 'Good work');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.marks SET score = 105 WHERE assessment_id = %L$q$, aid)) = -1,
    'a score above the maximum is rejected');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.marks SET score = -5 WHERE assessment_id = %L$q$, aid)) = -1,
    'a negative score is rejected');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'the student cannot see a draft mark');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'the parent cannot see a draft mark');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.move_assessment(aid, 'submitted');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.move_assessment(%L, 'published')$q$, aid)),
    'with approval required, the teacher cannot publish straight from submitted');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'submitted results are still hidden from the student');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.move_assessment(%L, 'published')$q$, aid)), 'results must be approved before publishing');
  PERFORM public.move_assessment(aid, 'approved');
  PERFORM public.move_assessment(aid, 'published');
END $$;

-- ---------------------------------------------------------------------------
-- Publication: visibility, notifications, history
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'the student sees the published mark');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'result_published'$q$) = 1, 'the student is notified');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE body LIKE '%85%' OR title LIKE '%85%'$q$) = 0, 'the notification does not contain the score');
  PERFORM pg_temp.ok(public.unread_notification_count(pg_temp.id('school_a')) = 1, 'it counts as unread');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions$q$) = 0, 'students cannot read the version history');
  PERFORM pg_temp.ok(pg_temp.rows($q$UPDATE public.marks SET score = 100$q$) <= 0, 'a student cannot edit a score');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'the verified parent sees the published mark');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'result_published'$q$) = 1, 'the parent is notified');

  PERFORM pg_temp.act_as('parent-unverified@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'an unverified guardian sees no marks');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a'))$q$) = 0, 'and gets no notification');

  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks$q$) = 0, 'another student sees no marks');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a'))$q$) = 0, 'and gets no notification');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'result_published'$q$) = 1, 'the teacher is notified');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions WHERE version = 1 AND score = 85$q$) = 1, 'publishing stores version 1 for staff');
  PERFORM pg_temp.ok(pg_temp.rows($q$UPDATE public.marks SET score = 99$q$) = -1, 'the teacher cannot edit a published mark directly');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM public.mark_notifications_read(pg_temp.id('school_a'));
  PERFORM pg_temp.ok(public.unread_notification_count(pg_temp.id('school_a')) = 0, 'reading notifications clears the unread count');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(public.unread_notification_count(pg_temp.id('school_a')) = 1, 'and does not clear anyone else''s');
END $$;

-- ---------------------------------------------------------------------------
-- Corrections to a published result
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID := pg_temp.id('test1');
  sid UUID := pg_temp.id('student-ama');
  cid UUID;
BEGIN
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 100, 'x', 'cheat')$q$, aid, sid)), 'a student cannot request a correction');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 100, 'x', 'cheat')$q$, aid, sid)), 'a parent cannot request a correction');
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 90, 'x', 'not mine')$q$, aid, sid)), 'a teacher outside the subject cannot request a correction');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 90, 'x', '')$q$, aid, sid)), 'a correction needs a reason');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 120, 'x', 'typo')$q$, aid, sid)), 'a corrected score above the maximum is rejected');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 85, 'Good work', 'same')$q$, aid, sid)), 'a correction that changes nothing is rejected');
  cid := public.request_correction(aid, sid, 90, 'Re-marked question 4', 'Question 4 was marked wrongly');
  INSERT INTO ids VALUES ('corr1', cid);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 91, 'x', 'again')$q$, aid, sid)), 'only one pending correction per result');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'the published result stays intact while approval is pending');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.decide_correction(%L, true)$q$, cid)), 'a teacher cannot approve a correction');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'the student still sees the original score');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_corrections$q$) = 0, 'students cannot read corrections');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'correction_pending'$q$) = 1, 'the administrator is told a correction needs approval');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.decide_correction(%L, false)$q$, cid)), 'rejecting needs a note');
  PERFORM public.decide_correction(cid, false, 'Marking was right');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 85$q$) = 1, 'a rejected correction changes nothing');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.decide_correction(%L, true)$q$, cid)), 'a decided correction cannot be decided again');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'correction_rejected'$q$) = 1, 'the teacher is told it was rejected');
  cid := public.request_correction(aid, sid, 90, 'Re-marked question 4', 'Re-marked after review');
  INSERT INTO ids VALUES ('corr2', cid);

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.decide_correction(cid, true, 'Verified against the script');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 90$q$) = 1, 'an approved correction updates the mark');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions WHERE version = 2 AND score = 90$q$) = 1, 'the new value is version 2');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions WHERE version = 1 AND score = 85$q$) = 1, 'the original value is kept as version 1');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'results_corrected'
    AND (details ->> 'old_score')::numeric = 85 AND (details ->> 'new_score')::numeric = 90
    AND details ->> 'reason' = 'Re-marked after review' AND details ->> 'approved_by' IS NOT NULL$q$) = 1,
    'the audit log holds old and new score, reason and approver');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.marks WHERE score = 90$q$) = 1, 'the student now sees the corrected score');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'result_corrected'$q$) = 1, 'the student is told it was updated');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'result_corrected'$q$) = 1, 'the parent is told it was updated');

  -- An administrator's own correction applies at once; so does a teacher's when the school turns approval off.
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.request_correction(aid, sid, 92, 'Final', 'Admin review');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions WHERE version = 3 AND score = 92$q$) = 1, 'an administrator''s correction applies immediately with history');
  UPDATE public.school_config SET correction_approval_required = false WHERE school_id = pg_temp.id('school_a');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.request_correction(aid, sid, 93, 'Final', 'Teacher fix');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions WHERE version = 4 AND score = 93$q$) = 1, 'with approval switched off a teacher''s correction applies at once');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  UPDATE public.school_config SET correction_approval_required = true WHERE school_id = pg_temp.id('school_a');

  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.request_correction(%L, %L, 10, 'x', 'other school')$q$, aid, sid)), 'another school''s administrator cannot correct these results');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_corrections$q$) = 0, 'and cannot read the corrections');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.result_versions$q$) = 0, 'or the history');
END $$;

-- ---------------------------------------------------------------------------
-- A school that does not require approval lets the subject teacher publish
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  aid UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  UPDATE public.school_config SET results_approval_required = false WHERE school_id = pg_temp.id('school_a');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Quiz 1', 'quiz', 20) RETURNING id INTO aid;
  INSERT INTO ids VALUES ('quiz1', aid);
  INSERT INTO public.marks (school_id, assessment_id, student_id, score) VALUES (pg_temp.id('school_a'), aid, pg_temp.id('student-ama'), 18);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.move_assessment(%L, 'published')$q$, aid)), 'a draft cannot be published without being submitted');
  PERFORM public.move_assessment(aid, 'submitted');
  PERFORM public.move_assessment(aid, 'published');
  PERFORM pg_temp.ok((SELECT status FROM public.assessments WHERE id = aid) = 'published', 'with approval off the teacher publishes directly');
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.move_assessment(%L, 'published')$q$, pg_temp.id('test1'))), 'another teacher cannot publish or move these results');

  -- A further draft assessment: never appears in a report.
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score)
  VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Draft exam', 'exam', 100) RETURNING id INTO aid;
  INSERT INTO public.marks (school_id, assessment_id, student_id, score) VALUES (pg_temp.id('school_a'), aid, pg_temp.id('student-ama'), 55);
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  UPDATE public.school_config SET results_approval_required = true WHERE school_id = pg_temp.id('school_a');
END $$;

-- ---------------------------------------------------------------------------
-- Grading scale and downloads
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r JSONB;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_grade_bands(pg_temp.id('school_a'), '[{"min_percent":0,"grade":"X"}]')$q$), 'a teacher cannot change the grading scale');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_grade_bands(pg_temp.id('school_a'), '[{"min_percent":50,"grade":"C"}]')$q$), 'a scale must start at 0%');
  PERFORM public.set_grade_bands(pg_temp.id('school_a'), '[{"min_percent":0,"grade":"F","remark":"Fail"},{"min_percent":50,"grade":"C"},{"min_percent":80,"grade":"A"}]');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'grading_scale_changed'$q$) = 1, 'a grading scale change is audited');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  r := public.student_report(pg_temp.id('student-ama'));
  PERFORM pg_temp.ok(jsonb_array_length(r -> 'rows') = 2, 'the student''s report holds only published results (draft exam left out)');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'rows') x WHERE x ->> 'assessment' = 'Algebra test' AND (x ->> 'score')::numeric = 93 AND x ->> 'grade' = 'A'),
    'the report uses the current score and the school''s grading scale');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(r -> 'rows') x WHERE x ->> 'assessment' = 'Draft exam'), 'unpublished marks are never exported');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-kofi'))), 'a student cannot download another student''s report');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.class_results(%L)$q$, pg_temp.id('class_1a'))), 'a student cannot download class results');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(public.student_report(pg_temp.id('student-ama')) -> 'rows') = 2, 'a parent can download their verified child''s report');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-kofi'))), 'a parent cannot download another child''s report');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.class_results(%L)$q$, pg_temp.id('class_1a'))), 'a parent cannot download class results');

  PERFORM pg_temp.act_as('parent-unverified@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-ama'))), 'an unverified guardian cannot download the report');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(public.student_report(pg_temp.id('student-ama')) -> 'rows') = 2, 'the subject teacher can download the student''s report for their subject');
  PERFORM pg_temp.ok(jsonb_array_length(public.class_results(pg_temp.id('class_1a')) -> 'rows') = 2, 'the teacher can download their class results');
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-ama'))), 'another teacher cannot download this student''s report');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.class_results(%L)$q$, pg_temp.id('class_1a'))), 'another teacher cannot download this class''s results');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length(public.class_results(pg_temp.id('class_1a')) -> 'rows') = 2, 'the administrator can download school class results');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'report_exported'$q$) >= 5, 'every export is audited');

  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-ama'))), 'another school''s administrator cannot download the report');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.class_results(%L)$q$, pg_temp.id('class_1a'))), 'nor class results');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-ama'))), 'a platform administrator cannot download pupil reports');

  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_report(%L)$q$, pg_temp.id('student-ama'))), 'a signed-out request cannot download anything');
END $$;


-- ---------------------------------------------------------------------------
-- Admission numbers
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r JSONB;
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_admission_number(%L, 'A-001')$q$, pg_temp.id('student-ama'))), 'a teacher cannot set an admission number');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_admission_number(%L, 'A-002')$q$, pg_temp.id('student-ama'))), 'a student cannot set their own');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.set_admission_number(pg_temp.id('student-ama'), 'A-001');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_admission_number(%L, 'a-001')$q$, pg_temp.id('student-kofi'))), 'two students cannot share a number');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.set_admission_number(%L, 'X-1')$q$, pg_temp.id('teacher-math'))), 'only students have admission numbers');
  PERFORM pg_temp.ok((SELECT admission_number FROM public.student_admission_numbers(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('student-ama')) = 'A-001', 'the office can read it');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.student_admission_numbers(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('student-ama')$q$) = 0, 'another student cannot read it');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  r := public.student_report(pg_temp.id('student-ama'));
  PERFORM pg_temp.ok(r -> 'student' ->> 'admission_number' = 'A-001', 'the report carries the admission number');
END $$;

ROLLBACK;
