-- fee_reminder_tick read a column that does not exist (profiles.name); the column is full_name.
DO $$
DECLARE def TEXT;
BEGIN
  def := pg_get_functiondef('public.fee_reminder_tick()'::regprocedure);
  def := replace(def, 'SELECT name INTO sname FROM public.profiles', 'SELECT full_name INTO sname FROM public.profiles');
  EXECUTE def;
END $$;
