-- Tenant isolation and permission tests (PDF section 12.3 acceptance:
-- "a user in School A cannot read or modify School B's records, even with a
-- hand-built request carrying a valid School B ID").
--
-- Runs as the database owner inside one transaction that is rolled back, so
-- it leaves no data behind. Each check prints PASS or stops with FAIL.
--   Laptop:   npm run db:test
--   Manually: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/tenant_isolation.sql
BEGIN;

CREATE FUNCTION pg_temp.ok(_cond BOOLEAN, _label TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF _cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', _label; END IF;
  RAISE NOTICE 'PASS: %', _label;
END $$;

-- Switch the current identity to a login (NULL = signed out / anonymous).
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

-- Runs a statement and returns the number of rows it touched, or -1 when the
-- database refused it with an error.
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

CREATE FUNCTION pg_temp.login(_email TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  uid UUID;
BEGIN
  INSERT INTO auth.users (email) VALUES (_email) RETURNING id INTO uid;
  RETURN uid;
END $$;

CREATE TEMP TABLE ids (name TEXT PRIMARY KEY, id UUID);
GRANT SELECT, INSERT, UPDATE ON pg_temp.ids TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO anon, authenticated;

-- Two unrelated schools, each with an administrator who has accepted.
DO $$
DECLARE
  a JSONB := public.bootstrap_school('Test School A', 'test-school-a', 'Admin A', 'admin-a@test.invalid');
  b JSONB := public.bootstrap_school('Test School B', 'test-school-b', 'Admin B', 'admin-b@test.invalid');
BEGIN
  INSERT INTO ids VALUES ('school_a', (a ->> 'school_id')::uuid), ('school_b', (b ->> 'school_id')::uuid);
  PERFORM public.accept_invitation_for(pg_temp.login('admin-a@test.invalid'), 'admin-a@test.invalid', a ->> 'token');
  PERFORM public.accept_invitation_for(pg_temp.login('admin-b@test.invalid'), 'admin-b@test.invalid', b ->> 'token');
  INSERT INTO ids SELECT 'profile_b', id FROM public.profiles WHERE email = 'admin-b@test.invalid';
  INSERT INTO ids SELECT 'config_b', id FROM public.school_config WHERE school_id = (b ->> 'school_id')::uuid;
END $$;

-- School A admin invites a teacher; the teacher accepts.
DO $$ BEGIN PERFORM pg_temp.act_as('admin-a@test.invalid'); END $$;
DO $$
DECLARE
  inv JSONB := public.invite_member((SELECT id FROM ids WHERE name = 'school_a'), 'Teacher A', 'Teacher-A@test.invalid', 'teacher');
BEGIN
  INSERT INTO ids VALUES ('teacher_token', NULL);
  UPDATE ids SET name = 'teacher_token:' || (inv ->> 'token') WHERE name = 'teacher_token';
  INSERT INTO ids VALUES ('teacher_membership', (inv ->> 'membership_id')::uuid);
END $$;
DO $$ BEGIN PERFORM pg_temp.act_as(NULL); END $$;
RESET ROLE;
DO $$
DECLARE
  tok TEXT := (SELECT substr(name, 15) FROM ids WHERE name LIKE 'teacher_token:%');
BEGIN
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.accept_invitation_for(%L, %L, %L)',
    pg_temp.login('someone-else@test.invalid'), 'someone-else@test.invalid', tok)),
    'an invitation cannot be accepted by a different email');
  PERFORM public.accept_invitation_for(pg_temp.login('teacher-a@test.invalid'), 'teacher-a@test.invalid', tok);
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.accept_invitation_for(%L, %L, %L)',
    (SELECT id FROM auth.users WHERE email = 'teacher-a@test.invalid'), 'teacher-a@test.invalid', tok)),
    'an invitation link works only once');
END $$;

