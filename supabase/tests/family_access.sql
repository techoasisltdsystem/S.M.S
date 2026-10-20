-- Tests for parent/child isolation and message attachments. One transaction, rolled back.
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


CREATE FUNCTION pg_temp.owner() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('role', 'none', true); PERFORM set_config('request.jwt.claims', '', true); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.owner() TO anon, authenticated;

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
  PERFORM pg_temp.member('school_a', 'teacher-t', 'teacher');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-kofi', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-nolink', 'parent');
  PERFORM pg_temp.member('school_b', 'parent-b', 'parent');
END $$;

DO $$
DECLARE y UUID; c UUID; m UUID; aid UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.academic_years (school_id, name, starts_on, ends_on, is_current) VALUES (pg_temp.id('school_a'), '2026/2027', '2026-09-01', '2027-07-31', true) RETURNING id INTO y;
  INSERT INTO public.classes (school_id, academic_year_id, name) VALUES (pg_temp.id('school_a'), y, 'JHS 1A') RETURNING id INTO c;
  INSERT INTO public.subjects (school_id, name) VALUES (pg_temp.id('school_a'), 'Mathematics') RETURNING id INTO m;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id) VALUES (pg_temp.id('school_a'), c, m, pg_temp.id('teacher-t'));
  -- Both children are in the SAME class, the hardest case for isolation.
  PERFORM public.enroll_student(c, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'l_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  INSERT INTO ids SELECT 'l_kofi', public.link_guardian(pg_temp.id('student-kofi'), pg_temp.id('parent-kofi'), 'father');
  PERFORM public.set_guardian_link_status(pg_temp.id('l_ama'), 'verified');
  PERFORM public.set_guardian_link_status(pg_temp.id('l_kofi'), 'verified');
  INSERT INTO ids VALUES ('class_1a', c);

  PERFORM pg_temp.act_as('teacher-t@test.invalid');
  INSERT INTO public.assessments (school_id, class_id, subject_id, title, kind, max_score) VALUES (pg_temp.id('school_a'), c, m, 'Algebra test', 'test', 100) RETURNING id INTO aid;
  INSERT INTO public.marks (school_id, assessment_id, student_id, score) VALUES (pg_temp.id('school_a'), aid, pg_temp.id('student-ama'), 85), (pg_temp.id('school_a'), aid, pg_temp.id('student-kofi'), 40);
  PERFORM public.move_assessment(aid, 'submitted');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.move_assessment(aid, 'approved');
  PERFORM public.move_assessment(aid, 'published');
END $$;

-- 1. Each parent sees only their own child's grades and information ------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 1 AND pg_temp.count('SELECT 1 FROM public.marks WHERE score = 85') = 1, 'parent A sees exactly their own child''s published mark');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks WHERE score = 40') = 0, 'and not the other child''s, even in the same class');
  PERFORM pg_temp.ok(jsonb_array_length(public.student_report(pg_temp.id('student-ama')) -> 'rows') = 1, 'parent A can download their own child''s report');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.student_report(%L)', pg_temp.id('student-kofi'))), 'but not the other child''s report');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.student_standing(%L)', pg_temp.id('student-kofi'))), 'nor the other child''s class position and average');
  PERFORM pg_temp.ok(public.student_standing(pg_temp.id('student-ama')) IS NOT NULL, 'parent A sees their own child''s standing');
  PERFORM pg_temp.ok(pg_temp.count(format('SELECT 1 FROM public.profiles WHERE id = %L', pg_temp.id('student-kofi'))) = 0, 'parent A cannot read the other child''s profile');
  PERFORM pg_temp.ok(pg_temp.count(format('SELECT 1 FROM public.guardian_links WHERE student_id = %L', pg_temp.id('student-kofi'))) = 0, 'nor the other child''s guardian links');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.class_results(%L)', pg_temp.id('class_1a'))), 'nor the whole class''s results');

  PERFORM pg_temp.act_as('parent-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 1 AND pg_temp.count('SELECT 1 FROM public.marks WHERE score = 40') = 1, 'parent B sees only their own child''s mark');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.student_report(%L)', pg_temp.id('student-ama'))), 'and cannot download the first child''s report');

  PERFORM pg_temp.act_as('parent-nolink@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0, 'a parent with no linked child sees no marks');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.student_report(%L)', pg_temp.id('student-ama'))), 'and no reports');

  PERFORM pg_temp.act_as('parent-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 0, 'a parent in another school sees nothing');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count('SELECT 1 FROM public.marks') = 1, 'a student sees only their own mark');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.student_report(%L)', pg_temp.id('student-kofi'))), 'and cannot download a classmate''s report');
