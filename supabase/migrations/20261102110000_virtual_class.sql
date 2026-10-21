-- Virtual classes: scheduled live lessons for a class, joined from the school site. The video itself runs on Jitsi
-- (meet.jit.si by default, configurable); the database holds the schedule, who joined and for how long, and recordings.

INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'vclass.manage'), ('headteacher', 'vclass.manage'), ('academic_coordinator', 'vclass.manage')
ON CONFLICT DO NOTHING;

CREATE TABLE public.virtual_classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools (id) ON DELETE RESTRICT,
  class_id UUID NOT NULL,
  subject_id UUID,
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 150),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  -- An unguessable room name: knowing the class is not enough to walk in.
  room TEXT NOT NULL UNIQUE DEFAULT ('TechOasis-' || replace(gen_random_uuid()::text, '-', '')),
  starts_at TIMESTAMPTZ NOT NULL,
  duration_min INT NOT NULL DEFAULT 40 CHECK (duration_min BETWEEN 5 AND 300),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (school_id, class_id) REFERENCES public.classes (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, subject_id) REFERENCES public.subjects (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX virtual_classes_school ON public.virtual_classes (school_id, starts_at DESC);

CREATE TABLE public.virtual_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.virtual_classes (id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  left_at TIMESTAMPTZ
);
CREATE INDEX virtual_attendance_session ON public.virtual_attendance (session_id, profile_id);

CREATE TABLE public.virtual_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.virtual_classes (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 150),
  url TEXT NOT NULL CHECK (url ~ '^https?://' AND length(url) <= 500),
  added_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.virtual_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_recordings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.virtual_classes, public.virtual_attendance, public.virtual_recordings FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.vclass_can_host(_v public.virtual_classes)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _v.teacher_id = public.my_profile_id(_v.school_id) OR public.has_permission(_v.school_id, 'vclass.manage')
$$;

-- Students of the class join; their guardians may watch the schedule and recordings; staff of the school can see everything.
CREATE OR REPLACE FUNCTION public.vclass_can_see(_v public.virtual_classes)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.vclass_can_host(_v) OR public.is_staff(_v.school_id) OR EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.class_id = _v.class_id AND e.status = 'active' AND (public.is_self_student(e.student_id) OR public.is_guardian_of(e.student_id)))
$$;

CREATE OR REPLACE FUNCTION public.vclass_save(_school UUID, _id UUID, _class UUID, _subject UUID, _title TEXT, _description TEXT, _starts TIMESTAMPTZ, _duration INT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school); rid UUID;
BEGIN
  IF NOT (public.has_permission(_school, 'vclass.manage') OR EXISTS (SELECT 1 FROM public.teaching_assignments ta WHERE ta.class_id = _class AND ta.teacher_id = me AND (_subject IS NULL OR ta.subject_id = _subject))) THEN
    RAISE EXCEPTION 'you can schedule classes only for a class you teach' USING ERRCODE = '42501';
  END IF;
  IF _starts IS NULL OR _starts < now() - interval '5 minutes' THEN RAISE EXCEPTION 'choose a start time from now on' USING ERRCODE = '22023'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.virtual_classes (school_id, class_id, subject_id, teacher_id, title, description, starts_at, duration_min, created_by)
    VALUES (_school, _class, _subject, me, btrim(_title), NULLIF(btrim(COALESCE(_description, '')), ''), _starts, COALESCE(_duration, 40), me) RETURNING id INTO rid;
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT _school, e.student_id, 'vclass_scheduled', 'A virtual class was scheduled', format('%s, %s', btrim(_title), to_char(_starts, 'DD Mon HH24:MI')), '/virtual-class'
    FROM public.enrollments e WHERE e.class_id = _class AND e.status = 'active';
  ELSE
    UPDATE public.virtual_classes v SET class_id = _class, subject_id = _subject, title = btrim(_title), description = NULLIF(btrim(COALESCE(_description, '')), ''), starts_at = _starts, duration_min = COALESCE(_duration, 40)
    WHERE v.id = _id AND v.school_id = _school AND v.status = 'scheduled' AND public.vclass_can_host(v) RETURNING id INTO rid;
    IF rid IS NULL THEN RAISE EXCEPTION 'only a scheduled class you host can be edited' USING ERRCODE = '42501'; END IF;
  END IF;
  PERFORM public.write_audit(_school, 'vclass_scheduled', 'virtual_class', rid, left(btrim(_title), 80), jsonb_build_object('starts', _starts));
  RETURN rid;
