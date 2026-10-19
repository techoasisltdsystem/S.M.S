-- Phase 2: the shared school records every dashboard reads.
--
-- Academic structure (years, terms, classes, subjects, teaching assignments,
-- timetable), enrolments, verified guardian links, attendance, assessments
-- and marks with a draft -> submitted -> approved -> published workflow,
-- school events and announcements, plus the platform (Super Admin) console
-- functions. Every row carries school_id and is protected by RLS that checks
-- the caller's role AND their relationship to the record: teachers only reach
-- classes they teach, students only themselves, parents only children whose
-- link the school has verified.

-- ---------------------------------------------------------------------------
-- Types and audit actions
-- ---------------------------------------------------------------------------
CREATE TYPE public.enrollment_status AS ENUM ('active', 'transferred', 'withdrawn', 'completed');
CREATE TYPE public.guardian_link_status AS ENUM ('pending', 'verified', 'revoked');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
CREATE TYPE public.assessment_kind AS ENUM ('classwork', 'homework', 'quiz', 'test', 'exam');
CREATE TYPE public.assessment_status AS ENUM ('draft', 'submitted', 'approved', 'published');
CREATE TYPE public.event_category AS ENUM ('academic', 'exam', 'sports', 'holiday', 'meeting', 'other');
CREATE TYPE public.audience AS ENUM ('everyone', 'staff', 'students', 'parents');

ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'student_enrolled';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'enrollment_changed';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'guardian_linked';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'attendance_corrected';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'results_submitted';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'results_approved';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'results_published';
ALTER TYPE public.audit_action ADD VALUE IF NOT EXISTS 'results_reopened';

ALTER TABLE public.profiles ADD COLUMN gender TEXT CHECK (gender IN ('female', 'male'));

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'academics.manage'),
  ('school_admin', 'communications.manage'),
  ('school_admin', 'attendance.view'),
  ('school_admin', 'grades.view'),
  ('auditor', 'attendance.view'),
  ('auditor', 'grades.view')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------------
CREATE TABLE public.academic_years (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL CHECK (ends_on > starts_on),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  UNIQUE (school_id, id)
);
CREATE UNIQUE INDEX academic_years_one_current ON public.academic_years (school_id) WHERE is_current;

CREATE TABLE public.terms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  academic_year_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL CHECK (ends_on > starts_on),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES public.academic_years (school_id, id) ON DELETE RESTRICT,
  UNIQUE (academic_year_id, name),
  UNIQUE (school_id, id)
);
CREATE UNIQUE INDEX terms_one_current ON public.terms (school_id) WHERE is_current;

CREATE TABLE public.subjects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name),
  UNIQUE (school_id, id)
);

CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  academic_year_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  level TEXT,
  room TEXT,
  form_teacher_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, academic_year_id) REFERENCES public.academic_years (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, form_teacher_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (academic_year_id, name),
  UNIQUE (school_id, id)
);

CREATE TABLE public.teaching_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, teacher_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (class_id, subject_id, teacher_id)
);

CREATE TABLE public.timetable_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  teacher_id UUID,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: 1 = Monday
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL CHECK (ends_at > starts_at),
  room TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE CASCADE,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, teacher_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);

-- Enrolment history is kept: a transfer ends one row and starts another.
CREATE TABLE public.enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  class_id UUID NOT NULL,
  student_id UUID NOT NULL,
  status enrollment_status NOT NULL DEFAULT 'active',
  enrolled_on DATE NOT NULL DEFAULT current_date,
  ended_on DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (class_id, student_id)
);
CREATE INDEX idx_enrollments_student ON public.enrollments (student_id);

CREATE TABLE public.guardian_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  guardian_id UUID NOT NULL,
  student_id UUID NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'guardian',
  status guardian_link_status NOT NULL DEFAULT 'pending',
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, guardian_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (guardian_id, student_id),
  CHECK (guardian_id <> student_id)
);

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
CREATE TABLE public.attendance_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  class_id UUID NOT NULL,
  session_date DATE NOT NULL,
  period TEXT NOT NULL DEFAULT 'day',
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  UNIQUE (class_id, session_date, period),
  UNIQUE (school_id, id)
);

CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  status attendance_status NOT NULL,
  note TEXT,
  recorded_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, session_id) REFERENCES public.attendance_sessions (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (session_id, student_id)
);
CREATE INDEX idx_attendance_records_student ON public.attendance_records (student_id);

-- ---------------------------------------------------------------------------
-- Assessments and marks
-- ---------------------------------------------------------------------------
CREATE TABLE public.assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  term_id UUID,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  kind assessment_kind NOT NULL DEFAULT 'test',
  max_score NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_score > 0),
  due_on DATE,
  status assessment_status NOT NULL DEFAULT 'draft',
  created_by UUID,
  submitted_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, term_id) REFERENCES public.terms (school_id, id) ON DELETE RESTRICT,
  UNIQUE (school_id, id)
);
CREATE INDEX idx_assessments_class ON public.assessments (class_id);

CREATE TABLE public.marks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  assessment_id UUID NOT NULL,
  student_id UUID NOT NULL,
  score NUMERIC(6,2) CHECK (score >= 0),
  comment TEXT,
  entered_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, assessment_id) REFERENCES public.assessments (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (assessment_id, student_id)
);
CREATE INDEX idx_marks_student ON public.marks (student_id);

