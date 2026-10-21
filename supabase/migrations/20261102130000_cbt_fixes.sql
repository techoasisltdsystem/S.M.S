-- cbt_attempt_save used a function Postgres does not have (jsonb_object_length); count the keys instead.
DO $$
DECLARE def TEXT;
BEGIN
  def := pg_get_functiondef('public.cbt_attempt_save(uuid, jsonb)'::regprocedure);
  def := replace(def, 'jsonb_object_length(clean)', '(SELECT count(*) FROM jsonb_object_keys(clean))');
  EXECUTE def;
END $$;