END $$;

-- Start, end or cancel. Ending closes everyone's attendance at that moment.
CREATE OR REPLACE FUNCTION public.vclass_set_status(_id UUID, _status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.virtual_classes;
BEGIN
  SELECT * INTO v FROM public.virtual_classes WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT public.vclass_can_host(v) THEN RAISE EXCEPTION 'only the host can do that' USING ERRCODE = '42501'; END IF;
  IF _status = 'live' AND v.status <> 'scheduled' THEN RAISE EXCEPTION 'only a scheduled class can start' USING ERRCODE = '22023'; END IF;
  IF _status = 'ended' AND v.status <> 'live' THEN RAISE EXCEPTION 'only a live class can end' USING ERRCODE = '22023'; END IF;
  IF _status = 'cancelled' AND v.status <> 'scheduled' THEN RAISE EXCEPTION 'only a scheduled class can be cancelled' USING ERRCODE = '22023'; END IF;
  UPDATE public.virtual_classes SET status = _status, started_at = CASE WHEN _status = 'live' THEN clock_timestamp() ELSE started_at END,
    ended_at = CASE WHEN _status IN ('ended', 'cancelled') THEN clock_timestamp() ELSE ended_at END WHERE id = v.id;
  IF _status = 'ended' THEN UPDATE public.virtual_attendance SET left_at = clock_timestamp() WHERE session_id = v.id AND left_at IS NULL; END IF;
  IF _status IN ('live', 'cancelled') THEN
    INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
    SELECT v.school_id, e.student_id, 'vclass_' || _status, CASE WHEN _status = 'live' THEN 'Your virtual class is live now' ELSE 'A virtual class was cancelled' END, v.title, '/virtual-class'
    FROM public.enrollments e WHERE e.class_id = v.class_id AND e.status = 'active';
  END IF;
  PERFORM public.write_audit(v.school_id, 'vclass_status', 'virtual_class', v.id, left(v.title, 80), jsonb_build_object('status', _status));
END $$;

-- Joining returns the room only to people allowed in, and only while the class is live (hosts may enter a scheduled class to start it).
CREATE OR REPLACE FUNCTION public.vclass_join(_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.virtual_classes; me UUID; host BOOLEAN; participant BOOLEAN; aid UUID;
BEGIN
  SELECT * INTO v FROM public.virtual_classes WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'class not found' USING ERRCODE = '42501'; END IF;
  me := public.my_profile_id(v.school_id);
  host := public.vclass_can_host(v);
  participant := EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = v.class_id AND e.status = 'active' AND e.student_id = me);
  IF NOT (host OR participant OR public.has_permission(v.school_id, 'vclass.manage')) THEN RAISE EXCEPTION 'this class is not for you' USING ERRCODE = '42501'; END IF;
  IF v.status <> 'live' AND NOT host THEN RAISE EXCEPTION 'the class is not live yet; wait for your teacher to start it' USING ERRCODE = '22023'; END IF;
  IF v.status IN ('ended', 'cancelled') THEN RAISE EXCEPTION 'this class has finished' USING ERRCODE = '22023'; END IF;
  SELECT id INTO aid FROM public.virtual_attendance WHERE session_id = v.id AND profile_id = me AND left_at IS NULL;
  IF aid IS NULL THEN INSERT INTO public.virtual_attendance (session_id, profile_id) VALUES (v.id, me) RETURNING id INTO aid;
  ELSE UPDATE public.virtual_attendance SET last_seen = clock_timestamp() WHERE id = aid; END IF;
  RETURN jsonb_build_object('room', v.room, 'host', host, 'status', v.status, 'title', v.title, 'display_name', (SELECT full_name FROM public.profiles WHERE id = me), 'attendance_id', aid);
END $$;

CREATE OR REPLACE FUNCTION public.vclass_heartbeat(_id UUID, _leaving BOOLEAN DEFAULT FALSE)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.virtual_classes;
BEGIN
  SELECT * INTO v FROM public.virtual_classes WHERE id = _id;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  UPDATE public.virtual_attendance SET last_seen = clock_timestamp(), left_at = CASE WHEN _leaving THEN clock_timestamp() ELSE left_at END
  WHERE session_id = _id AND profile_id = public.my_profile_id(v.school_id) AND left_at IS NULL;
  RETURN v.status;
END $$;

CREATE OR REPLACE FUNCTION public.vclass_list(_school UUID, _scope TEXT DEFAULT 'upcoming')
RETURNS TABLE (id UUID, title TEXT, description TEXT, class_name TEXT, subject TEXT, teacher TEXT, starts_at TIMESTAMPTZ, duration_min INT, status TEXT,
               can_host BOOLEAN, can_join BOOLEAN, participants BIGINT, online BIGINT, class_size BIGINT, minutes INT, recordings JSONB)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school);
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT v.id, v.title, v.description, c.name, s.name, p.full_name, v.starts_at, v.duration_min, v.status,
      public.vclass_can_host(v),
      v.status = 'live' AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = v.class_id AND e.status = 'active' AND e.student_id = me),
      (SELECT count(DISTINCT a.profile_id) FROM public.virtual_attendance a WHERE a.session_id = v.id),
      (SELECT count(DISTINCT a.profile_id) FROM public.virtual_attendance a WHERE a.session_id = v.id AND a.left_at IS NULL AND a.last_seen > now() - interval '2 minutes'),
      (SELECT count(*) FROM public.enrollments e WHERE e.class_id = v.class_id AND e.status = 'active'),
      CASE WHEN v.started_at IS NOT NULL THEN (EXTRACT(EPOCH FROM (COALESCE(v.ended_at, now()) - v.started_at)) / 60)::int END,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'url', r.url, 'at', r.created_at) ORDER BY r.created_at) FROM public.virtual_recordings r WHERE r.session_id = v.id), '[]')
    FROM public.virtual_classes v JOIN public.classes c ON c.id = v.class_id LEFT JOIN public.subjects s ON s.id = v.subject_id JOIN public.profiles p ON p.id = v.teacher_id
    WHERE v.school_id = _school AND public.vclass_can_see(v)
      AND CASE _scope WHEN 'upcoming' THEN v.status IN ('scheduled', 'live') WHEN 'past' THEN v.status IN ('ended', 'cancelled') ELSE TRUE END
    ORDER BY CASE WHEN v.status = 'live' THEN 0 ELSE 1 END, CASE WHEN _scope = 'past' THEN -extract(epoch FROM v.starts_at) ELSE extract(epoch FROM v.starts_at) END
    LIMIT 200;
