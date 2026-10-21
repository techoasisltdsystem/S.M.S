import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, RefreshCw } from "lucide-react";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/hooks/useFees";
import { authHeader } from "@/lib/db";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";

interface Order { order_id?: string; reference: string; status: string; amount: number; currency: string; excess: number; student: string; invoice: string; payer: string | null; created_at: string; paid_at: string | null; receipt: string | null; gateway_response: string | null }

const LABEL: Record<string, string> = { created: "Not started", pending: "Awaiting payment", paid: "Confirmed", failed: "Failed", abandoned: "Cancelled", mismatch: "Needs review" };
const FILTERS: [string, string][] = [["", "All"], ["review", "Needs review"], ["paid", "Confirmed"], ["pending", "Awaiting payment"], ["failed", "Failed"]];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Every online attempt, for reconciliation. Only a confirmed order has touched the ledger; the rest never count as collected. */
interface Refund { id: string; amount: number; currency: string; reason: string; method: string; status: string; error: string | null; created_at: string; student: string | null; receipt: string | null }

const OnlinePayments = ({ schoolId }: { schoolId: string }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const refunds = useQuery({ queryKey: ["fee-refunds", schoolId], queryFn: () => rpc<Refund[]>("fee_refunds_list", { _school: schoolId }) });
  const post = async (path: string, body: unknown) => {
    const auth = await authHeader();
    const res = await fetch("/api/billing/" + path, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "That did not work.");
    return j;
  };
  const reconcile = async () => {
    setChecking(true);
    try {
      const r = await post("fee-reconcile", { school: schoolId });
      toast({ title: r.skipped ? "Nothing to check" : `Checked ${r.checked} attempt${r.checked === 1 ? "" : "s"} with Paystack`, description: r.skipped ?? "Only what Paystack confirms is applied; nothing is marked paid by hand." });
      void qc.invalidateQueries({ queryKey: ["fee-orders"] }); void qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) { toast({ title: "Could not check", description: errMsg(e), variant: "destructive" }); }
    finally { setChecking(false); }
  };
  const retry = async (id: string) => {
    try { const r = await post("fee-refund", { retry: id }); toast({ title: r.status === "refunded" ? "Refund completed" : "Still failing", description: r.error, variant: r.status === "refunded" ? "default" : "destructive" }); }
    catch (e) { toast({ title: "Not retried", description: errMsg(e), variant: "destructive" }); }
    void qc.invalidateQueries({ queryKey: ["fee-refunds"] });
  };
  const [filter, setFilter] = useState("");
  const q = useQuery({ queryKey: ["fee-orders", schoolId, filter], refetchInterval: 60_000, queryFn: () => rpc<Order[]>("fee_orders_list", { _school: schoolId, _status: filter || null, _limit: 100 }) });
  const rows = q.data ?? [];
  return (
    <>
    <Panel title="Online payments (Paystack)" icon={CreditCard}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="mr-auto" disabled={checking} onClick={reconcile}>{checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1 h-4 w-4" aria-hidden />} Check pending payments with Paystack</Button>
        {FILTERS.map(([k, v]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={cn("rounded-full border px-3 py-1 text-xs", filter === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>{v}</button>
        ))}
      </div>
      {q.isLoading && <LoadingRows rows={3} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState icon={CreditCard} title="No online payments here" text="Payments parents start from an invoice appear here, confirmed or not." />}
      <ul className="divide-y divide-border">
        {rows.map((o) => (
          <li key={o.reference} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{o.student}</span><span className="ml-2 text-xs text-muted-foreground">{o.invoice}{o.payer ? ` · paid by ${o.payer}` : ""}</span>
              <span className="block text-xs text-muted-foreground">{o.reference} · started {when(o.created_at)}{o.receipt ? ` · receipt ${o.receipt}` : ""}{o.gateway_response && o.status !== "paid" ? ` · ${o.gateway_response}` : ""}</span>
              {o.excess > 0 && <span className="block text-xs font-medium text-warning">{money(o.excess, o.currency)} above the balance: refund or credit needed{can("payments.refund") && o.order_id && <button type="button" className="ml-2 underline" onClick={() => { const why = window.prompt("Why is this excess being refunded? (at least 5 characters)"); if (why) post("fee-refund", { order: o.order_id, reason: why }).then((r) => { toast({ title: r.status === "refunded" ? "Refunded" : "Refund recorded", description: r.error }); void qc.invalidateQueries({ queryKey: ["fee-orders"] }); void qc.invalidateQueries({ queryKey: ["fee-refunds"] }); }).catch((e) => toast({ title: "Not refunded", description: errMsg(e), variant: "destructive" })); }}>Refund it</button>}</span>}
            </span>
            <span className="text-right"><span className="font-semibold">{money(o.amount, o.currency)}</span>
              <span className={cn("block text-xs", o.status === "paid" ? "text-success" : o.status === "mismatch" || o.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{LABEL[o.status] ?? o.status}</span></span>
          </li>
        ))}
      </ul>
    </Panel>
    <Panel title="Refunds" icon={CreditCard} className="mt-4">
      {refunds.isLoading && <LoadingRows rows={2} />}
      {refunds.isError && <ErrorBox message={errMsg(refunds.error)} onRetry={() => refunds.refetch()} />}
      {refunds.data && refunds.data.length === 0 && <p className="text-sm text-muted-foreground">No refunds yet. A refund is started from a payment on its invoice.</p>}
      <ul className="divide-y divide-border">
        {(refunds.data ?? []).map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0"><span className="font-medium">{f.student ?? "Student"}</span><span className="ml-2 text-xs text-muted-foreground">{f.receipt ?? "excess payment"} · {f.method === "paystack" ? "online" : "offline"}</span>
              <span className="block text-xs text-muted-foreground">{f.reason} · {when(f.created_at)}{f.error ? ` · ${f.error}` : ""}</span></span>
            <span className="flex items-center gap-2"><span className="font-semibold">{money(f.amount, f.currency)}</span>
              <span className={cn("text-xs", f.status === "refunded" ? "text-success" : f.status === "failed" ? "text-destructive" : "text-warning")}>{f.status === "refunded" ? "Refunded" : f.status === "failed" ? "Failed" : "With Paystack"}</span>
              {f.status === "failed" && can("payments.refund") && <Button size="sm" variant="outline" onClick={() => void retry(f.id)}>Retry</Button>}</span>
          </li>
        ))}
      </ul>
    </Panel>
    </>
  );
};

export default OnlinePayments;
