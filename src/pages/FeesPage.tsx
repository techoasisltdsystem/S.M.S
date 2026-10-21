import { useMemo, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, DollarSign, FileSpreadsheet, FilePlus2, Layers, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import OnlinePayments from "@/components/fees/OnlinePayments";
import FeePeriods from "@/components/fees/FeePeriods";
import FeeReports from "@/components/fees/FeeReports";
import FeeSettingsPanel from "@/components/fees/FeeSettingsPanel";
import { loadStatement, useClassStatus, usePeriods } from "@/hooks/useFeeAdmin";
import { statementPdf } from "@/lib/reports";
import InvoiceDialog, { StatusChip, STATUS_LABEL } from "@/components/fees/InvoiceDialog";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { PAGE, money, useFeeActions, useFeeStructures, useFeeSummary, useInvoices, type FeeStructure } from "@/hooks/useFees";
import { useClasses, useDirectory, useGuardianLinks } from "@/hooks/useSchoolData";
import { rpc } from "@/lib/rpc";
import { downloadCsv } from "@/lib/reports";
import { cn } from "@/lib/utils";

const day = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ANY = "__any";

const InvoiceTable = ({ rows, onOpen, showStudent }: { rows: ReturnType<typeof useInvoices>["data"]; onOpen: (id: string) => void; showStudent: boolean }) => (
  <div className="overflow-x-auto">
    <table className="w-full min-w-[640px] text-sm">
      <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
        <th className="py-2 pr-3 font-medium">Invoice</th>{showStudent && <th className="px-3 py-2 font-medium">Student</th>}
        <th className="px-3 py-2 font-medium">Due</th><th className="px-3 py-2 text-right font-medium">Total</th><th className="px-3 py-2 text-right font-medium">Balance</th><th className="px-3 py-2 font-medium">Status</th>
      </tr></thead>
      <tbody>
        {(rows ?? []).map((r) => (
          <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50" onClick={() => onOpen(r.id)}>
            <td className="py-2.5 pr-3"><button className="font-medium text-primary hover:underline focus:underline focus:outline-none" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }}>{r.number}</button><span className="block text-xs text-muted-foreground">{r.title}</span></td>
            {showStudent && <td className="px-3 py-2.5">{r.student_name}<span className="block text-xs text-muted-foreground">{r.class_name ?? "No class"}</span></td>}
            <td className={cn("px-3 py-2.5", r.status === "overdue" && "text-destructive")}>{day(r.due_on)}</td>
            <td className="px-3 py-2.5 text-right">{money(r.total)}</td>
            <td className="px-3 py-2.5 text-right font-medium">{money(r.balance)}</td>
            <td className="px-3 py-2.5"><StatusChip status={r.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const NewInvoiceDialog = ({ open, onClose, schoolId }: { open: boolean; onClose: () => void; schoolId: string }) => {
  const { toast } = useToast();
  const people = useDirectory(schoolId);
  const { createInvoice } = useFeeActions(schoolId);
  const [student, setStudent] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(plusDays(30));
  const [lines, setLines] = useState([{ description: "", amount: "" }]);
  const students = useMemo(() => (people.data ?? []).filter((p) => p.roles.includes("student")), [people.data]);
  const total = lines.reduce((n, l) => n + (Number(l.amount) || 0), 0);
  const valid = student && title.trim() && lines.every((l) => l.description.trim() && Number(l.amount) > 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">New invoice</DialogTitle><DialogDescription>For one student. Their verified parents are notified (the notice names the invoice number, never an amount).</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ni-student">Student</Label>
            <Select value={student} onValueChange={setStudent}>
              <SelectTrigger id="ni-student"><SelectValue placeholder="Choose a student" /></SelectTrigger>
              <SelectContent>{students.map((s) => <SelectItem key={s.profile_id} value={s.profile_id}>{s.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="ni-title">Title</Label><Input id="ni-title" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="ni-due">Due date</Label><Input id="ni-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Lines</p>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
                <Input aria-label="Description" placeholder="Description" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <Input aria-label="Amount" placeholder="Amount" inputMode="decimal" value={l.amount} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" disabled={lines.length >= 20} onClick={() => setLines([...lines, { description: "", amount: "" }])}><Plus className="mr-1 h-4 w-4" /> Add line</Button>
              <p className="text-sm font-semibold">Total {money(total)}</p>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || createInvoice.isPending}
            onClick={async () => {
              try {
                await createInvoice.mutateAsync({ student, title: title.trim(), dueOn: due, lines: lines.map((l) => ({ description: l.description.trim(), amount: Number(l.amount) })) });
                toast({ title: "Invoice created" });
                setTitle(""); setLines([{ description: "", amount: "" }]); setStudent("");
                onClose();
              } catch (e) { toast({ title: "Not created", description: errMsg(e), variant: "destructive" }); }
            }}>
            {createInvoice.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Create invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const StructureDialog = ({ schoolId, item, onClose }: { schoolId: string; item: FeeStructure | "new" | null; onClose: () => void }) => {
  const { toast } = useToast();
  const classes = useClasses(schoolId);
  const { saveStructure } = useFeeActions(schoolId);
  const periods = usePeriods(schoolId);
  const [f, setF] = useState({ name: "", description: "", amount: "", classId: ANY, termId: "", dueOn: plusDays(30), active: true });
  const [seed, setSeed] = useState<unknown>(null);
  if (item !== seed) {
    setSeed(item);
    if (item === "new") setF({ name: "", description: "", amount: "", classId: ANY, termId: "", dueOn: plusDays(30), active: true });
    else if (item) setF({ name: item.name, description: item.description ?? "", amount: String(item.amount), classId: item.class_id ?? ANY, termId: (item as { term_id?: string | null }).term_id ?? "", dueOn: item.due_on, active: item.is_active });
  }
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">{item === "new" ? "New fee" : "Edit fee"}</DialogTitle><DialogDescription>A named charge you can turn into invoices for a class. Changing the amount does not change invoices already issued.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="fs-name">Name</Label><Input id="fs-name" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="fs-desc">Description (optional)</Label><Textarea id="fs-desc" rows={2} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="fs-amt">Amount per student</Label><Input id="fs-amt" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="fs-due">Due date</Label><Input id="fs-due" type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} /></div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fs-class">Applies to</Label>
            <Select value={f.classId} onValueChange={(v) => setF({ ...f, classId: v })}>
              <SelectTrigger id="fs-class"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value={ANY}>Any class</SelectItem>{(classes.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fs-term">Academic period (optional)</Label>
            <select id="fs-term" value={f.termId} onChange={(e) => setF({ ...f, termId: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Not linked to a period</option>
              {(periods.data?.terms ?? []).filter((t) => t.status !== "closed").map((t) => <option key={t.id} value={t.id}>{(periods.data?.years ?? []).find((y) => y.id === t.academic_year_id)?.name} · {t.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Invoices raised from a linked fee take that period&apos;s fee due date, and move with it if the school changes it.</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Active (can be used to generate invoices)</label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.name.trim() || !(Number(f.amount) > 0) || saveStructure.isPending}
            onClick={async () => {
              try {
                await saveStructure.mutateAsync({ id: item === "new" || !item ? null : item.id, name: f.name.trim(), description: f.description.trim(), amount: Number(f.amount), classId: f.classId === ANY ? null : f.classId, termId: f.termId || null, dueOn: f.dueOn, active: f.active });
                toast({ title: "Fee saved" });
                onClose();
              } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
            }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const GenerateDialog = ({ schoolId, item, onClose }: { schoolId: string; item: FeeStructure | null; onClose: () => void }) => {
  const { toast } = useToast();
  const classes = useClasses(schoolId);
  const { generate } = useFeeActions(schoolId);
  const [classId, setClassId] = useState("");
  const list = (classes.data ?? []).filter((c) => !item?.class_id || c.id === item.class_id);
  const chosen = classId || list[0]?.id || "";
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Generate invoices</DialogTitle><DialogDescription>{item?.name}: {item ? money(item.amount) : ""} for each student in the class. Students who already have this invoice are skipped.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="gen-class">Class</Label>
          <Select value={chosen} onValueChange={setClassId}>
            <SelectTrigger id="gen-class"><SelectValue placeholder="Choose a class" /></SelectTrigger>
            <SelectContent>{list.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!chosen || generate.isPending}
            onClick={async () => {
              try {
                const r = await generate.mutateAsync({ structure: item!.id, classId: chosen });
                toast({ title: `${r.created} invoice${r.created === 1 ? "" : "s"} created`, description: r.skipped ? `${r.skipped} student${r.skipped === 1 ? "" : "s"} already had one.` : undefined });
                onClose();
              } catch (e) { toast({ title: "Not generated", description: errMsg(e), variant: "destructive" }); }
            }}>
            {generate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const StaffFees = ({ schoolId }: { schoolId: string }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const summary = useFeeSummary(schoolId, true);
  const structures = useFeeStructures(schoolId, true);
  const { remind } = useFeeActions(schoolId);
  const [status, setStatus] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const invoices = useInvoices(schoolId, { status, search, page });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | "new" | null>(null);
  const [generating, setGenerating] = useState<FeeStructure | null>(null);
  const s = summary.data;
  const rows = invoices.data ?? [];
  const total = rows[0]?.total_rows ?? 0;
  const canInvoice = can("fees.invoice");

  const exportCsv = async () => {
    try {
      const all = await rpc<NonNullable<typeof invoices.data>>("list_invoices", { _school: schoolId, _student: null, _status: status || null, _search: search.trim() || null, _limit: 200, _offset: 0 });
      downloadCsv("invoices.csv", ["Invoice", "Student", "Class", "Title", "Issued", "Due", "Total", "Paid", "Balance", "Status"],
        all.map((r) => [r.number, r.student_name, r.class_name, r.title, r.issued_on, r.due_on, r.total, r.paid, r.balance, STATUS_LABEL[r.status]]));
      toast({ title: "Export ready", description: all.length === 200 ? "The first 200 invoices matching your filters." : undefined });
    } catch (e) { toast({ title: "Could not export", description: errMsg(e), variant: "destructive" }); }
  };

  return (
    <>
      <Tabs defaultValue="overview">
        <TabsList><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="fees">Fee structures</TabsTrigger><TabsTrigger value="online">Online payments</TabsTrigger><TabsTrigger value="reports">Reports</TabsTrigger><TabsTrigger value="periods">Periods</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          {summary.isLoading && <LoadingRows rows={3} />}
          {summary.isError && <ErrorBox message={errMsg(summary.error)} onRetry={() => summary.refetch()} />}
          {s && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[["Billed", money(s.billed), ""], ["Collected", money(s.collected), "text-success"], ["Outstanding", money(s.outstanding), ""], ["Overdue", money(s.overdue_amount), s.overdue_count ? "text-destructive" : ""]].map(([label, value, tone]) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-card"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("font-heading text-xl font-bold", tone)}>{value}</p></div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{s.invoices} invoice{s.invoices === 1 ? "" : "s"} · {s.paid_in_full} paid in full · {s.overdue_count} overdue{s.billed > 0 ? ` · ${Math.round((s.collected / s.billed) * 100)}% collected` : ""}</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="By class" icon={Users}>
                  {s.by_class.length === 0 ? <EmptyState icon={Users} title="Nothing billed yet" /> : (
                    <ul className="space-y-3">
                      {s.by_class.map((c) => {
                        const pct = c.billed ? Math.round((c.collected / c.billed) * 100) : 0;
                        return (
                          <li key={c.class}>
                            <div className="flex justify-between text-sm"><span className="font-medium">{c.class}</span><span className="text-muted-foreground">{money(c.collected)} of {money(c.billed)}</span></div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.class} collected`}><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
                <Panel title="Recent payments" icon={DollarSign}>
                  {s.recent_payments.length === 0 ? <EmptyState icon={DollarSign} title="No payments yet" /> : (
                    <ul className="divide-y divide-border text-sm">
                      {s.recent_payments.map((p) => <li key={p.receipt} className="flex justify-between gap-2 py-2"><span>{p.student}<span className="block text-xs text-muted-foreground">{p.receipt} · {day(p.paid_on)}</span></span><span className="font-medium">{money(p.amount)}</span></li>)}
                    </ul>
                  )}
                </Panel>
              </div>
              {canInvoice && (
                <Button variant="outline" disabled={remind.isPending || s.overdue_count === 0}
                  onClick={async () => { try { const n = await remind.mutateAsync(undefined as never); toast({ title: n ? `${n} reminder${n === 1 ? "" : "s"} sent` : "No reminders due", description: n ? undefined : "Each overdue invoice is reminded at most once a week." }); } catch (e) { toast({ title: "Not sent", description: errMsg(e), variant: "destructive" }); } }}>
                  <BellRing className="mr-2 h-4 w-4" aria-hidden /> Remind parents of overdue invoices
                </Button>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <Panel title="Invoices" icon={FilePlus2}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <form className="relative min-w-52 flex-1" onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft); setPage(0); }}>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input className="pl-9" placeholder="Search by student, number or title" aria-label="Search invoices" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} onBlur={() => { setSearch(searchDraft); setPage(0); }} />
              </form>
              <Select value={status || ANY} onValueChange={(v) => { setStatus(v === ANY ? "" : v); setPage(0); }}>
                <SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>All statuses</SelectItem>{(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((k) => <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCsv}><FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden /> Export CSV</Button>
              {canInvoice && <Button onClick={() => setCreating(true)}><Plus className="mr-2 h-4 w-4" aria-hidden /> New invoice</Button>}
            </div>
            {invoices.isLoading && <LoadingRows />}
            {invoices.isError && <ErrorBox message={errMsg(invoices.error)} onRetry={() => invoices.refetch()} />}
            {!invoices.isLoading && !invoices.isError && rows.length === 0 && <EmptyState icon={FilePlus2} title="No invoices match" text="Create a fee under Fee structures and generate invoices for a class, or raise one invoice." />}
            {rows.length > 0 && <InvoiceTable rows={rows} onOpen={setOpenId} showStudent />}
            {total > PAGE && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                <span className="text-muted-foreground">Page {page + 1} of {Math.ceil(total / PAGE)}</span>
                <Button size="icon" variant="outline" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" aria-label="Next page" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </Panel>
        </TabsContent>

        <TabsContent value="online" className="mt-4"><OnlinePayments schoolId={schoolId} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><FeeReports schoolId={schoolId} /></TabsContent>
        <TabsContent value="periods" className="mt-4"><FeePeriods schoolId={schoolId} /></TabsContent>
        <TabsContent value="settings" className="mt-4"><FeeSettingsPanel schoolId={schoolId} /></TabsContent>

        <TabsContent value="fees" className="mt-4">
          <Panel title="Fee structures" icon={Layers}>
            {canInvoice && <div className="mb-3 flex justify-end"><Button onClick={() => setEditing("new")}><Plus className="mr-2 h-4 w-4" aria-hidden /> New fee</Button></div>}
            {structures.isLoading && <LoadingRows />}
            {structures.isError && <ErrorBox message={errMsg(structures.error)} onRetry={() => structures.refetch()} />}
            {!structures.isLoading && (structures.data ?? []).length === 0 && <EmptyState icon={Layers} title="No fees set up" text="A fee is a named charge, like Tuition Term 1, that you turn into invoices for a class." />}
            <ul className="divide-y divide-border">
              {(structures.data ?? []).map((f) => (
                <li key={f.id} className={cn("flex flex-wrap items-center gap-3 py-3", !f.is_active && "opacity-60")}>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{f.name} · {money(f.amount)}</span><span className="text-xs text-muted-foreground">{f.class_name ?? "Any class"} · due {day(f.due_on)} · {f.invoiced} invoice{f.invoiced === 1 ? "" : "s"}{f.is_active ? "" : " · inactive"}</span></span>
                  {canInvoice && <><Button size="sm" variant="outline" onClick={() => setEditing(f)}>Edit</Button><Button size="sm" disabled={!f.is_active} onClick={() => setGenerating(f)}>Generate invoices</Button></>}
                </li>
              ))}
            </ul>
          </Panel>
        </TabsContent>
      </Tabs>
      <InvoiceDialog schoolId={schoolId} id={openId} onClose={() => setOpenId(null)} />
      <NewInvoiceDialog open={creating} onClose={() => setCreating(false)} schoolId={schoolId} />
      <StructureDialog schoolId={schoolId} item={editing} onClose={() => setEditing(null)} />
      <GenerateDialog schoolId={schoolId} item={generating} onClose={() => setGenerating(null)} />
    </>
  );
};

const StatementButton = ({ schoolId, student }: { schoolId: string; student: string }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
      setBusy(true);
      try { statementPdf(await loadStatement(schoolId, student)); } catch (e) { toast({ title: "Could not make the statement", description: errMsg(e), variant: "destructive" }); } finally { setBusy(false); }
    }}>Download fee statement (PDF)</Button>
  );
};

const STATUS_TEXT: Record<string, string> = { none: "No fees", overdue: "Overdue", part_paid: "Partly paid", not_yet_due: "Not yet due", paid: "Paid" };

/** A teacher the school has allowed to see fee status: a one-word status per student of their class, no amounts or history. */
const TeacherStatus = ({ schoolId }: { schoolId: string }) => {
  const classes = useClasses(schoolId);
  const [cls, setCls] = useState("");
  const q = useClassStatus(schoolId, cls);
  return (
    <Panel title="Fee status of my class" icon={DollarSign}>
      <div className="mb-3 max-w-xs space-y-2"><Label htmlFor="ts-class">Class</Label>
        <select id="ts-class" value={cls} onChange={(e) => setCls(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Choose a class</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      <ul className="divide-y divide-border text-sm">{(q.data ?? []).map((r) => <li key={r.student_id} className="flex justify-between py-2"><span>{r.student_name}</span><span className={r.status === "overdue" ? "font-medium text-destructive" : r.status === "paid" ? "text-success" : "text-muted-foreground"}>{STATUS_TEXT[r.status]}</span></li>)}</ul>
      <p className="mt-3 text-xs text-muted-foreground">You can see only a status. Amounts, payments and receipts are for the school office and the family.</p>
    </Panel>
  );
};

/** A student sees their own fees only. Paying is offered only when the school allows it. */
const StudentFees = ({ schoolId, me }: { schoolId: string; me: string }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const invoices = useInvoices(schoolId, { student: me });
  const owed = (invoices.data ?? []).reduce((n, r) => n + r.balance, 0);
  return (
    <div className="space-y-4">
      <Panel title="My fees" icon={DollarSign}>
        {invoices.isLoading && <LoadingRows rows={2} />}
        {invoices.isError && <ErrorBox message={errMsg(invoices.error)} onRetry={() => invoices.refetch()} />}
        {!invoices.isLoading && (invoices.data ?? []).length === 0 && <EmptyState icon={DollarSign} title="No invoices" text="Invoices the school issues for you appear here." />}
        {(invoices.data ?? []).length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Total outstanding: <span className="font-semibold">{money(owed)}</span></p><StatementButton schoolId={schoolId} student={me} /></div>
            <InvoiceTable rows={invoices.data} onOpen={setOpenId} showStudent={false} />
          </>
        )}
      </Panel>
      <InvoiceDialog schoolId={schoolId} id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

const ParentFees = ({ schoolId, me }: { schoolId: string; me: string }) => {
  const links = useGuardianLinks(schoolId);
  const people = useDirectory(schoolId);
  const [picked, setPicked] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const children = useMemo(() => (links.data ?? []).filter((l) => l.guardian_id === me && l.status === "verified"), [links.data, me]);
  const child = children.some((c) => c.student_id === picked) ? picked : children[0]?.student_id ?? null;
  const invoices = useInvoices(schoolId, { student: child });
  const name = (id: string) => (people.data ?? []).find((p) => p.profile_id === id)?.full_name ?? "Child";
  const owed = (invoices.data ?? []).reduce((n, r) => n + r.balance, 0);

  if (links.isLoading) return <LoadingRows rows={2} />;
  if (children.length === 0) return <EmptyState icon={Users} title="No verified children yet" text="The school must verify your link to your child before you can see their fees." />;
  return (
    <div className="space-y-4">
      {children.length > 1 && (
        <div className="max-w-xs space-y-2"><Label htmlFor="fee-child">Child</Label>
          <Select value={child ?? ""} onValueChange={setPicked}>
            <SelectTrigger id="fee-child"><SelectValue /></SelectTrigger>
            <SelectContent>{children.map((c) => <SelectItem key={c.student_id} value={c.student_id}>{name(c.student_id)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <Panel title={`Fees for ${child ? name(child) : "your child"}`} icon={DollarSign}>
        {invoices.isLoading && <LoadingRows rows={2} />}
        {invoices.isError && <ErrorBox message={errMsg(invoices.error)} onRetry={() => invoices.refetch()} />}
        {!invoices.isLoading && (invoices.data ?? []).length === 0 && <EmptyState icon={DollarSign} title="No invoices" text="Invoices the school issues for your child appear here." />}
        {(invoices.data ?? []).length > 0 && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Total outstanding for {child ? name(child) : "your child"}: <span className="font-semibold">{money(owed)}</span></p>{child && <StatementButton schoolId={schoolId} student={child} />}</div>
            <InvoiceTable rows={invoices.data} onOpen={setOpenId} showStudent={false} />
            <p className="mt-3 text-xs text-muted-foreground">Open an invoice to pay online with Paystack. Payments made at the school office are recorded here by the school, and every confirmed payment has a receipt.</p>
          </>
        )}
      </Panel>
      <InvoiceDialog schoolId={schoolId} id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
};

const FeesPage = () => {
  const { user, can } = useAuth();
  const schoolId = user?.schoolId ?? "";
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Fees and payments</h1>
          <p className="text-sm text-muted-foreground">{user?.role === "parent" ? "Your children's invoices, payments and receipts." : "Fee structures, invoices, payments received and what is still owed."}</p>
        </div>
        {!user || user.role === "platform" ? (
          <EmptyState icon={DollarSign} title="Not available" text="Fees belong to a school. Sign in with a school account." />
        ) : can("fees.view") ? (
          <StaffFees schoolId={schoolId} />
        ) : user.role === "parent" ? (
          <ParentFees schoolId={schoolId} me={user.id} />
        ) : user.role === "student" ? (
          <StudentFees schoolId={schoolId} me={user.id} />
        ) : can("fees.status") ? (
          <TeacherStatus schoolId={schoolId} />
        ) : (
          <EmptyState icon={DollarSign} title="No access to fees" text="Fees are visible to the school's finance office, to parents for their own children and to students for themselves." />
        )}
      </div>
    </DashboardLayout>
  );
};

export default FeesPage;
