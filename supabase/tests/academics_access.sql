-- Access tests for the shared school records (classes, attendance, results,
-- guardians, notices) and the platform console. Same harness as
-- tenant_isolation.sql: one transaction, rolled back; PASS or stop with FAIL.
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
  PERFORM pg_temp.member('school_b', 'student-b', 'student');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
END $$;

-- ---------------------------------------------------------------------------
-- The administrator sets up the school year
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  y UUID; c1 UUID; c2 UUID; m UUID; e UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_current)
  VALUES (pg_temp.id('school_a'), '2026/2027', '2026-09-01', '2027-07-31', true) RETURNING id INTO y;
  INSERT INTO public.terms (school_id, academic_year_id, name, starts_on, ends_on, is_current)
  VALUES (pg_temp.id('school_a'), y, 'Term 1', '2026-09-01', '2026-12-18', true);
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1A') RETURNING id INTO c1;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1B') RETURNING id INTO c2;
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'Mathematics') RETURNING id INTO m;
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'English') RETURNING id INTO e;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id)
  VALUES (pg_temp.id('school_a'), c1, m, pg_temp.id('teacher-math')),
         (pg_temp.id('school_a'), c2, e, pg_temp.id('teacher-other'));
  INSERT INTO ids VALUES ('year', y), ('class_1a', c1), ('class_1b', c2), ('maths', m), ('english', e);
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  PERFORM public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-unverified'), 'uncle');
END $$;

DO $$ BEGIN
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.enrollments') = 2, 'admin enrols students and sees every enrolment');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.enroll_student(pg_temp.id('class_1a'), pg_temp.id('parent-ama'))$q$),
    'a parent account cannot be enrolled as a student');
  PERFORM pg_temp.ok(pg_temp.rows($q$INSERT INTO public.enrollments (school_id, class_id, student_id)
    VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('student-kofi'))$q$) = -1,
    'enrolments cannot be written directly, only through enroll_student');
  PERFORM pg_temp.ok(pg_temp.fails($q$INSERT INTO public.classes (school_id, academic_year_id, name)
    VALUES (pg_temp.id('school_b'), pg_temp.id('year'), 'Sneaky')$q$), 'admin A cannot add a class to school B');
END $$;

-- ---------------------------------------------------------------------------
-- Parents only see children once the school verifies the link
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(NOT public.is_guardian_of(pg_temp.id('student-ama')), 'a pending link gives the parent no access');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE id = pg_temp.id('student-ama')$q$) = 0,
    'parent cannot read the child''s profile before verification');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified')$q$),
    'a parent cannot verify their own link');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE id = pg_temp.id('student-ama')$q$) = 1,
    'after verification the parent sees their child');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE id = pg_temp.id('student-kofi')$q$) = 0,
    'the parent does not see other children');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.enrollments') = 1, 'the parent sees only their child''s enrolment');

  PERFORM pg_temp.act_as('parent-unverified@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.enrollments') = 0, 'an unverified guardian sees no enrolment');
END $$;

-- ---------------------------------------------------------------------------
-- Teachers reach only the classes they teach
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.enrollments') = 1, 'teacher sees only enrolments in classes they teach');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE id = pg_temp.id('student-ama')$q$) = 1,
    'teacher can read their own student''s profile');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE id = pg_temp.id('student-kofi')$q$) = 0,
    'teacher cannot read a student they do not teach');
  PERFORM public.save_attendance(pg_temp.id('class_1a'), current_date,
    jsonb_build_array(jsonb_build_object('student_id', pg_temp.id('student-ama'), 'status', 'present')));
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.attendance_records') = 1, 'teacher takes today''s register for their class');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.save_attendance(pg_temp.id('class_1b'), current_date,
    jsonb_build_array(jsonb_build_object('student_id', pg_temp.id('student-kofi'), 'status', 'absent')))$q$),
    'teacher cannot take the register for a class they do not teach');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.save_attendance(pg_temp.id('class_1a'), current_date - 3,
    jsonb_build_array(jsonb_build_object('student_id', pg_temp.id('student-ama'), 'status', 'absent')))$q$),
    'teacher cannot change a past day''s register');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.save_attendance(pg_temp.id('class_1a'), current_date,
    jsonb_build_array(jsonb_build_object('student_id', pg_temp.id('student-kofi'), 'status', 'present')))$q$),
    'a student outside the class cannot be marked in its register');
  PERFORM pg_temp.ok(pg_temp.rows($q$UPDATE public.attendance_records SET status = 'absent'$q$) = -1,
    'attendance cannot be edited directly');

  -- Results: the teacher drafts an assessment and enters marks.
  WITH x AS (
    INSERT INTO public.assessments (school_id, class_id, subject_id, title, max_score, status)
    VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Class test 1', 50, 'published')
    RETURNING id)
  INSERT INTO ids SELECT 'test1', id FROM x;
