-- Learning resources, student concerns ("Reports"), and the figures the redesigned dashboards show.

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'resources.manage'), ('headteacher', 'resources.manage'), ('academic_coordinator', 'resources.manage'), ('librarian', 'resources.manage'),
  ('school_admin', 'concerns.manage'), ('headteacher', 'concerns.manage')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- 1. Learning resources: files or links for the whole school or one class, optionally per subject.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.learning_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 150),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  folder TEXT CHECK (folder IS NULL OR length(folder) <= 80),
  subject_id UUID,
  class_id UUID,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'doc', 'slides', 'sheet', 'image', 'video', 'link', 'text')),
  url TEXT CHECK (url IS NULL OR (url ~ '^https?://' AND length(url) <= 500)),
  file_name TEXT,
  mime TEXT,
  size_bytes INT,
  content BYTEA,
  downloads INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'archived')),
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((url IS NULL) <> (content IS NULL)),
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX learning_resources_school ON public.learning_resources (school_id, created_at DESC);
ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_resources FROM PUBLIC, anon, authenticated;

-- Who may see a resource: staff, and students/guardians of the class it is for (or everyone, for whole-school items).
CREATE OR REPLACE FUNCTION public.can_see_resource(_school UUID, _class UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_member(_school) AND (
    _class IS NULL OR public.is_staff(_school) OR EXISTS (
      SELECT 1 FROM public.enrollments e WHERE e.class_id = _class AND e.status = 'active' AND (public.is_self_student(e.student_id) OR public.is_guardian_of(e.student_id))))
$$;

-- Who may add one: resource managers anywhere; a teacher for a class (and subject) they teach.
CREATE OR REPLACE FUNCTION public.can_add_resource(_school UUID, _class UUID, _subject UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_school, 'resources.manage') OR (_class IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teaching_assignments ta WHERE ta.school_id = _school AND ta.class_id = _class
      AND (_subject IS NULL OR ta.subject_id = _subject) AND ta.teacher_id = public.my_profile_id(_school)))
$$;

