-- Tests for CBT, virtual classes and payroll.
--   Laptop:   npm run db:test
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
  PERFORM pg_temp.member('school_a', 'accountant', 'finance_officer');
  PERFORM pg_temp.member('school_a', 'teacher-math', 'teacher');
  PERFORM pg_temp.member('school_a', 'librarian', 'librarian');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-bea', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-bea', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-unverified', 'parent');
  PERFORM pg_temp.member('school_b', 'student-b', 'student');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
END $$;

DO $$
DECLARE
  y UUID; c1 UUID; c2 UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_current)
  VALUES (pg_temp.id('school_a'), '2026/2027', '2026-09-01', '2027-07-31', true) RETURNING id INTO y;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1A') RETURNING id INTO c1;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1B') RETURNING id INTO c2;
  INSERT INTO ids VALUES ('class_1a', c1), ('class_1b', c2);
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c1, pg_temp.id('student-bea'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  INSERT INTO ids SELECT 'link_bea', public.link_guardian(pg_temp.id('student-bea'), pg_temp.id('parent-bea'), 'father');
  PERFORM public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-unverified'), 'uncle');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_bea'), 'verified');
END $$;


DO $$
DECLARE
  sa UUID := pg_temp.id('school_a'); subj UUID; q1 UUID; q2 UUID; q3 UUID; q4 UUID; t UUID; j JSONB; att UUID; att2 UUID; tq RECORD; essay UUID;
  answers JSONB := '{}'; v UUID; run UUID; adv UUID; n INT;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.subjects (school_id, name) VALUES (sa, 'Mathematics') RETURNING id INTO subj;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id) VALUES (sa, pg_temp.id('class_1a'), subj, pg_temp.id('teacher-math'));

  -- ======================= CBT =======================
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  q1 := public.cbt_question_save(sa, NULL, subj, 'mcq', 'What is 2 + 2?', '["3","4","5"]', '1', 2, 'easy');
  q2 := public.cbt_question_save(sa, NULL, subj, 'true_false', 'Zero is an even number.', '[]', 'true', 1, 'easy');
  q3 := public.cbt_question_save(sa, NULL, subj, 'short', 'Write 4 in words.', '[]', '["four"]', 1, 'easy');
  q4 := public.cbt_question_save(sa, NULL, subj, 'essay', 'Explain what a prime number is.', '[]', NULL, 5, 'medium');
  PERFORM pg_temp.ok(q1 IS NOT NULL AND q4 IS NOT NULL, 'a teacher can build a question bank for their subject');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_question_save(%L, NULL, %L, 'mcq', 'Bad one?', '["a"]', '0', 1, 'easy')$q$, sa, subj)), 'a multiple-choice question needs at least two options');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_question_save(%L, NULL, %L, 'mcq', 'Bad key?', '["a","b"]', '5', 1, 'easy')$q$, sa, subj)), 'the correct option must exist');
  t := public.cbt_test_save(sa, NULL, pg_temp.id('class_1a'), subj, 'Mid-term test', 'Answer everything', 30, now() - interval '1 minute', now() + interval '1 hour', true, 1, ARRAY[q1, q2, q3, q4]);
  PERFORM public.cbt_test_set_status(t, 'published');
  PERFORM pg_temp.ok((SELECT phase FROM public.cbt_tests_list(sa) WHERE id = t) = 'live', 'a published test inside its window is live');
  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_test_set_status(%L, 'closed')$q$, t)), 'other staff cannot run someone else''s test');

  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_attempt_start(%L)$q$, t)), 'a student of another class cannot take the test');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  j := public.cbt_attempt_start(t);
  att := (j ->> 'attempt_id')::uuid;
  PERFORM pg_temp.ok(jsonb_array_length(j -> 'questions') = 4 AND NOT (j::text LIKE '%"correct"%'), 'starting a test returns the questions without the answer key');
  PERFORM pg_temp.ok((public.cbt_attempt_start(t) ->> 'attempt_id')::uuid = att, 'reopening returns the same attempt');
  PERFORM set_config('role', 'none', true);
  FOR tq IN SELECT * FROM public.cbt_test_questions WHERE test_id = t LOOP
    answers := answers || jsonb_build_object(tq.id::text, CASE tq.kind WHEN 'mcq' THEN '1'::jsonb WHEN 'true_false' THEN 'false'::jsonb WHEN 'short' THEN '" Four "'::jsonb ELSE '"A number with exactly two factors."'::jsonb END);
    IF tq.kind = 'essay' THEN essay := tq.id; END IF;
  END LOOP;
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((public.cbt_attempt_save(att, answers) ->> 'saved')::int = 4, 'answers are autosaved');
  PERFORM pg_temp.ok(public.cbt_attempt_submit(att, answers) ->> 'status' = 'submitted', 'the student submits');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_attempt_start(%L)$q$, t)), 'a submitted test cannot be started again');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT score FROM public.cbt_attempts WHERE id = att) = 3 AND (SELECT needs_grading FROM public.cbt_attempts WHERE id = att), 'the server marks objective answers (2 + 0 + 1) and holds the essay for grading');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT my_score FROM public.cbt_tests_list(sa) WHERE id = t) IS NULL, 'the score stays hidden until results are released');

  -- integrity: going over the violation limit ends the attempt
  PERFORM pg_temp.act_as('student-bea@test.invalid');
  att2 := (public.cbt_attempt_start(t) ->> 'attempt_id')::uuid;
  PERFORM public.cbt_attempt_violation(att2, 'tab_switch');
  PERFORM pg_temp.ok(public.cbt_attempt_violation(att2, 'copy') ->> 'status' = 'terminated', 'going past the allowed violations terminates the attempt');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_attempt_save(%L, '{}')$q$, att)), 'a student cannot touch another student''s attempt');

  -- teacher: live roster, grading, release
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  j := public.cbt_test_live(t);
  PERFORM pg_temp.ok(jsonb_array_length(j -> 'roster') = 2 AND (SELECT count(*) FROM jsonb_array_elements(j -> 'roster') r WHERE (r ->> 'violations')::int = 2) = 1, 'the live roster shows every student and their violations');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_release_results(%L, true)$q$, t)), 'results cannot be released while essays are ungraded');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_grade_essay(%L, %L, 9)$q$, att, essay)), 'an essay score cannot exceed its marks');
  PERFORM pg_temp.ok((public.cbt_grade_essay(att, essay, 4) ->> 'score')::numeric = 7, 'grading the essay completes the score');
  PERFORM public.cbt_release_results(t, true);
  PERFORM pg_temp.ok((public.cbt_dashboard(sa) ->> 'attempts')::int = 2, 'the CBT dashboard counts attempts');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT my_score FROM public.cbt_tests_list(sa) WHERE id = t) = 7, 'after release the student sees their score');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT my_status FROM public.cbt_tests_list(sa) WHERE id = t) = 'submitted', 'a parent sees their child''s test status');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_test_live(%L)$q$, t)), 'but cannot monitor the test');

  -- the clock is the server's: an expired attempt is submitted automatically
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  t := public.cbt_test_save(sa, NULL, pg_temp.id('class_1a'), subj, 'Quick quiz', NULL, 5, now() - interval '1 minute', now() + interval '1 hour', false, 0, ARRAY[q1]);
  PERFORM public.cbt_test_set_status(t, 'published');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  att := (public.cbt_attempt_start(t) ->> 'attempt_id')::uuid;
  PERFORM set_config('role', 'none', true);
  UPDATE public.cbt_attempts SET deadline = now() - interval '1 second' WHERE id = att;
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(public.cbt_attempt_save(att, '{}') ->> 'status' = 'auto_submitted', 'saving after the deadline submits the attempt instead');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.cbt_test_set_status(t, 'closed');
  PERFORM pg_temp.ok((SELECT phase FROM public.cbt_tests_list(sa) WHERE id = t) = 'closed', 'a test can be ended for everyone');

  -- ======================= Virtual class =======================
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  v := public.vclass_save(sa, NULL, pg_temp.id('class_1a'), subj, 'Quadratic equations', NULL, now() + interval '1 minute', 40);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.vclass_save(%L, NULL, %L, NULL, 'Not my class', NULL, now() + interval '1 hour', 40)$q$, sa, pg_temp.id('class_1b'))), 'a teacher can schedule only for a class they teach');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.vclass_join(%L)$q$, v)), 'students cannot enter before the teacher starts');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.vclass_set_status(v, 'live');
  PERFORM pg_temp.ok((public.vclass_join(v) ->> 'host')::boolean, 'the teacher joins as host');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  j := public.vclass_join(v);
  PERFORM pg_temp.ok((j ->> 'room') LIKE 'TechOasis-%' AND NOT (j ->> 'host')::boolean, 'a student of the class gets the room once it is live');
  PERFORM pg_temp.ok(public.vclass_heartbeat(v) = 'live', 'the heartbeat keeps attendance current');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.vclass_join(%L)$q$, v)), 'a student of another class cannot join');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.vclass_list(sa, 'all')) = 0, 'and does not see it');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.vclass_list(sa, 'all')) = 1 AND pg_temp.fails(format($q$SELECT public.vclass_join(%L)$q$, v)), 'a parent sees the class but cannot enter the room');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.vclass_attendance(v)) = 2, 'the host sees who joined');
  PERFORM public.vclass_set_status(v, 'ended');
  PERFORM public.vclass_add_recording(v, 'Lesson recording', 'https://example.org/rec.mp4');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.vclass_add_recording(%L, 'x', 'not a link')$q$, v)), 'a recording must be a web link');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(jsonb_array_length((SELECT recordings FROM public.vclass_list(sa, 'past') WHERE id = v)) = 1, 'students see the recording afterwards');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.vclass_join(%L)$q$, v)), 'an ended class cannot be joined');
  PERFORM pg_temp.ok((public.vclass_stats(sa) ->> 'recordings')::int = 1, 'virtual class figures count recordings');

  -- ======================= Payroll =======================
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM public.payroll_profile_save(sa, pg_temp.id('teacher-math'), 3000, 'GHS', 'Grade 3', 'GCB Bank', 'Teacher Math', '1234567890', 'P0001', true);
  PERFORM public.payroll_profile_save(sa, pg_temp.id('librarian'), 5000, 'GHS', 'Librarian', NULL, NULL, NULL, NULL, true);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_profile_save(%L, %L, 100, 'GHS', NULL, NULL, NULL, NULL, NULL, true)$q$, sa, pg_temp.id('student-ama'))), 'students cannot be put on payroll');
  PERFORM public.payroll_item_save(sa, NULL, NULL, 'allowance', 'Transport', 'fixed', 200, true);
  PERFORM public.payroll_item_save(sa, NULL, NULL, 'deduction', 'SSNIT', 'percent', 5.5, true);
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.payroll_profiles_list(%L)$q$, sa)), 'a teacher cannot see everyone''s salaries');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.advance_request(%L, 10000, 3, 'too much money')$q$, sa)), 'an advance is capped at three months of basic salary');
  adv := public.advance_request(sa, 1200, 3, 'School fees for my child');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.advance_request(%L, 100, 1, 'second one now')$q$, sa)), 'only one open advance at a time');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.advance_decide(%L, true, NULL)$q$, adv)), 'finance staff without approval rights cannot approve advances');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.advance_decide(adv, true, 'Approved');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  run := public.payroll_run_create(sa, '2026-10');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_run_create(%L, '2026-10')$q$, sa)), 'one payroll per month');
  j := public.payroll_run_calculate(run);
  PERFORM pg_temp.ok((j ->> 'payslips')::int = 2 AND jsonb_array_length(j -> 'warnings') = 1, 'calculation makes a payslip per staff member and warns about a missing bank account');
  PERFORM pg_temp.ok((SELECT net FROM public.payslips_for_run(run) WHERE staff = 'Teacher Math') = 2635, 'net = 3000 + 200 transport - 165 SSNIT - 400 advance');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_run_approve(%L)$q$, run)), 'the person who prepared payroll cannot approve it');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_run_mark_paid(%L, 'x')$q$, run)), 'an unapproved payroll cannot be paid');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.payroll_run_approve(run);
  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_run_calculate(%L)$q$, run)), 'an approved payroll cannot be recalculated');
  PERFORM public.payroll_run_mark_paid(run, 'BANK-REF-1');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok((SELECT balance FROM public.salary_advances WHERE id = adv) = 800, 'paying the payroll reduces the advance balance');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.my_payslips(sa)) = 1 AND (SELECT bank FROM public.my_payslips(sa)) LIKE 'GCB Bank %7890' AND (SELECT bank FROM public.my_payslips(sa)) NOT LIKE '%123456%', 'staff see their own payslip with the account masked');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.my_payslips(%L)$q$, sa)), 'students have no payslips');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.payroll_runs_list(%L)$q$, sa)), 'another school cannot see this payroll');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  j := public.payroll_dashboard(sa);
  PERFORM pg_temp.ok((j ->> 'staff_paid')::int = 2 AND (j ->> 'advances_outstanding')::numeric = 800, 'the payroll dashboard reports staff paid and advances outstanding');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.payroll_activity(sa)) >= 5, 'every payroll step is in the activity log');
END $$;

ROLLBACK;
