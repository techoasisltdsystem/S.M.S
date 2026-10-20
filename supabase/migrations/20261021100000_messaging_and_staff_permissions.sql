-- Phase A: staff roles with school-configurable permissions, and private messaging.
--
-- Messaging rules (enforced here, not in the browser):
--   * Only participants can read a conversation. Platform admins have no access.
--   * Who may start a conversation with whom is decided by can_message_profile().
--   * Messages are never edited or deleted. A participant can report one; a
--     school administrator with messages.moderate sees only reported messages
--     and may hide them (the audit log records who and why).

-- ---------------------------------------------------------------------------
-- Default permissions for the new staff roles
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('school_admin', 'messages.moderate'),
  ('headteacher', 'students.view'),
  ('headteacher', 'attendance.view'),
  ('headteacher', 'grades.view'),
  ('headteacher', 'grades.approve'),
  ('headteacher', 'grades.publish'),
  ('headteacher', 'audit.view'),
  ('headteacher', 'communications.manage'),
  ('academic_coordinator', 'students.view'),
  ('academic_coordinator', 'attendance.view'),
  ('academic_coordinator', 'grades.view'),
  ('academic_coordinator', 'grades.approve'),
  ('academic_coordinator', 'academics.manage')
ON CONFLICT DO NOTHING;

-- Roles that can see every student record in the school.
CREATE OR REPLACE FUNCTION public.sees_all_students(_school UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(_school, 'students.view')
     AND EXISTS (SELECT 1 FROM public.my_roles(_school) r
                 WHERE r IN ('school_admin', 'finance_officer', 'auditor', 'headteacher', 'academic_coordinator'))
$$;

-- ---------------------------------------------------------------------------
-- Per-school permission changes for staff roles
-- ---------------------------------------------------------------------------
CREATE TABLE public.school_role_permissions (
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  role member_role NOT NULL,
  permission TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, role, permission),
  FOREIGN KEY (school_id, changed_by) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);

-- Only these can be switched on or off per school. Settings, user management,
-- the audit log and refunds stay fixed so a school cannot hand them out by mistake.
CREATE OR REPLACE FUNCTION public.grantable_permission(_permission TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT _permission IN ('students.view', 'attendance.view', 'attendance.record', 'grades.view',
                         'grades.enter', 'communications.manage', 'fees.invoice')
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_school UUID, _permission TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.mfa_satisfied(_permission) AND EXISTS (
    SELECT 1
    FROM public.my_roles(_school) r
    JOIN public.schools s ON s.id = _school
    WHERE (s.status = 'active' OR _permission LIKE '%.view')
      AND COALESCE(
            (SELECT o.granted FROM public.school_role_permissions o
              WHERE o.school_id = _school AND o.role = r AND o.permission = _permission),
            EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role = r AND rp.permission = _permission))
  )
$$;