CREATE OR REPLACE FUNCTION public.resource_add(_school UUID, _title TEXT, _description TEXT, _folder TEXT, _subject UUID, _class UUID, _url TEXT, _file_name TEXT, _b64 TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE data BYTEA; chk RECORD; k TEXT; rid UUID; ext TEXT;
BEGIN
  IF NOT public.can_add_resource(_school, _class, _subject) THEN RAISE EXCEPTION 'you cannot add resources here' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_title, ''))) < 2 THEN RAISE EXCEPTION 'give the resource a title' USING ERRCODE = '22023'; END IF;
  IF (_url IS NULL OR btrim(_url) = '') = (_b64 IS NULL) THEN RAISE EXCEPTION 'add either a file or a link' USING ERRCODE = '22023'; END IF;
  IF _url IS NOT NULL AND btrim(_url) <> '' THEN
    IF btrim(_url) !~ '^https?://' THEN RAISE EXCEPTION 'a link must start with http:// or https://' USING ERRCODE = '22023'; END IF;
    k := CASE WHEN _url ~* '(youtube\.com|youtu\.be|vimeo\.com|\.mp4$)' THEN 'video' ELSE 'link' END;
    INSERT INTO public.learning_resources (school_id, title, description, folder, subject_id, class_id, kind, url, uploaded_by)
    VALUES (_school, btrim(_title), NULLIF(btrim(COALESCE(_description, '')), ''), NULLIF(btrim(COALESCE(_folder, '')), ''), _subject, _class, k, btrim(_url), public.my_profile_id(_school))
    RETURNING id INTO rid;
  ELSE
    data := public.decode_upload(_b64, 10);
    SELECT * INTO chk FROM public.check_upload(_file_name, data, ARRAY['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'png', 'jpg', 'jpeg'], 10);
    ext := lower(regexp_replace(chk.clean_name, '^.*\.', ''));
    k := CASE ext WHEN 'pdf' THEN 'pdf' WHEN 'docx' THEN 'doc' WHEN 'pptx' THEN 'slides' WHEN 'xlsx' THEN 'sheet' WHEN 'csv' THEN 'sheet' WHEN 'txt' THEN 'text' ELSE 'image' END;
    INSERT INTO public.learning_resources (school_id, title, description, folder, subject_id, class_id, kind, file_name, mime, size_bytes, content, uploaded_by)
    VALUES (_school, btrim(_title), NULLIF(btrim(COALESCE(_description, '')), ''), NULLIF(btrim(COALESCE(_folder, '')), ''), _subject, _class, k, chk.clean_name, chk.mime, length(data), data, public.my_profile_id(_school))
    RETURNING id INTO rid;
  END IF;
  PERFORM public.write_audit(_school, 'resource_added', 'learning_resource', rid, left(btrim(_title), 80), jsonb_build_object('kind', k, 'class', _class));
  -- Tell the class (or school) that something new is there.
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT _school, m.profile_id, 'resource_added', 'New learning resource', btrim(_title), '/resources'
  FROM public.school_memberships m
  WHERE m.school_id = _school AND m.status = 'active' AND m.role = 'student'
    AND (_class IS NULL OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = _class AND e.student_id = m.profile_id AND e.status = 'active'));
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.resources_list(_school UUID, _search TEXT DEFAULT NULL, _subject UUID DEFAULT NULL, _kind TEXT DEFAULT NULL, _limit INT DEFAULT 20, _offset INT DEFAULT 0)
RETURNS TABLE (id UUID, title TEXT, description TEXT, folder TEXT, subject TEXT, class TEXT, kind TEXT, url TEXT, file_name TEXT, size_bytes INT, downloads INT,
               created_at TIMESTAMPTZ, uploaded_by TEXT, can_archive BOOLEAN, total_rows BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school); mgr BOOLEAN := public.has_permission(_school, 'resources.manage');
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT r.id, r.title, r.description, r.folder, s.name, c.name, r.kind, r.url, r.file_name, r.size_bytes, r.downloads, r.created_at, p.full_name,
      mgr OR r.uploaded_by = me, count(*) OVER ()
    FROM public.learning_resources r
    LEFT JOIN public.subjects s ON s.id = r.subject_id LEFT JOIN public.classes c ON c.id = r.class_id LEFT JOIN public.profiles p ON p.id = r.uploaded_by
    WHERE r.school_id = _school AND r.status = 'published' AND public.can_see_resource(_school, r.class_id)
      AND (_subject IS NULL OR r.subject_id = _subject) AND (_kind IS NULL OR r.kind = _kind)
      AND (_search IS NULL OR r.title ILIKE '%' || _search || '%' OR r.folder ILIKE '%' || _search || '%' OR s.name ILIKE '%' || _search || '%')
    ORDER BY r.created_at DESC LIMIT least(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0);
END $$;

CREATE OR REPLACE FUNCTION public.resources_stats(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('total', count(*), 'documents', count(*) FILTER (WHERE kind IN ('pdf', 'doc', 'slides', 'sheet', 'text')),
      'media', count(*) FILTER (WHERE kind IN ('video', 'image', 'link')), 'downloads', COALESCE(sum(downloads), 0))
    FROM public.learning_resources r WHERE r.school_id = _school AND r.status = 'published' AND public.can_see_resource(_school, r.class_id));
END $$;

-- Opening a resource counts as one use. Files come back as base64; links as their address.
CREATE OR REPLACE FUNCTION public.resource_open(_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.learning_resources;
BEGIN
  SELECT * INTO r FROM public.learning_resources WHERE id = _id AND status = 'published';
  IF NOT FOUND OR NOT public.can_see_resource(r.school_id, r.class_id) THEN RAISE EXCEPTION 'resource not found' USING ERRCODE = '42501'; END IF;
  UPDATE public.learning_resources SET downloads = downloads + 1 WHERE id = r.id;
  RETURN CASE WHEN r.url IS NOT NULL THEN jsonb_build_object('url', r.url)
    ELSE jsonb_build_object('name', r.file_name, 'mime', r.mime, 'content', encode(r.content, 'base64')) END;
END $$;

CREATE OR REPLACE FUNCTION public.resource_archive(_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.learning_resources;
BEGIN
  SELECT * INTO r FROM public.learning_resources WHERE id = _id;
  IF NOT FOUND OR NOT (public.has_permission(r.school_id, 'resources.manage') OR r.uploaded_by = public.my_profile_id(r.school_id)) THEN
    RAISE EXCEPTION 'you cannot remove this resource' USING ERRCODE = '42501';
  END IF;
  UPDATE public.learning_resources SET status = 'archived' WHERE id = r.id;
  PERFORM public.write_audit(r.school_id, 'resource_archived', 'learning_resource', r.id, left(r.title, 80), '{}');
END $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Concerns ("Reports"): a student or their guardian raises a concern with the principal or a teacher.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE public.concerns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  raised_by UUID NOT NULL,
  recipient TEXT NOT NULL CHECK (recipient IN ('principal', 'teacher')),
  teacher_id UUID,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('academic', 'behaviour', 'bullying', 'attendance', 'welfare', 'facilities', 'other')),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 150),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 5 AND 3000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved')),
  response TEXT CHECK (response IS NULL OR length(response) <= 3000),
  responded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  resolved_at TIMESTAMPTZ,
  CHECK ((recipient = 'teacher') = (teacher_id IS NOT NULL)),
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX concerns_school ON public.concerns (school_id, created_at DESC);
ALTER TABLE public.concerns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concerns FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.concern_submit(_school UUID, _student UUID, _recipient TEXT, _teacher UUID, _category TEXT, _title TEXT, _body TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school); cid UUID;
BEGIN
  IF me IS NULL OR NOT (public.is_self_student(_student) OR public.is_guardian_of(_student)) THEN RAISE EXCEPTION 'you can raise concerns only for yourself or your own child' USING ERRCODE = '42501'; END IF;
  IF _recipient NOT IN ('principal', 'teacher') THEN RAISE EXCEPTION 'choose who it is for' USING ERRCODE = '22023'; END IF;
  IF _recipient = 'teacher' AND NOT EXISTS (
    SELECT 1 FROM public.teaching_assignments ta JOIN public.enrollments e ON e.class_id = ta.class_id AND e.status = 'active'
    WHERE ta.teacher_id = _teacher AND e.student_id = _student) THEN
    RAISE EXCEPTION 'choose one of the student''s own teachers' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.concerns (school_id, student_id, raised_by, recipient, teacher_id, category, title, body)
  VALUES (_school, _student, me, _recipient, CASE WHEN _recipient = 'teacher' THEN _teacher END, COALESCE(_category, 'other'), btrim(_title), btrim(_body)) RETURNING id INTO cid;
  PERFORM public.write_audit(_school, 'concern_submitted', 'concern', cid, left(btrim(_title), 80), jsonb_build_object('recipient', _recipient, 'category', _category));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT _school, x.pid, 'concern_submitted', 'A new concern was raised', btrim(_title), '/concerns'
  FROM (SELECT _teacher AS pid WHERE _recipient = 'teacher'
        UNION SELECT m.profile_id FROM public.school_memberships m WHERE _recipient = 'principal' AND m.school_id = _school AND m.status = 'active' AND m.role IN ('school_admin', 'headteacher')) x;
  RETURN cid;
END $$;

CREATE OR REPLACE FUNCTION public.can_handle_concern(_c public.concerns)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_c.school_id, 'concerns.manage') OR (_c.teacher_id IS NOT NULL AND _c.teacher_id = public.my_profile_id(_c.school_id))
$$;

