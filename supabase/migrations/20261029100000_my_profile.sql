-- "My profile": a person sees and edits their own details. Editing goes through one function that
-- touches only the caller's own row and only the fields a person may change about themselves.
-- Status, email, role and admission number stay with the school administrator.
CREATE OR REPLACE FUNCTION public.my_profile_details(_school UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := public.my_profile_id(_school);
  p public.profiles;
  roles TEXT[];
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'you are not a member of this school' USING ERRCODE = '42501'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id = me;
  SELECT array_agg(DISTINCT r::text) INTO roles FROM public.my_roles(_school) r;
  RETURN jsonb_build_object(
    'name', p.full_name, 'email', p.email, 'phone', p.phone, 'address', p.address, 'date_of_birth', p.date_of_birth,
    'emergency_contact', p.emergency_contact, 'gender', p.gender, 'admission_number', p.admission_number,
    'status', p.status, 'member_since', p.created_at, 'roles', COALESCE(roles, '{}'),
    'school', (SELECT name FROM public.schools WHERE id = _school),
    'class', (SELECT c.name FROM public.enrollments e JOIN public.classes c ON c.id = e.class_id
               WHERE e.student_id = me AND e.status = 'active' ORDER BY e.enrolled_on DESC LIMIT 1),
    'teaches', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object('class', c.name, 'subject', s.name))
                          FROM public.teaching_assignments t JOIN public.classes c ON c.id = t.class_id JOIN public.subjects s ON s.id = t.subject_id
                         WHERE t.teacher_id = me), '[]'),
    'children', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', sp.full_name, 'relationship', g.relationship, 'verified', g.status = 'verified'))
                           FROM public.guardian_links g JOIN public.profiles sp ON sp.id = g.student_id
                          WHERE g.guardian_id = me), '[]'));
END $$;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  _school UUID, _full_name TEXT, _phone TEXT, _address TEXT, _date_of_birth DATE, _emergency_contact TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me UUID := public.my_profile_id(_school);
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'you are not a member of this school' USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_full_name, ''))) < 2 OR length(_full_name) > 100 THEN RAISE EXCEPTION 'enter your full name' USING ERRCODE = '22023'; END IF;
  IF length(COALESCE(_phone, '')) > 30 OR COALESCE(_phone, '') !~ '^[0-9+()\s-]*$' THEN RAISE EXCEPTION 'enter a valid phone number' USING ERRCODE = '22023'; END IF;
  IF length(COALESCE(_address, '')) > 300 OR length(COALESCE(_emergency_contact, '')) > 200 THEN RAISE EXCEPTION 'that text is too long' USING ERRCODE = '22023'; END IF;
  IF _date_of_birth IS NOT NULL AND (_date_of_birth > current_date OR _date_of_birth < date '1900-01-01') THEN RAISE EXCEPTION 'enter a valid date of birth' USING ERRCODE = '22023'; END IF;
  UPDATE public.profiles SET full_name = btrim(_full_name), phone = NULLIF(btrim(COALESCE(_phone, '')), ''),
      address = NULLIF(btrim(COALESCE(_address, '')), ''), date_of_birth = _date_of_birth,
      emergency_contact = NULLIF(btrim(COALESCE(_emergency_contact, '')), ''), updated_at = now()
   WHERE id = me;
END $$;

REVOKE EXECUTE ON FUNCTION public.my_profile_details(UUID), public.update_my_profile(UUID, TEXT, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile_details(UUID), public.update_my_profile(UUID, TEXT, TEXT, TEXT, DATE, TEXT) TO authenticated;
