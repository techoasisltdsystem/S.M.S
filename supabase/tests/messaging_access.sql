-- Access tests for staff-role permissions and private messaging. Same harness as
-- academics_access.sql: one transaction, rolled back; PASS or stop with FAIL.
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
  PERFORM pg_temp.member('school_a', 'teacher-math', 'teacher');
  PERFORM pg_temp.member('school_a', 'teacher-other', 'teacher');
  PERFORM pg_temp.member('school_a', 'student-ama', 'student', 'female');
  PERFORM pg_temp.member('school_a', 'student-kofi', 'student', 'male');
  PERFORM pg_temp.member('school_a', 'parent-ama', 'parent');
  PERFORM pg_temp.member('school_a', 'parent-unverified', 'parent');
  PERFORM pg_temp.member('school_a', 'accountant', 'finance_officer');
  PERFORM pg_temp.member('school_a', 'librarian', 'librarian');
  PERFORM pg_temp.member('school_a', 'head', 'headteacher');
  PERFORM pg_temp.member('school_b', 'student-b', 'student');
  INSERT INTO auth.users (email) VALUES ('platform@test.invalid') RETURNING id INTO uid;
  UPDATE public.school_subscriptions SET plan_id = (SELECT id FROM public.plans WHERE code = 'unlimited');
  INSERT INTO public.platform_admins (user_id) VALUES (uid);
END $$;

-- The school year, classes, teaching, and one verified plus one unverified guardian link.
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
  PERFORM public.enroll_student(c1, pg_temp.id('student-ama'));
  PERFORM public.enroll_student(c2, pg_temp.id('student-kofi'));
  INSERT INTO ids SELECT 'link_ama', public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-ama'), 'mother');
  PERFORM public.link_guardian(pg_temp.id('student-ama'), pg_temp.id('parent-unverified'), 'uncle');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
END $$;

-- ---------------------------------------------------------------------------
-- Who may be messaged
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('parent-ama')$q$) = 1,
    'a teacher can message the verified guardian of a pupil they teach');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('parent-unverified')$q$) = 0,
    'a teacher cannot message a guardian whose link is unverified');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('student-ama')$q$) = 0,
    'a teacher cannot message students while the school has not enabled it');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE roles && ARRAY['school_admin','librarian','teacher']::member_role[]$q$) >= 3,
    'a teacher can message administrators and other staff');

  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_conversation(%L, ARRAY[%L]::uuid[], 'x', 'hello')$q$, sa, pg_temp.id('parent-ama'))),
    'a teacher who does not teach the child cannot start a conversation with that parent');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('teacher-math')$q$) = 1,
    'a parent can message the teacher of their verified child');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id IN (pg_temp.id('teacher-other'), pg_temp.id('parent-unverified'), pg_temp.id('student-ama'), pg_temp.id('librarian'))$q$) = 0,
    'a parent cannot find other teachers, other parents, students or the librarian');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id IN (pg_temp.id('accountant'), pg_temp.id('head'))$q$) = 2,
    'a parent can message office staff (accountant and headteacher)');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_conversation(%L, ARRAY[%L, %L]::uuid[], 'x', 'hello')$q$, sa, pg_temp.id('teacher-math'), pg_temp.id('accountant'))),
    'a parent cannot start a group conversation');

  PERFORM pg_temp.act_as('parent-unverified@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('teacher-math')$q$) = 0,
    'an unverified guardian cannot message the teacher');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a'))$q$) = 0,
    'a student cannot message anyone while the school has not enabled it');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.start_conversation(%L, ARRAY[%L]::uuid[], 'x', 'hello')$q$, sa, pg_temp.id('student-b'))),
    'an administrator cannot message a person from another school');
END $$;

-- ---------------------------------------------------------------------------
-- Conversations are private to their participants
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sa UUID := pg_temp.id('school_a');
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  INSERT INTO ids VALUES ('conv1', public.start_conversation(sa, ARRAY[pg_temp.id('parent-ama')], 'Ama''s progress', 'Ama is doing well in maths.'));

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_conversations(pg_temp.id('school_a'))$q$) = 1, 'the parent sees the new conversation');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.conversation_thread(pg_temp.id('conv1'))$q$) = 1, 'the parent reads the message');
  PERFORM pg_temp.ok(public.unread_message_count(sa) = 1, 'the parent has one unread message');
  PERFORM public.mark_conversation_read(pg_temp.id('conv1'));
  PERFORM pg_temp.ok(public.unread_message_count(sa) = 0, 'reading the conversation clears the unread count');
  INSERT INTO ids VALUES ('reply1', public.send_message(pg_temp.id('conv1'), 'Thank you, teacher.'));

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(public.unread_message_count(sa) = 1, 'the teacher sees the parent''s reply as unread');

  -- People outside the conversation see and write nothing.
  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.messages$q$) = 0, 'another teacher cannot read the messages table');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.conversations$q$) = 0, 'another teacher cannot see the conversation');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.conversation_thread(pg_temp.id('conv1'))$q$), 'another teacher cannot open the thread');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.send_message(pg_temp.id('conv1'), 'let me in')$q$), 'another teacher cannot post into it');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.messages$q$) = 0, 'a school administrator cannot browse a private conversation');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.conversation_thread(pg_temp.id('conv1'))$q$), 'a school administrator cannot open it either');

  PERFORM pg_temp.act_as('platform@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.messages$q$) = 0, 'a platform administrator cannot read school messages');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.conversations$q$) = 0, 'a platform administrator cannot see school conversations');

  PERFORM pg_temp.act_as('admin-b@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.conversation_thread(pg_temp.id('conv1'))$q$), 'another school''s administrator cannot open it');

  PERFORM pg_temp.act_as(NULL);
  PERFORM pg_temp.ok(pg_temp.rows($q$SELECT 1 FROM public.messages$q$) = -1, 'a signed-out request cannot read messages');

  -- Messages cannot be written or changed directly.
  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$INSERT INTO public.messages (school_id, conversation_id, sender_id, body) VALUES (%L, %L, %L, 'forged')$q$,
    sa, pg_temp.id('conv1'), pg_temp.id('teacher-math'))) = -1, 'a message cannot be inserted directly (no forged sender)');
  PERFORM pg_temp.ok(pg_temp.rows(format($q$UPDATE public.messages SET body = 'edited' WHERE id = %L$q$, pg_temp.id('reply1'))) = -1,
    'a sent message cannot be edited');
