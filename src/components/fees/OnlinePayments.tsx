import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { money } from "@/hooks/useFees";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";

interface Order { reference: string; status: string; amount: number; currency: string; excess: number; student: string; invoice: string; payer: string | null; created_at: string; paid_at: string | null; receipt: string | null; gateway_response: string | null }

const LABEL: Record<string, string> = { created: "Not started", pending: "Awaiting payment", paid: "Confirmed", failed: "Failed", abandoned: "Cancelled", mismatch: "Needs review" };
const FILTERS: [string, string][] = [["", "All"], ["review", "Needs review"], ["paid", "Confirmed"], ["pending", "Awaiting payment"], ["failed", "Failed"]];
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Every online attempt, for reconciliation. Only a confirmed order has touched the ledger; the rest never count as collected. */
const OnlinePayments = ({ schoolId }: { schoolId: string }) => {
  const [filter, setFilter] = useState("");
  const q = useQuery({ queryKey: ["fee-orders", schoolId, filter], refetchInterval: 60_000, queryFn: () => rpc<Order[]>("fee_orders_list", { _school: schoolId, _status: filter || null, _limit: 100 }) });
  const rows = q.data ?? [];
  return (
    <Panel title="Online payments (Paystack)" icon={CreditCard}>
      <div className="mb-3 flex flex-wrap gap-2">
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
              {o.excess > 0 && <span className="block text-xs font-medium text-warning">{money(o.excess, o.currency)} above the balance: refund or credit needed</span>}
            </span>
            <span className="text-right"><span className="font-semibold">{money(o.amount, o.currency)}</span>
              <span className={cn("block text-xs", o.status === "paid" ? "text-success" : o.status === "mismatch" || o.status === "failed" ? "text-destructive" : "text-muted-foreground")}>{LABEL[o.status] ?? o.status}</span></span>
          </li>
        ))}
      </ul>
    </Panel>
  );
};

export default OnlinePayments;
