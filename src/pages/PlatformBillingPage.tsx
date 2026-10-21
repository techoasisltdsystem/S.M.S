import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock, Download, FlaskConical, Search, Users, XCircle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import BarChart from "@/components/kit/BarChart";
import Donut from "@/components/kit/Donut";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { money, rpcExportTransactions, stamp, useBillingOverview, useReconciliation, useTransactions, type BillingOverview } from "@/hooks/useBilling";
import { useDebounced } from "@/hooks/useDebounced";

const ORDER_LABEL: Record<string, string> = { created: "Not paid", pending: "Awaiting payment", paid: "Paid", failed: "Failed", abandoned: "Cancelled", mismatch: "Under review", refunded: "Refunded" };
const ISSUE: Record<string, string> = {
  paid_without_period: "Paid, but no subscription period", amount_mismatch: "Amount did not match", stuck_pending: "Pending for over an hour",
  event_without_order: "Event for an unknown order", bad_signature: "Webhook rejected (bad signature)",
};
const PALETTE = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--info))", "hsl(var(--destructive))"];
const sum = (rows: { currency: string; total_minor: number }[]) => (rows.length ? rows.map((r) => money(Number(r.total_minor), r.currency)).join(" + ") : money(0));
const ALL = "all";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym;

const Overview = ({ o }: { o: BillingOverview }) => (
  <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KitStat icon={Users} label="Registered clients" value={o.clients} sub={`${o.trials} on trial`} to="/platform/clients" />
      <KitStat icon={CheckCircle2} tone="success" label="Active subscriptions" value={o.active} sub={`${o.cancelled} cancelled`} />
      <KitStat icon={CalendarClock} tone="warning" label="Expiring in 7 days" value={o.expiring_soon} sub={`${o.expiring_today} today`} to="/platform/renewals" />
      <KitStat icon={XCircle} tone="destructive" label="Expired or past due" value={o.expired + o.past_due} sub={`${o.expired} expired · ${o.past_due} past due`} to="/platform/renewals" />
      <KitStat icon={Banknote} tone="success" label="Revenue collected" value={sum(o.revenue)} sub="Verified, non-demo payments only" />
      <KitStat icon={Clock} tone="warning" label="Awaiting payment" value={o.awaiting_payment} sub={`${sum(o.pending)} pending, not revenue`} />
      <KitStat icon={AlertTriangle} tone="destructive" label="Failed or cancelled (30 days)" value={o.failed_payments} sub="Not counted as revenue" />
      <KitStat icon={FlaskConical} tone="info" label="Demo payments" value={o.demo_paid} sub="Excluded from revenue" />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Revenue by month">
        <BarChart bars={o.revenue_by_month.map((m) => ({ label: monthLabel(m.month), values: [Number(m.total_minor) / 100] }))} series={[{ name: "Verified revenue", color: PALETTE[1] }]} format={(n) => n.toLocaleString("en-GB", { maximumFractionDigits: 0 })} />
      </Panel>
      <Panel title="New schools by month">
        <BarChart bars={o.growth.map((m) => ({ label: monthLabel(m.month), values: [m.schools] }))} series={[{ name: "Schools registered", color: PALETTE[0] }]} />
      </Panel>
      <Panel title="Renewals and expiries">
        <BarChart bars={o.renewals.map((m) => ({ label: monthLabel(m.month), values: [m.renewals, m.expiries] }))} series={[{ name: "Renewals paid", color: PALETTE[1] }, { name: "Periods ending", color: PALETTE[2] }]} />
      </Panel>
      <Panel title="Package distribution">
        {o.by_package.length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions yet.</p> : <Donut segments={o.by_package.map((p, i) => ({ label: p.name, value: p.count, color: PALETTE[i % PALETTE.length] }))} centerLabel="schools" />}
      </Panel>
    </div>
  </div>
);

