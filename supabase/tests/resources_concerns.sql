-- Tests for learning resources, student concerns and the dashboard figures.
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
  sa UUID := pg_temp.id('school_a'); subj UUID; r1 UUID; r2 UUID; c1 UUID; c2 UUID; j JSONB; n INT;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.subjects (school_id, name) VALUES (sa, 'Mathematics') RETURNING id INTO subj;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id) VALUES (sa, pg_temp.id('class_1a'), subj, pg_temp.id('teacher-math'));

  -- ===== learning resources =====
  r1 := public.resource_add(sa, 'School handbook', 'For everyone', 'General', NULL, NULL, 'https://example.org/handbook', NULL, NULL);
  PERFORM pg_temp.ok(r1 IS NOT NULL, 'an administrator can add a whole-school link');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  r2 := public.resource_add(sa, 'Algebra notes', NULL, 'Maths notes', subj, pg_temp.id('class_1a'), NULL, 'algebra.txt', encode('x + y = z, a worked example'::bytea, 'base64'));
  PERFORM pg_temp.ok(r2 IS NOT NULL, 'a teacher can add a file for a class they teach');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.resource_add(%L, 'Not mine', NULL, NULL, NULL, %L, 'https://example.org/x', NULL, NULL)$q$, sa, pg_temp.id('class_1b'))), 'but not for a class they do not teach');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.resource_add(%L, 'Bad link', NULL, NULL, NULL, %L, 'ftp://x', NULL, NULL)$q$, sa, pg_temp.id('class_1a'))), 'a link must be http or https');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.resources_list(sa)) = 2, 'a student in the class sees the class file and the school link');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.resource_add(%L, 'Student upload', NULL, NULL, NULL, NULL, 'https://example.org/s', NULL, NULL)$q$, sa)), 'a student cannot add resources');
  j := public.resource_open(r2);
  PERFORM pg_temp.ok(convert_from(decode(j ->> 'content', 'base64'), 'UTF8') LIKE 'x + y%', 'a student can open the class file');
  PERFORM pg_temp.ok((public.resources_stats(sa) ->> 'downloads')::int = 1, 'opening counts as a download');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.resources_list(sa)) = 1, 'a student in another class sees only the school link');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.resource_open(%L)$q$, r2)), 'and cannot open the other class file by its id');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.resources_list(sa)) = 2, 'a parent sees what their child sees');
  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.resources_list(%L)$q$, sa)), 'another school sees nothing');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.resource_archive(%L)$q$, r2)), 'a student cannot remove a resource');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.resource_archive(r2);
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.resources_list(sa)) = 1, 'an archived resource disappears');

  -- ===== concerns =====
  c1 := public.concern_submit(sa, pg_temp.id('student-ama'), 'principal', NULL, 'bullying', 'Bullying concern', 'Someone keeps taking my lunch.');
  PERFORM pg_temp.ok(c1 IS NOT NULL, 'a student can raise a concern with the principal');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.concern_submit(%L, %L, 'principal', NULL, 'other', 'For Bea', 'Not my concern to raise.')$q$, sa, pg_temp.id('student-bea'))), 'a student cannot raise one for another student');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  c2 := public.concern_submit(sa, pg_temp.id('student-ama'), 'teacher', pg_temp.id('teacher-math'), 'academic', 'Extra maths help', 'Could Ama get extra practice?');
  PERFORM pg_temp.ok(c2 IS NOT NULL, 'a parent can raise one with their child''s teacher');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.concern_submit(%L, %L, 'teacher', %L, 'other', 'Wrong teacher', 'This teacher does not teach her.')$q$, sa, pg_temp.id('student-ama'), pg_temp.id('accountant'))), 'only the student''s own teachers can be chosen');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.concerns_list(sa)) = 2, 'the parent sees both concerns about their child');
  PERFORM pg_temp.act_as('parent-bea@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.concerns_list(sa)) = 0, 'another family sees none');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.concerns_list(sa)) = 1, 'the teacher sees only the concern addressed to them');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.concern_respond(%L, 'resolved', 'ok fine')$q$, c1)), 'and cannot handle the principal''s concern');
  PERFORM public.concern_respond(c2, 'resolved', 'Extra practice sheets every Friday.');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.concerns_list(sa)) = 2, 'the principal sees all concerns');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.concern_respond(%L, 'resolved', '')$q$, c1)), 'resolving needs a response');
  PERFORM public.concern_respond(c1, 'in_review', 'We are looking into it.');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT status FROM public.concerns_list(sa) WHERE id = c2) = 'resolved' AND (SELECT response FROM public.concerns_list(sa) WHERE id = c2) LIKE 'Extra practice%', 'the student sees the resolution');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.concern_respond(%L, 'resolved', 'closing my own')$q$, c1)), 'a student cannot resolve a concern');

  -- ===== dashboard figures =====
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  j := public.school_dashboard_trends(sa);
  PERFORM pg_temp.ok((j ->> 'students_now')::int = 3 AND jsonb_array_length(j -> 'attendance_by_month') = 6 AND jsonb_array_length(j -> 'payments_by_month') = 6, 'the trends report students and six months of attendance and payments');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  j := public.school_dashboard_trends(sa);
  PERFORM pg_temp.ok(j -> 'revenue_month' = 'null'::jsonb AND j -> 'payments_by_month' = 'null'::jsonb, 'money is hidden from staff without fee access');
  PERFORM pg_temp.ok((SELECT subjects_covered FROM public.class_coverage(sa) WHERE class_id = pg_temp.id('class_1a')) = 1, 'class coverage counts staffed subjects');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.my_recent_activity(sa)) >= 1, 'a teacher sees their own recent actions');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.school_dashboard_trends(%L)$q$, sa)), 'students cannot read school trends');
  j := public.student_profile_extras(sa, pg_temp.id('student-ama'));
  PERFORM pg_temp.ok(j ->> 'class' = 'JHS 1A' AND jsonb_array_length(j -> 'guardians') = 1 AND jsonb_array_length(j -> 'subjects') = 1, 'the student profile shows class, guardian and subjects');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.student_profile_extras(%L, %L)$q$, sa, pg_temp.id('student-bea'))), 'but not another student''s');
END $$;

ROLLBACK;