CREATE OR REPLACE FUNCTION public.concerns_list(_school UUID, _status TEXT DEFAULT NULL, _search TEXT DEFAULT NULL, _limit INT DEFAULT 20, _offset INT DEFAULT 0)
RETURNS TABLE (id UUID, title TEXT, body TEXT, category TEXT, recipient TEXT, teacher TEXT, student TEXT, raised_by TEXT, status TEXT, response TEXT,
               created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ, can_handle BOOLEAN, total_rows BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school);
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT c.id, c.title, c.body, c.category, c.recipient, t.full_name, s.full_name, r.full_name, c.status, c.response, c.created_at, c.resolved_at,
      public.can_handle_concern(c), count(*) OVER ()
    FROM public.concerns c
    JOIN public.profiles s ON s.id = c.student_id JOIN public.profiles r ON r.id = c.raised_by LEFT JOIN public.profiles t ON t.id = c.teacher_id
    WHERE c.school_id = _school
      AND (public.can_handle_concern(c) OR c.raised_by = me OR public.is_self_student(c.student_id) OR public.is_guardian_of(c.student_id))
      AND (_status IS NULL OR c.status = _status)
      AND (_search IS NULL OR c.title ILIKE '%' || _search || '%' OR s.full_name ILIKE '%' || _search || '%')
    ORDER BY c.created_at DESC LIMIT least(GREATEST(_limit, 1), 100) OFFSET GREATEST(_offset, 0);
