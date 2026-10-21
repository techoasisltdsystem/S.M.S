-- Two payroll readers returned a column named id and also looked rows up by an unqualified id; qualify the lookups.
DO $$
DECLARE def TEXT;
BEGIN
  def := pg_get_functiondef('public.payslips_for_run(uuid)'::regprocedure);
  def := replace(def, 'SELECT * INTO r FROM public.payroll_runs WHERE id = _run', 'SELECT * INTO r FROM public.payroll_runs x WHERE x.id = _run');
  EXECUTE def;
  def := pg_get_functiondef('public.my_payslips(uuid)'::regprocedure);
  def := replace(def, '(SELECT full_name FROM public.profiles WHERE id = p.profile_id)', '(SELECT pf.full_name FROM public.profiles pf WHERE pf.id = p.profile_id)');
  def := replace(def, '(SELECT name FROM public.schools WHERE id = _school)', '(SELECT sc.name FROM public.schools sc WHERE sc.id = _school)');
  EXECUTE def;
END $$;
