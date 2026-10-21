-- Adjustments add negative invoice lines and can bring a fully waived invoice to zero. The first attempt matched the
-- constraint text by pattern and missed these two, so drop them by name.
ALTER TABLE public.invoice_lines DROP CONSTRAINT IF EXISTS invoice_lines_amount_check;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_total_check;