-- ---------------------------------------------------------------------------
-- Calendar and communication
-- ---------------------------------------------------------------------------
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  category event_category NOT NULL DEFAULT 'academic',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  location TEXT,
  audience audience NOT NULL DEFAULT 'everyone',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX idx_events_school_start ON public.events (school_id, starts_at);

CREATE TABLE public.announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  class_id UUID,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  body TEXT NOT NULL DEFAULT '',
  audience audience NOT NULL DEFAULT 'everyone',
  created_by UUID,
  author_name TEXT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_announcements_school ON public.announcements (school_id, published_at DESC);

-- ---------------------------------------------------------------------------
-- Relationship helpers (SECURITY DEFINER; each answers only about the caller)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role_in(_school UUID, _role member_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.my_roles(_school) r WHERE r = _role)
$$;

-- School office roles that work with every student record in the school.
CREATE OR REPLACE FUNCTION public.sees_all_students(_school UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_school, 'students.view')
     AND EXISTS (SELECT 1 FROM public.my_roles(_school) r
                 WHERE r IN ('school_admin', 'finance_officer', 'auditor'))
$$;

-- Staff are every role except students and parents.
CREATE OR REPLACE FUNCTION public.is_staff(_school UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.my_roles(_school) r WHERE r NOT IN ('student', 'parent'))
$$;

-- Caller teaches the class (any subject) or is its form teacher.
CREATE OR REPLACE FUNCTION public.teaches_class(_class UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes c
    WHERE c.id = _class
      AND public.has_role_in(c.school_id, 'teacher')
      AND (c.form_teacher_id = public.my_profile_id(c.school_id)
           OR EXISTS (SELECT 1 FROM public.teaching_assignments t
                      WHERE t.class_id = c.id AND t.teacher_id = public.my_profile_id(c.school_id)))
  )
$$;

CREATE OR REPLACE FUNCTION public.teaches_subject(_class UUID, _subject UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teaching_assignments t
    WHERE t.class_id = _class AND t.subject_id = _subject
      AND public.has_role_in(t.school_id, 'teacher')
      AND t.teacher_id = public.my_profile_id(t.school_id)
  )
$$;

-- Caller is this student (with an active student role).
CREATE OR REPLACE FUNCTION public.is_self_student(_student UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _student AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL
      AND public.has_role_in(p.school_id, 'student')
  )
$$;

-- Caller is a guardian of this student whose link the school has verified.
CREATE OR REPLACE FUNCTION public.is_guardian_of(_student UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.guardian_links g
    JOIN public.profiles p ON p.id = g.guardian_id
    WHERE g.student_id = _student AND g.status = 'verified'
      AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL
      AND public.has_role_in(g.school_id, 'parent')
  )
$$;

-- Caller teaches a class this student is actively enrolled in.
CREATE OR REPLACE FUNCTION public.teaches_student(_student UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = _student AND e.status = 'active' AND public.teaches_class(e.class_id)
  )
$$;

-- Caller is enrolled in the class, or a verified guardian of someone who is.
CREATE OR REPLACE FUNCTION public.belongs_to_class(_class UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.class_id = _class AND e.status = 'active'
      AND (public.is_self_student(e.student_id) OR public.is_guardian_of(e.student_id))
  )
$$;

-- The one place that says who may see a student's records.
CREATE OR REPLACE FUNCTION public.can_see_student(_student UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_self_student(_student)
      OR public.is_guardian_of(_student)
      OR public.teaches_student(_student)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _student AND public.sees_all_students(p.school_id))
$$;

-- Whether the caller is in an audience. Staff see everything addressed to anyone.
CREATE OR REPLACE FUNCTION public.in_audience(_school UUID, _audience audience)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE _audience
    WHEN 'everyone' THEN public.is_member(_school)
    WHEN 'staff' THEN public.is_staff(_school)
    WHEN 'students' THEN public.is_staff(_school) OR public.has_role_in(_school, 'student')
    WHEN 'parents' THEN public.is_staff(_school) OR public.has_role_in(_school, 'parent')
  END
$$;

-- Teacher of this subject in this class, or a school administrator.
CREATE OR REPLACE FUNCTION public.can_enter_marks(_assessment UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = _assessment
      AND public.has_permission(a.school_id, 'grades.enter')
      AND public.teaches_subject(a.class_id, a.subject_id)
  )
$$;