END $$;

DO $$ BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok((SELECT status FROM public.assessments WHERE id = pg_temp.id('test1')) = 'draft',
    'a new assessment always starts as a draft, whatever the browser sends');
  INSERT INTO public.marks (school_id, assessment_id, student_id, score)
  VALUES (pg_temp.id('school_a'), pg_temp.id('test1'), pg_temp.id('student-ama'), 42);
  PERFORM pg_temp.ok(pg_temp.fails($q$INSERT INTO public.marks (school_id, assessment_id, student_id, score)
    VALUES (pg_temp.id('school_a'), pg_temp.id('test1'), pg_temp.id('student-kofi'), 30)$q$),
    'marks cannot be entered for a student outside the class');
  PERFORM pg_temp.ok(pg_temp.fails($q$UPDATE public.marks SET score = 60 WHERE assessment_id = pg_temp.id('test1')$q$),
    'a mark above the maximum is refused');
  PERFORM pg_temp.ok(pg_temp.fails($q$UPDATE public.assessments SET status = 'published' WHERE id = pg_temp.id('test1')$q$),
    'a teacher cannot publish by editing the status');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.move_assessment(pg_temp.id('test1'), 'approved')$q$),
    'a teacher cannot approve results');

  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0, 'another teacher cannot see these marks');
  PERFORM pg_temp.ok(pg_temp.fails($q$INSERT INTO public.assessments (school_id, class_id, subject_id, title)
    VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), pg_temp.id('maths'), 'Not mine')$q$),
    'a teacher cannot create assessments for a subject they do not teach');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0, 'the student cannot see draft marks');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.assessments') = 0, 'the student cannot see a draft assessment');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.move_assessment(pg_temp.id('test1'), 'submitted');
  PERFORM pg_temp.ok(pg_temp.fails($q$UPDATE public.marks SET score = 10 WHERE assessment_id = pg_temp.id('test1')$q$),
    'marks are locked once submitted');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.move_assessment(pg_temp.id('test1'), 'published')$q$),
    'results cannot be published before approval');
  PERFORM public.move_assessment(pg_temp.id('test1'), 'approved');
  PERFORM public.move_assessment(pg_temp.id('test1'), 'published');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT score FROM public.marks) = 42, 'the student sees their mark once published');
  PERFORM pg_temp.ok((public.student_standing(pg_temp.id('student-ama')) ->> 'average')::numeric = 84
    AND (public.student_standing(pg_temp.id('student-ama')) ->> 'rank')::int = 1, 'the student sees their average and class position');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.student_standing(pg_temp.id('student-kofi'))$q$),
    'a student cannot look up a classmate''s standing');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT score FROM public.marks) = 42, 'the verified parent sees the published mark');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.attendance_records') = 1, 'the parent sees the child''s attendance');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0, 'a classmate in another class sees no marks');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.move_assessment(pg_temp.id('test1'), 'draft', '')$q$),
    'reopening needs a reason');
  PERFORM public.move_assessment(pg_temp.id('test1'), 'draft', 'Wrong answer key');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'results_reopened'
    AND details ->> 'reason' = 'Wrong answer key'), 'the reopening and its reason are in the audit log');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0, 'reopened results disappear from the student view');
END $$;

-- ---------------------------------------------------------------------------
-- Notices and the directory
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.announcements (school_id, title, audience, author_name) VALUES (pg_temp.id('school_a'), 'Staff meeting', 'staff', 'Forged');
  INSERT INTO public.announcements (school_id, title, audience) VALUES (pg_temp.id('school_a'), 'Sports day', 'everyone');
  INSERT INTO public.events (school_id, title, starts_at, audience) VALUES (pg_temp.id('school_a'), 'Open day', now() + interval '3 days', 'parents');
  PERFORM pg_temp.ok((SELECT author_name FROM public.announcements WHERE title = 'Staff meeting') = 'Admin A',
    'the author name comes from the session, not the browser');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO public.announcements (school_id, class_id, title, audience) VALUES (pg_temp.id('school_a'), pg_temp.id('class_1a'), 'Bring calculators', 'students');
  PERFORM pg_temp.ok(pg_temp.fails($q$INSERT INTO public.announcements (school_id, title) VALUES (pg_temp.id('school_a'), 'Whole school')$q$),
    'a teacher cannot post a school-wide notice');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.announcements') = 2, 'the student sees the school notice and their class notice, not staff ones');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.events') = 0, 'the student does not see a parents-only event');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.school_directory(pg_temp.id('school_a')) WHERE 'student' = ANY(roles)$q$) = 1,
    'the directory shows a student only themselves among students');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.announcements') = 1, 'another class does not see the class notice');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.events') = 1, 'the parent sees the parents event');
  PERFORM pg_temp.act_as('student-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.announcements') = 0, 'school B sees nothing from school A');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.school_directory(pg_temp.id('school_a'))$q$) = 0,
    'school B cannot list school A''s people');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.school_overview(pg_temp.id('school_a'))$q$), 'school B cannot read school A''s figures');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((public.school_overview(pg_temp.id('school_a')) -> 'students_by_gender' ->> 'female')::int = 1,
    'school figures are counted from real records');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.school_overview(pg_temp.id('school_a'))$q$), 'a teacher cannot read whole-school figures');
