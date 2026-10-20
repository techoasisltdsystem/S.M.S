-- Unread tracking fix: a new recipient has read nothing yet, and message and
-- read times use the real clock so two actions in one transaction still order correctly.
ALTER TABLE public.messages ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE public.conversation_participants ALTER COLUMN last_read_at SET DEFAULT clock_timestamp();

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

  INSERT INTO public.conversations (school_id, subject, created_by, last_message_at)
  VALUES (_school, left(btrim(COALESCE(_subject, '')), 200), me, clock_timestamp()) RETURNING id INTO conv;
  INSERT INTO public.conversation_participants (conversation_id, school_id, profile_id, last_read_at)
  SELECT conv, _school, x, CASE WHEN x = me THEN clock_timestamp() ELSE 'epoch'::timestamptz END
    FROM unnest(recips || me) x;
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
  UPDATE public.conversations SET last_message_at = clock_timestamp() WHERE id = _conversation;
  UPDATE public.conversation_participants SET last_read_at = clock_timestamp()
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
  UPDATE public.conversation_participants SET last_read_at = clock_timestamp()
   WHERE conversation_id = _conversation AND profile_id = public.my_profile_id(school);
END $$;