-- Platform super admins. On hosted Supabase they must have passed the second
-- sign-in factor (laptop tokens carry no aal claim).
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
     AND COALESCE(auth.jwt() ->> 'aal', '') <> 'aal1'
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Attendance may only be recorded for students enrolled in the class on that
-- date. Changing a past day's status is logged as a correction.
CREATE OR REPLACE FUNCTION public.check_attendance_record()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sess public.attendance_sessions;
BEGIN
  SELECT * INTO sess FROM public.attendance_sessions WHERE id = NEW.session_id;
  IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = sess.class_id AND e.student_id = NEW.student_id
                 AND e.enrolled_on <= sess.session_date AND (e.ended_on IS NULL OR e.ended_on >= sess.session_date)) THEN
    RAISE EXCEPTION 'this student is not enrolled in the class on that date' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.student_id <> OLD.student_id OR NEW.session_id <> OLD.session_id THEN
      RAISE EXCEPTION 'student and session cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND sess.session_date < current_date THEN
      PERFORM public.write_audit(NEW.school_id, 'attendance_corrected', 'attendance', NEW.student_id,
        (SELECT full_name FROM public.profiles WHERE id = NEW.student_id),
        jsonb_build_object('date', sess.session_date, 'old_status', OLD.status, 'new_status', NEW.status, 'note', NEW.note));
    END IF;
  END IF;
  NEW.recorded_by := COALESCE(public.my_profile_id(NEW.school_id), NEW.recorded_by);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.check_mark()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = NEW.assessment_id;
  IF a.school_id <> NEW.school_id THEN
    RAISE EXCEPTION 'assessment belongs to another school' USING ERRCODE = '42501';
  END IF;
  IF a.status <> 'draft' THEN
    RAISE EXCEPTION 'marks can only be changed while the assessment is a draft; ask an approver to reopen it' USING ERRCODE = '42501';
  END IF;
  IF NEW.score IS NOT NULL AND NEW.score > a.max_score THEN
    RAISE EXCEPTION 'score % is above the maximum of %', NEW.score, a.max_score USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = a.class_id AND e.student_id = NEW.student_id) THEN
    RAISE EXCEPTION 'this student is not in the class' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.student_id <> OLD.student_id OR NEW.assessment_id <> OLD.assessment_id) THEN
    RAISE EXCEPTION 'student and assessment cannot be changed' USING ERRCODE = '42501';
  END IF;
  NEW.entered_by := COALESCE(public.my_profile_id(NEW.school_id), NEW.entered_by);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Assessment status changes only through the workflow functions below.
CREATE OR REPLACE FUNCTION public.guard_assessment()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'draft';
      NEW.submitted_at := NULL; NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.published_at := NULL;
      NEW.created_by := public.my_profile_id(NEW.school_id);
      RETURN NEW;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.published_at IS DISTINCT FROM OLD.published_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.class_id <> OLD.class_id OR NEW.subject_id <> OLD.subject_id OR NEW.school_id <> OLD.school_id THEN
      RAISE EXCEPTION 'use submit, approve, publish or reopen to change an assessment''s status' USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'only a draft assessment can be edited' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Authors of events and announcements come from the session, not the browser.
-- Not SECURITY DEFINER: it must see the caller's role in current_user.
CREATE OR REPLACE FUNCTION public.stamp_author()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.school_id <> OLD.school_id THEN
        RAISE EXCEPTION 'school_id cannot be changed' USING ERRCODE = '42501';
      END IF;
      NEW.created_by := OLD.created_by;
    ELSE
      NEW.created_by := public.my_profile_id(NEW.school_id);
    END IF;
    IF TG_TABLE_NAME = 'announcements' THEN
      NEW.author_name := (SELECT full_name FROM public.profiles WHERE id = public.my_profile_id(NEW.school_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER check_attendance_record BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.check_attendance_record();
CREATE TRIGGER check_mark BEFORE INSERT OR UPDATE ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.check_mark();
CREATE TRIGGER guard_assessment BEFORE INSERT OR UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.guard_assessment();
CREATE TRIGGER stamp_event_author BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.stamp_author();
CREATE TRIGGER stamp_announcement_author BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.stamp_author();
CREATE TRIGGER guard_years_tenant BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_terms_tenant BEFORE UPDATE ON public.terms
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_subjects_tenant BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_classes_tenant BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_assignments_tenant BEFORE UPDATE ON public.teaching_assignments
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_timetable_tenant BEFORE UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();
CREATE TRIGGER guard_marks_tenant BEFORE UPDATE ON public.marks
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_columns();

-- School status changes carry the platform admin's reason into the audit log.
CREATE OR REPLACE FUNCTION public.audit_schools()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(NEW.id, 'school_created', 'school', NEW.id, NEW.name, '{}');
  ELSE
    PERFORM public.write_audit(NEW.id, 'school_updated', 'school', NEW.id, NEW.name,
      jsonb_strip_nulls(jsonb_build_object(
        'changed', public.changed_columns(to_jsonb(OLD), to_jsonb(NEW)),
        'old_status', OLD.status, 'new_status', NEW.status,
        'reason', NULLIF(current_setting('tosms.reason', true), ''))));
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- Direct writes are allowed only where a single row is the whole action
-- (setting up classes, a teacher's draft marks, posting a notice). Actions
-- that touch several rows or move a record through a workflow go through the
-- functions further down.
-- ---------------------------------------------------------------------------
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teaching_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Academic structure: every member of the school can read it; administrators
-- with academics.manage set it up.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years', 'terms', 'subjects', 'classes', 'teaching_assignments', 'timetable_slots'] LOOP
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated USING (public.is_member(school_id))', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.has_permission(school_id, ''academics.manage''))', t);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.has_permission(school_id, ''academics.manage'')) WITH CHECK (public.has_permission(school_id, ''academics.manage''))', t);
  END LOOP;
END $$;
-- Removing a timetable slot or teaching assignment is routine; nothing else is deleted.
CREATE POLICY timetable_slots_delete ON public.timetable_slots FOR DELETE TO authenticated
  USING (public.has_permission(school_id, 'academics.manage'));
CREATE POLICY teaching_assignments_delete ON public.teaching_assignments FOR DELETE TO authenticated
  USING (public.has_permission(school_id, 'academics.manage'));

-- Profiles: also visible to the people who work with that student
-- (their teachers, verified guardians, the school office).
CREATE POLICY profiles_select_related ON public.profiles FOR SELECT TO authenticated
  USING (public.can_see_student(id));

CREATE POLICY enrollments_select ON public.enrollments FOR SELECT TO authenticated
  USING (public.sees_all_students(school_id) OR public.teaches_class(class_id)
         OR public.is_self_student(student_id) OR public.is_guardian_of(student_id));

CREATE POLICY guardian_links_select ON public.guardian_links FOR SELECT TO authenticated
  USING (public.sees_all_students(school_id)
         OR guardian_id = public.my_profile_id(school_id)
         OR (status = 'verified' AND public.is_self_student(student_id)));

CREATE POLICY attendance_sessions_select ON public.attendance_sessions FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'attendance.view') OR public.teaches_class(class_id)
         OR public.belongs_to_class(class_id));

