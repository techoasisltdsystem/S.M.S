import { useState } from "react";
import { BarChart3, Download } from "lucide-react";
import KitStat from "@/components/kit/KitStat";
import BarChart from "@/components/kit/BarChart";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useFeeReport, usePeriods } from "@/hooks/useFeeAdmin";
import { methodLabel, money } from "@/hooks/useFees";
import { useClasses } from "@/hooks/useSchoolData";
import { downloadCsv } from "@/lib/reports";
import { rpc } from "@/lib/rpc";

const sel = "h-10 rounded-md border border-input bg-background px-3 text-sm";

/** Collections, arrears and breakdowns from the settled ledger. Gross, refunds, reversals and net are kept apart; pending money is never counted. */
const FeeReports = ({ schoolId }: { schoolId: string }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const periods = usePeriods(schoolId);
  const classes = useClasses(schoolId);
  const [f, setF] = useState({ year: "", term: "", cls: "", from: "", to: "" });
  const q = useFeeReport(schoolId, f);
  const r = q.data;
  const cur = "GHS";
  const terms = (periods.data?.terms ?? []).filter((t) => !f.year || t.academic_year_id === f.year);

  const exportCsv = async () => {
    if (!r) return;
    try {
      await rpc("fee_log_export", { _school: schoolId, _what: "fee report" });
      downloadCsv(`fee-report-${new Date().toISOString().slice(0, 10)}.csv`, ["section", "label", "amount"], [
        ["summary", "Assessed (before adjustments)", r.assessed], ["summary", "Discounts, scholarships and waivers", r.discounts], ["summary", "Extra charges", r.charges], ["summary", "Net assessed", r.net_assessed],
        ["summary", "Online collections", r.online_collected], ["summary", "Offline collections", r.offline_collected], ["summary", "Net collected", r.net_collected],
        ["summary", "Refunds", r.refunds], ["summary", "Reversals", r.reversals], ["summary", "Gross collected", r.gross_collected], ["summary", "Outstanding", r.outstanding], ["summary", "Overdue", r.overdue_amount],
        ...r.by_class.map((c) => ["by class: " + c.class, `assessed ${c.assessed} / collected ${c.collected}`, c.outstanding]),
        ...r.by_term.map((t) => ["by period: " + t.term, `assessed ${t.assessed} / collected ${t.collected}`, t.outstanding]),
        ...r.by_category.map((c) => ["by category", c.category, c.amount]),
        ...r.by_method.map((m) => ["by method", methodLabel(m.method), m.amount]),
        ...r.monthly.map((m) => ["by month", m.month, m.amount]),
      ]);
    } catch (e) { toast({ title: "Export not allowed", description: errMsg(e), variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      <Panel title="Fee reports" icon={BarChart3}>
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <select aria-label="Academic year" className={sel} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value, term: "" })}><option value="">All years</option>{(periods.data?.years ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          <select aria-label="Term or semester" className={sel} value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}><option value="">All periods</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <select aria-label="Class" className={sel} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })}><option value="">All classes</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="text-xs text-muted-foreground">Paid from<Input type="date" className="w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
          <label className="text-xs text-muted-foreground">to<Input type="date" className="w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
          {can("fees.export") && <Button variant="outline" disabled={!r} onClick={exportCsv}><Download className="mr-1 h-4 w-4" aria-hidden /> Download CSV</Button>}
        </div>
        {q.isLoading && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {r && r.invoices === 0 && <EmptyState icon={BarChart3} title="No invoices match" text="Change the filters, or raise invoices from a fee." />}
        {r && r.invoices > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KitStat icon={BarChart3} label="Net assessed" value={money(r.net_assessed, cur)} sub={`${money(r.assessed, cur)} before ${money(r.discounts, cur)} discounts and ${money(r.charges, cur)} charges`} />
              <KitStat icon={BarChart3} tone="success" label="Net collected" value={money(r.net_collected, cur)} sub={`${money(r.online_collected, cur)} online · ${money(r.offline_collected, cur)} offline`} />
              <KitStat icon={BarChart3} tone="warning" label="Outstanding" value={money(r.outstanding, cur)} sub={`${money(r.overdue_amount, cur)} overdue in ${r.overdue_accounts} account${r.overdue_accounts === 1 ? "" : "s"}`} />
              <KitStat icon={BarChart3} tone="info" label="Collection rate" value={r.net_assessed > 0 ? `${Math.round((r.net_collected / r.net_assessed) * 100)}%` : "-"} sub={`${r.students_paid} paid · ${r.students_part_paid} part paid · ${r.students_unpaid} unpaid`} />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Gross to net collections">
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Gross collected</dt><dd className="font-medium">{money(r.gross_collected, cur)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Refunds</dt><dd>-{money(r.refunds, cur)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Reversals</dt><dd>-{money(r.reversals, cur)}</dd></div>
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>Net collected</dt><dd>{money(r.net_collected, cur)}</dd></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><dt>Offline payments awaiting approval (not counted)</dt><dd>{money(r.pending_offline, cur)}</dd></div>
                </dl>
              </Panel>
              <Panel title="Collections by month">
                {r.monthly.length === 0 ? <p className="text-sm text-muted-foreground">No collections yet.</p> : <BarChart height={140} bars={r.monthly.map((m) => ({ label: m.month, values: [Number(m.amount)] }))} series={[{ name: "Collected", color: "hsl(var(--primary))" }]} />}
              </Panel>
              <Panel title="By class">
                <ul className="divide-y divide-border text-sm">{r.by_class.map((c) => <li key={c.class} className="flex justify-between py-1.5"><span>{c.class}</span><span className="text-right text-xs text-muted-foreground">{money(c.collected, cur)} of {money(c.assessed, cur)} · owes {money(c.outstanding, cur)}</span></li>)}</ul>
              </Panel>
              <Panel title="By period">
                <ul className="divide-y divide-border text-sm">{r.by_term.map((t) => <li key={t.term} className="flex justify-between py-1.5"><span>{t.term}</span><span className="text-right text-xs text-muted-foreground">{money(t.collected, cur)} of {money(t.assessed, cur)} · owes {money(t.outstanding, cur)}</span></li>)}</ul>
              </Panel>
              <Panel title="By fee category">
                <ul className="divide-y divide-border text-sm">{r.by_category.map((c) => <li key={c.category} className="flex justify-between py-1.5"><span>{c.category}</span><span className="font-medium">{money(c.amount, cur)}</span></li>)}</ul>
              </Panel>
              <Panel title="By payment method">
                <ul className="divide-y divide-border text-sm">{r.by_method.length === 0 ? <li className="py-1.5 text-muted-foreground">No payments yet.</li> : r.by_method.map((m) => <li key={m.method} className="flex justify-between py-1.5"><span>{methodLabel(m.method)} <span className="text-xs text-muted-foreground">· {m.payments}</span></span><span className="font-medium">{money(m.amount, cur)}</span></li>)}</ul>
              </Panel>
              <Panel title="Upcoming deadlines">
                {r.upcoming_deadlines.length === 0 ? <p className="text-sm text-muted-foreground">No unpaid accounts with a deadline ahead.</p> : <ul className="divide-y divide-border text-sm">{r.upcoming_deadlines.map((d) => <li key={d.due_on} className="flex justify-between py-1.5"><span>{new Date(`${d.due_on}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span><span className="text-xs text-muted-foreground">{d.accounts} account{d.accounts === 1 ? "" : "s"} · {money(d.outstanding, cur)}</span></li>)}</ul>}
              </Panel>
              <Panel title="Recent adjustments">
                {r.recent_adjustments.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <ul className="divide-y divide-border text-sm">{r.recent_adjustments.map((a, i) => <li key={i} className="py-1.5"><span className="font-medium capitalize">{a.kind}</span> {money(a.amount, cur)}<span className="block text-xs text-muted-foreground">{a.reason}</span></li>)}</ul>}
              </Panel>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
};

export default FeeReports;