const SIZE = 20;
const Transactions = () => {
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(search.trim(), 300);
  const tx = useTransactions({ status: status === ALL ? "" : status, search: dq, page }, SIZE);
  const rows = tx.data ?? [];
  const total = Number(rows[0]?.total_rows ?? 0);
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const { can } = useAuth();
  const exportCsv = async () => {
    const all = await rpcExportTransactions(status === ALL ? "" : status, dq);
    const head = ["reference", "school", "package", "interval", "currency", "amount", "status", "channel", "demo", "created", "paid", "email"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(","), ...all.map((r) => [r.reference, r.school_name, r.plan, r.billing_interval, r.currency, (Number(r.total_minor) / 100).toFixed(2), r.status, r.channel, r.demo, r.created_at, r.paid_at, r.customer_email].map(esc).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search transactions" placeholder="Reference, school or email" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
          <SelectTrigger aria-label="Status" className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>Any status</SelectItem>{Object.entries(ORDER_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        {can("billing.export") && <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" aria-hidden /> Export CSV</Button>}
      </div>
      {tx.isLoading && <LoadingRows rows={4} />}
      {tx.isError && <ErrorBox message={errMsg(tx.error)} onRetry={() => tx.refetch()} />}
      {tx.data && rows.length === 0 && <EmptyState icon={Banknote} title="No transactions" text="Payments appear here as soon as someone starts checkout." />}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[56rem] text-sm">
            <thead><tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-3">Reference</th><th scope="col" className="px-4 py-3">School</th><th scope="col" className="px-4 py-3">Package</th><th scope="col" className="px-4 py-3">Amount</th>
              <th scope="col" className="px-4 py-3">Channel</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Date</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.reference} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{t.reference}{t.demo && <span className="ml-1 rounded bg-destructive/10 px-1 text-[10px] font-bold text-destructive">DEMO</span>}</td>
                  <td className="px-4 py-2.5">{t.school_id ? <Link className="text-primary hover:underline" to={`/platform/clients/${t.school_id}`}>{t.school_name}</Link> : <span>{t.school_name} <span className="text-xs text-muted-foreground">(not created)</span></span>}</td>
                  <td className="px-4 py-2.5">{t.plan} <span className="text-xs text-muted-foreground">{t.billing_interval} · {t.purpose.replace("_", " ")}</span></td>
                  <td className="px-4 py-2.5">{money(Number(t.total_minor), t.currency)}</td>
                  <td className="px-4 py-2.5 capitalize">{t.channel?.replace("_", " ") ?? "—"}</td>
                  <td className="px-4 py-2.5">{ORDER_LABEL[t.status] ?? t.status}{t.status !== "paid" && t.gateway_response ? <span className="block text-xs text-muted-foreground">{t.gateway_response}</span> : null}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{stamp(t.paid_at ?? t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} transaction{total === 1 ? "" : "s"} · page {page + 1} of {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
};

const Reconciliation = () => {
  const q = useReconciliation();
  return (
    <Panel title="Things that do not add up" icon={AlertTriangle}>
      {q.isLoading && <LoadingRows rows={3} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> Every payment matches its order and subscription.</p>}
      <ul className="divide-y divide-border">
        {(q.data ?? []).map((r, i) => (
          <li key={i} className="py-3 text-sm">
            <p className="font-medium">{ISSUE[r.issue] ?? r.issue}{r.school_name ? ` · ${r.school_name}` : ""}</p>
            <p className="text-muted-foreground">{r.detail}</p>
            <p className="text-xs text-muted-foreground">{r.reference ? <span className="font-mono">{r.reference}</span> : null} {r.at ? ` · ${stamp(r.at)}` : ""}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">This list only reports. A payment can become &quot;paid&quot; only through server-side verification with Paystack.</p>
    </Panel>
  );
};

const PlatformBillingPage = () => {
  const o = useBillingOverview();
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Payments and transactions</h1>
          <p className="text-sm text-muted-foreground">Every figure here is calculated from verified payment records. Pending, failed, cancelled, refunded and demo payments are never counted as revenue.</p>
        </div>
        <Tabs defaultValue="overview">
          <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="transactions">Transactions</TabsTrigger><TabsTrigger value="recon">Reconciliation</TabsTrigger></TabsList>
          <TabsContent value="overview" className="mt-4">
            {o.isLoading && <LoadingRows rows={4} />}
            {o.isError && <ErrorBox message={errMsg(o.error)} onRetry={() => o.refetch()} />}
            {o.data && <Overview o={o.data} />}
          </TabsContent>
          <TabsContent value="transactions" className="mt-4"><Transactions /></TabsContent>
          <TabsContent value="recon" className="mt-4"><Reconciliation /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PlatformBillingPage;