END $$;

CREATE OR REPLACE FUNCTION public.concern_respond(_id UUID, _status TEXT, _response TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.concerns;
BEGIN
  SELECT * INTO c FROM public.concerns WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_handle_concern(c) THEN RAISE EXCEPTION 'you cannot handle this concern' USING ERRCODE = '42501'; END IF;
  IF _status NOT IN ('pending', 'in_review', 'resolved') THEN RAISE EXCEPTION 'unknown status' USING ERRCODE = '22023'; END IF;
  IF _status = 'resolved' AND length(btrim(COALESCE(_response, c.response, ''))) < 5 THEN RAISE EXCEPTION 'write a short response before resolving it' USING ERRCODE = '22023'; END IF;
  UPDATE public.concerns SET status = _status, response = COALESCE(NULLIF(btrim(COALESCE(_response, '')), ''), response), responded_by = public.my_profile_id(c.school_id),
    updated_at = clock_timestamp(), resolved_at = CASE WHEN _status = 'resolved' THEN clock_timestamp() END WHERE id = c.id;
  PERFORM public.write_audit(c.school_id, 'concern_updated', 'concern', c.id, left(c.title, 80), jsonb_build_object('status', _status));
  INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
  SELECT c.school_id, x.pid, 'concern_updated', CASE WHEN _status = 'resolved' THEN 'Your concern was resolved' ELSE 'Your concern is being looked at' END, c.title, '/concerns'
  FROM (SELECT c.raised_by AS pid UNION SELECT c.student_id) x;
END $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Dashboard figures
-- ---------------------------------------------------------------------------------------------
-- Month-on-month figures for the school dashboard. Money only for people who may see fees.
CREATE OR REPLACE FUNCTION public.school_dashboard_trends(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m0 DATE := date_trunc('month', current_date)::date; m1 DATE := (date_trunc('month', current_date) - interval '1 month')::date; money_ok BOOLEAN;
BEGIN
  IF NOT public.is_staff(_school) THEN RAISE EXCEPTION 'staff only' USING ERRCODE = '42501'; END IF;
  money_ok := public.has_permission(_school, 'fees.view');
  RETURN jsonb_build_object(
    'students_now', (SELECT count(*) FROM public.school_memberships WHERE school_id = _school AND role = 'student' AND status = 'active'),
    'students_before', (SELECT count(*) FROM public.school_memberships WHERE school_id = _school AND role = 'student' AND status = 'active' AND created_at < m0),
    'staff_now', (SELECT count(*) FROM public.school_memberships WHERE school_id = _school AND role NOT IN ('student', 'parent') AND status = 'active'),
    'staff_before', (SELECT count(*) FROM public.school_memberships WHERE school_id = _school AND role NOT IN ('student', 'parent') AND status = 'active' AND created_at < m0),
    'revenue_month', CASE WHEN money_ok THEN (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE school_id = _school AND status = 'recorded' AND paid_on >= m0) END,
    'revenue_last_month', CASE WHEN money_ok THEN (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE school_id = _school AND status = 'recorded' AND paid_on >= m1 AND paid_on < m0) END,
    'revenue_total', CASE WHEN money_ok THEN (SELECT COALESCE(sum(amount), 0) FROM public.payments WHERE school_id = _school AND status = 'recorded') END,
    'outstanding', CASE WHEN money_ok THEN (SELECT COALESCE(sum(i.total - COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.invoice_id = i.id AND p.status = 'recorded'), 0)), 0)
                                            FROM public.invoices i WHERE i.school_id = _school AND i.status = 'issued') END,
    'payments_by_month', CASE WHEN money_ok THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(mm, 'Mon'), 'amount', COALESCE(t, 0)) ORDER BY mm)
        FROM (SELECT g.mm, (SELECT sum(amount) FROM public.payments p WHERE p.school_id = _school AND p.status = 'recorded' AND date_trunc('month', p.paid_on) = g.mm) t
              FROM generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') g(mm)) x), '[]') END,
    'attendance_by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(mm, 'Mon'), 'rate', rate) ORDER BY mm)
        FROM (SELECT g.mm, (SELECT round(100.0 * count(*) FILTER (WHERE r.status IN ('present', 'late', 'excused')) / NULLIF(count(*), 0), 1)
                            FROM public.attendance_records r JOIN public.attendance_sessions s ON s.id = r.session_id
                            WHERE s.school_id = _school AND date_trunc('month', s.session_date) = g.mm) rate
              FROM generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), interval '1 month') g(mm)) x), '[]')
  );
