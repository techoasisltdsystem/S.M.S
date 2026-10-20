-- Correcting a notice's wording: the author or the office may change the title and
-- text only. Who receives it is fixed once posted (withdraw and repost to change it).
CREATE OR REPLACE FUNCTION public.edit_announcement(_announcement UUID, _title TEXT, _body TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.announcements;
BEGIN
  SELECT * INTO a FROM public.announcements WHERE id = _announcement FOR UPDATE;
  IF NOT FOUND OR NOT (public.has_permission(a.school_id, 'communications.manage') OR a.created_by = public.my_profile_id(a.school_id)) THEN
    RAISE EXCEPTION 'you cannot edit this notice' USING ERRCODE = '42501';
  END IF;
  IF a.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'a withdrawn notice cannot be edited' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_title, ''))) = 0 THEN RAISE EXCEPTION 'give the notice a title' USING ERRCODE = '22023'; END IF;
  IF length(COALESCE(_body, '')) > 4000 THEN RAISE EXCEPTION 'the message is too long' USING ERRCODE = '22023'; END IF;
  UPDATE public.announcements SET title = btrim(_title), body = COALESCE(btrim(_body), '') WHERE id = a.id;
END $$;
REVOKE EXECUTE ON FUNCTION public.edit_announcement(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_announcement(UUID, TEXT, TEXT) TO authenticated;
