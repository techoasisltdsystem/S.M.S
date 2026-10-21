-- Online payment of school fees through Paystack.
--
-- This sits on top of the existing fee ledger (invoices, invoice_lines, payments). A verified online payment becomes
-- an ordinary row in `payments` (method 'paystack'), so balances, receipts, voiding and reports keep working from
-- one authoritative ledger. Platform subscription payments live in billing_orders and are never mixed with these.

-- 1. Payments may now come from Paystack.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.payments'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%method%' LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.payments ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash', 'mobile_money', 'bank_transfer', 'cheque', 'other', 'paystack'));

-- 2. One row per attempt to pay online. The amount, invoice and payer are fixed by the server when it is created.
CREATE TABLE public.fee_payment_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  student_id UUID NOT NULL,
  payer_profile_id UUID,
  payer_user_id UUID NOT NULL,
  payer_name TEXT,
  payer_email TEXT NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'paid', 'failed', 'abandoned', 'mismatch')),
  access_code TEXT,
  channel TEXT,
  gateway_response TEXT,
  gateway_transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  initialized_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_id UUID,
  excess NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (excess >= 0),
  FOREIGN KEY (school_id, invoice_id) REFERENCES public.invoices (school_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (school_id, student_id) REFERENCES public.profiles (school_id, id) ON DELETE RESTRICT
);
CREATE INDEX fee_payment_orders_invoice ON public.fee_payment_orders (invoice_id, created_at DESC);
CREATE INDEX fee_payment_orders_school ON public.fee_payment_orders (school_id, created_at DESC);
ALTER TABLE public.fee_payment_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_payment_orders FROM PUBLIC, anon, authenticated;

-- A settlement can create at most one payment row, however many times it is attempted.
ALTER TABLE public.payments ADD COLUMN order_id UUID UNIQUE REFERENCES public.fee_payment_orders (id) ON DELETE RESTRICT;

-- Every verification, webhook or return the server handled, kept for reconciliation. No card data.
CREATE TABLE public.fee_payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reference TEXT,
  source TEXT NOT NULL,
  outcome TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE public.fee_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fee_payment_events FROM PUBLIC, anon, authenticated;