-- ---------------------------------------------------------------------------
-- School A administrator against School B
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM pg_temp.act_as('admin-a@test.invalid'); END $$;
DO $$
DECLARE
  a UUID := (SELECT id FROM ids WHERE name = 'school_a');
  b UUID := (SELECT id FROM ids WHERE name = 'school_b');
BEGIN
  PERFORM pg_temp.ok((SELECT array_agg(id) FROM public.schools) = ARRAY[a], 'A admin sees only school A');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.profiles WHERE school_id = b), 'A admin cannot read school B people');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.school_config WHERE school_id = b), 'A admin cannot read school B settings');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE school_id = b), 'A admin cannot read school B audit log');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.school_memberships WHERE school_id = b), 'A admin cannot read school B roles');
  PERFORM pg_temp.ok((SELECT count(*) FROM public.profiles WHERE school_id = a) = 2, 'A admin sees both school A people');

  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.school_config SET school_name = %L WHERE id = %L', 'hacked',
    (SELECT id FROM ids WHERE name = 'config_b'))) <= 0, 'A admin cannot change school B settings by id');
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.profiles SET full_name = %L WHERE id = %L', 'hacked',
    (SELECT id FROM ids WHERE name = 'profile_b'))) <= 0, 'A admin cannot change a school B person by id');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.invite_member(%L, %L, %L, %L)', b, 'X', 'x@test.invalid', 'school_admin')),
    'A admin cannot add people to school B');
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.school_config SET school_id = %L WHERE school_id = %L', b, a)) = -1,
    'school settings cannot be moved to another school');
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.profiles SET school_id = %L WHERE school_id = %L', b, a)) = -1,
    'people cannot be moved to another school');
  PERFORM pg_temp.ok(pg_temp.fails(format('INSERT INTO public.school_config (school_id, school_name) VALUES (%L, %L)', b, 'x')),
    'A admin cannot create settings for school B');
  PERFORM pg_temp.ok(pg_temp.fails(format('INSERT INTO public.schools (name, slug) VALUES (%L, %L)', 'X', 'x')),
    'a school admin cannot create schools');
END $$;

-- Audit log is append-only and written by the server.
DO $$
DECLARE
  a UUID := (SELECT id FROM ids WHERE name = 'school_a');
  before_count INT := (SELECT count(*) FROM public.audit_logs);
BEGIN
  PERFORM pg_temp.ok(pg_temp.fails(format('INSERT INTO public.audit_logs (school_id, action, target_type) VALUES (%L, %L, %L)', a, 'login', 'x')),
    'nobody can write audit entries directly');
  PERFORM pg_temp.ok(pg_temp.rows('UPDATE public.audit_logs SET actor_name = ''x''') = -1, 'audit entries cannot be edited');
  PERFORM pg_temp.ok(pg_temp.rows('DELETE FROM public.audit_logs') = -1, 'audit entries cannot be deleted');
  UPDATE public.school_config SET tagline = 'New tagline' WHERE school_id = a;
  PERFORM pg_temp.ok((SELECT count(*) FROM public.audit_logs) = before_count + 1
    AND EXISTS (SELECT 1 FROM public.audit_logs WHERE action = 'config_updated' AND actor_name = 'Admin A'
                AND actor_role = 'school_admin' AND details -> 'changed' ? 'tagline'),
    'changing settings writes an audit entry naming the admin');
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.school_memberships SET role = %L WHERE profile_id = public.my_profile_id(%L)', 'teacher', a)) <= 0,
    'an admin cannot change their own role');
  PERFORM pg_temp.ok(pg_temp.rows('DELETE FROM public.profiles') = -1, 'people cannot be deleted');
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.profiles SET status = %L WHERE id = public.my_profile_id(%L)', 'suspended', a)) = -1,
    'an admin cannot suspend their own account');
END $$;

-- On hosted Supabase a password-only session (aal1) cannot use admin powers.
DO $$
DECLARE
  a UUID := (SELECT id FROM ids WHERE name = 'school_a');
