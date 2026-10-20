-- The suspension flag must never be NULL when the enforcement setting is not set.
CREATE OR REPLACE FUNCTION public.schools_subscription_flag()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.suspended_by_subscription := (NEW.status = 'suspended' AND COALESCE(current_setting('app.subscription_enforce', true), 'off') = 'on');
  END IF;
  RETURN NEW;
END $$;
