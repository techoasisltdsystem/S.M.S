-- Tests for targeted, scheduled announcements with read status.
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
  PERFORM pg_temp.member('school_a', 'accountant', 'finance_officer');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-unverified', 'parent');
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
  INSERT INTO ids VALUES ('class_1a', c1), ('class_1b', c2);
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  PERFORM public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-unverified'), 'uncle');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
END $$;

CREATE FUNCTION pg_temp.sees(_email TEXT, _key TEXT) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  PERFORM pg_temp.act_as(_email);
  SELECT count(*) INTO n FROM public.announcements WHERE id = pg_temp.id(_key);
  RETURN n = 1;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.sees(TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Teachers post to their classes; the audience decides who sees it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO ids VALUES ('n_students', public.post_announcement(sa, 'Quiz on Friday', 'Revise chapter 3.', 'students', ARRAY[pg_temp.id('class_1a')]));
  INSERT INTO ids VALUES ('n_everyone_1a', public.post_announcement(sa, 'Class trip', 'Forms due Monday.', 'everyone', ARRAY[pg_temp.id('class_1a')]));
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.post_announcement(%L, 'x', '', 'students', ARRAY[%L]::uuid[])$q$, sa, pg_temp.id('class_1b'))), 'a teacher cannot post to a class they do not teach');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.post_announcement(%L, 'x', '', 'everyone', '{}'::uuid[])$q$, sa)), 'or to the whole school');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.post_announcement(%L, 'x', '', 'staff', ARRAY[%L]::uuid[])$q$, sa, pg_temp.id('class_1a'))), 'or to staff');

  PERFORM pg_temp.ok(pg_temp.sees('student-ama@test.invalid', 'n_students'), 'a student in the class sees a notice for its students');
  PERFORM pg_temp.ok(NOT pg_temp.sees('student-kofi@test.invalid', 'n_students'), 'a student in another class does not');
  PERFORM pg_temp.ok(NOT pg_temp.sees('parent-ama@test.invalid', 'n_students'), 'a parent does not see a students-only notice');
  PERFORM pg_temp.ok(NOT pg_temp.sees('teacher-other@test.invalid', 'n_students'), 'a teacher of another class does not');
  PERFORM pg_temp.ok(pg_temp.sees('admin-a@test.invalid', 'n_students'), 'the school office sees every notice');
  PERFORM pg_temp.ok(pg_temp.sees('parent-ama@test.invalid', 'n_everyone_1a'), 'a verified parent of the class sees a notice for everyone in it');
  PERFORM pg_temp.ok(NOT pg_temp.sees('parent-unverified@test.invalid', 'n_everyone_1a'), 'an unverified guardian does not');
  PERFORM pg_temp.ok(NOT pg_temp.sees('student-kofi@test.invalid', 'n_everyone_1a'), 'nor another class');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'announcement'$q$) = 2, 'the student is notified of both');
  PERFORM pg_temp.act_as('student-kofi@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'announcement'$q$) = 0, 'a student outside the audience is not notified');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE kind = 'announcement'$q$) = 0, 'the author is not notified of their own notice');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$INSERT INTO public.announcements (school_id, title, audience) VALUES (%L, 'fake', 'everyone')$q$, sa)) = -1, 'a student cannot post a notice');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.post_announcement(%L, 'x', '', 'students', ARRAY[%L]::uuid[])$q$, sa, pg_temp.id('class_1a'))), 'not even through the function');
END $$;

-- ---------------------------------------------------------------------------
-- The office: teachers only, several classes, preview
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  p JSONB;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO ids VALUES ('n_teachers', public.post_announcement(sa, 'Staff meeting', 'Thursday 3pm', 'teachers', '{}'));
  INSERT INTO ids VALUES ('n_two', public.post_announcement(sa, 'Sports day', '', 'students', ARRAY[pg_temp.id('class_1a'), pg_temp.id('class_1b')]));
  PERFORM pg_temp.ok(pg_temp.sees('teacher-other@test.invalid', 'n_teachers'), 'every teacher sees a teachers-only notice');
  PERFORM pg_temp.ok(NOT pg_temp.sees('accountant@test.invalid', 'n_teachers'), 'other staff do not');
  PERFORM pg_temp.ok(NOT pg_temp.sees('student-ama@test.invalid', 'n_teachers'), 'nor students');
  PERFORM pg_temp.ok(NOT pg_temp.sees('parent-ama@test.invalid', 'n_teachers'), 'nor parents');
  PERFORM pg_temp.ok(pg_temp.sees('student-ama@test.invalid', 'n_two') AND pg_temp.sees('student-kofi@test.invalid', 'n_two'), 'a notice for two classes reaches both');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  p := public.audience_preview(sa, 'students', ARRAY[pg_temp.id('class_1a')]);
  PERFORM pg_temp.ok((p ->> 'total')::int = 1 AND (p ->> 'students')::int = 1, 'the preview counts who a notice would reach');
  p := public.audience_preview(sa, 'everyone', '{}');
  PERFORM pg_temp.ok((p ->> 'total')::int = 8 AND (p ->> 'parents')::int = 2, 'including the whole school');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.audience_preview(%L, 'everyone', '{}'::uuid[])$q$, sa)), 'a student cannot count audiences');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'announcement_published' AND (details ->> 'recipients')::int >= 1$q$) = 4,
    'each posting is audited with its audience size');