CREATE POLICY attendance_records_select ON public.attendance_records FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'attendance.view')
         OR public.is_self_student(student_id) OR public.is_guardian_of(student_id)
         OR EXISTS (SELECT 1 FROM public.attendance_sessions s
                    WHERE s.id = session_id AND public.teaches_class(s.class_id)));

-- Assessments: staff who grade or oversee them see drafts; students and
-- parents only see published ones for their class.
CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'grades.view') OR public.teaches_class(class_id)
         OR (status = 'published' AND public.belongs_to_class(class_id)));
CREATE POLICY assessments_insert ON public.assessments FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(school_id, 'grades.enter') AND public.teaches_subject(class_id, subject_id));
CREATE POLICY assessments_update ON public.assessments FOR UPDATE TO authenticated
  USING (public.has_permission(school_id, 'grades.enter') AND public.teaches_subject(class_id, subject_id))
  WITH CHECK (public.has_permission(school_id, 'grades.enter') AND public.teaches_subject(class_id, subject_id));

CREATE POLICY marks_select ON public.marks FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'grades.view')
         OR public.can_enter_marks(assessment_id)
         OR ((public.is_self_student(student_id) OR public.is_guardian_of(student_id))
             AND EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND a.status = 'published')));
CREATE POLICY marks_insert ON public.marks FOR INSERT TO authenticated
  WITH CHECK (public.can_enter_marks(assessment_id));
CREATE POLICY marks_update ON public.marks FOR UPDATE TO authenticated
  USING (public.can_enter_marks(assessment_id)) WITH CHECK (public.can_enter_marks(assessment_id));

CREATE POLICY events_select ON public.events FOR SELECT TO authenticated
  USING (public.in_audience(school_id, audience));
CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(school_id, 'communications.manage'));
CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (public.has_permission(school_id, 'communications.manage'))
  WITH CHECK (public.has_permission(school_id, 'communications.manage'));

-- Announcements: the office posts to anyone; a teacher posts to a class they teach.
CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated
  USING (public.in_audience(school_id, audience)
         AND (class_id IS NULL OR public.has_permission(school_id, 'communications.manage')
              OR public.teaches_class(class_id) OR public.belongs_to_class(class_id)));
CREATE POLICY announcements_insert ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(school_id, 'communications.manage')
              OR (class_id IS NOT NULL AND public.teaches_class(class_id)
                  AND public.has_permission(school_id, 'attendance.record')));
CREATE POLICY announcements_update ON public.announcements FOR UPDATE TO authenticated
  USING (public.has_permission(school_id, 'communications.manage') OR created_by = public.my_profile_id(school_id))
  WITH CHECK (public.has_permission(school_id, 'communications.manage')
              OR (created_by = public.my_profile_id(school_id) AND class_id IS NOT NULL AND public.teaches_class(class_id)));

-- Platform super admins can read the school-level audit trail they create.
CREATE POLICY audit_logs_select_platform ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_platform_admin() AND target_type = 'school');

-- ---------------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------------

-- Enrols a student in a class. A student already active in another class of
-- the same academic year is transferred, which needs students.transfer.
CREATE OR REPLACE FUNCTION public.enroll_student(_class UUID, _student UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.classes;
  cur public.enrollments;
  res public.enrollments;
  who TEXT;
BEGIN
  SELECT * INTO c FROM public.classes WHERE id = _class;
  IF NOT FOUND OR NOT public.has_permission(c.school_id, 'students.create') THEN
    RAISE EXCEPTION 'you cannot enrol students in this class' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.school_id = c.school_id
                 AND m.profile_id = _student AND m.role = 'student' AND m.status <> 'suspended') THEN
    RAISE EXCEPTION 'this person is not a student of the school' USING ERRCODE = '22023';
  END IF;
  SELECT full_name INTO who FROM public.profiles WHERE id = _student;

  SELECT e.* INTO cur FROM public.enrollments e JOIN public.classes k ON k.id = e.class_id
   WHERE e.student_id = _student AND e.status = 'active' AND k.academic_year_id = c.academic_year_id
   FOR UPDATE OF e;
  IF FOUND AND cur.class_id = _class THEN
    RETURN cur.id;
  ELSIF FOUND THEN
    IF NOT public.has_permission(c.school_id, 'students.transfer') THEN
      RAISE EXCEPTION 'this student is already in another class; transferring needs the transfer permission' USING ERRCODE = '42501';
    END IF;
    UPDATE public.enrollments SET status = 'transferred', ended_on = current_date WHERE id = cur.id;
  END IF;

  INSERT INTO public.enrollments (school_id, class_id, student_id, status, enrolled_on, created_by)
  VALUES (c.school_id, _class, _student, 'active', current_date, public.my_profile_id(c.school_id))
  ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active', ended_on = NULL, enrolled_on = current_date
  RETURNING * INTO res;

  PERFORM public.write_audit(c.school_id,
    (CASE WHEN cur.id IS NULL THEN 'student_enrolled' ELSE 'enrollment_changed' END)::audit_action,
    'student', _student, who,
    jsonb_strip_nulls(jsonb_build_object('class', c.name, 'from_class', (SELECT name FROM public.classes WHERE id = cur.class_id))));
  RETURN res.id;
