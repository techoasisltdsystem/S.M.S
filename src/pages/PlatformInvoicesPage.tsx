import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Receipt, Search } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { money, stamp, useBillingSettings, useTransactions } from "@/hooks/useBilling";
import { useDebounced } from "@/hooks/useDebounced";
import { billingReceiptPdf, type ReceiptData } from "@/lib/billingReceipt";
import { rpc } from "@/lib/rpc";

const SIZE = 15;

/** Receipts for payments the server has verified. A receipt is never produced for an unpaid or failed order. */
const PlatformInvoicesPage = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const dq = useDebounced(search, 300);
  const q = useTransactions({ status: "paid", search: dq, page }, SIZE);
  const settings = useBillingSettings().data;
  const rows = q.data ?? [];
  const total = Number(rows[0]?.total_rows ?? 0);
  const pages = Math.max(1, Math.ceil(total / SIZE));

  const receipt = async (reference: string) => {
    setBusy(reference);
    try {
      const data = await rpc<ReceiptData>("platform_receipt", { _reference: reference });
      billingReceiptPdf(data, settings?.business_name ?? "Tech Oasis", settings?.support_email);
    } catch (e) { toast({ title: "No receipt", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(null); }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Invoices and receipts</h1>
          <p className="text-sm text-muted-foreground">Every verified payment, with a downloadable receipt. Amounts and tax are read from the stored order, never recomputed.</p>
        </div>
        <Panel title="Paid orders" icon={Receipt}>
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input aria-label="Search paid orders" placeholder="Search reference, school or email" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          </div>
          {q.isLoading && <LoadingRows rows={5} />}
          {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
          {q.data && rows.length === 0 && <EmptyState icon={Receipt} title="No paid orders" text="Paid orders appear here after the payment is verified." />}
          <ul className="divide-y divide-border">
            {rows.map((t) => (
              <li key={t.reference} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{t.school_name ?? t.customer_email}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t.plan} · {t.billing_interval}{t.demo ? " · demo" : ""}</span>
                  <span className="block text-xs text-muted-foreground">{t.reference} · paid {stamp(t.paid_at)}</span>
                </span>
                <span className="flex items-center gap-3"><span className="font-semibold">{money(Number(t.total_minor), t.currency)}</span>
                  <Button size="sm" variant="outline" disabled={busy === t.reference} onClick={() => receipt(t.reference)}><Download className="mr-1 h-4 w-4" aria-hidden /> Receipt</Button></span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total} paid order{total === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              Page {page + 1} of {pages}
              <Button size="icon" variant="outline" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </span>
          </div>
        </Panel>
      </div>
    </DashboardLayout>
  );
};

export default PlatformInvoicesPage;