END $$;

-- ---------------------------------------------------------------------------
-- Scheduling, delivery, read status, withdrawal
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
  aid UUID;
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  aid := public.post_announcement(sa, 'Holiday tomorrow', 'School closed.', 'everyone', '{}', now() + interval '1 day');
  INSERT INTO ids VALUES ('n_later', aid);
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.post_announcement(%L, 'x', '', 'everyone', '{}'::uuid[], now() - interval '1 day')$q$, sa)), 'a notice cannot be scheduled in the past');
  PERFORM pg_temp.ok(pg_temp.sees('admin-a@test.invalid', 'n_later'), 'the office sees a scheduled notice');
  PERFORM pg_temp.ok(NOT pg_temp.sees('student-ama@test.invalid', 'n_later'), 'its audience does not, until its time');
  PERFORM pg_temp.ok(NOT pg_temp.sees('teacher-math@test.invalid', 'n_later'), 'staff do not either');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE body = 'Holiday tomorrow'$q$) = 0, 'and nobody is notified yet');

  PERFORM set_config('role', 'none', true);
  UPDATE public.announcements SET published_at = now() - interval '1 minute' WHERE id = aid;
  PERFORM public.deliver_due_announcements();
  PERFORM public.deliver_due_announcements();
  PERFORM pg_temp.ok(pg_temp.sees('student-ama@test.invalid', 'n_later'), 'once its time comes it is visible');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_notifications(pg_temp.id('school_a')) WHERE body = 'Holiday tomorrow'$q$) = 1, 'and delivered exactly once');

  -- Read status.
  PERFORM public.mark_announcements_read(ARRAY[pg_temp.id('n_students'), pg_temp.id('n_teachers')]);
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok((SELECT recipients || '/' || reads FROM public.announcement_stats(pg_temp.id('school_a')) WHERE announcement_id = pg_temp.id('n_students')) = '1/1', 'the author sees how many of the audience have read it');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok((SELECT reads FROM public.announcement_stats(pg_temp.id('school_a')) WHERE announcement_id = pg_temp.id('n_teachers')) = 0, 'reading is recorded only for notices you are allowed to see');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.announcement_stats(pg_temp.id('school_a'))$q$) = 0, 'a student cannot see read figures');

  -- Editing the wording.
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.edit_announcement(pg_temp.id('n_everyone_1a'), 'Class trip (updated)', 'Forms due Tuesday.');
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.edit_announcement(%L, 'hacked', '')$q$, pg_temp.id('n_everyone_1a'))), 'only the author or the office can edit a notice');
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.announcements WHERE title = 'Class trip (updated)'$q$) = 1, 'the author can correct the wording');

  -- Withdrawal.
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cancel_announcement(%L)$q$, pg_temp.id('n_students'))), 'another teacher cannot withdraw it');
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM public.cancel_announcement(pg_temp.id('n_students'));
  PERFORM pg_temp.ok(NOT pg_temp.sees('student-ama@test.invalid', 'n_students'), 'a withdrawn notice disappears for its audience');
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'announcement_cancelled'$q$) = 1, 'the withdrawal is audited');

  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.announcements$q$) = 0, 'another school sees none of these notices');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.post_announcement(%L, 'x', '', 'everyone', '{}'::uuid[])$q$, sa)), 'and cannot post to this school');
END $$;

ROLLBACK;
