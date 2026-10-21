-- Academic calendar: draft / published / cancelled events, class targeting, change history, notifications and reminders.
-- The existing calendar page keeps working: old events become published events for the same audience.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled')),
  ADD COLUMN IF NOT EXISTS description TEXT CHECK (description IS NULL OR length(description) <= 1500),
  ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS class_id UUID,
  ADD COLUMN IF NOT EXISTS term_id UUID,
  ADD COLUMN IF NOT EXISTS reminder_days INT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE public.event_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  event_id UUID NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  actor_id UUID,
  kind TEXT NOT NULL,
  before JSONB,
  after JSONB
);
CREATE INDEX event_changes_event ON public.event_changes (event_id, at DESC);
ALTER TABLE public.event_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_changes FROM PUBLIC, anon, authenticated;

CREATE TABLE public.event_reminder_log (
  event_id UUID NOT NULL,
  stage INT NOT NULL,
  starts_on DATE NOT NULL,
  recipient_id UUID NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (event_id, stage, starts_on, recipient_id)
);
ALTER TABLE public.event_reminder_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_reminder_log FROM PUBLIC, anon, authenticated;

-- A class-specific event is for that class's students, their guardians and its teachers (managers see everything).
CREATE OR REPLACE FUNCTION public.event_class_visible(_school UUID, _class UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _class IS NULL OR public.has_permission(_school, 'communications.manage') OR EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.class_id = _class AND e.status = 'active' AND (public.is_self_student(e.student_id) OR public.is_guardian_of(e.student_id))
  ) OR EXISTS (
    SELECT 1 FROM public.teaching_assignments ta JOIN public.profiles p ON p.id = ta.teacher_id WHERE ta.class_id = _class AND p.user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'communications.manage')
         OR (status IN ('published', 'cancelled') AND public.in_audience(school_id, audience) AND public.event_class_visible(school_id, class_id)));

-- The people an event is for.
CREATE OR REPLACE FUNCTION public.event_recipients(_school UUID, _audience public.audience, _class UUID)
RETURNS TABLE (profile_id UUID) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.profile_id FROM public.school_memberships m
  WHERE m.school_id = _school AND m.status = 'active'
    AND CASE _audience
          WHEN 'everyone' THEN TRUE
          WHEN 'staff' THEN m.role NOT IN ('student', 'parent')
          WHEN 'students' THEN m.role = 'student'
          WHEN 'parents' THEN m.role = 'parent' END
    AND (_class IS NULL OR
         (m.role = 'student' AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.class_id = _class AND e.student_id = m.profile_id AND e.status = 'active'))
      OR (m.role = 'parent' AND EXISTS (SELECT 1 FROM public.guardian_links g JOIN public.enrollments e ON e.student_id = g.student_id AND e.class_id = _class AND e.status = 'active'
                                        WHERE g.guardian_id = m.profile_id AND g.status = 'verified'))
      OR (m.role NOT IN ('student', 'parent') AND EXISTS (SELECT 1 FROM public.teaching_assignments ta WHERE ta.class_id = _class AND ta.teacher_id = m.profile_id)))
$$;