END $$;

-- ---------------------------------------------------------------------------
-- Platform (Super Admin) console
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r JSONB;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_overview()'), 'a school admin cannot open the platform console');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_school_status(pg_temp.id('school_b'), 'suspended', 'x')$q$),
    'a school admin cannot suspend schools');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok((public.platform_overview() ->> 'schools')::int >= 2, 'the platform admin sees school counts');
  PERFORM pg_temp.ok((SELECT students FROM public.platform_schools() WHERE id = pg_temp.id('school_a')) = 2,
    'per-school counts are real');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0 AND pg_temp.count('SELECT 1 FROM public.enrollments') = 0,
    'the platform admin does not read pupils'' records');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_school_status(pg_temp.id('school_b'), 'suspended', '  ')$q$),
    'suspending needs a reason');
  PERFORM public.set_school_status(pg_temp.id('school_b'), 'suspended', 'Unpaid subscription');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = pg_temp.id('school_b')
    AND action = 'school_updated' AND details ->> 'reason' = 'Unpaid subscription'), 'the reason is kept in the audit log');
  r := public.platform_create_school('New School', 'new-school', 'New Head', 'head@test.invalid');
  PERFORM pg_temp.ok(r ? 'token', 'the platform admin creates a school with an admin invitation');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.platform_create_school('Dup', 'new-school', 'X', 'x@test.invalid')$q$),
    'a used short name is refused');

  -- On hosted Supabase the console needs the second sign-in factor.
  PERFORM set_config('request.jwt.claims', (current_setting('request.jwt.claims')::jsonb || '{"aal":"aal1"}')::text, true);
  PERFORM pg_temp.ok(pg_temp.fails('SELECT public.platform_overview()'), 'a password-only platform session is refused');
END $$;

-- Setup records are audited by the database, with the signed-in person as actor.
DO $$
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'Audit Probe');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = pg_temp.id('school_a')
    AND action = 'record_created' AND target_type = 'subjects' AND target_name = 'Audit Probe'
    AND actor_user_id = auth.uid()), 'adding a subject is audited with the actor');
  UPDATE public.subjects SET name = 'Audit Probe 2' WHERE name = 'Audit Probe';
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = pg_temp.id('school_a')
    AND action = 'record_updated' AND details -> 'changed' ? 'name'), 'changing a subject is audited');
  PERFORM pg_temp.ok(pg_temp.fails($q$INSERT INTO public.audit_logs (school_id, action, target_type) VALUES (pg_temp.id('school_a'), 'record_created', 'x')$q$),
    'nobody can write audit entries directly');
END $$;

-- Deleting setup records: allowed for the office, refused when still in use, audited.
DO $$
DECLARE
  c UUID; s UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'Delete Probe') RETURNING id INTO s;
  DELETE FROM public.subjects WHERE id = s;
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = s), 'the office deletes an unused subject');
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = pg_temp.id('school_a')
    AND action = 'record_deleted' AND target_type = 'subjects' AND target_name = 'Delete Probe'), 'the deletion is audited');
  SELECT id INTO c FROM public.classes WHERE school_id = pg_temp.id('school_a') AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = classes.id) LIMIT 1;
  PERFORM pg_temp.ok(pg_temp.fails(format('DELETE FROM public.classes WHERE id = %L', c)), 'a class with students cannot be deleted');
  PERFORM pg_temp.ok(pg_temp.fails($q$DELETE FROM public.academic_years WHERE school_id = pg_temp.id('school_a') AND EXISTS (SELECT 1 FROM public.terms t WHERE t.academic_year_id = academic_years.id)$q$),
    'a year with terms cannot be deleted');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.subjects WHERE school_id = pg_temp.id('school_a')$q$) = 0, 'school B sees none of school A subjects');
END $$;

ROLLBACK;