END $$;

-- ---------------------------------------------------------------------------
-- Revoking a guardian link ends the parent's ability to write
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'revoked');

  PERFORM pg_temp.act_as('parent-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.send_message(pg_temp.id('conv1'), 'still there?')$q$),
    'after the link is revoked the parent cannot keep writing to the teacher');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('teacher-math')$q$) = 0,
    'after the link is revoked the teacher is no longer a recipient');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.send_message(pg_temp.id('conv1'), 'hello again')$q$),
    'and the teacher cannot write to a parent who is no longer linked');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.set_guardian_link_status(pg_temp.id('link_ama'), 'verified');
END $$;

-- ---------------------------------------------------------------------------
-- Reporting and moderation
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.moderation_queue(pg_temp.id('school_a'))$q$), 'a teacher cannot open the moderation queue');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.report_message(pg_temp.id('reply1'), '')$q$), 'a report needs a reason');
  PERFORM public.report_message(pg_temp.id('reply1'), 'Not appropriate');

  PERFORM pg_temp.act_as('teacher-other@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.report_message(pg_temp.id('reply1'), 'spying')$q$), 'a non-participant cannot report a message');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.moderation_queue(pg_temp.id('school_a'))$q$) = 1, 'the administrator sees only the reported message');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.hide_message(pg_temp.id('reply1'), '')$q$), 'hiding needs a reason');
  PERFORM public.hide_message(pg_temp.id('reply1'), 'Inappropriate language');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.conversation_thread(pg_temp.id('conv1')) WHERE hidden AND body IS NULL$q$) = 1,
    'a hidden message shows as hidden with no text');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'message_hidden'$q$) = 1, 'hiding a message is in the audit log');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'conversation_started' AND details::text NOT LIKE '%maths%'$q$) = 1,
    'starting a conversation is logged without its content');
END $$;

-- ---------------------------------------------------------------------------
-- Students can message only when the school allows it
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  UPDATE public.school_config SET students_can_message = true WHERE school_id = pg_temp.id('school_a');

  PERFORM pg_temp.act_as('student-ama@test.invalid');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id = pg_temp.id('teacher-math')$q$) = 1,
    'when enabled, a student can message their own teacher');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.message_recipients(pg_temp.id('school_a')) WHERE profile_id IN (pg_temp.id('teacher-other'), pg_temp.id('student-kofi'), pg_temp.id('parent-ama'), pg_temp.id('librarian'))$q$) = 0,
    'a student still cannot message other teachers, other students, parents or the librarian');
END $$;

-- ---------------------------------------------------------------------------
-- Staff roles and permissions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(NOT public.has_permission(pg_temp.id('school_a'), 'students.view'), 'a librarian has no student access by default');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.profiles WHERE id = pg_temp.id('student-ama')$q$) = 0, 'a librarian cannot read student profiles');

  PERFORM pg_temp.act_as('head@test.invalid');
  PERFORM pg_temp.ok(public.has_permission(pg_temp.id('school_a'), 'grades.publish'), 'a headteacher can publish results by default');
  PERFORM pg_temp.ok(NOT public.has_permission(pg_temp.id('school_a'), 'users.manage'), 'a headteacher cannot manage users');

  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM pg_temp.ok(public.has_permission(pg_temp.id('school_a'), 'fees.invoice'), 'an accountant can raise invoices');
  PERFORM pg_temp.ok(NOT public.has_permission(pg_temp.id('school_a'), 'grades.enter'), 'an accountant cannot enter results');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_role_permission(pg_temp.id('school_a'), 'librarian', 'grades.view', true)$q$), 'a teacher cannot change role permissions');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT * FROM public.role_permission_matrix(pg_temp.id('school_a'))$q$), 'a teacher cannot read the permission matrix');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_role_permission(pg_temp.id('school_a'), 'librarian', 'users.manage', true)$q$), 'user management cannot be handed to another role');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_role_permission(pg_temp.id('school_a'), 'parent', 'students.view', true)$q$), 'parents cannot be given staff permissions');
  PERFORM pg_temp.ok(pg_temp.fails($q$SELECT public.set_role_permission(pg_temp.id('school_a'), 'school_admin', 'grades.view', false)$q$), 'administrator permissions cannot be reduced here');
  PERFORM public.set_role_permission(pg_temp.id('school_a'), 'librarian', 'attendance.view', true);
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.audit_logs WHERE action = 'permission_changed'$q$) = 1, 'a permission change is audited');

  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(public.has_permission(pg_temp.id('school_a'), 'attendance.view'), 'the school''s change takes effect for that role');
  PERFORM pg_temp.ok(pg_temp.count($q$SELECT 1 FROM public.my_memberships() m WHERE m.school_id = pg_temp.id('school_a') AND 'attendance.view' = ANY (m.permissions)$q$) = 1,
    'and appears in the person''s menu permissions');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.set_role_permission(pg_temp.id('school_a'), 'librarian', 'attendance.view', false);
  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(NOT public.has_permission(pg_temp.id('school_a'), 'attendance.view'), 'switching it back removes the access');
END $$;

ROLLBACK;
