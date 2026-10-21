-- Tests for PAYE and SSNIT, the payroll bank file, CBT question pictures and question import.
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
  sa UUID := pg_temp.id('school_a'); subj UUID; q UUID; run UUID; j JSONB; n INT; t UUID; att JSONB;
  bands JSONB := '[{"upto":490,"rate":0},{"upto":600,"rate":5},{"upto":730,"rate":10},{"upto":3896.67,"rate":17.5},{"upto":19896.67,"rate":25},{"upto":50416.67,"rate":30},{"upto":null,"rate":35}]';
BEGIN
  -- ======================= PAYE =======================
  PERFORM pg_temp.ok(public.payroll_paye(400, bands) = 0, 'income under the first band pays no tax');
  PERFORM pg_temp.ok(public.payroll_paye(5000, bands) = 848.50, 'PAYE on 5,000 a month is 848.50 under the GRA bands');
  PERFORM pg_temp.ok(public.payroll_paye(60000, bands) = round(5.5 + 13 + 3166.67 * 0.175 + 16000 * 0.25 + 30520 * 0.30 + (60000 - 50416.67) * 0.35, 2), 'the top band has no upper limit');

  PERFORM pg_temp.act_as('accountant@test.invalid');
  PERFORM public.payroll_profile_save(sa, pg_temp.id('teacher-math'), 3000, 'GHS', 'Grade 3', 'GCB Bank', 'Teacher Math', '1234567890', 'P0001', true);
  PERFORM public.payroll_profile_save(sa, pg_temp.id('librarian'), 5000, 'GHS', 'Librarian', NULL, NULL, NULL, NULL, true);
  PERFORM public.payroll_item_save(sa, NULL, NULL, 'allowance', 'Transport', 'fixed', 200, true);
  j := public.payroll_tax_settings_get(sa);
  PERFORM pg_temp.ok(NOT (j ->> 'enabled')::boolean AND jsonb_array_length(j -> 'bands') = 7, 'statutory deductions start switched off with the GRA bands filled in');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_tax_settings_save(%L, true, 5.5, 13, '[{"upto":500,"rate":0},{"upto":400,"rate":5},{"upto":null,"rate":10}]')$q$, sa)), 'band limits must go up');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_tax_settings_save(%L, true, 5.5, 13, '[{"upto":500,"rate":0}]')$q$, sa)), 'the last band must be open-ended');
  PERFORM public.payroll_tax_settings_save(sa, true, 5.5, 13, bands);
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_tax_settings_save(%L, false, 0, 0, %L)$q$, sa, bands)), 'a teacher cannot change tax settings');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.payroll_tax_settings_get(%L)$q$, sa)), 'a teacher cannot read tax settings');

  PERFORM pg_temp.act_as('accountant@test.invalid');
  run := public.payroll_run_create(sa, '2026-11');
  j := public.payroll_run_calculate(run);
  -- Teacher: SSNIT 165; taxable 3000 + 200 - 165 = 3035; PAYE 5.5 + 13 + (3035 - 730) * 0.175 = 421.88; net 3200 - 165 - 421.88 = 2613.12
  PERFORM pg_temp.ok((SELECT net FROM public.payslips_for_run(run) WHERE staff = 'Teacher Math') = 2613.12, 'net pay takes off SSNIT and PAYE');
  PERFORM pg_temp.ok((SELECT lines FROM public.payslips_for_run(run) WHERE staff = 'Teacher Math') @> '[{"kind":"statutory","name":"PAYE income tax","amount":421.88}]', 'the payslip shows the PAYE line');
  j := public.payroll_statutory_summary(run);
  PERFORM pg_temp.ok((j ->> 'ssnit_employee')::numeric = 165 + 275 AND (j ->> 'ssnit_employer')::numeric = 390 + 650, 'the statutory summary totals employee and employer SSNIT');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.payroll_bank_file(%L)$q$, run)), 'no bank file before approval');

  PERFORM pg_temp.act_as('admin-a@test.invalid');
  PERFORM public.payroll_run_approve(run);
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT * FROM public.payroll_bank_file(%L)$q$, run)), 'a teacher cannot export the bank file');
  PERFORM pg_temp.act_as('accountant@test.invalid');
  SELECT count(*) INTO n FROM public.payroll_bank_file(run);
  PERFORM pg_temp.ok(n = 2, 'the bank file has a row per paid staff member');
  PERFORM pg_temp.ok((SELECT account_number FROM public.payroll_bank_file(run) WHERE staff = 'Teacher Math') = '1234567890', 'the bank file carries the full account number');
  PERFORM set_config('role', 'none', true);
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.audit_logs WHERE target_id = run AND details ->> 'step' = 'bank_file_exported'), 'exporting the bank file is logged');

  -- ======================= CBT pictures and import =======================
  PERFORM pg_temp.act_as('admin-a@test.invalid');
  INSERT INTO public.subjects (school_id, name) VALUES (sa, 'Mathematics') RETURNING id INTO subj;
  INSERT INTO public.teaching_assignments (school_id, class_id, subject_id, teacher_id) VALUES (sa, pg_temp.id('class_1a'), subj, pg_temp.id('teacher-math'));
  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  n := public.cbt_questions_import(sa, jsonb_build_array(
    jsonb_build_object('subject_id', subj, 'kind', 'mcq', 'prompt', 'Solve $x^2 = 9$ for positive x', 'options', '["2","3","4"]'::jsonb, 'correct', '1'::jsonb, 'marks', 2),
    jsonb_build_object('subject_id', subj, 'kind', 'true_false', 'prompt', 'A triangle has three sides.', 'correct', 'true'::jsonb),
    jsonb_build_object('subject_id', subj, 'kind', 'essay', 'prompt', 'Describe the shape shown.')));
  PERFORM pg_temp.ok(n = 3 AND (SELECT count(*) FROM public.cbt_questions_list(sa)) = 3, 'questions import in one go');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_questions_import(%L, %L)$q$, sa, jsonb_build_array(
    jsonb_build_object('subject_id', subj, 'kind', 'true_false', 'prompt', 'Fine question.', 'correct', 'true'::jsonb),
    jsonb_build_object('subject_id', subj, 'kind', 'mcq', 'prompt', 'Broken question?', 'options', '["a"]'::jsonb, 'correct', '0'::jsonb)))), 'a bad row stops the whole import');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.cbt_questions_list(sa)) = 3, 'nothing from a failed import is kept');
  PERFORM pg_temp.act_as('librarian@test.invalid');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_questions_import(%L, %L)$q$, sa, jsonb_build_array(jsonb_build_object('subject_id', subj, 'kind', 'essay', 'prompt', 'Sneaky question')))), 'a librarian cannot import questions');

  PERFORM pg_temp.act_as('teacher-math@test.invalid');
  q := (SELECT x.id FROM public.cbt_questions_list(sa) x WHERE x.kind = 'essay');
  PERFORM pg_temp.ok(pg_temp.fails(format($q$SELECT public.cbt_question_set_image(%L, 'javascript:alert(1)')$q$, q)), 'only image data is accepted as a picture');
  PERFORM public.cbt_question_set_image(q, 'data:image/png;base64,iVBORw0KGgo=');
  PERFORM pg_temp.ok((SELECT x.image FROM public.cbt_questions_list(sa) x WHERE x.id = q) LIKE 'data:image/png%', 'the picture is saved on the question');
  t := public.cbt_test_save(sa, NULL, pg_temp.id('class_1a'), subj, 'Shapes quiz', NULL, 10, now() - interval '1 minute', now() + interval '1 hour', false, 3,
         ARRAY(SELECT x.id FROM public.cbt_questions_list(sa) x ORDER BY x.prompt));
  PERFORM public.cbt_test_set_status(t, 'published');
  PERFORM pg_temp.act_as('student-ama@test.invalid');
  att := public.cbt_attempt_start(t);
  PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM jsonb_array_elements(att -> 'questions') x WHERE x ->> 'image' LIKE 'data:image/png%'), 'the student sees the picture on the paper');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(att -> 'questions') x WHERE x ? 'correct'), 'the paper still has no answer key');
END $$;

ROLLBACK;
