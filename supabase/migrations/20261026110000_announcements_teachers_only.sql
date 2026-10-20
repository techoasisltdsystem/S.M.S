-- A notice for teachers is for teachers: other staff no longer see it through the
-- "staff see every school-wide notice" rule.
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
  IF public.has_permission(a.school_id, 'communications.manage') OR a.created_by = me THEN RETURN TRUE; END IF;
  IF a.cancelled_at IS NOT NULL OR a.published_at > clock_timestamp() THEN RETURN FALSE; END IF;
  classes := public.announcement_target_classes(a.id);
  IF cardinality(classes) = 0 AND a.audience <> 'teachers' AND public.is_staff(a.school_id) THEN RETURN TRUE; END IF;
  RETURN EXISTS (SELECT 1 FROM public.audience_members(a.school_id, a.audience, classes) am WHERE am.profile_id = me);
END $$;
