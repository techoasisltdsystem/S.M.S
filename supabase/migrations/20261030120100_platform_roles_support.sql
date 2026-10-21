-- Support and subscription-history functions serve school staff too, so they test the platform side as a
-- condition rather than a guard. Swap that condition for the matching platform permission.
DO $$
DECLARE
  m RECORD; f RECORD; def TEXT; newdef TEXT;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('subscription_history', 'clients.view'), ('list_support_requests', 'support.view'), ('get_support_request', 'support.view'),
    ('list_support_access', 'support.view'), ('reply_support_request', 'support.manage'), ('end_support_access', 'support.manage')
  ) AS t(fn, perm)
  LOOP
    FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = m.fn LOOP
      def := pg_get_functiondef(f.oid);
      newdef := regexp_replace(def, '(public\.)?is_platform_admin\(\)', format('public.platform_can(%L)', m.perm), 'g');
      IF newdef <> def THEN EXECUTE newdef; END IF;
    END LOOP;
  END LOOP;
END $$;
