import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, Loader2, Lock, Megaphone, Plus, Star } from "lucide-react";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePeriods, type TermRow, type YearRow } from "@/hooks/useFeeAdmin";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";

const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not set");
const STATUS: Record<string, string> = { draft: "Draft", published: "Published", completed: "Completed", archived: "Archived", closed: "Closed" };
const chip = (s: string) => (
  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", s === "published" ? "bg-success/10 text-success" : s === "draft" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{STATUS[s] ?? s}</span>
);
const blankYear = { id: null as string | null, name: "", starts: "", ends: "", status: "draft" };
const blankTerm = { id: null as string | null, year: "", name: "", starts: "", ends: "", due: "", days: "14, 7, 3, 0", exStart: "", exEnd: "", brStart: "", brEnd: "", fixedDue: false };

/** Academic years, terms or semesters, fee deadlines and reminder schedules. Closing a period keeps every invoice and payment. */
const FeePeriods = ({ schoolId }: { schoolId: string }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = usePeriods(schoolId);
  const edit = can("school.settings.manage");
  const [year, setYear] = useState<typeof blankYear | null>(null);
  const [term, setTerm] = useState<typeof blankTerm | null>(null);
  const [due, setDue] = useState<{ term: TermRow; date: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["periods"] }); void qc.invalidateQueries({ queryKey: ["current-period"] }); void qc.invalidateQueries({ queryKey: ["calendar-periods"] }); };

  const run = async (fn: () => Promise<unknown>, ok: string, after?: () => void) => {
    setBusy(true); setError(null);
    try { await fn(); toast({ title: ok }); refresh(); after?.(); }
    catch (e) { setError(errMsg(e)); toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };
  const days = (s: string) => s.split(/[ ,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n));

  const saveYear = () => run(() => rpc("save_academic_year", { _school: schoolId, _id: year!.id, _name: year!.name, _starts: year!.starts, _ends: year!.ends, _status: year!.status }), "Academic year saved", () => setYear(null));
  const saveTerm = () => run(() => rpc("save_term", {
    _school: schoolId, _id: term!.id, _year: term!.year, _name: term!.name, _starts: term!.starts, _ends: term!.ends, _fee_due: term!.due || null, _reminder_days: days(term!.days),
    _exams_start: term!.exStart || null, _exams_end: term!.exEnd || null, _break_start: term!.brStart || null, _break_end: term!.brEnd || null,
  }), "Period saved", () => setTerm(null));
  const openTerm = (t: TermRow | null, y: YearRow) => setTerm(t
    ? { id: t.id, year: t.academic_year_id, name: t.name, starts: t.starts_on, ends: t.ends_on, due: t.fee_due_on ?? "", days: (t.reminder_days ?? []).join(", "), exStart: t.exams_start ?? "", exEnd: t.exams_end ?? "", brStart: t.break_start ?? "", brEnd: t.break_end ?? "", fixedDue: true }
    : { ...blankTerm, year: y.id });

  const years = q.data?.years ?? [];
  return (
    <div className="space-y-4">
      <Panel title="Academic years and periods" icon={CalendarClock}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Each school sets its own structure: terms, semesters or other periods. Fee invoices follow their period&apos;s deadline, and reminders are sent from it.</p>
          {edit && <Button size="sm" onClick={() => { setError(null); setYear({ ...blankYear }); }}><Plus className="mr-1 h-4 w-4" aria-hidden /> Academic year</Button>}
        </div>
        {q.isLoading && <LoadingRows rows={3} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {q.data && years.length === 0 && <EmptyState icon={CalendarClock} title="No academic years yet" text="Create the year, add its terms or semesters, then publish the calendar." />}
        <div className="space-y-5">
          {years.map((y) => {
            const terms = (q.data?.terms ?? []).filter((t) => t.academic_year_id === y.id);
            return (
              <section key={y.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-heading font-semibold">{y.name} {chip(y.status)} {y.is_current && <span className="ml-1 inline-flex items-center gap-1 text-xs text-primary"><Star className="h-3 w-3" aria-hidden /> Current</span>}</p>
                  <p className="text-xs text-muted-foreground">{day(y.starts_on)} to {day(y.ends_on)}</p>
                </div>
                {edit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setError(null); setYear({ id: y.id, name: y.name, starts: y.starts_on, ends: y.ends_on, status: y.status }); }}>Edit year</Button>
                    <Button size="sm" variant="outline" onClick={() => openTerm(null, y)}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add term or semester</Button>
                    <Button size="sm" variant="outline" disabled={busy || terms.every((t) => t.status !== "draft") && y.status !== "draft"} onClick={() => run(() => rpc("publish_academic_calendar", { _year: y.id }), "Calendar published, the school was told")}><Megaphone className="mr-1 h-4 w-4" aria-hidden /> Publish calendar</Button>
                  </div>
                )}
                <ul className="mt-3 divide-y divide-border">
                  {terms.length === 0 && <li className="py-2 text-sm text-muted-foreground">No periods yet.</li>}
                  {terms.map((t) => (
                    <li key={t.id} className="space-y-1 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{t.name} {chip(t.status)} {t.is_current && <span className="ml-1 inline-flex items-center gap-1 text-xs text-primary"><Star className="h-3 w-3" aria-hidden /> Active now</span>}</span>
                        <span className="text-xs text-muted-foreground">{day(t.starts_on)} to {day(t.ends_on)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fees due {day(t.fee_due_on)} · reminders {t.reminder_days?.length ? t.reminder_days.map((d) => (d === 0 ? "on the day" : `${d} days before`)).join(", ") : "none"}
                        {t.exams_start ? ` · exams ${day(t.exams_start)} to ${day(t.exams_end)}` : ""}{t.break_start ? ` · break ${day(t.break_start)} to ${day(t.break_end)}` : ""}
                      </p>
                      {edit && t.status !== "closed" && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => { setError(null); openTerm(t, y); }}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => { setError(null); setDue({ term: t, date: t.fee_due_on ?? "", reason: "" }); }}><CalendarCheck className="mr-1 h-4 w-4" aria-hidden /> Change fee due date</Button>
                          {!t.is_current && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => rpc("set_current_period", { _school: schoolId, _year: y.id, _term: t.id }), "Active period changed")}>Make active</Button>}
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(`Close ${t.name}? Its invoices, payments and receipts stay exactly as they are, but the period can no longer be edited.`)) void run(() => rpc("close_term", { _term: t.id }), "Period closed"); }}><Lock className="mr-1 h-4 w-4" aria-hidden /> Close period</Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        {!edit && <p className="mt-3 text-xs text-muted-foreground">Only people who manage school settings can change periods.</p>}
      </Panel>

      <Dialog open={!!year} onOpenChange={(o) => { if (!o && !busy) setYear(null); }}>
        <DialogContent>
          {year && (
            <form onSubmit={(e) => { e.preventDefault(); void saveYear(); }}>
              <DialogHeader><DialogTitle>{year.id ? "Edit academic year" : "New academic year"}</DialogTitle><DialogDescription>For example 2026/2027. Years cannot overlap.</DialogDescription></DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="py-name">Name</Label><Input id="py-name" value={year.name} onChange={(e) => setYear({ ...year, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="py-s">Starts</Label><Input id="py-s" type="date" value={year.starts} onChange={(e) => setYear({ ...year, starts: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="py-e">Ends</Label><Input id="py-e" type="date" value={year.ends} onChange={(e) => setYear({ ...year, ends: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="py-st">Status</Label>
                  <select id="py-st" value={year.status} onChange={(e) => setYear({ ...year, status: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {Object.entries(STATUS).filter(([k]) => k !== "closed").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setYear(null)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !year.name || !year.starts || !year.ends}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!term} onOpenChange={(o) => { if (!o && !busy) setTerm(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {term && (
            <form onSubmit={(e) => { e.preventDefault(); void saveTerm(); }}>
              <DialogHeader><DialogTitle>{term.id ? "Edit period" : "New term or semester"}</DialogTitle><DialogDescription>Dates must sit inside the academic year and not overlap another period.</DialogDescription></DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="pt-name">Name</Label><Input id="pt-name" placeholder="Term 1, Semester 2…" value={term.name} onChange={(e) => setTerm({ ...term, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="pt-s">Starts</Label><Input id="pt-s" type="date" value={term.starts} onChange={(e) => setTerm({ ...term, starts: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pt-e">Ends</Label><Input id="pt-e" type="date" value={term.ends} onChange={(e) => setTerm({ ...term, ends: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pt-d">Fee due date</Label><Input id="pt-d" type="date" disabled={term.fixedDue} value={term.due} onChange={(e) => setTerm({ ...term, due: e.target.value })} />{term.fixedDue && <p className="text-xs text-muted-foreground">Use &quot;Change fee due date&quot; so families are told.</p>}</div>
                  <div className="space-y-1.5"><Label htmlFor="pt-r">Reminder days before</Label><Input id="pt-r" value={term.days} onChange={(e) => setTerm({ ...term, days: e.target.value })} /><p className="text-xs text-muted-foreground">0 means on the day.</p></div>
                  <div className="space-y-1.5"><Label htmlFor="pt-es">Exams start (optional)</Label><Input id="pt-es" type="date" value={term.exStart} onChange={(e) => setTerm({ ...term, exStart: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pt-ee">Exams end</Label><Input id="pt-ee" type="date" value={term.exEnd} onChange={(e) => setTerm({ ...term, exEnd: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pt-bs">Break starts (optional)</Label><Input id="pt-bs" type="date" value={term.brStart} onChange={(e) => setTerm({ ...term, brStart: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pt-be">Break ends</Label><Input id="pt-be" type="date" value={term.brEnd} onChange={(e) => setTerm({ ...term, brEnd: e.target.value })} /></div>
                </div>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setTerm(null)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !term.name || !term.starts || !term.ends}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!due} onOpenChange={(o) => { if (!o && !busy) setDue(null); }}>
        <DialogContent>
          {due && (
            <form onSubmit={(e) => { e.preventDefault(); void run(() => rpc<number>("set_term_fee_due", { _term: due.term.id, _due: due.date, _reason: due.reason }).then((n) => toast({ title: `${n} unpaid invoice${n === 1 ? "" : "s"} moved`, description: "Families were notified and reminders follow the new date." })), "Fee due date changed", () => setDue(null)); }}>
              <DialogHeader><DialogTitle>Change the fee due date of {due.term.name}</DialogTitle><DialogDescription>Unpaid invoices of this period move to the new date and their reminders restart. Paid invoices are left alone. The change and your reason are recorded.</DialogDescription></DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="pd-d">New due date</Label><Input id="pd-d" type="date" value={due.date} onChange={(e) => setDue({ ...due, date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="pd-r">Reason</Label><Textarea id="pd-r" rows={2} value={due.reason} onChange={(e) => setDue({ ...due, reason: e.target.value })} /></div>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setDue(null)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !due.date || due.reason.trim().length < 5}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Change date</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeePeriods;