-- 3. Start a payment. Runs as the signed-in person; the database decides whether they may pay and how much.
CREATE OR REPLACE FUNCTION public.fee_pay_start(_invoice UUID, _amount NUMERIC)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.invoices;
  paid NUMERIC; bal NUMERIC; amt NUMERIC := round(COALESCE(_amount, 0), 2);
  me UUID; ref TEXT; oid UUID; cur TEXT; email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sign in to pay' USING ERRCODE = '42501'; END IF;
  SELECT * INTO i FROM public.invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND OR NOT public.is_guardian_of(i.student_id) THEN RAISE EXCEPTION 'you cannot pay this invoice' USING ERRCODE = '42501'; END IF;
  PERFORM public.require_feature(i.school_id, 'fees', 'fees and payments');
  IF i.status = 'cancelled' THEN RAISE EXCEPTION 'this invoice is cancelled' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(sum(amount), 0) INTO paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
  bal := i.total - paid;
  IF bal <= 0 THEN RAISE EXCEPTION 'this invoice is already fully paid' USING ERRCODE = '22023'; END IF;
  IF amt <= 0 THEN RAISE EXCEPTION 'enter an amount above zero' USING ERRCODE = '22023'; END IF;
  IF amt > bal THEN RAISE EXCEPTION 'that is more than the balance of %', bal USING ERRCODE = '22023'; END IF;
  IF (SELECT count(*) FROM public.fee_payment_orders WHERE invoice_id = i.id AND status IN ('created', 'pending') AND created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'too many unfinished payment attempts; finish or wait before starting another' USING ERRCODE = '54000';
  END IF;
  SELECT id INTO me FROM public.profiles WHERE school_id = i.school_id AND user_id = auth.uid();
  SELECT currency INTO cur FROM public.schools WHERE id = i.school_id;
  SELECT u.email::text INTO email FROM auth.users u WHERE u.id = auth.uid();
  ref := 'FEE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  INSERT INTO public.fee_payment_orders (school_id, invoice_id, student_id, payer_profile_id, payer_user_id, payer_name, payer_email, reference, amount, currency)
  VALUES (i.school_id, i.id, i.student_id, me, auth.uid(), (SELECT full_name FROM public.profiles WHERE id = me), email, ref, amt, COALESCE(cur, 'GHS'))
  RETURNING id INTO oid;
  RETURN jsonb_build_object('order_id', oid, 'reference', ref, 'amount', amt, 'currency', COALESCE(cur, 'GHS'), 'balance_before', bal);
END $$;

-- 4. Server-only helpers (owner connection; not callable from the browser).
CREATE OR REPLACE FUNCTION public.fee_order_for_server(_reference TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('reference', o.reference, 'status', o.status, 'amount_minor', round(o.amount * 100)::bigint, 'currency', o.currency,
    'email', o.payer_email, 'access_code', o.access_code, 'school_id', o.school_id, 'student_id', o.student_id, 'invoice_id', o.invoice_id)
  FROM public.fee_payment_orders o WHERE o.reference = _reference
$$;

CREATE OR REPLACE FUNCTION public.fee_mark_initialized(_reference TEXT, _access_code TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.fee_payment_orders SET access_code = _access_code, initialized_at = clock_timestamp(), status = 'pending'
  WHERE reference = _reference AND status IN ('created', 'pending')
$$;

CREATE OR REPLACE FUNCTION public.fee_record_event(_reference TEXT, _source TEXT, _outcome TEXT, _detail JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.fee_payment_events (reference, source, outcome, detail) VALUES (_reference, _source, _outcome, COALESCE(_detail, '{}'))
$$;

-- Settle from what Paystack itself reported (the server fetched it; the browser never supplies this).
-- Idempotent: a repeated call for a paid order changes nothing and creates no second payment.
CREATE OR REPLACE FUNCTION public.fee_settle(_reference TEXT, _gateway JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.fee_payment_orders;
  i public.invoices;
  g_status TEXT := _gateway ->> 'status';
  paid NUMERIC; bal NUMERIC; apply_amt NUMERIC; rct TEXT; pid UUID; student_name TEXT; total_paid NUMERIC;
BEGIN
  SELECT * INTO o FROM public.fee_payment_orders WHERE reference = _reference FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'unknown'); END IF;
  IF o.status = 'paid' THEN RETURN jsonb_build_object('status', 'paid', 'payment_id', o.payment_id); END IF;

  IF g_status = 'success' THEN
    IF (_gateway ->> 'amount_minor')::bigint IS DISTINCT FROM round(o.amount * 100)::bigint OR upper(COALESCE(_gateway ->> 'currency', '')) <> upper(o.currency) THEN
      UPDATE public.fee_payment_orders SET status = 'mismatch', verified_at = clock_timestamp(), gateway_response = 'Amount or currency did not match the order',
        gateway_transaction_id = _gateway ->> 'transaction_id' WHERE id = o.id;
      RETURN jsonb_build_object('status', 'mismatch');
    END IF;
    SELECT * INTO i FROM public.invoices WHERE id = o.invoice_id FOR UPDATE;
    SELECT COALESCE(sum(amount), 0) INTO paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
    bal := CASE WHEN i.status = 'cancelled' THEN 0 ELSE GREATEST(i.total - paid, 0) END;
    apply_amt := LEAST(o.amount, bal);
    IF apply_amt > 0 THEN
      rct := public.next_fee_number(o.school_id, 'receipt');
      INSERT INTO public.payments (school_id, invoice_id, student_id, amount, method, reference, paid_on, receipt_number, note, order_id)
      VALUES (o.school_id, o.invoice_id, o.student_id, apply_amt, 'paystack', o.reference, current_date, rct,
              'Online payment verified with Paystack' || CASE WHEN o.payer_name IS NOT NULL THEN ' (paid by ' || o.payer_name || ')' ELSE '' END, o.id)
      RETURNING id INTO pid;
    END IF;
    UPDATE public.fee_payment_orders SET status = 'paid', verified_at = clock_timestamp(), paid_at = COALESCE((_gateway ->> 'paid_at')::timestamptz, clock_timestamp()),
      channel = _gateway ->> 'channel', gateway_response = _gateway ->> 'gateway_response', gateway_transaction_id = _gateway ->> 'transaction_id',
      payment_id = pid, excess = o.amount - apply_amt WHERE id = o.id;
    SELECT COALESCE(sum(amount), 0) INTO total_paid FROM public.payments WHERE invoice_id = i.id AND status = 'recorded';
    SELECT full_name INTO student_name FROM public.profiles WHERE id = o.student_id;

    -- Tell the family and the finance team. A failed notification must never undo a payment, so none of this can raise.
    BEGIN
      IF apply_amt > 0 THEN
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
        SELECT o.school_id, r.pid, 'payment_received', 'School fees payment confirmed',
          format('%s %s received for %s (%s). Paid to date %s of %s. Receipt %s.', o.currency, to_char(apply_amt, 'FM999,999,990.00'), student_name, i.title,
                 to_char(total_paid, 'FM999,999,990.00'), to_char(i.total, 'FM999,999,990.00'), rct), '/fees'
        FROM (
          SELECT g.guardian_id AS pid FROM public.guardian_links g WHERE g.student_id = o.student_id AND g.status = 'verified'
          UNION SELECT o.student_id
          UNION SELECT m.profile_id FROM public.school_memberships m WHERE m.school_id = o.school_id AND m.status = 'active' AND m.role IN ('school_admin', 'finance_officer')
        ) r;
      END IF;
      IF o.amount - apply_amt > 0 THEN
        INSERT INTO public.notifications (school_id, recipient_id, kind, title, body, link)
        SELECT o.school_id, m.profile_id, 'payment_received', 'Payment received above the balance',
          format('%s %s of order %s was paid after the invoice was settled. It needs a refund or credit decision.', o.currency, to_char(o.amount - apply_amt, 'FM999,999,990.00'), o.reference), '/fees'
        FROM public.school_memberships m WHERE m.school_id = o.school_id AND m.status = 'active' AND m.role IN ('school_admin', 'finance_officer');
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN jsonb_build_object('status', 'paid', 'payment_id', pid, 'receipt', rct, 'applied', apply_amt, 'excess', o.amount - apply_amt, 'balance', i.total - total_paid);
  END IF;

  -- Anything that is not a verified success never touches the ledger.
  IF g_status IN ('failed', 'abandoned', 'reversed') THEN
    UPDATE public.fee_payment_orders SET status = CASE WHEN g_status = 'abandoned' THEN 'abandoned' ELSE 'failed' END, verified_at = clock_timestamp(),
      gateway_response = _gateway ->> 'gateway_response', gateway_transaction_id = _gateway ->> 'transaction_id' WHERE id = o.id;
    RETURN jsonb_build_object('status', CASE WHEN g_status = 'abandoned' THEN 'abandoned' ELSE 'failed' END);
  END IF;
  RETURN jsonb_build_object('status', o.status);
END $$;

-- 5. What the browser may read about an order: the payer and finance staff only.
CREATE OR REPLACE FUNCTION public.fee_pay_status(_reference TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.fee_payment_orders; p public.payments;
BEGIN
  SELECT * INTO o FROM public.fee_payment_orders WHERE reference = _reference;
  IF NOT FOUND OR NOT (o.payer_user_id = auth.uid() OR public.has_permission(o.school_id, 'fees.view')) THEN
    RAISE EXCEPTION 'payment not found' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.payments WHERE id = o.payment_id;
  RETURN jsonb_build_object('reference', o.reference, 'status', o.status, 'amount', o.amount, 'currency', o.currency, 'excess', o.excess,
    'invoice_id', o.invoice_id, 'invoice', (SELECT number FROM public.invoices WHERE id = o.invoice_id), 'student', (SELECT full_name FROM public.profiles WHERE id = o.student_id),
    'receipt', p.receipt_number, 'paid_at', o.paid_at, 'channel', o.channel, 'gateway_response', o.gateway_response);
END $$;

-- Online attempts for the finance team: pending, failed and above-balance payments need eyes.
CREATE OR REPLACE FUNCTION public.fee_orders_list(_school UUID, _status TEXT DEFAULT NULL, _limit INT DEFAULT 50)
RETURNS TABLE (reference TEXT, status TEXT, amount NUMERIC, currency TEXT, excess NUMERIC, student TEXT, invoice TEXT, payer TEXT, created_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, receipt TEXT, gateway_response TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'fees.view') THEN RAISE EXCEPTION 'you cannot see payments' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT o.reference, o.status, o.amount, o.currency, o.excess, s.full_name, i.number, o.payer_name, o.created_at, o.paid_at, p.receipt_number, o.gateway_response
    FROM public.fee_payment_orders o
    JOIN public.profiles s ON s.id = o.student_id JOIN public.invoices i ON i.id = o.invoice_id LEFT JOIN public.payments p ON p.id = o.payment_id
    WHERE o.school_id = _school AND (_status IS NULL OR o.status = _status OR (_status = 'review' AND (o.status = 'mismatch' OR o.excess > 0)))
    ORDER BY o.created_at DESC LIMIT least(GREATEST(_limit, 1), 200);
END $$;

REVOKE EXECUTE ON FUNCTION public.fee_order_for_server(TEXT), public.fee_mark_initialized(TEXT, TEXT), public.fee_record_event(TEXT, TEXT, TEXT, JSONB),
  public.fee_settle(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fee_pay_start(UUID, NUMERIC), public.fee_pay_status(TEXT), public.fee_orders_list(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_pay_start(UUID, NUMERIC), public.fee_pay_status(TEXT), public.fee_orders_list(UUID, TEXT, INT) TO authenticated;
