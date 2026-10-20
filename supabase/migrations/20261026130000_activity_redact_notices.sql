-- Notice and event titles are free text and can name people, so the platform
-- activity log no longer shows them. Only structural school records keep their names.
CREATE OR REPLACE FUNCTION public.platform_activity_log(
  _school UUID DEFAULT NULL, _actor TEXT DEFAULT NULL, _action TEXT DEFAULT NULL, _from TIMESTAMPTZ DEFAULT NULL, _to TIMESTAMPTZ DEFAULT NULL,
  _target_type TEXT DEFAULT NULL, _admins_only BOOLEAN DEFAULT TRUE, _limit INT DEFAULT 50, _offset INT DEFAULT 0
) RETURNS TABLE (
  id UUID, created_at TIMESTAMPTZ, school_id UUID, school_name TEXT, actor_name TEXT, actor_role TEXT, action TEXT, target_type TEXT,
  target_name TEXT, details JSONB, total BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.platform_only();
  RETURN QUERY
  SELECT l.id, l.created_at, l.school_id, s.name, l.actor_name, l.actor_role, l.action::text, l.target_type,
         CASE WHEN l.target_type IN ('school', 'school_config', 'academic_years', 'terms', 'classes', 'subjects', 'grading_scale', 'role_permission')
              THEN l.target_name END,
         public.platform_safe_details(l.details),
         count(*) OVER ()
    FROM public.audit_logs l LEFT JOIN public.schools s ON s.id = l.school_id
   WHERE l.action::text NOT IN ('login', 'logout')
     AND (_school IS NULL OR l.school_id = _school)
     AND (_actor IS NULL OR l.actor_name ILIKE '%' || _actor || '%')
     AND (_action IS NULL OR l.action::text = _action)
     AND (_target_type IS NULL OR l.target_type = _target_type)
     AND (_from IS NULL OR l.created_at >= _from) AND (_to IS NULL OR l.created_at <= _to)
     AND (NOT _admins_only OR l.actor_role ILIKE '%school_admin%' OR l.actor_role ILIKE '%platform_admin%' OR l.actor_role ILIKE '%headteacher%')
   ORDER BY l.created_at DESC
   LIMIT LEAST(GREATEST(_limit, 1), 200) OFFSET GREATEST(_offset, 0);
END $$;