-- Keep a history, and tell the audience when an event is published, moved or cancelled.
CREATE OR REPLACE FUNCTION public.events_after_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE kind TEXT := NULL; headline TEXT; sname TEXT; msg TEXT; r RECORD;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN kind := 'published'; END IF;
    INSERT INTO public.event_changes (school_id, event_id, actor_id, kind, after) VALUES (NEW.school_id, NEW.id, NEW.created_by, 'created', to_jsonb(NEW));
  ELSE
    IF OLD.status <> 'published' AND NEW.status = 'published' THEN kind := 'published';
    ELSIF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN kind := 'cancelled';
    ELSIF NEW.status = 'published' AND (OLD.starts_at IS DISTINCT FROM NEW.starts_at OR OLD.ends_at IS DISTINCT FROM NEW.ends_at OR OLD.location IS DISTINCT FROM NEW.location) THEN kind := 'changed';
    END IF;
    IF row(OLD.title, OLD.starts_at, OLD.ends_at, OLD.status, OLD.audience, OLD.class_id, OLD.location, OLD.description) IS DISTINCT FROM row(NEW.title, NEW.starts_at, NEW.ends_at, NEW.status, NEW.audience, NEW.class_id, NEW.location, NEW.description) THEN
      INSERT INTO public.event_changes (school_id, event_id, actor_id, kind, before, after)
      VALUES (NEW.school_id, NEW.id, public.my_profile_id(NEW.school_id), COALESCE(kind, 'edited'), to_jsonb(OLD), to_jsonb(NEW));
      PERFORM public.write_audit(NEW.school_id, 'event_changed', 'event', NEW.id, left(NEW.title, 80),
        jsonb_build_object('kind', COALESCE(kind, 'edited'), 'from', OLD.starts_at, 'to', NEW.starts_at, 'status', NEW.status));
    END IF;
  END IF;
  IF kind IS NOT NULL AND NEW.status IN ('published', 'cancelled') THEN
    sname := (SELECT name FROM public.schools WHERE id = NEW.school_id);
    headline := CASE kind WHEN 'published' THEN 'New event: ' WHEN 'changed' THEN 'Event updated: ' ELSE 'Event cancelled: ' END || NEW.title;
    msg := to_char(NEW.starts_at, 'DD Mon YYYY HH24:MI') || COALESCE(' at ' || NEW.location, '') || CASE WHEN kind = 'cancelled' AND NEW.cancel_reason IS NOT NULL THEN '. ' || NEW.cancel_reason ELSE '' END;
    FOR r IN SELECT * FROM public.event_recipients(NEW.school_id, NEW.audience, NEW.class_id) LOOP
      INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link) VALUES (NEW.school_id, r.profile_id, 'event_' || kind, headline, msg, '/calendar');
      PERFORM public.enqueue_email(NEW.school_id, r.profile_id, headline || ' - ' || sname, msg || E'\n\n' || sname, 'event:' || NEW.id || ':' || kind || ':' || extract(epoch FROM NEW.updated_at)::bigint || ':' || r.profile_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.events_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  IF NEW.status = 'cancelled' AND COALESCE(btrim(NEW.cancel_reason), '') = '' AND TG_OP = 'UPDATE' AND OLD.status <> 'cancelled' THEN
    RAISE EXCEPTION 'give a reason for cancelling the event' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER events_touch BEFORE INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_touch();
CREATE TRIGGER events_after_write AFTER INSERT OR UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.events_after_write();

-- Overlaps the editor should warn about (it does not forbid them).
CREATE OR REPLACE FUNCTION public.event_conflicts(_school UUID, _start TIMESTAMPTZ, _end TIMESTAMPTZ, _exclude UUID DEFAULT NULL)
RETURNS TABLE (id UUID, title TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, status TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'communications.manage') THEN RAISE EXCEPTION 'you cannot manage the calendar' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT e.id, e.title, e.starts_at, e.ends_at, e.status FROM public.events e
    WHERE e.school_id = _school AND e.status <> 'cancelled' AND e.id IS DISTINCT FROM _exclude
      AND tstzrange(e.starts_at, COALESCE(e.ends_at, e.starts_at + interval '1 minute')) && tstzrange(_start, COALESCE(_end, _start + interval '1 minute'))
    ORDER BY e.starts_at LIMIT 10;
END $$;

CREATE OR REPLACE FUNCTION public.event_history(_event UUID)
RETURNS TABLE (at TIMESTAMPTZ, kind TEXT, actor TEXT, before_starts TIMESTAMPTZ, after_starts TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s UUID;
BEGIN
  SELECT school_id INTO s FROM public.events WHERE id = _event;
  IF s IS NULL OR NOT public.has_permission(s, 'communications.manage') THEN RAISE EXCEPTION 'you cannot see this' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT c.at, c.kind, (SELECT full_name FROM public.profiles WHERE id = c.actor_id), (c.before ->> 'starts_at')::timestamptz, (c.after ->> 'starts_at')::timestamptz
    FROM public.event_changes c WHERE c.event_id = _event ORDER BY c.at DESC LIMIT 30;
END $$;

-- Event reminders: once per (event, reminder day, start date, person), so moving an event starts a fresh schedule.
CREATE OR REPLACE FUNCTION public.calendar_reminder_tick()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD; r RECORD; stage INT; pick INT; days INT; fresh BOOLEAN; sent INT := 0; sname TEXT; msg TEXT; headline TEXT;
BEGIN
  FOR e IN SELECT ev.*, s.name AS school_name FROM public.events ev JOIN public.schools s ON s.id = ev.school_id
           WHERE ev.status = 'published' AND cardinality(ev.reminder_days) > 0 AND ev.starts_at::date >= current_date AND ev.starts_at::date <= current_date + 90 AND s.status = 'active' LOOP
    days := e.starts_at::date - current_date;
    SELECT min(x) INTO pick FROM unnest(e.reminder_days) x WHERE x >= days;
    IF pick IS NULL THEN CONTINUE; END IF;
    headline := 'Reminder: ' || e.title;
    msg := CASE days WHEN 0 THEN 'Today' WHEN 1 THEN 'Tomorrow' ELSE 'In ' || days || ' days' END || ' - ' || to_char(e.starts_at, 'DD Mon YYYY HH24:MI') || COALESCE(' at ' || e.location, '');
    FOR r IN SELECT * FROM public.event_recipients(e.school_id, e.audience, e.class_id) LOOP
      fresh := FALSE;
      FOREACH stage IN ARRAY e.reminder_days LOOP
        IF stage >= days THEN
          INSERT INTO public.event_reminder_log (event_id, stage, starts_on, recipient_id) VALUES (e.id, stage, e.starts_at::date, r.profile_id) ON CONFLICT DO NOTHING;
          IF FOUND AND stage = pick THEN fresh := TRUE; END IF;
        END IF;
      END LOOP;
      IF fresh THEN
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link) VALUES (e.school_id, r.profile_id, 'event_reminder', headline, msg, '/calendar');
        PERFORM public.enqueue_email(e.school_id, r.profile_id, headline || ' - ' || e.school_name, msg || E'\n\n' || e.school_name, 'evRem:' || e.id || ':' || pick || ':' || e.starts_at::date || ':' || r.profile_id);
        sent := sent + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN sent;
END $$;

REVOKE EXECUTE ON FUNCTION public.calendar_reminder_tick(), public.event_recipients(UUID, public.audience, UUID), public.events_after_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.event_conflicts(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID), public.event_history(UUID), public.event_class_visible(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.event_conflicts(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID), public.event_history(UUID), public.event_class_visible(UUID, UUID) TO authenticated;