END $$;

-- Ends an active enrolment (withdrawn or completed).
CREATE OR REPLACE FUNCTION public.end_enrollment(_enrollment UUID, _status enrollment_status)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.enrollments;
BEGIN
  SELECT * INTO e FROM public.enrollments WHERE id = _enrollment FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(e.school_id, 'students.transfer') THEN
    RAISE EXCEPTION 'you cannot change this enrolment' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('withdrawn', 'completed') OR e.status <> 'active' THEN
    RAISE EXCEPTION 'only an active enrolment can be marked withdrawn or completed' USING ERRCODE = '22023';
  END IF;
  UPDATE public.enrollments SET status = _status, ended_on = current_date WHERE id = e.id;
  PERFORM public.write_audit(e.school_id, 'enrollment_changed', 'student', e.student_id,
    (SELECT full_name FROM public.profiles WHERE id = e.student_id),
    jsonb_build_object('class', (SELECT name FROM public.classes WHERE id = e.class_id), 'new_status', _status));
END $$;

-- Links a parent account to a student. The link starts pending; the school
-- verifies it (after checking identity) before the parent sees anything.
CREATE OR REPLACE FUNCTION public.link_guardian(_student UUID, _guardian UUID, _relationship TEXT DEFAULT 'guardian')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sid UUID := (SELECT school_id FROM public.profiles WHERE id = _student);
  res UUID;
BEGIN
  IF sid IS NULL OR NOT public.has_permission(sid, 'students.update') THEN
    RAISE EXCEPTION 'you cannot link guardians for this student' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships WHERE school_id = sid AND profile_id = _student AND role = 'student') THEN
    RAISE EXCEPTION 'this person is not a student of the school' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships WHERE school_id = sid AND profile_id = _guardian AND role = 'parent') THEN
    RAISE EXCEPTION 'add the guardian to the school as a parent first' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.guardian_links (school_id, guardian_id, student_id, relationship, status)
  VALUES (sid, _guardian, _student, COALESCE(NULLIF(btrim(_relationship), ''), 'guardian'), 'pending')
  ON CONFLICT (guardian_id, student_id) DO UPDATE
    SET relationship = EXCLUDED.relationship,
        status = CASE WHEN guardian_links.status = 'revoked' THEN 'pending'::guardian_link_status ELSE guardian_links.status END
  RETURNING id INTO res;
  RETURN res;
END $$;

CREATE OR REPLACE FUNCTION public.set_guardian_link_status(_link UUID, _status guardian_link_status)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g public.guardian_links;
BEGIN
  SELECT * INTO g FROM public.guardian_links WHERE id = _link FOR UPDATE;
  IF NOT FOUND OR NOT public.has_permission(g.school_id, 'students.update') THEN
    RAISE EXCEPTION 'you cannot change this guardian link' USING ERRCODE = '42501';
  END IF;
  IF _status = 'pending' THEN
    RAISE EXCEPTION 'a link can be verified or revoked' USING ERRCODE = '22023';
  END IF;
  UPDATE public.guardian_links
     SET status = _status,
         verified_by = CASE WHEN _status = 'verified' THEN public.my_profile_id(g.school_id) END,
         verified_at = CASE WHEN _status = 'verified' THEN now() END
   WHERE id = g.id;
  PERFORM public.write_audit(g.school_id, 'guardian_linked', 'student', g.student_id,
    (SELECT full_name FROM public.profiles WHERE id = g.student_id),
    jsonb_build_object('guardian', (SELECT full_name FROM public.profiles WHERE id = g.guardian_id),
                       'relationship', g.relationship, 'status', _status));
END $$;

-- Saves a class register for one day: [{student_id, status, note}, ...].
-- Teachers of the class and administrators record today's register; earlier
-- days are corrections and need attendance.correct. Future days are refused.
CREATE OR REPLACE FUNCTION public.save_attendance(_class UUID, _date DATE, _records JSONB, _period TEXT DEFAULT 'day')
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.classes;
  sess UUID;
  r JSONB;