END $$;

-- Who attended one class, for how long (hosts and managers).
CREATE OR REPLACE FUNCTION public.vclass_attendance(_id UUID)
RETURNS TABLE (profile_id UUID, name TEXT, role TEXT, joined_at TIMESTAMPTZ, minutes INT, online BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.virtual_classes;
BEGIN
  SELECT * INTO v FROM public.virtual_classes WHERE id = _id;
  IF NOT FOUND OR NOT public.vclass_can_host(v) THEN RAISE EXCEPTION 'only the host can see attendance' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, (SELECT m.role::text FROM public.school_memberships m WHERE m.profile_id = p.id AND m.school_id = v.school_id LIMIT 1),
      min(a.joined_at), (sum(EXTRACT(EPOCH FROM (COALESCE(a.left_at, a.last_seen) - a.joined_at))) / 60)::int,
      bool_or(a.left_at IS NULL AND a.last_seen > now() - interval '2 minutes')
    FROM public.virtual_attendance a JOIN public.profiles p ON p.id = a.profile_id WHERE a.session_id = v.id GROUP BY p.id, p.full_name ORDER BY p.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.vclass_add_recording(_id UUID, _title TEXT, _url TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.virtual_classes; rid UUID;
BEGIN
  SELECT * INTO v FROM public.virtual_classes WHERE id = _id;
  IF NOT FOUND OR NOT public.vclass_can_host(v) THEN RAISE EXCEPTION 'only the host can add recordings' USING ERRCODE = '42501'; END IF;
  IF btrim(COALESCE(_url, '')) !~ '^https?://' THEN RAISE EXCEPTION 'paste the link to the recording (http or https)' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.virtual_recordings (session_id, title, url, added_by) VALUES (v.id, COALESCE(NULLIF(btrim(_title), ''), v.title), btrim(_url), public.my_profile_id(v.school_id)) RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.vclass_stats(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN (WITH v AS (SELECT x.* FROM public.virtual_classes x WHERE x.school_id = _school AND public.vclass_can_see(x))
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM v WHERE v.status <> 'cancelled'),
    'live', (SELECT count(*) FROM v WHERE v.status = 'live'),
    'upcoming_today', (SELECT count(*) FROM v WHERE v.status = 'scheduled' AND v.starts_at::date = current_date),
    'recordings', (SELECT count(*) FROM public.virtual_recordings r JOIN v ON v.id = r.session_id),
    'online', (SELECT count(DISTINCT a.profile_id) FROM public.virtual_attendance a JOIN v ON v.id = a.session_id WHERE v.status = 'live' AND a.left_at IS NULL AND a.last_seen > now() - interval '2 minutes'),
    'avg_minutes', (SELECT round(avg(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60)) FROM v WHERE v.status = 'ended'),
    'by_month', COALESCE((SELECT jsonb_agg(jsonb_build_object('month', to_char(mm, 'Mon'), 'sessions', n, 'attendance', att) ORDER BY mm) FROM (
       SELECT g.mm, (SELECT count(*) FROM v WHERE v.status = 'ended' AND date_trunc('month', v.starts_at) = g.mm) n,
         round(100.0 * (SELECT count(DISTINCT (a.session_id, a.profile_id)) FROM public.virtual_attendance a JOIN v vv ON vv.id = a.session_id
                          JOIN public.enrollments e ON e.student_id = a.profile_id AND e.class_id = vv.class_id AND e.status = 'active'
                          WHERE vv.status = 'ended' AND date_trunc('month', vv.starts_at) = g.mm)
           / NULLIF((SELECT sum((SELECT count(*) FROM public.enrollments e WHERE e.class_id = v2.class_id AND e.status = 'active')) FROM v v2
                     WHERE v2.status = 'ended' AND date_trunc('month', v2.starts_at) = g.mm), 0), 1) att
       FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') g(mm)) x), '[]')));
END $$;

DO $$
DECLARE fn TEXT;
BEGIN
  REVOKE EXECUTE ON FUNCTION public.vclass_can_host(public.virtual_classes), public.vclass_can_see(public.virtual_classes) FROM PUBLIC, anon, authenticated;
  FOREACH fn IN ARRAY ARRAY['vclass_save(UUID, UUID, UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, INT)', 'vclass_set_status(UUID, TEXT)', 'vclass_join(UUID)', 'vclass_heartbeat(UUID, BOOLEAN)',
    'vclass_list(UUID, TEXT)', 'vclass_attendance(UUID)', 'vclass_add_recording(UUID, TEXT, TEXT)', 'vclass_stats(UUID)'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
  END LOOP;
END $$;
