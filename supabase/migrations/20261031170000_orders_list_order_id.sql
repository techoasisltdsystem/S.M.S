-- The online payments list now carries each order's id so finance can refund an excess from it.
DROP FUNCTION IF EXISTS public.fee_orders_list(UUID, TEXT, INT);
CREATE FUNCTION public.fee_orders_list(_school UUID, _status TEXT DEFAULT NULL, _limit INT DEFAULT 50)
RETURNS TABLE (order_id UUID, reference TEXT, status TEXT, amount NUMERIC, currency TEXT, excess NUMERIC, student TEXT, invoice TEXT, payer TEXT, created_at TIMESTAMPTZ, paid_at TIMESTAMPTZ, receipt TEXT, gateway_response TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(_school, 'fees.view') THEN RAISE EXCEPTION 'you cannot see payments' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT o.id, o.reference, o.status, o.amount, o.currency, CASE WHEN o.excess_refunded_at IS NULL THEN o.excess ELSE 0 END, s.full_name, i.number, o.payer_name, o.created_at, o.paid_at, p.receipt_number, o.gateway_response
    FROM public.fee_payment_orders o
    JOIN public.profiles s ON s.id = o.student_id JOIN public.invoices i ON i.id = o.invoice_id LEFT JOIN public.payments p ON p.id = o.payment_id
    WHERE o.school_id = _school AND (_status IS NULL OR o.status = _status OR (_status = 'review' AND (o.status = 'mismatch' OR (o.excess > 0 AND o.excess_refunded_at IS NULL))))
    ORDER BY o.created_at DESC LIMIT least(GREATEST(_limit, 1), 200);
END $$;
REVOKE EXECUTE ON FUNCTION public.fee_orders_list(UUID, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_orders_list(UUID, TEXT, INT) TO authenticated;