BEGIN
  SELECT * INTO c FROM public.classes WHERE id = _class;
  IF NOT FOUND OR NOT public.has_permission(c.school_id, 'attendance.record')
     OR NOT (public.teaches_class(_class) OR public.has_role_in(c.school_id, 'school_admin')) THEN
    RAISE EXCEPTION 'you cannot take attendance for this class' USING ERRCODE = '42501';
  END IF;
  IF _date > current_date THEN
    RAISE EXCEPTION 'attendance cannot be recorded for a future date' USING ERRCODE = '22023';
  END IF;
  IF _date < current_date AND NOT public.has_permission(c.school_id, 'attendance.correct') THEN
    RAISE EXCEPTION 'past attendance can only be corrected by an authorised administrator' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_records) <> 'array' THEN
    RAISE EXCEPTION 'records must be a list' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.attendance_sessions (school_id, class_id, session_date, period, recorded_by)
  VALUES (c.school_id, _class, _date, COALESCE(NULLIF(btrim(_period), ''), 'day'), public.my_profile_id(c.school_id))
  ON CONFLICT (class_id, session_date, period) DO UPDATE SET recorded_by = EXCLUDED.recorded_by
  RETURNING id INTO sess;

  FOR r IN SELECT * FROM jsonb_array_elements(_records) LOOP
    INSERT INTO public.attendance_records (school_id, session_id, student_id, status, note)
    VALUES (c.school_id, sess, (r ->> 'student_id')::uuid, (r ->> 'status')::attendance_status, NULLIF(r ->> 'note', ''))
    ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note
      WHERE attendance_records.status IS DISTINCT FROM EXCLUDED.status OR attendance_records.note IS DISTINCT FROM EXCLUDED.note;
  END LOOP;
  RETURN sess;
END $$;

-- Results workflow: draft -> submitted (teacher) -> approved -> published.
-- Students and parents see marks only once published.
CREATE OR REPLACE FUNCTION public.move_assessment(_assessment UUID, _to assessment_status, _reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.assessments;
  label TEXT;
BEGIN
  SELECT * INTO a FROM public.assessments WHERE id = _assessment FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE = '42501'; END IF;
  label := a.title || ' (' || (SELECT name FROM public.classes WHERE id = a.class_id) || ', '
           || (SELECT name FROM public.subjects WHERE id = a.subject_id) || ')';

  IF _to = 'submitted' THEN
    IF NOT public.can_enter_marks(a.id) THEN
      RAISE EXCEPTION 'only the subject teacher can submit these results' USING ERRCODE = '42501';
    END IF;
    IF a.status <> 'draft' THEN RAISE EXCEPTION 'only a draft can be submitted' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.marks m WHERE m.assessment_id = a.id AND m.score IS NOT NULL) THEN
      RAISE EXCEPTION 'enter at least one mark before submitting' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assessments SET status = 'submitted', submitted_at = now() WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_submitted', 'assessment', a.id, label, '{}');
  ELSIF _to = 'approved' THEN
    IF NOT public.has_permission(a.school_id, 'grades.approve') THEN
      RAISE EXCEPTION 'you cannot approve results' USING ERRCODE = '42501';
    END IF;
    IF a.status <> 'submitted' THEN RAISE EXCEPTION 'only submitted results can be approved' USING ERRCODE = '22023'; END IF;
    UPDATE public.assessments SET status = 'approved', approved_by = public.my_profile_id(a.school_id), approved_at = now() WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_approved', 'assessment', a.id, label, '{}');
  ELSIF _to = 'published' THEN
    IF NOT public.has_permission(a.school_id, 'grades.publish') THEN
      RAISE EXCEPTION 'you cannot publish results' USING ERRCODE = '42501';
    END IF;
    IF a.status <> 'approved' THEN RAISE EXCEPTION 'results must be approved before publishing' USING ERRCODE = '22023'; END IF;
    UPDATE public.assessments SET status = 'published', published_at = now() WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_published', 'assessment', a.id, label, '{}');
  ELSIF _to = 'draft' THEN
    IF NOT public.has_permission(a.school_id, 'grades.reopen') THEN
      RAISE EXCEPTION 'you cannot reopen results' USING ERRCODE = '42501';
    END IF;
    IF a.status = 'draft' THEN RAISE EXCEPTION 'these results are already a draft' USING ERRCODE = '22023'; END IF;
    IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'give a reason for reopening' USING ERRCODE = '22023';
    END IF;
    UPDATE public.assessments
       SET status = 'draft', submitted_at = NULL, approved_by = NULL, approved_at = NULL, published_at = NULL
     WHERE id = a.id;
    PERFORM public.write_audit(a.school_id, 'results_reopened', 'assessment', a.id, label,
      jsonb_build_object('reason', btrim(_reason), 'was', a.status));
  END IF;
END $$;