END $$;

-- How much of each class is staffed and assessed: subjects with a teacher out of all subjects, and published assessments.
CREATE OR REPLACE FUNCTION public.class_coverage(_school UUID)
RETURNS TABLE (class_id UUID, class_name TEXT, subjects_covered BIGINT, subjects_total BIGINT, assessments_published BIGINT, assessments_total BIGINT, students BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(_school) THEN RAISE EXCEPTION 'staff only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT c.id, c.name,
      (SELECT count(DISTINCT ta.subject_id) FROM public.teaching_assignments ta WHERE ta.class_id = c.id),
      (SELECT count(*) FROM public.subjects s WHERE s.school_id = _school),
      (SELECT count(*) FROM public.assessments a WHERE a.class_id = c.id AND a.status = 'published'),
      (SELECT count(*) FROM public.assessments a WHERE a.class_id = c.id),
      (SELECT count(*) FROM public.enrollments e WHERE e.class_id = c.id AND e.status = 'active')
    FROM public.classes c WHERE c.school_id = _school ORDER BY c.name;
END $$;

-- The signed-in person's own recent actions (for "Recent Activity" on the teacher dashboard).
CREATE OR REPLACE FUNCTION public.my_recent_activity(_school UUID, _limit INT DEFAULT 6)
RETURNS TABLE (id UUID, at TIMESTAMPTZ, action TEXT, target TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT l.id, l.created_at, l.action::text, l.target_name FROM public.audit_logs l
    WHERE l.school_id = _school AND l.actor_id = public.my_profile_id(_school) AND l.action::text NOT IN ('login', 'logout')
    ORDER BY l.created_at DESC LIMIT least(GREATEST(_limit, 1), 20);
END $$;

-- A student's school details and guardians, for the student profile page (the student, their guardians and staff).
CREATE OR REPLACE FUNCTION public.student_profile_extras(_school UUID, _student UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cls RECORD;
BEGIN
  IF NOT (public.is_self_student(_student) OR public.is_guardian_of(_student) OR public.is_staff(_school)) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  SELECT c.id, c.name, (SELECT full_name FROM public.profiles WHERE id = c.form_teacher_id) AS teacher, e.enrolled_on INTO cls
  FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id WHERE e.student_id = _student AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1;
  RETURN jsonb_build_object(
    'class', cls.name, 'class_teacher', cls.teacher,
    'admitted_on', (SELECT min(enrolled_on) FROM public.enrollments WHERE student_id = _student),
    'subjects', COALESCE((SELECT jsonb_agg(DISTINCT s.name) FROM public.teaching_assignments ta JOIN public.subjects s ON s.id = ta.subject_id WHERE ta.class_id = cls.id), '[]'),
    'teachers', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('id', p.id, 'name', p.full_name)) FROM public.teaching_assignments ta JOIN public.profiles p ON p.id = ta.teacher_id WHERE ta.class_id = cls.id), '[]'),
    'guardians', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', p.full_name, 'relationship', g.relationship, 'email', p.email, 'phone', p.phone))
                           FROM public.guardian_links g JOIN public.profiles p ON p.id = g.guardian_id WHERE g.student_id = _student AND g.status = 'verified'), '[]'));
END $$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY['can_see_resource(UUID, UUID)', 'can_add_resource(UUID, UUID, UUID)',
    'resource_add(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, TEXT, TEXT)', 'resources_list(UUID, TEXT, UUID, TEXT, INT, INT)', 'resources_stats(UUID)',
    'resource_open(UUID)', 'resource_archive(UUID)', 'concern_submit(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT)', 'concerns_list(UUID, TEXT, TEXT, INT, INT)',
    'concern_respond(UUID, TEXT, TEXT)', 'school_dashboard_trends(UUID)', 'class_coverage(UUID)', 'my_recent_activity(UUID, INT)', 'student_profile_extras(UUID, UUID)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
  REVOKE EXECUTE ON FUNCTION public.can_handle_concern(public.concerns) FROM PUBLIC, anon;
END $$;
