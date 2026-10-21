import { useState } from "react";
import { BarChart3, Download } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import { EmptyState, Panel } from "@/components/kit/Panel";
import BarChart from "@/components/kit/BarChart";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/hooks/useBilling";
import { useReport } from "@/hooks/usePlatformOps";
import { downloadCsv } from "@/lib/reports";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const sum = (rows: { currency: string; total_minor: number }[]) => (rows.length ? rows.map((r) => money(Number(r.total_minor), r.currency)).join(" + ") : money(0));
const PURPOSE: Record<string, string> = { new_school: "New schools", renewal: "Renewals", change_plan: "Package changes" };

/** Revenue, registrations and payment outcomes for any date range, from verified payment records. Demo payments are excluded. */
const PlatformReportsPage = () => {
  const [range, setRange] = useState(() => ({ from: iso(new Date(Date.now() - 180 * 86400000)), to: iso(new Date()) }));
  const q = useReport(range.from, range.to);
  const r = q.data;
  const invalid = range.to < range.from;

  const exportCsv = () => {
    if (!r) return;
    downloadCsv(`platform-report-${range.from}-to-${range.to}.csv`, ["section", "label", "currency", "value"], [
      ...r.revenue_by_month.map((m) => ["revenue by month", m.month, m.currency, (Number(m.total_minor) / 100).toFixed(2)]),
      ...r.revenue_by_package.map((p) => ["revenue by package", p.plan, p.currency, (Number(p.total_minor) / 100).toFixed(2)]),
      ...r.registrations_by_month.map((m) => ["schools registered", m.month, "", m.schools]),
      ...r.purposes.map((p) => ["paid orders by type", PURPOSE[p.purpose] ?? p.purpose, "", p.orders]),
    ]);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Analytics and reports</h1>
            <p className="text-sm text-muted-foreground">Figures come from verified payments and registrations in the range you choose. Viewing a report is recorded in the event log.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">From<Input type="date" className="w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">To<Input type="date" className="w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
            <Button variant="outline" disabled={!r} onClick={exportCsv}><Download className="mr-1 h-4 w-4" aria-hidden /> Download CSV</Button>
          </div>
        </div>
        {invalid && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">The end date must not be before the start date.</p>}
        {q.isLoading && !invalid && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {r && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KitStat icon={BarChart3} label="Revenue" value={sum(r.revenue)} sub={`${r.orders_paid} paid order${r.orders_paid === 1 ? "" : "s"}`} />
              <KitStat icon={BarChart3} tone="info" label="Schools registered" value={r.schools_registered} sub="In this range" />
              <KitStat icon={BarChart3} tone="warning" label="Pending payments" value={r.orders_pending} sub="Not completed yet" />
              <KitStat icon={BarChart3} tone="destructive" label="Failed or cancelled" value={r.orders_failed} sub="Never counted as revenue" />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Revenue by month" icon={BarChart3}>
                {r.revenue_by_month.length === 0 ? <EmptyState icon={BarChart3} title="No paid orders in this range" /> : (
                  <BarChart height={160} bars={r.revenue_by_month.map((m) => ({ label: `${m.month}${m.currency === "GHS" ? "" : ` ${m.currency}`}`, values: [Number(m.total_minor) / 100] }))} series={[{ name: "Revenue", color: "hsl(var(--primary))" }]} />
                )}
              </Panel>
              <Panel title="Schools registered by month" icon={BarChart3}>
                {r.registrations_by_month.length === 0 ? <EmptyState icon={BarChart3} title="No registrations in this range" /> : (
                  <BarChart height={160} bars={r.registrations_by_month.map((m) => ({ label: m.month, values: [m.schools] }))} series={[{ name: "Schools", color: "hsl(var(--info))" }]} />
                )}
              </Panel>
              <Panel title="Revenue by package" icon={BarChart3}>
                {r.revenue_by_package.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to show.</p> : (
                  <ul className="divide-y divide-border text-sm">{r.revenue_by_package.map((p) => <li key={p.plan + p.currency} className="flex justify-between py-2"><span>{p.plan} <span className="text-xs text-muted-foreground">· {p.orders} order{p.orders === 1 ? "" : "s"}</span></span><span className="font-semibold">{money(Number(p.total_minor), p.currency)}</span></li>)}</ul>
                )}
              </Panel>
              <Panel title="Paid orders by type" icon={BarChart3}>
                {r.purposes.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to show.</p> : (
                  <ul className="divide-y divide-border text-sm">{r.purposes.map((p) => <li key={p.purpose} className="flex justify-between py-2"><span>{PURPOSE[p.purpose] ?? p.purpose}</span><span className="font-semibold">{p.orders}</span></li>)}</ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PlatformReportsPage;
