-- Admission numbers: set by the school office, shown on reports and class lists.

CREATE OR REPLACE FUNCTION public.set_admission_number(_student UUID, _number TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.profiles;
  clean TEXT := NULLIF(btrim(COALESCE(_number, '')), '');
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = _student;
  IF NOT FOUND OR NOT public.has_permission(p.school_id, 'students.update') THEN
    RAISE EXCEPTION 'you cannot change this student''s admission number' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.school_memberships m WHERE m.profile_id = p.id AND m.school_id = p.school_id AND m.role = 'student') THEN
    RAISE EXCEPTION 'that person is not a student' USING ERRCODE = '22023';
  END IF;
  IF clean IS NOT NULL AND length(clean) > 30 THEN RAISE EXCEPTION 'an admission number can be at most 30 characters' USING ERRCODE = '22023'; END IF;
  IF clean IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles x WHERE x.school_id = p.school_id AND lower(x.admission_number) = lower(clean) AND x.id <> p.id) THEN
    RAISE EXCEPTION 'another student already has that admission number' USING ERRCODE = '23505';
  END IF;
  UPDATE public.profiles SET admission_number = clean WHERE id = p.id;
END $$;

-- Admission numbers for the people the caller may see as students.
CREATE OR REPLACE FUNCTION public.student_admission_numbers(_school UUID)
RETURNS TABLE (profile_id UUID, admission_number TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member(_school) THEN RAISE EXCEPTION 'not a member' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT p.id, p.admission_number FROM public.profiles p
   WHERE p.school_id = _school AND p.admission_number IS NOT NULL AND public.can_see_student(p.id);
END $$;

REVOKE EXECUTE ON FUNCTION public.set_admission_number(UUID, TEXT), public.student_admission_numbers(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_admission_number(UUID, TEXT), public.student_admission_numbers(UUID) TO authenticated;
