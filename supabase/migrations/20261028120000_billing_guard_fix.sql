-- The payment gateway is chosen when checkout starts, so it may change once, while the order is
-- still 'created'. Everything else about an order's price and owner stays fixed.
CREATE OR REPLACE FUNCTION public.billing_records_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payment records cannot be deleted' USING ERRCODE = '42501'; END IF;
  IF TG_TABLE_NAME = 'billing_orders' THEN
    IF NEW.reference <> OLD.reference OR NEW.total_minor <> OLD.total_minor OR NEW.base_minor <> OLD.base_minor
       OR NEW.currency <> OLD.currency OR NEW.plan_id <> OLD.plan_id OR NEW.purpose <> OLD.purpose
       OR NEW.customer_email <> OLD.customer_email OR (NEW.gateway <> OLD.gateway AND OLD.status <> 'created') THEN
      RAISE EXCEPTION 'an order''s amount, plan and owner cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'paid' AND NEW.status NOT IN ('paid', 'refunded') THEN
      RAISE EXCEPTION 'a paid order cannot be reversed' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'these records cannot be edited' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