CREATE OR REPLACE FUNCTION public.my_memberships()
RETURNS TABLE (
  school_id UUID, school_name TEXT, school_status school_status, profile_id UUID,
  full_name TEXT, email TEXT, avatar_url TEXT, role member_role, permissions TEXT[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.status, p.id, p.full_name, p.email, p.avatar_url, m.role,
         COALESCE(ARRAY(
           SELECT q.perm FROM (
             SELECT rp.permission AS perm FROM public.role_permissions rp
              WHERE rp.role = m.role
                AND NOT EXISTS (SELECT 1 FROM public.school_role_permissions o
                                 WHERE o.school_id = s.id AND o.role = m.role
                                   AND o.permission = rp.permission AND NOT o.granted)
             UNION
             SELECT o.permission FROM public.school_role_permissions o
              WHERE o.school_id = s.id AND o.role = m.role AND o.granted
           ) q
           WHERE s.status = 'active' OR q.perm LIKE '%.view'
           ORDER BY q.perm), '{}')
  FROM public.school_memberships m
  JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
  JOIN public.schools s ON s.id = m.school_id
  WHERE p.user_id = auth.uid() AND auth.uid() IS NOT NULL
    AND m.status = 'active' AND p.status = 'active'
  ORDER BY s.name, m.role
$$;

-- The permissions a role holds in this school (defaults plus the school's changes),
-- for the administrator's permission screen.
CREATE OR REPLACE FUNCTION public.role_permission_matrix(_school UUID)
RETURNS TABLE (role member_role, permission TEXT, granted BOOLEAN, is_default BOOLEAN, changeable BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'staff.manage') THEN
    RAISE EXCEPTION 'you cannot view role permissions' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.role, p.permission,
         COALESCE(o.granted, d.permission IS NOT NULL),
         d.permission IS NOT NULL,
         true
  FROM (SELECT unnest(enum_range(NULL::member_role)) AS role) r
  CROSS JOIN (SELECT unnest(ARRAY['students.view', 'attendance.view', 'attendance.record', 'grades.view',
                                  'grades.enter', 'communications.manage', 'fees.invoice']) AS permission) p
  LEFT JOIN public.role_permissions d ON d.role = r.role AND d.permission = p.permission
  LEFT JOIN public.school_role_permissions o ON o.school_id = _school AND o.role = r.role AND o.permission = p.permission
  WHERE r.role NOT IN ('school_admin', 'student', 'parent')
  ORDER BY r.role, p.permission;
END $$;

CREATE OR REPLACE FUNCTION public.set_role_permission(_school UUID, _role member_role, _permission TEXT, _granted BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_default BOOLEAN;
BEGIN
  IF NOT public.has_permission(_school, 'staff.manage') THEN
    RAISE EXCEPTION 'you cannot change role permissions' USING ERRCODE = '42501';
  END IF;
  IF _role IN ('school_admin', 'student', 'parent') THEN
    RAISE EXCEPTION 'permissions for this role cannot be changed' USING ERRCODE = '22023';
  END IF;
  IF NOT public.grantable_permission(_permission) THEN
    RAISE EXCEPTION 'that permission cannot be changed per school' USING ERRCODE = '22023';
  END IF;

  is_default := EXISTS (SELECT 1 FROM public.role_permissions WHERE role = _role AND permission = _permission);
  IF _granted = is_default THEN
    DELETE FROM public.school_role_permissions WHERE school_id = _school AND role = _role AND permission = _permission;
  ELSE
    INSERT INTO public.school_role_permissions (school_id, role, permission, granted, changed_by)
    VALUES (_school, _role, _permission, _granted, public.my_profile_id(_school))
    ON CONFLICT (school_id, role, permission)
    DO UPDATE SET granted = EXCLUDED.granted, changed_by = EXCLUDED.changed_by, changed_at = now();
  END IF;

  PERFORM public.write_audit(_school, 'permission_changed', 'role_permission', NULL, _role::text,
    jsonb_build_object('role', _role, 'permission', _permission, 'granted', _granted, 'default', is_default));
END $$;

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
ALTER TABLE public.school_config ADD COLUMN students_can_message BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL DEFAULT '' CHECK (length(subject) <= 200),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, created_by) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT,
  UNIQUE (school_id, id)
);

CREATE TABLE public.conversation_participants (
  conversation_id UUID NOT NULL,
  school_id UUID NOT NULL,
  profile_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id),
  FOREIGN KEY (school_id, conversation_id) REFERENCES public.conversations (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, profile_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_participants_profile ON public.conversation_participants (profile_id);

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_at TIMESTAMPTZ,
  reported_by UUID,
  report_reason TEXT,
  hidden_at TIMESTAMPTZ,
  hidden_by UUID,
  hidden_reason TEXT,
  FOREIGN KEY (school_id, conversation_id) REFERENCES public.conversations (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, sender_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX idx_messages_conversation ON public.messages (conversation_id, created_at);

ALTER TABLE public.school_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Caller is a participant (through their own, active profile).
CREATE OR REPLACE FUNCTION public.is_participant(_conversation UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    JOIN public.profiles p ON p.id = cp.profile_id AND p.school_id = cp.school_id
    WHERE cp.conversation_id = _conversation
      AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL
      AND p.status = 'active' AND public.is_member(cp.school_id)
  )
$$;

CREATE POLICY school_role_permissions_select ON public.school_role_permissions FOR SELECT TO authenticated
  USING (public.has_permission(school_id, 'staff.manage'));
CREATE POLICY conversations_select ON public.conversations FOR SELECT TO authenticated
  USING (public.is_participant(id));
CREATE POLICY participants_select ON public.conversation_participants FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id));
CREATE POLICY messages_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id));