BEGIN
  PERFORM set_config('request.jwt.claims', (auth.jwt() || '{"aal":"aal1"}')::text, true);
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.school_config SET tagline = %L WHERE school_id = %L', 'x', a)) <= 0
    AND pg_temp.fails(format('SELECT public.invite_member(%L, %L, %L, %L)', a, 'X', 'x@test.invalid', 'teacher')),
    'an admin without a second factor (aal1) cannot change settings or add people');
  PERFORM set_config('request.jwt.claims', (auth.jwt() || '{"aal":"aal2"}')::text, true);
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.school_config SET tagline = %L WHERE school_id = %L', 'MFA ok', a)) = 1,
    'the same admin after MFA (aal2) can change settings');
END $$;

-- ---------------------------------------------------------------------------
-- Teacher in School A
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM pg_temp.act_as('teacher-a@test.invalid'); END $$;
DO $$
DECLARE
  a UUID := (SELECT id FROM ids WHERE name = 'school_a');
BEGIN
  PERFORM pg_temp.ok((SELECT count(*) FROM public.profiles) = 1, 'a teacher sees only their own profile');
  PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.audit_logs), 'a teacher cannot read the audit log');
  PERFORM pg_temp.ok(pg_temp.rows(format('UPDATE public.school_config SET tagline = %L WHERE school_id = %L', 'x', a)) <= 0,
    'a teacher cannot change school settings');
  PERFORM pg_temp.ok(pg_temp.fails(format('SELECT public.invite_member(%L, %L, %L, %L)', a, 'X', 'x@test.invalid', 'school_admin')),
    'a teacher cannot add people');
  PERFORM pg_temp.ok(pg_temp.rows('UPDATE public.profiles SET status = ''inactive''') = -1
    AND pg_temp.rows('UPDATE public.profiles SET email = ''new@test.invalid''') = -1,
    'a teacher cannot change their own status or email');
  PERFORM pg_temp.ok(pg_temp.rows('UPDATE public.profiles SET phone = ''0200000000''') = 1, 'a teacher can update their own phone');
  PERFORM pg_temp.ok((SELECT array_agg(role::text) FROM public.my_memberships()) = ARRAY['teacher'], 'my_memberships reports the teacher role');
END $$;

-- The admin suspends the teacher: access stops at once.
DO $$ BEGIN PERFORM pg_temp.act_as('admin-a@test.invalid'); END $$;
UPDATE public.school_memberships SET status = 'suspended' WHERE id = (SELECT id FROM ids WHERE name = 'teacher_membership');
DO $$ BEGIN PERFORM pg_temp.act_as('teacher-a@test.invalid'); END $$;
DO $$ BEGIN PERFORM pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.schools) AND NOT EXISTS (SELECT 1 FROM public.my_memberships()),
  'a suspended member loses access'); END $$;

-- Signed-out requests see nothing.
DO $$ BEGIN PERFORM pg_temp.act_as(NULL); END $$;
DO $$ BEGIN PERFORM pg_temp.ok(pg_temp.fails('SELECT 1 FROM public.profiles LIMIT 1') AND pg_temp.fails('SELECT 1 FROM public.school_config LIMIT 1'),
  'signed-out requests cannot read people or settings'); END $$;

-- A suspended school keeps read access but cannot change anything.
RESET ROLE;
UPDATE public.schools SET status = 'suspended' WHERE id = (SELECT id FROM ids WHERE name = 'school_b');
DO $$ BEGIN PERFORM pg_temp.act_as('admin-b@test.invalid'); END $$;
DO $$ BEGIN PERFORM pg_temp.ok(EXISTS (SELECT 1 FROM public.school_config), 'a suspended school can still read its records'); END $$;
DO $$ BEGIN PERFORM pg_temp.ok(pg_temp.rows('UPDATE public.school_config SET tagline = ''x''') <= 0, 'a suspended school cannot change settings'); END $$;

RESET ROLE;
ROLLBACK;
