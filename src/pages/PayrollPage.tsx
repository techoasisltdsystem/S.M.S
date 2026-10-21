import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, Circle, Clock, Download, FileText, HandCoins, Loader2, MinusCircle, Plus, PlusCircle, Search, UserPlus, Wallet } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import BarChart from "@/components/kit/BarChart";
import { PageHeader, QuickActions, StatusPill, TableCard, td, th } from "@/components/kit/Dash";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { money } from "@/hooks/useFees";
import { relative } from "@/hooks/useSchoolData";
import { payslipPdf } from "@/lib/reports";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";

interface Staff { profile_id: string; name: string; role: string; email: string | null; has_profile: boolean; basic_salary: number | null; currency: string | null; pay_grade: string | null; bank_name: string | null; account_name: string | null; account_number: string | null; tax_id: string | null; active: boolean; allowances: number; deductions: number; advance_balance: number }
interface Item { id: string; profile_id: string | null; staff: string | null; kind: "allowance" | "deduction"; name: string; calc: "fixed" | "percent"; amount: number; active: boolean }
interface Advance { id: string; staff: string; amount: number; months: number; monthly_deduction: number; balance: number; reason: string; status: string; requested_at: string; decided_by: string | null; decision_note: string | null; mine: boolean; can_decide: boolean }
interface Run { id: string; period: string; status: "draft" | "calculated" | "approved" | "paid" | "cancelled"; staff: number; gross: number; deductions: number; net: number; created_by: string | null; calculated_at: string | null; approved_by: string | null; approved_at: string | null; paid_at: string | null; payment_reference: string | null; can_approve: boolean }
interface Slip { id: string; number: string; staff: string; currency: string; basic: number; allowances: number; deductions: number; advance_deduction: number; gross: number; net: number; lines: { kind: string; name: string; amount: number }[]; bank: string | null; period?: string; paid_at?: string; school?: string }
interface Dash { current: { id: string; period: string; status: Run["status"]; gross: number; net: number; deductions: number; staff: number; created_at: string; created_by: string | null; calculated_at: string | null; approved_at: string | null; approved_by: string | null; paid_at: string | null } | null;
  staff_paid: number; staff_on_payroll: number; staff_total: number; pending_runs: number; advances_outstanding: number; advances_requested: number; by_month: { period: string; net: number }[] }

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const RUN: Record<Run["status"], { label: string; tone: "grey" | "blue" | "purple" | "green" | "red" }> = { draft: { label: "Draft", tone: "grey" }, calculated: { label: "Awaiting approval", tone: "blue" }, approved: { label: "Approved", tone: "purple" }, paid: { label: "Paid", tone: "green" }, cancelled: { label: "Cancelled", tone: "red" } };
const ADV: Record<string, "orange" | "green" | "red" | "grey"> = { requested: "orange", approved: "green", rejected: "red", repaid: "grey" };
const monthLabel = (p: string) => new Date(`${p}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** The payroll workflow as a status bar: each step is complete only when the database says so. */
const Steps = ({ c }: { c: NonNullable<Dash["current"]> }) => {
  const order: Run["status"][] = ["draft", "calculated", "approved", "paid"];
  const at = order.indexOf(c.status);
  const steps = [
    { name: "Calculations", done: at >= 1 }, { name: "Validations", done: at >= 1 }, { name: "Approvals", done: at >= 2 }, { name: "Disbursement", done: at >= 3 }, { name: "Paid", done: at >= 3 },
  ];
  const log = [
    { label: "Draft created", done: true, who: c.created_by, when: c.created_at },
    { label: "Calculations complete", done: !!c.calculated_at, who: "System", when: c.calculated_at },
    { label: c.approved_at ? `Approved by ${c.approved_by ?? "approver"}` : "Pending approval", done: !!c.approved_at, who: null, when: c.approved_at },
    { label: c.paid_at ? "Payment recorded" : "Bank disbursement", done: !!c.paid_at, who: null, when: c.paid_at },
  ];
  return (
    <div>
      <div className="grid grid-cols-5 gap-3">
        {steps.map((s) => (
          <div key={s.name}>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full bg-primary transition-all duration-700", s.done ? "w-full" : "w-0")} /></div>
            <p className="mt-1.5 text-xs font-medium">{s.name} <span className="text-muted-foreground">{s.done ? "100%" : "0%"}</span></p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {log.map((l) => (
          <li key={l.label} className="flex items-center justify-between gap-3 text-sm">
            <span className={cn("flex items-center gap-2", !l.done && "text-muted-foreground")}>{l.done ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <Circle className="h-4 w-4" aria-hidden />}{l.label}</span>
            <span className="text-xs text-muted-foreground">{l.when ? `${l.who ? `${l.who} · ` : ""}${new Date(l.when).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Awaiting…"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const SlipsTable = ({ slips, onDownload }: { slips: Slip[]; onDownload: (s: Slip) => void }) => (
  <table className="w-full"><thead><tr><th className={th}>Payslip</th><th className={th}>Staff</th><th className={th}>Basic</th><th className={th}>Allowances</th><th className={th}>Deductions</th><th className={th}>Net</th><th className={th} /></tr></thead>
    <tbody className="divide-y divide-border">{slips.map((s) => (
      <tr key={s.id}><td className={`${td} text-xs text-muted-foreground`}>{s.number}{s.period ? ` · ${monthLabel(s.period)}` : ""}</td><td className={`${td} font-medium`}>{s.staff}</td><td className={td}>{money(s.basic, s.currency)}</td>
        <td className={td}>{money(s.allowances, s.currency)}</td><td className={td}>{money(s.deductions + s.advance_deduction, s.currency)}</td><td className={`${td} font-semibold`}>{money(s.net, s.currency)}</td>
        <td className={`${td} text-right`}><Button size="sm" variant="ghost" onClick={() => onDownload(s)} aria-label={`Download payslip ${s.number}`}><Download className="h-4 w-4" /></Button></td></tr>
    ))}</tbody></table>
);

const PayrollPage = () => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sid = user!.schoolId;
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "dashboard";
  const manage = can("payroll.manage");
  const approve = can("payroll.approve");
  const officer = manage || approve;
  const refresh = () => ["pay-dash", "pay-staff", "pay-items", "pay-adv", "pay-runs", "pay-slips", "pay-activity", "my-slips"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  const dash = useQuery({ queryKey: ["pay-dash", sid], enabled: officer, queryFn: () => rpc<Dash>("payroll_dashboard", { _school: sid }) });
  const staff = useQuery({ queryKey: ["pay-staff", sid], enabled: manage, queryFn: () => rpc<Staff[]>("payroll_profiles_list", { _school: sid }) });
  const items = useQuery({ queryKey: ["pay-items", sid], enabled: manage, queryFn: () => rpc<Item[]>("payroll_items_list", { _school: sid }) });
  const advances = useQuery({ queryKey: ["pay-adv", sid], queryFn: () => rpc<Advance[]>("advances_list", { _school: sid }) });
  const runs = useQuery({ queryKey: ["pay-runs", sid], enabled: officer, queryFn: () => rpc<Run[]>("payroll_runs_list", { _school: sid }) });
  const activity = useQuery({ queryKey: ["pay-activity", sid], enabled: officer, queryFn: () => rpc<{ id: string; at: string; actor: string | null; action: string; target: string | null; details: Record<string, unknown> }[]>("payroll_activity", { _school: sid }) });
  const mySlips = useQuery({ queryKey: ["my-slips", sid], queryFn: () => rpc<Slip[]>("my_payslips", { _school: sid }) });
  const [runView, setRunView] = useState<string | null>(null);
  const slips = useQuery({ queryKey: ["pay-slips", runView], enabled: !!runView, queryFn: () => rpc<Slip[]>("payslips_for_run", { _run: runView }) });

  const act = useMutation({
    mutationFn: (v: { fn: string; args: Record<string, unknown>; ok: string }) => rpc<unknown>(v.fn, v.args).then((r) => ({ ok: v.ok, r })),
    onSuccess: ({ ok, r }) => {
      const w = (r as { warnings?: { staff: string; issue: string }[] } | null)?.warnings;
      toast({ title: ok, description: w && w.length ? `${w.length} warning(s): ${w.map((x) => `${x.staff}: ${x.issue}`).join("; ")}` : undefined });
      refresh();
    },
    onError: (e) => toast({ title: "Not done", description: errMsg(e), variant: "destructive" }),
  });

  // dialogs
  const [prof, setProf] = useState<{ s: Staff; basic: string; currency: string; grade: string; bank: string; aname: string; anum: string; tax: string; active: boolean } | null>(null);
  const [item, setItem] = useState<{ id: string | null; profile: string; kind: Item["kind"]; name: string; calc: Item["calc"]; amount: string; active: boolean } | null>(null);
  const [advReq, setAdvReq] = useState<{ amount: string; months: string; reason: string } | null>(null);
  const [newRun, setNewRun] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const download = (s: Slip, period?: string) => payslipPdf({ ...s, period: s.period ?? period ?? "", school: s.school ?? user!.schoolName });
  const runPeriod = (runs.data ?? []).find((r) => r.id === runView)?.period;

  const tabs = officer ? [
    { to: "/payroll", label: "Dashboard" }, ...(manage ? [{ to: "/payroll?tab=profiles", label: "Salary Profile" }] : []), { to: "/payroll?tab=runs", label: "Payroll" },
    { to: "/payroll?tab=payslips", label: "Payslips" }, { to: "/payroll?tab=advances", label: "Salary Advance" }, ...(manage ? [{ to: "/payroll?tab=items", label: "Allowances & Deductions" }] : []), { to: "/payroll?tab=audit", label: "Audit" },
  ] : [{ to: "/payroll", label: "My Payslips" }, { to: "/payroll?tab=advances", label: "Salary Advance" }];

  const d = dash.data;
  const c = d?.current;
  const myAdvanceOpen = (advances.data ?? []).some((a) => a.mine && (a.status === "requested" || a.status === "approved"));

  return (
    <DashboardLayout>
      <PageHeader title={officer ? "Payroll Management" : "My Payslips"} tabs={tabs}>
        {tab === "runs" && manage && <Button onClick={() => setNewRun(new Date().toISOString().slice(0, 7))}><Plus className="mr-1 h-4 w-4" aria-hidden /> New payroll</Button>}
        {tab === "items" && manage && <Button onClick={() => setItem({ id: null, profile: "", kind: "allowance", name: "", calc: "fixed", amount: "", active: true })}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add item</Button>}
        {tab === "advances" && !myAdvanceOpen && <Button variant="outline" onClick={() => setAdvReq({ amount: "", months: "3", reason: "" })}><HandCoins className="mr-1 h-4 w-4" aria-hidden /> Request advance</Button>}
      </PageHeader>

      {/* ---------- officer dashboard ---------- */}
      {officer && tab === "dashboard" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KitStat to="/payroll?tab=runs" icon={FileText} label="Monthly Payroll" value={c ? money(c.net) : null} sub={c ? `${monthLabel(c.period)} · net` : "No payroll yet"} />
            <KitStat delay={0.06} to="/payroll?tab=payslips" icon={Clock} tone="info" label="Staff Paid" value={d ? `${d.staff_paid}/${d.staff_on_payroll}` : null} sub={d ? `${d.staff_total} staff · last paid run` : undefined} />
            <KitStat delay={0.12} to="/payroll?tab=runs" icon={Clock} tone="warning" label="Pending Payments" value={d ? d.pending_runs : null} sub="Awaiting approval or payment" />
            <KitStat delay={0.18} to="/payroll?tab=advances" icon={HandCoins} tone="primary" label="Advances Outstanding" value={d ? money(d.advances_outstanding) : null} sub={d ? `${d.advances_requested} request(s) waiting` : undefined} />
            <KitStat delay={0.24} to="/payroll?tab=items" icon={MinusCircle} tone="destructive" label="Total Deductions" value={c ? money(c.deductions) : null} sub={c ? monthLabel(c.period) : undefined} />
          </div>
          <QuickActions text="Easily access important payroll tasks." actions={[
            ...(manage ? [{ to: "/payroll?tab=profiles", label: "Add Profile", icon: UserPlus, tone: "green" as const }] : []),
            { to: "/payroll?tab=payslips", label: "Payslip", icon: FileText, tone: "blue" as const },
            ...(manage ? [{ to: "/payroll?tab=items", label: "Allowance", icon: PlusCircle, tone: "purple" as const }, { to: "/payroll?tab=items", label: "Deductions", icon: MinusCircle, tone: "indigo" as const }] : []),
            { to: "/payroll?tab=advances", label: "Advances", icon: HandCoins, tone: "orange" as const },
          ]} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Panel title="Payroll Status" icon={Wallet} className="xl:col-span-2" link={{ to: "/payroll?tab=runs", label: "View" }}>
              {!c ? <EmptyState icon={Wallet} title="No payroll run yet" text="Create a payroll for the month, calculate it, have it approved, then record the payment." action={manage ? { to: "/payroll?tab=runs", label: "Start a payroll" } : undefined} /> : (
                <><p className="-mt-2 mb-4 flex items-center gap-2 text-sm"><span className="font-medium">{monthLabel(c.period)} Payroll</span><StatusPill tone={RUN[c.status].tone} dot>{RUN[c.status].label}</StatusPill></p><Steps c={c} /></>
              )}
            </Panel>
            <Panel title="Net pay by month" icon={Banknote}>
              {!d || d.by_month.length === 0 ? <EmptyState icon={Banknote} title="No paid payrolls yet" /> : <BarChart height={170} bars={d.by_month.map((m) => ({ label: m.period.slice(5), values: [Number(m.net)] }))} series={[{ name: "Net paid", color: "hsl(var(--primary))" }]} format={(n) => money(n)} />}
            </Panel>
          </div>
          <TableCard title="Recent Payroll Activities" count={activity.data?.length}>
            {(activity.data ?? []).length === 0 ? <p className="px-5 pb-4 text-sm text-muted-foreground">No payroll activity yet.</p> : (
              <table className="w-full"><thead><tr><th className={th}>User</th><th className={th}>Action</th><th className={th}>Timestamp</th></tr></thead>
                <tbody className="divide-y divide-border">{activity.data!.slice(0, 8).map((a) => (
                  <tr key={a.id}><td className={`${td} font-medium`}>{a.actor ?? "System"}</td>
                    <td className={td}>{a.action === "payroll_run" ? `${String(a.details.step ?? "updated").replace(/^./, (x) => x.toUpperCase())} payroll ${a.target}` : a.action === "payroll_advance" ? `Salary advance ${a.target}` : `Updated salary details: ${a.target}`}</td>
                    <td className={`${td} text-muted-foreground`}>{relative(a.at)}</td></tr>
                ))}</tbody></table>
            )}
          </TableCard>
        </div>
      )}

      {/* ---------- staff: my payslips ---------- */}
      {!officer && tab === "dashboard" && (
        <TableCard title="My Payslips" count={mySlips.data?.length}>
          {mySlips.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : mySlips.isError ? <div className="p-5"><ErrorBox message={errMsg(mySlips.error)} onRetry={() => mySlips.refetch()} /></div>
            : (mySlips.data ?? []).length === 0 ? <div className="p-5"><EmptyState icon={FileText} title="No payslips yet" text="Your payslip appears here once the school's payroll for the month is paid." /></div>
            : <SlipsTable slips={mySlips.data!} onDownload={(s) => download(s)} />}
        </TableCard>
      )}

      {/* ---------- salary profiles ---------- */}
      {manage && tab === "profiles" && (
        <TableCard title="Salary Profiles" count={staff.data?.filter((s) => s.has_profile).length} action={<div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label="Search staff" placeholder="Search staff…" className="h-9 w-52 pl-8" value={search} onChange={(e) => setSearch(e.target.value)} /></div>}>
          {staff.isLoading ? <div className="p-5"><LoadingRows rows={4} /></div> : (
            <table className="w-full"><thead><tr><th className={th}>Staff</th><th className={th}>Grade</th><th className={th}>Basic</th><th className={th}>Allowances</th><th className={th}>Deductions</th><th className={th}>Bank</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-border">{(staff.data ?? []).filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase())).map((s) => (
                <tr key={s.profile_id}>
                  <td className={td}><span className="font-medium">{s.name}</span><span className="block text-xs capitalize text-muted-foreground">{s.role?.replace(/_/g, " ")}</span></td>
                  <td className={td}>{s.pay_grade ?? "-"}</td><td className={td}>{s.basic_salary != null ? money(s.basic_salary, s.currency ?? "GHS") : "-"}</td>
                  <td className={td}>{s.has_profile ? money(s.allowances) : "-"}</td><td className={td}>{s.has_profile ? money(s.deductions) : "-"}</td>
                  <td className={`${td} text-xs`}>{s.bank_name ? `${s.bank_name} ····${(s.account_number ?? "").slice(-4)}` : <span className="text-warning">Not set</span>}</td>
                  <td className={td}>{!s.has_profile ? <StatusPill tone="grey">No profile</StatusPill> : s.active ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="red">Off payroll</StatusPill>}</td>
                  <td className={`${td} text-right`}><Button size="sm" variant="outline" onClick={() => setProf({ s, basic: s.basic_salary != null ? String(s.basic_salary) : "", currency: s.currency ?? "GHS", grade: s.pay_grade ?? "", bank: s.bank_name ?? "", aname: s.account_name ?? s.name, anum: s.account_number ?? "", tax: s.tax_id ?? "", active: s.has_profile ? s.active : true })}>{s.has_profile ? "Edit" : "Add profile"}</Button></td>
                </tr>
              ))}</tbody></table>
          )}
        </TableCard>
      )}

      {/* ---------- runs ---------- */}
      {officer && tab === "runs" && (
        <div className="space-y-4">
          <TableCard title="Payroll runs" count={runs.data?.length}>
            {runs.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : (runs.data ?? []).length === 0 ? <div className="p-5"><EmptyState icon={Wallet} title="No payroll yet" text="Start with New payroll for this month." /></div> : (
              <table className="w-full"><thead><tr><th className={th}>Month</th><th className={th}>Status</th><th className={th}>Staff</th><th className={th}>Gross</th><th className={th}>Deductions</th><th className={th}>Net</th><th className={th} /></tr></thead>
                <tbody className="divide-y divide-border">{runs.data!.map((r) => (
                  <tr key={r.id}>
                    <td className={td}><span className="font-medium">{monthLabel(r.period)}</span><span className="block text-xs text-muted-foreground">by {r.created_by ?? "-"}{r.approved_by ? ` · approved by ${r.approved_by}` : ""}{r.payment_reference ? ` · ref ${r.payment_reference}` : ""}</span></td>
                    <td className={td}><StatusPill tone={RUN[r.status].tone}>{RUN[r.status].label}</StatusPill></td><td className={td}>{r.staff}</td>
                    <td className={td}>{money(r.gross)}</td><td className={td}>{money(r.deductions)}</td><td className={`${td} font-semibold`}>{money(r.net)}</td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {manage && (r.status === "draft" || r.status === "calculated") && <Button size="sm" variant="outline" disabled={act.isPending} onClick={() => act.mutate({ fn: "payroll_run_calculate", args: { _run: r.id }, ok: r.status === "draft" ? "Payroll calculated" : "Payroll recalculated" })}>{r.status === "draft" ? "Calculate" : "Recalculate"}</Button>}
                      {r.can_approve && <Button size="sm" disabled={act.isPending} onClick={() => { if (window.confirm(`Approve ${monthLabel(r.period)} payroll: ${money(r.net)} net to ${r.staff} staff?`)) act.mutate({ fn: "payroll_run_approve", args: { _run: r.id }, ok: "Payroll approved" }); }}><BadgeCheck className="mr-1 h-4 w-4" aria-hidden /> Approve</Button>}
                      {r.status === "calculated" && !r.can_approve && <span className="mx-2 text-xs text-muted-foreground">Needs another approver</span>}
                      {manage && r.status === "approved" && <Button size="sm" onClick={() => { const ref = window.prompt("Bank transfer or batch reference (optional)", ""); if (ref !== null) act.mutate({ fn: "payroll_run_mark_paid", args: { _run: r.id, _reference: ref }, ok: "Payroll marked paid; staff can see their payslips" }); }}>Mark paid</Button>}
                      {r.staff > 0 && <Button size="sm" variant="ghost" onClick={() => setRunView(r.id)}>Payslips</Button>}
                      {manage && (r.status === "draft" || r.status === "calculated") && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm("Cancel this payroll run?")) act.mutate({ fn: "payroll_run_cancel", args: { _run: r.id }, ok: "Payroll cancelled" }); }}>Cancel</Button>}
                    </td>
                  </tr>
                ))}</tbody></table>
            )}
          </TableCard>
          <p className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> The person who creates or calculates a payroll cannot approve it. Marking a payroll paid records that the bank transfer was made; the system does not move money itself.</p>
        </div>
      )}

      {/* ---------- payslips ---------- */}
      {officer && tab === "payslips" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2"><Label htmlFor="ps-run">Payroll</Label>
            <select id="ps-run" className={`${sel} max-w-xs`} value={runView ?? ""} onChange={(e) => setRunView(e.target.value || null)}><option value="">Choose a month…</option>{(runs.data ?? []).filter((r) => r.staff > 0).map((r) => <option key={r.id} value={r.id}>{monthLabel(r.period)} · {RUN[r.status].label}</option>)}</select></div>
          {runView && <TableCard title="Payslips" count={slips.data?.length}>{slips.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : <SlipsTable slips={slips.data ?? []} onDownload={(s) => download(s, runPeriod)} />}</TableCard>}
          <TableCard title="My Payslips" count={mySlips.data?.length}>{(mySlips.data ?? []).length === 0 ? <p className="px-5 pb-4 text-sm text-muted-foreground">You have no paid payslips.</p> : <SlipsTable slips={mySlips.data!} onDownload={(s) => download(s)} />}</TableCard>
        </div>
      )}

      {/* ---------- advances ---------- */}
      {tab === "advances" && (
        <TableCard title="Salary Advance" count={advances.data?.length}>
          {advances.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : advances.isError ? <div className="p-5"><ErrorBox message={errMsg(advances.error)} onRetry={() => advances.refetch()} /></div> : (advances.data ?? []).length === 0 ? (
            <div className="p-5"><EmptyState icon={HandCoins} title="No advances" text="Request a salary advance; it is repaid in equal monthly deductions." /></div>
          ) : (
            <table className="w-full"><thead><tr><th className={th}>Staff</th><th className={th}>Amount</th><th className={th}>Repayment</th><th className={th}>Balance</th><th className={th}>Reason</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-border">{advances.data!.map((a) => (
                <tr key={a.id}><td className={`${td} font-medium`}>{a.staff}{a.mine && <span className="ml-1 text-xs text-primary">(you)</span>}</td><td className={td}>{money(a.amount)}</td>
                  <td className={`${td} text-xs`}>{money(a.monthly_deduction)} × {a.months} months</td><td className={td}>{money(a.balance)}</td><td className={`${td} max-w-xs text-xs text-muted-foreground`}>{a.reason}{a.decision_note ? ` · ${a.decision_note}` : ""}</td>
                  <td className={td}><StatusPill tone={ADV[a.status]}>{a.status.replace(/^./, (x) => x.toUpperCase())}</StatusPill></td>
                  <td className={`${td} whitespace-nowrap text-right`}>{a.can_decide && <>
                    <Button size="sm" onClick={() => act.mutate({ fn: "advance_decide", args: { _id: a.id, _approve: true, _note: null }, ok: "Advance approved" })}>Approve</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { const n = window.prompt("Reason for declining (optional)", ""); if (n !== null) act.mutate({ fn: "advance_decide", args: { _id: a.id, _approve: false, _note: n }, ok: "Advance declined" }); }}>Decline</Button></>}</td></tr>
              ))}</tbody></table>
          )}
        </TableCard>
      )}

      {/* ---------- allowances & deductions ---------- */}
      {manage && tab === "items" && (
        <TableCard title="Allowances & Deductions" count={items.data?.length} subtitle="Items for everyone apply to every salary profile; others to one person">
          {items.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : (items.data ?? []).length === 0 ? <div className="p-5"><EmptyState icon={PlusCircle} title="No allowances or deductions" text="Add transport or housing allowances, pension or tax deductions, fixed or as a percentage of basic salary." /></div> : (
            <table className="w-full"><thead><tr><th className={th}>Name</th><th className={th}>Type</th><th className={th}>Amount</th><th className={th}>Applies to</th><th className={th}>Status</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-border">{items.data!.map((i) => (
                <tr key={i.id}><td className={`${td} font-medium`}>{i.name}</td><td className={td}><StatusPill tone={i.kind === "allowance" ? "green" : "orange"}>{i.kind === "allowance" ? "Allowance" : "Deduction"}</StatusPill></td>
                  <td className={td}>{i.calc === "percent" ? `${i.amount}% of basic` : money(i.amount)}</td><td className={td}>{i.staff ?? "All staff"}</td>
                  <td className={td}>{i.active ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="grey">Off</StatusPill>}</td>
                  <td className={`${td} text-right`}><Button size="sm" variant="outline" onClick={() => setItem({ id: i.id, profile: i.profile_id ?? "", kind: i.kind, name: i.name, calc: i.calc, amount: String(i.amount), active: i.active })}>Edit</Button></td></tr>
              ))}</tbody></table>
          )}
        </TableCard>
      )}

      {/* ---------- audit ---------- */}
      {officer && tab === "audit" && (
        <TableCard title="Payroll audit trail" count={activity.data?.length}>
          {(activity.data ?? []).length === 0 ? <p className="px-5 pb-4 text-sm text-muted-foreground">Nothing recorded yet.</p> : (
            <table className="w-full"><thead><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Details</th></tr></thead>
              <tbody className="divide-y divide-border">{activity.data!.map((a) => (
                <tr key={a.id}><td className={`${td} whitespace-nowrap text-xs text-muted-foreground`}>{new Date(a.at).toLocaleString("en-GB")}</td><td className={td}>{a.actor ?? "System"}</td>
                  <td className={td}>{a.action.replace(/_/g, " ")} · {a.target}</td><td className={`${td} text-xs text-muted-foreground`}>{Object.entries(a.details ?? {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}</td></tr>
              ))}</tbody></table>
          )}
        </TableCard>
      )}

      {/* ---------- dialogs ---------- */}
      <Dialog open={!!prof} onOpenChange={(o) => { if (!o) setProf(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {prof && (
            <form onSubmit={(e) => { e.preventDefault(); act.mutate({ fn: "payroll_profile_save", args: { _school: sid, _profile: prof.s.profile_id, _basic: Number(prof.basic), _currency: prof.currency, _grade: prof.grade, _bank: prof.bank, _account_name: prof.aname, _account_number: prof.anum, _tax_id: prof.tax, _active: prof.active }, ok: "Salary profile saved" }); setProf(null); }}>
              <DialogHeader><DialogTitle>Salary profile · {prof.s.name}</DialogTitle><DialogDescription>Bank details are visible only to payroll staff. Changes are recorded in the audit trail.</DialogDescription></DialogHeader>
              <div className="my-4 grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="p-basic">Basic salary (monthly)</Label><Input id="p-basic" inputMode="decimal" value={prof.basic} onChange={(e) => setProf({ ...prof, basic: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-cur">Currency</Label><Input id="p-cur" maxLength={3} value={prof.currency} onChange={(e) => setProf({ ...prof, currency: e.target.value.toUpperCase() })} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-grade">Pay grade</Label><Input id="p-grade" value={prof.grade} onChange={(e) => setProf({ ...prof, grade: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-tax">Tax ID (TIN)</Label><Input id="p-tax" value={prof.tax} onChange={(e) => setProf({ ...prof, tax: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-bank">Bank</Label><Input id="p-bank" value={prof.bank} onChange={(e) => setProf({ ...prof, bank: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="p-aname">Account name</Label><Input id="p-aname" value={prof.aname} onChange={(e) => setProf({ ...prof, aname: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5"><Label htmlFor="p-anum">Account number</Label><Input id="p-anum" autoComplete="off" value={prof.anum} onChange={(e) => setProf({ ...prof, anum: e.target.value })} /></div>
                <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={prof.active} onChange={(e) => setProf({ ...prof, active: e.target.checked })} /> On payroll</label>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setProf(null)}>Cancel</Button><Button type="submit" disabled={!(Number(prof.basic) >= 0) || prof.basic === ""}>Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!item} onOpenChange={(o) => { if (!o) setItem(null); }}>
        <DialogContent>
          {item && (
            <form onSubmit={(e) => { e.preventDefault(); act.mutate({ fn: "payroll_item_save", args: { _school: sid, _id: item.id, _profile: item.profile || null, _kind: item.kind, _name: item.name, _calc: item.calc, _amount: Number(item.amount), _active: item.active }, ok: "Item saved" }); setItem(null); }}>
              <DialogHeader><DialogTitle>{item.id ? "Edit" : "Add"} allowance or deduction</DialogTitle><DialogDescription>Used the next time a payroll is calculated. Payrolls already approved do not change.</DialogDescription></DialogHeader>
              <div className="my-4 grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="i-kind">Type</Label><select id="i-kind" className={sel} value={item.kind} onChange={(e) => setItem({ ...item, kind: e.target.value as Item["kind"] })}><option value="allowance">Allowance</option><option value="deduction">Deduction</option></select></div>
                <div className="space-y-1.5"><Label htmlFor="i-name">Name</Label><Input id="i-name" placeholder="Transport, SSNIT, PAYE…" value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="i-calc">Calculation</Label><select id="i-calc" className={sel} value={item.calc} onChange={(e) => setItem({ ...item, calc: e.target.value as Item["calc"] })}><option value="fixed">Fixed amount</option><option value="percent">% of basic salary</option></select></div>
                <div className="space-y-1.5"><Label htmlFor="i-amt">{item.calc === "percent" ? "Percent" : "Amount"}</Label><Input id="i-amt" inputMode="decimal" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5"><Label htmlFor="i-who">Applies to</Label><select id="i-who" className={sel} value={item.profile} onChange={(e) => setItem({ ...item, profile: e.target.value })}><option value="">All staff on payroll</option>{(staff.data ?? []).filter((s) => s.has_profile).map((s) => <option key={s.profile_id} value={s.profile_id}>{s.name}</option>)}</select></div>
                <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={item.active} onChange={(e) => setItem({ ...item, active: e.target.checked })} /> Active</label>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setItem(null)}>Cancel</Button><Button type="submit" disabled={item.name.trim().length < 2 || !(Number(item.amount) > 0)}>Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!advReq} onOpenChange={(o) => { if (!o) setAdvReq(null); }}>
        <DialogContent>
          {advReq && (
            <form onSubmit={(e) => { e.preventDefault(); act.mutate({ fn: "advance_request", args: { _school: sid, _amount: Number(advReq.amount), _months: Number(advReq.months), _reason: advReq.reason }, ok: "Advance requested" }); setAdvReq(null); }}>
              <DialogHeader><DialogTitle>Request a salary advance</DialogTitle><DialogDescription>Up to three months of basic salary, repaid in equal monthly deductions from payroll. An approver other than you decides.</DialogDescription></DialogHeader>
              <div className="my-4 grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="a-amt">Amount</Label><Input id="a-amt" inputMode="decimal" value={advReq.amount} onChange={(e) => setAdvReq({ ...advReq, amount: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="a-m">Repay over (months)</Label><Input id="a-m" inputMode="numeric" value={advReq.months} onChange={(e) => setAdvReq({ ...advReq, months: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5"><Label htmlFor="a-r">Reason</Label><Textarea id="a-r" rows={3} value={advReq.reason} onChange={(e) => setAdvReq({ ...advReq, reason: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setAdvReq(null)}>Cancel</Button><Button type="submit" disabled={!(Number(advReq.amount) > 0) || advReq.reason.trim().length < 5}>Request</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!newRun} onOpenChange={(o) => { if (!o) setNewRun(null); }}>
        <DialogContent>
          {newRun !== null && (
            <form onSubmit={(e) => { e.preventDefault(); act.mutate({ fn: "payroll_run_create", args: { _school: sid, _period: newRun }, ok: "Payroll created; calculate it next" }); setNewRun(null); }}>
              <DialogHeader><DialogTitle>New payroll</DialogTitle><DialogDescription>One payroll per month. After creating it, calculate, then a second person approves, then record the payment.</DialogDescription></DialogHeader>
              <div className="my-4 space-y-1.5"><Label htmlFor="r-m">Month</Label><Input id="r-m" type="month" value={newRun} onChange={(e) => setNewRun(e.target.value)} /></div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setNewRun(null)}>Cancel</Button><Button type="submit" disabled={!/^\d{4}-\d{2}$/.test(newRun) || act.isPending}>{act.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Create</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!runView && tab === "runs"} onOpenChange={(o) => { if (!o) setRunView(null); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Payslips · {runPeriod ? monthLabel(runPeriod) : ""}</DialogTitle><DialogDescription>Calculated from salary profiles, allowances, deductions and approved advances.</DialogDescription></DialogHeader>
          {slips.isLoading ? <LoadingRows rows={3} /> : <SlipsTable slips={slips.data ?? []} onDownload={(s) => download(s, runPeriod)} />}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PayrollPage;
