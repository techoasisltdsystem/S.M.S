-- Phase F: announcements to chosen groups, scheduled publication, delivery and read status.
--
-- An announcement goes to an audience (everyone, staff, teachers, students, parents),
-- optionally narrowed to one or more classes. Who receives it is decided here, the same
-- way for reading, counting and notifying. A scheduled announcement stays invisible to
-- its audience until its time. Announcements stay separate from private messages.

ALTER TABLE public.announcements
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN notified_at TIMESTAMPTZ;

-- Existing announcements are already visible; do not notify about them now.
UPDATE public.announcements SET notified_at = published_at WHERE notified_at IS NULL;

CREATE TABLE public.announcement_classes (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  school_id UUID NOT NULL,
  class_id UUID NOT NULL,
  PRIMARY KEY (announcement_id, class_id),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  school_id UUID NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (announcement_id, profile_id),
  FOREIGN KEY (school_id, profile_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.announcement_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.announcement_classes, public.announcement_reads FROM anon, authenticated;

-- The classes an announcement is limited to (the older single class_id counts too).
CREATE OR REPLACE FUNCTION public.announcement_target_classes(_announcement UUID)
RETURNS UUID[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(DISTINCT c), '{}') FROM (
    SELECT class_id AS c FROM public.announcements WHERE id = _announcement AND class_id IS NOT NULL
    UNION SELECT ac.class_id FROM public.announcement_classes ac WHERE ac.announcement_id = _announcement) x
$$;

-- Everyone an audience reaches: the single definition used for reading, counting and notifying.
CREATE OR REPLACE FUNCTION public.audience_members(_school UUID, _audience audience, _classes UUID[])
RETURNS TABLE (profile_id UUID, roles member_role[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH people AS (
    SELECT p.id, array_agg(m.role) AS roles
      FROM public.profiles p JOIN public.school_memberships m ON m.profile_id = p.id AND m.school_id = p.school_id AND m.status = 'active'
     WHERE p.school_id = _school AND p.status = 'active'
     GROUP BY p.id
  ), in_classes AS (
    SELECT e.student_id AS id, 'student'::text AS how FROM public.enrollments e
     WHERE e.school_id = _school AND e.status = 'active' AND e.class_id = ANY (_classes)
    UNION
    SELECT g.guardian_id, 'parent' FROM public.guardian_links g JOIN public.enrollments e ON e.student_id = g.student_id
     WHERE g.school_id = _school AND g.status = 'verified' AND e.status = 'active' AND e.class_id = ANY (_classes)
    UNION
    SELECT t.teacher_id, 'teacher' FROM public.teaching_assignments t WHERE t.school_id = _school AND t.class_id = ANY (_classes)
    UNION
    SELECT c.form_teacher_id, 'teacher' FROM public.classes c WHERE c.school_id = _school AND c.id = ANY (_classes) AND c.form_teacher_id IS NOT NULL
  )
  SELECT pe.id, pe.roles FROM people pe
  WHERE CASE
    WHEN cardinality(COALESCE(_classes, '{}')) = 0 THEN
      CASE _audience
        WHEN 'everyone' THEN TRUE
        WHEN 'staff' THEN EXISTS (SELECT 1 FROM unnest(pe.roles) r WHERE r NOT IN ('student', 'parent'))
        WHEN 'teachers' THEN 'teacher' = ANY (pe.roles)
        WHEN 'students' THEN 'student' = ANY (pe.roles)
        WHEN 'parents' THEN 'parent' = ANY (pe.roles)
      END
    ELSE EXISTS (
      SELECT 1 FROM in_classes ic WHERE ic.id = pe.id
        AND ((ic.how = 'student' AND _audience IN ('everyone', 'students') AND 'student' = ANY (pe.roles))
          OR (ic.how = 'parent' AND _audience IN ('everyone', 'parents') AND 'parent' = ANY (pe.roles))
          OR (ic.how = 'teacher' AND _audience IN ('everyone', 'staff', 'teachers') AND 'teacher' = ANY (pe.roles))))
  END
$$;

-- Can the caller read this announcement?
CREATE OR REPLACE FUNCTION public.can_read_announcement(_announcement UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.announcements;
  me UUID;
  classes UUID[];
BEGIN
  SELECT * INTO a FROM public.announcements WHERE id = _announcement;
  IF NOT FOUND OR NOT public.is_member(a.school_id) THEN RETURN FALSE; END IF;
  me := public.my_profile_id(a.school_id);
  -- The office and the author always see their own announcements, scheduled or cancelled.
  IF public.has_permission(a.school_id, 'communications.manage') OR a.created_by = me THEN RETURN TRUE; END IF;
  IF a.cancelled_at IS NOT NULL OR a.published_at > clock_timestamp() THEN RETURN FALSE; END IF;
  classes := public.announcement_target_classes(a.id);
  -- Staff see every school-wide notice, as before.
  IF cardinality(classes) = 0 AND public.is_staff(a.school_id) THEN RETURN TRUE; END IF;
  RETURN EXISTS (SELECT 1 FROM public.audience_members(a.school_id, a.audience, classes) am WHERE am.profile_id = me);
END $$;

DROP POLICY IF EXISTS announcements_select ON public.announcements;
CREATE POLICY announcements_select ON public.announcements FOR SELECT TO authenticated
  USING (public.can_read_announcement(id));

-- Sends notifications for announcements whose time has come (immediately for
-- ordinary posts; from the monitor job for scheduled ones). Never twice.
CREATE OR REPLACE FUNCTION public.deliver_due_announcements()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.announcements;
  n INT := 0;
BEGIN
  FOR a IN SELECT * FROM public.announcements WHERE notified_at IS NULL AND cancelled_at IS NULL AND published_at <= clock_timestamp()
           ORDER BY published_at FOR UPDATE SKIP LOCKED LOOP
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT a.school_id, am.profile_id, 'announcement', 'New notice', left(a.title, 120), '/calendar'
      FROM public.audience_members(a.school_id, a.audience, public.announcement_target_classes(a.id)) am
     WHERE am.profile_id IS DISTINCT FROM a.created_by;
    UPDATE public.announcements SET notified_at = clock_timestamp() WHERE id = a.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Posts an announcement after checking who may send it to whom.
CREATE OR REPLACE FUNCTION public.post_announcement(
  _school UUID, _title TEXT, _body TEXT, _audience audience, _classes UUID[], _publish_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  manager BOOLEAN := public.has_permission(_school, 'communications.manage');
  me UUID := public.my_profile_id(_school);
  cls UUID[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_classes, '{}')) x);
  c UUID;
  at TIMESTAMPTZ := COALESCE(_publish_at, clock_timestamp());
  aid UUID;
  reach INT;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'you are not a member of this school' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_title, ''))) = 0 THEN RAISE EXCEPTION 'give the notice a title' USING ERRCODE = '22023'; END IF;
  IF length(COALESCE(_body, '')) > 4000 THEN RAISE EXCEPTION 'the message is too long' USING ERRCODE = '22023'; END IF;
  IF at < clock_timestamp() - interval '5 minutes' THEN RAISE EXCEPTION 'a scheduled time cannot be in the past' USING ERRCODE = '22023'; END IF;
  IF at > clock_timestamp() + interval '180 days' THEN RAISE EXCEPTION 'schedule at most 180 days ahead' USING ERRCODE = '22023'; END IF;
  FOREACH c IN ARRAY cls LOOP
    IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = c AND school_id = _school) THEN RAISE EXCEPTION 'unknown class' USING ERRCODE = '22023'; END IF;
  END LOOP;

  IF NOT manager THEN
    -- Teachers post only to classes they teach, and only to pupils and parents there.
    IF NOT public.has_permission(_school, 'attendance.record') OR cardinality(cls) = 0 THEN
      RAISE EXCEPTION 'choose the classes you teach; only the school office can post to the whole school' USING ERRCODE = '42501';
    END IF;
    IF _audience NOT IN ('everyone', 'students', 'parents') THEN
      RAISE EXCEPTION 'teachers post to students and parents of their classes' USING ERRCODE = '42501';
    END IF;
    FOREACH c IN ARRAY cls LOOP
      IF NOT public.teaches_class(c) THEN RAISE EXCEPTION 'you can only post to classes you teach' USING ERRCODE = '42501'; END IF;
    END LOOP;
  END IF;

  INSERT INTO public.announcements (school_id, title, body, audience, class_id, published_at, created_by, author_name)
  VALUES (_school, btrim(_title), COALESCE(btrim(_body), ''), _audience, NULL, at, me, (SELECT full_name FROM public.profiles WHERE id = me))
  RETURNING id INTO aid;
  INSERT INTO public.announcement_classes (announcement_id, school_id, class_id) SELECT aid, _school, x FROM unnest(cls) x;
  SELECT count(*) INTO reach FROM public.audience_members(_school, _audience, cls);
  PERFORM public.write_audit(_school, 'announcement_published', 'announcement', aid, left(btrim(_title), 80),
    jsonb_build_object('audience', _audience, 'classes', cardinality(cls), 'recipients', reach, 'scheduled', at > clock_timestamp()));
  PERFORM public.deliver_due_announcements();
  RETURN aid;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_announcement(_announcement UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.announcements;
BEGIN
  SELECT * INTO a FROM public.announcements WHERE id = _announcement FOR UPDATE;
  IF NOT FOUND OR NOT (public.has_permission(a.school_id, 'communications.manage') OR a.created_by = public.my_profile_id(a.school_id)) THEN
    RAISE EXCEPTION 'you cannot withdraw this notice' USING ERRCODE = '42501';
  END IF;
  IF a.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'already withdrawn' USING ERRCODE = '22023'; END IF;
  UPDATE public.announcements SET cancelled_at = clock_timestamp() WHERE id = a.id;
  PERFORM public.write_audit(a.school_id, 'announcement_cancelled', 'announcement', a.id, left(a.title, 80),
    jsonb_build_object('was_published', a.published_at <= clock_timestamp()));
END $$;

-- Who an audience would reach, before sending (counts by role only).
CREATE OR REPLACE FUNCTION public.audience_preview(_school UUID, _audience audience, _classes UUID[])
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_permission(_school, 'communications.manage') OR public.has_permission(_school, 'attendance.record')) THEN
    RAISE EXCEPTION 'you cannot post notices' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT jsonb_build_object(
    'total', count(*),
    'students', count(*) FILTER (WHERE 'student' = ANY (roles)),
    'parents', count(*) FILTER (WHERE 'parent' = ANY (roles)),
    'staff', count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(roles) r WHERE r NOT IN ('student', 'parent'))))
    FROM public.audience_members(_school, _audience, COALESCE(_classes, '{}')));