-- Names and roles of people in the school. Staff see everyone; students and
-- parents see staff, themselves and their verified children.
CREATE OR REPLACE FUNCTION public.school_directory(_school UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, gender TEXT, roles member_role[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, p.gender, array_agg(m.role ORDER BY m.role)
  FROM public.profiles p
  JOIN public.school_memberships m ON m.profile_id = p.id AND m.school_id = p.school_id AND m.status = 'active'
  WHERE p.school_id = _school AND p.status = 'active' AND public.is_member(_school)
  GROUP BY p.id
  HAVING public.is_staff(_school)
      OR bool_or(m.role NOT IN ('student', 'parent'))
      OR p.user_id = auth.uid()
      OR public.is_guardian_of(p.id)
  ORDER BY p.full_name
$$;

-- Figures for the school dashboard, counted in the database.
CREATE OR REPLACE FUNCTION public.school_overview(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yr UUID := (SELECT id FROM public.academic_years WHERE school_id = _school AND is_current);
BEGIN
  IF NOT public.sees_all_students(_school) THEN
    RAISE EXCEPTION 'you cannot view this school''s figures' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'people', (SELECT COALESCE(jsonb_object_agg(role, n), '{}') FROM (
        SELECT m.role, count(DISTINCT m.profile_id) AS n FROM public.school_memberships m
        WHERE m.school_id = _school AND m.status = 'active' GROUP BY m.role) x),
    'invited', (SELECT count(*) FROM public.school_memberships WHERE school_id = _school AND status = 'invited'),
    'students_by_gender', (SELECT COALESCE(jsonb_object_agg(g, n), '{}') FROM (
        SELECT COALESCE(p.gender, 'unknown') AS g, count(DISTINCT p.id) AS n
        FROM public.school_memberships m JOIN public.profiles p ON p.id = m.profile_id
        WHERE m.school_id = _school AND m.role = 'student' AND m.status = 'active' GROUP BY 1) x),
    'current_year', (SELECT name FROM public.academic_years WHERE id = yr),
    'current_term', (SELECT name FROM public.terms WHERE school_id = _school AND is_current),
    'classes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name,
                   'female', (SELECT count(*) FROM public.enrollments e JOIN public.profiles p ON p.id = e.student_id
                              WHERE e.class_id = c.id AND e.status = 'active' AND p.gender = 'female'),
                   'male', (SELECT count(*) FROM public.enrollments e JOIN public.profiles p ON p.id = e.student_id
                            WHERE e.class_id = c.id AND e.status = 'active' AND p.gender = 'male'),
                   'total', (SELECT count(*) FROM public.enrollments e WHERE e.class_id = c.id AND e.status = 'active'))
                 ORDER BY c.name), '[]')
                FROM public.classes c WHERE c.school_id = _school AND c.academic_year_id = yr),
    'attendance_today', (SELECT jsonb_build_object(
        'present', count(*) FILTER (WHERE r.status = 'present'),
        'late', count(*) FILTER (WHERE r.status = 'late'),
        'absent', count(*) FILTER (WHERE r.status = 'absent'),
        'excused', count(*) FILTER (WHERE r.status = 'excused'),
        'classes_marked', count(DISTINCT s.class_id))
      FROM public.attendance_sessions s JOIN public.attendance_records r ON r.session_id = s.id
      WHERE s.school_id = _school AND s.session_date = current_date),
    'results_waiting', (SELECT count(*) FROM public.assessments WHERE school_id = _school AND status IN ('submitted', 'approved'))
  );
END $$;

-- A student's average over published results and position in their class.
-- Classmates' scores stay hidden; only the position is returned.
CREATE OR REPLACE FUNCTION public.student_standing(_student UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cls UUID;
  res JSONB;
BEGIN
  IF NOT public.can_see_student(_student) THEN
    RAISE EXCEPTION 'you cannot view this student' USING ERRCODE = '42501';
  END IF;
  SELECT e.class_id INTO cls FROM public.enrollments e
   WHERE e.student_id = _student AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1;
  IF cls IS NULL THEN RETURN jsonb_build_object('average', NULL, 'rank', NULL, 'class_size', 0); END IF;
  WITH avgs AS (
    SELECT e.student_id, avg(m.score / a.max_score * 100) AS average
    FROM public.enrollments e
    LEFT JOIN public.assessments a ON a.class_id = e.class_id AND a.status = 'published'
    LEFT JOIN public.marks m ON m.assessment_id = a.id AND m.student_id = e.student_id AND m.score IS NOT NULL
    WHERE e.class_id = cls AND e.status = 'active'
    GROUP BY e.student_id
  ), ranked AS (
    SELECT student_id, average, CASE WHEN average IS NULL THEN NULL ELSE rank() OVER (ORDER BY average DESC NULLS LAST) END AS pos
    FROM avgs
  )
  SELECT jsonb_build_object('average', round(r.average, 1), 'rank', r.pos, 'class_size', (SELECT count(*) FROM avgs))
    INTO res FROM ranked r WHERE r.student_id = _student;
  RETURN res;
END $$;

-- ---------------------------------------------------------------------------
-- Platform (Super Admin) console. Counts only: platform staff manage schools
-- and their access, they do not read pupils' records.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'schools', (SELECT count(*) FROM public.schools),
    'schools_active', (SELECT count(*) FROM public.schools WHERE status = 'active'),
    'schools_suspended', (SELECT count(*) FROM public.schools WHERE status = 'suspended'),
    'schools_new_30d', (SELECT count(*) FROM public.schools WHERE created_at > now() - interval '30 days'),
    'people', (SELECT COALESCE(jsonb_object_agg(role, n), '{}') FROM (
        SELECT role, count(*) AS n FROM public.school_memberships WHERE status = 'active' GROUP BY role) x),
    'invited', (SELECT count(*) FROM public.school_memberships WHERE status = 'invited'),
    'signins_7d', (SELECT count(*) FROM public.audit_logs WHERE action = 'login' AND created_at > now() - interval '7 days'),
    'schools_by_month', (SELECT COALESCE(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'count',
        (SELECT count(*) FROM public.schools s WHERE date_trunc('month', s.created_at) = m)) ORDER BY m), '[]')
      FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m)
  );
END $$;

