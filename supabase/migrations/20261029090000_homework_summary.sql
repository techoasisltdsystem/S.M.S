-- Counts for the teacher dashboard: of the homework this teacher can mark, how much has come in.
-- Only assignments the caller may mark (can_mark_submissions) are counted, and only for pupils
-- currently enrolled in the class. Nothing about individual pupils is returned.
CREATE OR REPLACE FUNCTION public.teacher_homework_summary(_school UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mine AS (
    SELECT a.id, a.class_id, a.deadline_at
      FROM public.assessments a
     WHERE a.school_id = _school AND a.released_at IS NOT NULL AND a.submission_format <> 'none'
       AND public.is_member(_school) AND public.can_mark_submissions(a.id)
  ), cells AS (
    SELECT m.id AS assessment_id, e.student_id, m.deadline_at,
           EXISTS (SELECT 1 FROM public.submissions s
                    WHERE s.assessment_id = m.id AND s.student_id = e.student_id AND s.status IN ('submitted', 'late', 'returned', 'marked')) AS done
      FROM mine m JOIN public.enrollments e ON e.class_id = m.class_id AND e.status = 'active'
  )
  SELECT jsonb_build_object(
    'assignments', (SELECT count(*) FROM mine),
    'total', count(*),
    'submitted', count(*) FILTER (WHERE done),
    'overdue', count(*) FILTER (WHERE NOT done AND deadline_at IS NOT NULL AND deadline_at < now()),
    'pending', count(*) FILTER (WHERE NOT done AND (deadline_at IS NULL OR deadline_at >= now())))
    FROM cells
$$;
REVOKE EXECUTE ON FUNCTION public.teacher_homework_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_homework_summary(UUID) TO authenticated;