-- Who the caller may start a conversation with.
CREATE OR REPLACE FUNCTION public.can_message_profile(_school UUID, _to UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := public.my_profile_id(_school);
  my_r member_role[];
  to_r member_role[];
  students_ok BOOLEAN;
  office member_role[] := ARRAY['headteacher', 'academic_coordinator', 'finance_officer']::member_role[];
  i_am_staff BOOLEAN;
  they_are_staff BOOLEAN;
BEGIN
  IF me IS NULL OR _to IS NULL OR _to = me OR NOT public.is_member(_school) THEN RETURN FALSE; END IF;
  IF (SELECT status FROM public.schools WHERE id = _school) <> 'active' THEN RETURN FALSE; END IF;

  SELECT array_agg(m.role) INTO to_r
    FROM public.school_memberships m
    JOIN public.profiles p ON p.id = m.profile_id AND p.school_id = m.school_id
   WHERE m.school_id = _school AND m.profile_id = _to AND m.status = 'active' AND p.status = 'active';
  IF to_r IS NULL THEN RETURN FALSE; END IF;

  my_r := ARRAY(SELECT public.my_roles(_school));
  students_ok := COALESCE((SELECT students_can_message FROM public.school_config WHERE school_id = _school), FALSE);
  i_am_staff := EXISTS (SELECT 1 FROM unnest(my_r) x WHERE x NOT IN ('student', 'parent'));
  they_are_staff := EXISTS (SELECT 1 FROM unnest(to_r) x WHERE x NOT IN ('student', 'parent'));

  -- School administrators reach everyone in their school.
  IF 'school_admin' = ANY (my_r) THEN RETURN TRUE; END IF;
  -- Everyone can reach a school administrator (students only when the school allows it).
  IF 'school_admin' = ANY (to_r) AND (my_r <> ARRAY['student']::member_role[] OR students_ok) THEN RETURN TRUE; END IF;
  -- Staff reach other staff.
  IF i_am_staff AND they_are_staff THEN RETURN TRUE; END IF;

  -- Teachers reach the verified guardians (and, if enabled, the students) of pupils they teach.
  IF 'teacher' = ANY (my_r) THEN
    IF 'parent' = ANY (to_r) AND EXISTS (
         SELECT 1 FROM public.guardian_links g
          WHERE g.school_id = _school AND g.guardian_id = _to AND g.status = 'verified'
            AND public.teaches_student(g.student_id)) THEN RETURN TRUE; END IF;
    IF 'student' = ANY (to_r) AND students_ok AND public.teaches_student(_to) THEN RETURN TRUE; END IF;
  END IF;

  -- Office roles reach parents (and, if enabled, students).
  IF my_r && office THEN
    IF 'parent' = ANY (to_r) THEN RETURN TRUE; END IF;
    IF 'student' = ANY (to_r) AND students_ok THEN RETURN TRUE; END IF;
  END IF;

  -- Parents reach office roles and teachers of their verified children.
  IF 'parent' = ANY (my_r) THEN
    IF to_r && office THEN RETURN TRUE; END IF;
    IF 'teacher' = ANY (to_r) AND EXISTS (
         SELECT 1 FROM public.guardian_links g
         JOIN public.enrollments e ON e.student_id = g.student_id AND e.status = 'active'
         JOIN public.classes c ON c.id = e.class_id
          WHERE g.school_id = _school AND g.guardian_id = me AND g.status = 'verified'
            AND (c.form_teacher_id = _to
                 OR EXISTS (SELECT 1 FROM public.teaching_assignments t WHERE t.class_id = c.id AND t.teacher_id = _to))
       ) THEN RETURN TRUE; END IF;
  END IF;

  -- Students (when enabled) reach office roles and their own teachers.
  IF 'student' = ANY (my_r) AND students_ok THEN
    IF to_r && office THEN RETURN TRUE; END IF;
    IF 'teacher' = ANY (to_r) AND EXISTS (
         SELECT 1 FROM public.enrollments e
         JOIN public.classes c ON c.id = e.class_id
          WHERE e.school_id = _school AND e.student_id = me AND e.status = 'active'
            AND (c.form_teacher_id = _to
                 OR EXISTS (SELECT 1 FROM public.teaching_assignments t WHERE t.class_id = c.id AND t.teacher_id = _to))
       ) THEN RETURN TRUE; END IF;
  END IF;

  RETURN FALSE;
END $$;

-- The searchable recipient list: only people the caller may message.
CREATE OR REPLACE FUNCTION public.message_recipients(_school UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, roles member_role[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, array_agg(m.role ORDER BY m.role)
  FROM public.profiles p
  JOIN public.school_memberships m ON m.profile_id = p.id AND m.school_id = p.school_id AND m.status = 'active'
  WHERE p.school_id = _school AND p.status = 'active' AND public.is_member(_school)
    AND public.can_message_profile(_school, p.id)
  GROUP BY p.id
  ORDER BY p.full_name
$$;

CREATE OR REPLACE FUNCTION public.start_conversation(_school UUID, _recipients UUID[], _subject TEXT, _body TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := public.my_profile_id(_school);
  recips UUID[] := ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(_recipients, '{}')) x);
  r UUID;
  conv UUID;
  i_am_staff BOOLEAN;
BEGIN
  IF me IS NULL OR NOT public.is_member(_school) THEN
    RAISE EXCEPTION 'you are not a member of this school' USING ERRCODE = '42501';
  END IF;
  IF cardinality(recips) = 0 THEN RAISE EXCEPTION 'choose at least one recipient' USING ERRCODE = '22023'; END IF;
  IF cardinality(recips) > 50 THEN RAISE EXCEPTION 'too many recipients' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_body, ''))) = 0 OR length(_body) > 5000 THEN
    RAISE EXCEPTION 'write a message (up to 5000 characters)' USING ERRCODE = '22023';
  END IF;
  i_am_staff := EXISTS (SELECT 1 FROM public.my_roles(_school) x WHERE x NOT IN ('student', 'parent'));
  IF cardinality(recips) > 1 AND NOT i_am_staff THEN
    RAISE EXCEPTION 'you can message one person at a time' USING ERRCODE = '42501';
  END IF;
  FOREACH r IN ARRAY recips LOOP
    IF NOT public.can_message_profile(_school, r) THEN
      RAISE EXCEPTION 'you are not allowed to message one of these people' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  INSERT INTO public.conversations (school_id, subject, created_by)
  VALUES (_school, left(btrim(COALESCE(_subject, '')), 200), me) RETURNING id INTO conv;
  INSERT INTO public.conversation_participants (conversation_id, school_id, profile_id)
  SELECT conv, _school, x FROM unnest(recips || me) x;
  INSERT INTO public.messages (school_id, conversation_id, sender_id, body)
  VALUES (_school, conv, me, btrim(_body));
  -- Who was contacted is logged; what was said is not.
  PERFORM public.write_audit(_school, 'conversation_started', 'conversation', conv, NULL,
    jsonb_build_object('participants', cardinality(recips) + 1));
  RETURN conv;