END $$;

-- 2. Files and images in messages -----------------------------------------------------------------------
DO $$
DECLARE
  conv UUID; msg UUID; f1 UUID; f2 UUID;
  png TEXT := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
BEGIN
  PERFORM pg_temp.act_as('teacher-t@test.invalid');
  conv := public.start_conversation(pg_temp.id('school_a'), ARRAY[pg_temp.id('parent-ama')], 'Report', 'Please see the attached');
  SELECT message_id INTO msg FROM public.conversation_thread(conv) LIMIT 1;
  f1 := public.attach_message_file(msg, 'photo.png', png);
  f2 := public.attach_message_file(msg, 'notes.txt', encode(convert_to('Homework this week: fractions', 'UTF8'), 'base64'));
  PERFORM pg_temp.ok(f1 IS NOT NULL AND f2 IS NOT NULL, 'a teacher can attach an image and a document to a message');
  PERFORM set_config('t.msg', msg::text, false); PERFORM set_config('t.f1', f1::text, false); PERFORM set_config('t.conv', conv::text, false);
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.attach_message_file(%L, %L, %L)', msg, 'evil.exe', png)), 'a program file is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.attach_message_file(%L, %L, %L)', msg, 'fake.png', encode(convert_to('not an image at all', 'UTF8'), 'base64'))), 'a file whose content does not match its type is refused');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.attach_message_file(%L, %L, %L)', msg, 'big.pdf', repeat('QUJD', 1800000))), 'a file over 5 MB is refused');
  PERFORM public.attach_message_file(msg, 'a.png', png); PERFORM public.attach_message_file(msg, 'b.png', png); PERFORM public.attach_message_file(msg, 'c.png', png);
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.attach_message_file(%L, %L, %L)', msg, 'd.png', png)), 'a message carries at most 5 files');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.message_files_of(conv)) = 5, 'the recipient sees the files on the message');
  PERFORM pg_temp.ok(public.get_message_file(f1) ->> 'mime' = 'image/png', 'and can open them');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.attach_message_file(%L, %L, %L)', msg, 'x.png', png)), 'the recipient cannot add files to the teacher''s message');

  PERFORM pg_temp.act_as('parent-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.message_files_of(%L)', conv)), 'another parent cannot list the files');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.get_message_file(%L)', f1)), 'or open them');
  PERFORM pg_temp.ok(pg_temp.fails('SELECT count(*) FROM public.message_files'), 'or read the table');

  PERFORM pg_temp.act_as('parent-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.get_message_file(%L)', f1)), 'a person in another school cannot open them');
  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.get_message_file(%L)', f1)), 'nor a signed-out visitor');

  PERFORM pg_temp.owner();
  UPDATE public.messages SET created_at = now() - interval '1 hour' WHERE id = msg;
  PERFORM pg_temp.act_as('teacher-t@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.attach_message_file(%L, %L, %L)', msg, 'late.png', png)), 'files cannot be added to an old message');

  PERFORM pg_temp.owner();
  UPDATE public.messages SET hidden_at = now() WHERE id = msg;
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.get_message_file(%L)', f1)) AND (SELECT count(*) FROM public.message_files_of(conv)) = 0, 'a message hidden by the school hides its files too');
END $$;

ROLLBACK;