CREATE OR REPLACE FUNCTION public.platform_schools()
RETURNS TABLE (
  id UUID, name TEXT, slug TEXT, status school_status, created_at TIMESTAMPTZ,
  admins BIGINT, teachers BIGINT, students BIGINT, parents BIGINT, invited BIGINT, last_activity TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT s.id, s.name, s.slug, s.status, s.created_at,
         count(*) FILTER (WHERE m.role = 'school_admin' AND m.status = 'active'),
         count(*) FILTER (WHERE m.role = 'teacher' AND m.status = 'active'),
         count(*) FILTER (WHERE m.role = 'student' AND m.status = 'active'),
         count(*) FILTER (WHERE m.role = 'parent' AND m.status = 'active'),
         count(*) FILTER (WHERE m.status = 'invited'),
         (SELECT max(a.created_at) FROM public.audit_logs a WHERE a.school_id = s.id)
  FROM public.schools s
  LEFT JOIN public.school_memberships m ON m.school_id = s.id
  GROUP BY s.id
  ORDER BY s.name;
END $$;

-- Suspending keeps every record and leaves the school read-only.
CREATE OR REPLACE FUNCTION public.set_school_status(_school UUID, _status school_status, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'give a reason; it is kept in the audit log' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('tosms.reason', btrim(_reason), true);
  UPDATE public.schools SET status = _status WHERE id = _school AND status IS DISTINCT FROM _status;
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM public.schools WHERE id = _school) THEN
    RAISE EXCEPTION 'school not found' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('tosms.reason', '', true);
END $$;

-- Creates a school and returns its first administrator's invitation link token.
CREATE OR REPLACE FUNCTION public.platform_create_school(_name TEXT, _slug TEXT, _admin_name TEXT, _admin_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'platform administrators only' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_name, ''))) = 0 OR length(btrim(COALESCE(_admin_name, ''))) = 0 THEN
    RAISE EXCEPTION 'enter the school name and the administrator''s name' USING ERRCODE = '22023';
  END IF;
  IF lower(btrim(COALESCE(_admin_email, ''))) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'enter a valid email address' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(_slug, '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'the short name may only use lowercase letters, numbers and dashes' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schools WHERE slug = _slug) THEN
    RAISE EXCEPTION 'that short name is already used by another school' USING ERRCODE = '23505';
  END IF;
  RETURN public.bootstrap_school(_name, _slug, _admin_name, _admin_email);
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.academic_years, public.terms, public.subjects, public.classes,
  public.teaching_assignments, public.timetable_slots, public.enrollments, public.guardian_links,
  public.attendance_sessions, public.attendance_records, public.assessments, public.marks,
  public.events, public.announcements TO authenticated;
GRANT INSERT, UPDATE ON public.academic_years, public.terms, public.subjects, public.classes,
  public.teaching_assignments, public.timetable_slots, public.assessments, public.marks,
  public.events, public.announcements TO authenticated;
GRANT DELETE ON public.timetable_slots, public.teaching_assignments TO authenticated;
-- Enrolments, guardian links and attendance change only through the functions above.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.enrollments, public.guardian_links,
  public.attendance_sessions, public.attendance_records FROM authenticated;
REVOKE ALL ON public.academic_years, public.terms, public.subjects, public.classes,
  public.teaching_assignments, public.timetable_slots, public.enrollments, public.guardian_links,
  public.attendance_sessions, public.attendance_records, public.assessments, public.marks,
  public.events, public.announcements FROM anon;

REVOKE EXECUTE ON FUNCTION
  public.check_attendance_record(), public.check_mark(), public.guard_assessment(), public.stamp_author()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.has_role_in(UUID, member_role), public.sees_all_students(UUID), public.is_staff(UUID),
  public.teaches_class(UUID), public.teaches_subject(UUID, UUID), public.is_self_student(UUID),
  public.is_guardian_of(UUID), public.teaches_student(UUID), public.belongs_to_class(UUID),
  public.can_see_student(UUID), public.in_audience(UUID, audience), public.can_enter_marks(UUID),
  public.enroll_student(UUID, UUID), public.end_enrollment(UUID, enrollment_status),
  public.link_guardian(UUID, UUID, TEXT), public.set_guardian_link_status(UUID, guardian_link_status),
  public.save_attendance(UUID, DATE, JSONB, TEXT), public.move_assessment(UUID, assessment_status, TEXT),
  public.school_directory(UUID), public.school_overview(UUID), public.student_standing(UUID),
  public.platform_overview(), public.platform_schools(),
  public.set_school_status(UUID, school_status, TEXT),
  public.platform_create_school(TEXT, TEXT, TEXT, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.has_role_in(UUID, member_role), public.sees_all_students(UUID), public.is_staff(UUID),
  public.teaches_class(UUID), public.teaches_subject(UUID, UUID), public.is_self_student(UUID),
  public.is_guardian_of(UUID), public.teaches_student(UUID), public.belongs_to_class(UUID),
  public.can_see_student(UUID), public.in_audience(UUID, audience), public.can_enter_marks(UUID),
  public.enroll_student(UUID, UUID), public.end_enrollment(UUID, enrollment_status),
  public.link_guardian(UUID, UUID, TEXT), public.set_guardian_link_status(UUID, guardian_link_status),
  public.save_attendance(UUID, DATE, JSONB, TEXT), public.move_assessment(UUID, assessment_status, TEXT),
  public.school_directory(UUID), public.school_overview(UUID), public.student_standing(UUID),
  public.platform_overview(), public.platform_schools(),
  public.set_school_status(UUID, school_status, TEXT),
  public.platform_create_school(TEXT, TEXT, TEXT, TEXT)
TO authenticated;