END $$;

CREATE OR REPLACE FUNCTION public.send_message(_conversation UUID, _body TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  school UUID;
  me UUID;
  msg UUID;
BEGIN
  IF NOT public.is_participant(_conversation) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501';
  END IF;
  SELECT school_id INTO school FROM public.conversations WHERE id = _conversation;
  me := public.my_profile_id(school);
  IF length(btrim(COALESCE(_body, ''))) = 0 OR length(_body) > 5000 THEN
    RAISE EXCEPTION 'write a message (up to 5000 characters)' USING ERRCODE = '22023';
  END IF;
  -- A reply needs someone left in the conversation the sender may still contact
  -- (for example a revoked guardian link ends the parent's ability to write).
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
     WHERE cp.conversation_id = _conversation AND cp.profile_id <> me
       AND public.can_message_profile(school, cp.profile_id)
  ) THEN
    RAISE EXCEPTION 'you can no longer message this conversation' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messages (school_id, conversation_id, sender_id, body)
  VALUES (school, _conversation, me, btrim(_body)) RETURNING id INTO msg;
  UPDATE public.conversations SET last_message_at = now() WHERE id = _conversation;
  UPDATE public.conversation_participants SET last_read_at = now()
   WHERE conversation_id = _conversation AND profile_id = me;
  RETURN msg;
END $$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  school UUID;
BEGIN
  IF NOT public.is_participant(_conversation) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501';
  END IF;
  SELECT school_id INTO school FROM public.conversations WHERE id = _conversation;
  UPDATE public.conversation_participants SET last_read_at = now()
   WHERE conversation_id = _conversation AND profile_id = public.my_profile_id(school);
END $$;

CREATE OR REPLACE FUNCTION public.my_conversations(_school UUID)
RETURNS TABLE (
  conversation_id UUID, subject TEXT, last_message_at TIMESTAMPTZ, last_message_preview TEXT,
  last_sender_name TEXT, unread_count INT, participants JSONB
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.subject, c.last_message_at,
         lm.preview, lm.sender_name,
         (SELECT count(*)::int FROM public.messages m
           WHERE m.conversation_id = c.id AND m.sender_id <> me.profile_id AND m.created_at > me.last_read_at),
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name), '[]')
            FROM public.conversation_participants cp2
            JOIN public.profiles p ON p.id = cp2.profile_id AND p.school_id = cp2.school_id
           WHERE cp2.conversation_id = c.id AND cp2.profile_id <> me.profile_id)
  FROM public.conversation_participants me
  JOIN public.profiles mp ON mp.id = me.profile_id AND mp.school_id = me.school_id
  JOIN public.conversations c ON c.id = me.conversation_id
  LEFT JOIN LATERAL (
    SELECT CASE WHEN m.hidden_at IS NULL THEN left(m.body, 140) ELSE 'Message hidden by the school' END AS preview,
           sp.full_name AS sender_name
    FROM public.messages m JOIN public.profiles sp ON sp.id = m.sender_id AND sp.school_id = m.school_id
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
  ) lm ON TRUE
  WHERE me.school_id = _school AND mp.user_id = auth.uid() AND auth.uid() IS NOT NULL
    AND mp.status = 'active' AND public.is_member(_school)
  ORDER BY c.last_message_at DESC