END $$;

CREATE OR REPLACE FUNCTION public.mark_announcements_read(_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i UUID;
  a public.announcements;
BEGIN
  FOREACH i IN ARRAY COALESCE(_ids, '{}') LOOP
    SELECT * INTO a FROM public.announcements WHERE id = i;
    IF FOUND AND public.can_read_announcement(i) AND a.published_at <= clock_timestamp() THEN
      INSERT INTO public.announcement_reads (announcement_id, profile_id, school_id)
      VALUES (i, public.my_profile_id(a.school_id), a.school_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Delivery and read figures, for the author and the office only.
CREATE OR REPLACE FUNCTION public.announcement_stats(_school UUID)
RETURNS TABLE (announcement_id UUID, classes UUID[], recipients INT, reads INT, delivered BOOLEAN, scheduled BOOLEAN, cancelled BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  manager BOOLEAN := public.has_permission(_school, 'communications.manage');
  me UUID := public.my_profile_id(_school);
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT a.id, public.announcement_target_classes(a.id),
         (SELECT count(*)::int FROM public.audience_members(a.school_id, a.audience, public.announcement_target_classes(a.id)) am WHERE am.profile_id IS DISTINCT FROM a.created_by),
         (SELECT count(*)::int FROM public.announcement_reads r WHERE r.announcement_id = a.id AND r.profile_id IS DISTINCT FROM a.created_by),
         a.notified_at IS NOT NULL, a.published_at > clock_timestamp(), a.cancelled_at IS NOT NULL
    FROM public.announcements a
   WHERE a.school_id = _school AND (manager OR a.created_by = me);
END $$;

-- The class list for every announcement the caller can read (for labels on the board).
CREATE OR REPLACE FUNCTION public.announcement_classes_for(_school UUID)
RETURNS TABLE (announcement_id UUID, classes UUID[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, public.announcement_target_classes(a.id) FROM public.announcements a
   WHERE a.school_id = _school AND public.can_read_announcement(a.id)
$$;

-- The monitor job also delivers scheduled announcements.
CREATE OR REPLACE FUNCTION public.audit_monitor_tick()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.subscriptions_enforce();
  PERFORM public.deliver_due_announcements();
  RETURN public.audit_run_health_check('scheduled', NULL);
END $$;

REVOKE EXECUTE ON FUNCTION
  public.announcement_target_classes(UUID), public.audience_members(UUID, audience, UUID[]), public.can_read_announcement(UUID),
  public.deliver_due_announcements(), public.post_announcement(UUID, TEXT, TEXT, audience, UUID[], TIMESTAMPTZ),
  public.cancel_announcement(UUID), public.audience_preview(UUID, audience, UUID[]), public.mark_announcements_read(UUID[]),
  public.announcement_stats(UUID), public.announcement_classes_for(UUID)
FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.audience_members(UUID, audience, UUID[]), public.deliver_due_announcements(), public.announcement_target_classes(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION
  public.can_read_announcement(UUID), public.post_announcement(UUID, TEXT, TEXT, audience, UUID[], TIMESTAMPTZ),
  public.cancel_announcement(UUID), public.audience_preview(UUID, audience, UUID[]), public.mark_announcements_read(UUID[]),
  public.announcement_stats(UUID), public.announcement_classes_for(UUID)
TO authenticated;