$$;

CREATE OR REPLACE FUNCTION public.conversation_thread(_conversation UUID)
RETURNS TABLE (
  message_id UUID, sender_id UUID, sender_name TEXT, body TEXT, created_at TIMESTAMPTZ,
  hidden BOOLEAN, mine BOOLEAN, reported BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  school UUID;
  me UUID;
BEGIN
  IF NOT public.is_participant(_conversation) THEN
    RAISE EXCEPTION 'conversation not found' USING ERRCODE = '42501';
  END IF;
  SELECT c.school_id INTO school FROM public.conversations c WHERE c.id = _conversation;
  me := public.my_profile_id(school);
  RETURN QUERY
  SELECT m.id, m.sender_id, p.full_name,
         CASE WHEN m.hidden_at IS NULL THEN m.body END,
         m.created_at, m.hidden_at IS NOT NULL, m.sender_id = me, m.reported_at IS NOT NULL
  FROM public.messages m
  JOIN public.profiles p ON p.id = m.sender_id AND p.school_id = m.school_id
  WHERE m.conversation_id = _conversation
  ORDER BY m.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.unread_message_count(_school UUID)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(sum(u.n), 0)::int FROM (
    SELECT (SELECT count(*) FROM public.messages m
             WHERE m.conversation_id = cp.conversation_id AND m.sender_id <> cp.profile_id
               AND m.created_at > cp.last_read_at) AS n
    FROM public.conversation_participants cp
    JOIN public.profiles p ON p.id = cp.profile_id AND p.school_id = cp.school_id
    WHERE cp.school_id = _school AND p.user_id = auth.uid() AND auth.uid() IS NOT NULL
      AND p.status = 'active' AND public.is_member(_school)
  ) u
$$;

CREATE OR REPLACE FUNCTION public.report_message(_message UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  msg public.messages;
BEGIN
  SELECT * INTO msg FROM public.messages WHERE id = _message;
  IF NOT FOUND OR NOT public.is_participant(msg.conversation_id) THEN
    RAISE EXCEPTION 'message not found' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'say why you are reporting this message' USING ERRCODE = '22023';
  END IF;
  UPDATE public.messages
     SET reported_at = COALESCE(reported_at, now()),
         reported_by = COALESCE(reported_by, public.my_profile_id(msg.school_id)),
         report_reason = COALESCE(report_reason, left(btrim(_reason), 500))
   WHERE id = _message;
END $$;

-- Reported messages only: administrators do not browse private conversations.
CREATE OR REPLACE FUNCTION public.moderation_queue(_school UUID)
RETURNS TABLE (
  message_id UUID, conversation_id UUID, sender_name TEXT, body TEXT, created_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ, reported_by_name TEXT, report_reason TEXT, hidden_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'messages.moderate') THEN
    RAISE EXCEPTION 'you cannot moderate messages' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.conversation_id, sp.full_name, m.body, m.created_at, m.reported_at,
         rp.full_name, m.report_reason, m.hidden_at
  FROM public.messages m
  JOIN public.profiles sp ON sp.id = m.sender_id AND sp.school_id = m.school_id
  LEFT JOIN public.profiles rp ON rp.id = m.reported_by AND rp.school_id = m.school_id
  WHERE m.school_id = _school AND m.reported_at IS NOT NULL
  ORDER BY (m.hidden_at IS NOT NULL), m.reported_at DESC;
END $$;

CREATE OR REPLACE FUNCTION public.hide_message(_message UUID, _reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  msg public.messages;
BEGIN
  SELECT * INTO msg FROM public.messages WHERE id = _message;
  IF NOT FOUND OR NOT public.has_permission(msg.school_id, 'messages.moderate') THEN
    RAISE EXCEPTION 'you cannot moderate this message' USING ERRCODE = '42501';
  END IF;
  IF msg.reported_at IS NULL THEN
    RAISE EXCEPTION 'only reported messages can be hidden' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'give a reason for hiding this message' USING ERRCODE = '22023';
  END IF;
  UPDATE public.messages
     SET hidden_at = now(), hidden_by = public.my_profile_id(msg.school_id), hidden_reason = left(btrim(_reason), 500)
   WHERE id = _message;
  PERFORM public.write_audit(msg.school_id, 'message_hidden', 'message', _message, NULL,
    jsonb_build_object('reason', left(btrim(_reason), 500), 'sender', msg.sender_id));
END $$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.school_role_permissions, public.conversations,
  public.conversation_participants, public.messages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.school_role_permissions, public.conversations,
  public.conversation_participants, public.messages FROM authenticated;
GRANT SELECT ON public.school_role_permissions, public.conversations,
  public.conversation_participants, public.messages TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.grantable_permission(TEXT), public.is_participant(UUID), public.can_message_profile(UUID, UUID),
  public.role_permission_matrix(UUID), public.set_role_permission(UUID, member_role, TEXT, BOOLEAN),
  public.message_recipients(UUID), public.start_conversation(UUID, UUID[], TEXT, TEXT),
  public.send_message(UUID, TEXT), public.mark_conversation_read(UUID), public.my_conversations(UUID),
  public.conversation_thread(UUID), public.unread_message_count(UUID), public.report_message(UUID, TEXT),
  public.moderation_queue(UUID), public.hide_message(UUID, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.is_participant(UUID),
  public.role_permission_matrix(UUID), public.set_role_permission(UUID, member_role, TEXT, BOOLEAN),
  public.message_recipients(UUID), public.start_conversation(UUID, UUID[], TEXT, TEXT),
  public.send_message(UUID, TEXT), public.mark_conversation_read(UUID), public.my_conversations(UUID),
  public.conversation_thread(UUID), public.unread_message_count(UUID), public.report_message(UUID, TEXT),
  public.moderation_queue(UUID), public.hide_message(UUID, TEXT)
TO authenticated;
-- can_message_profile and grantable_permission are used inside the functions above only.
