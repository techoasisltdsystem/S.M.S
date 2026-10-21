import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, FileText, Loader2, Plus, Search } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import { PageHeader, StatusPill, TableCard, td, th } from "@/components/kit/Dash";
import { EmptyState } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDebounced } from "@/hooks/useDebounced";
import { useDirectory, useGuardianLinks } from "@/hooks/useSchoolData";
import { rpc } from "@/lib/rpc";

interface Concern { id: string; title: string; body: string; category: string; recipient: string; teacher: string | null; student: string; raised_by: string; status: "pending" | "in_review" | "resolved"; response: string | null; created_at: string; resolved_at: string | null; can_handle: boolean; total_rows: number }
const CATEGORIES: Record<string, string> = { academic: "Academic", behaviour: "Behaviour", bullying: "Bullying", attendance: "Attendance", welfare: "Welfare", facilities: "Facilities", other: "Other" };
const STATUS: Record<string, { label: string; tone: "orange" | "blue" | "green" }> = { pending: { label: "Pending", tone: "orange" }, in_review: { label: "In review", tone: "blue" }, resolved: { label: "Resolved", tone: "green" } };
const SIZE = 10;
const sel = "h-9 rounded-lg border border-input bg-background px-3 text-sm";
const date = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Concerns raised by students and parents, addressed to the principal or one of the student's teachers. */
const ConcernsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sid = user!.schoolId;
  const isFamily = user!.role === "student" || user!.role === "parent";
  const links = useGuardianLinks(sid);
  const people = useDirectory(sid);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(search, 300);
  const list = useQuery({ queryKey: ["concerns", sid, status, dq, page], placeholderData: (p) => p,
    queryFn: () => rpc<Concern[]>("concerns_list", { _school: sid, _status: status || null, _search: dq || null, _limit: SIZE, _offset: page * SIZE }) });
  const all = useQuery({ queryKey: ["concerns-all", sid], queryFn: () => rpc<Concern[]>("concerns_list", { _school: sid, _status: null, _search: null, _limit: 100, _offset: 0 }) });
  const rows = list.data ?? [];
  const total = Number(rows[0]?.total_rows ?? 0);
  const pages = Math.max(1, Math.ceil(total / SIZE));
  const counts = { total: all.data?.length ?? 0, pending: (all.data ?? []).filter((c) => c.status !== "resolved").length, resolved: (all.data ?? []).filter((c) => c.status === "resolved").length };
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["concerns"] }); void qc.invalidateQueries({ queryKey: ["concerns-all"] }); };

  // Who the concern can be about: the student themself, or a parent's verified children.
  const name = useMemo(() => new Map((people.data ?? []).map((p) => [p.profile_id, p.full_name])), [people.data]);
  const children = user!.role === "student" ? [{ id: user!.id, name: user!.name }]
    : (links.data ?? []).filter((l) => l.guardian_id === user!.id && l.status === "verified").map((l) => ({ id: l.student_id, name: name.get(l.student_id) ?? "Child" }));

  const [raising, setRaising] = useState(false);
  const [f, setF] = useState({ student: "", recipient: "principal", teacher: "", category: "academic", title: "", body: "" });
  const student = f.student || children[0]?.id || "";
  const teachers = useQuery({ queryKey: ["student-teachers", student], enabled: raising && !!student,
    queryFn: () => rpc<{ teachers: { id: string; name: string }[] }>("student_profile_extras", { _school: sid, _student: student }).then((r) => r.teachers ?? []) });
  const [error, setError] = useState<string | null>(null);
  const submit = useMutation({
    mutationFn: () => rpc("concern_submit", { _school: sid, _student: student, _recipient: f.recipient, _teacher: f.recipient === "teacher" ? f.teacher : null, _category: f.category, _title: f.title, _body: f.body }),
    onSuccess: () => { toast({ title: "Report sent", description: "You will be notified when it is answered." }); setRaising(false); setF({ student: "", recipient: "principal", teacher: "", category: "academic", title: "", body: "" }); refresh(); },
    onError: (e) => setError(errMsg(e)),
  });

  const [open, setOpen] = useState<Concern | null>(null);
  const [reply, setReply] = useState({ status: "in_review", response: "" });
  const respond = useMutation({
    mutationFn: () => rpc("concern_respond", { _id: open!.id, _status: reply.status, _response: reply.response }),
    onSuccess: () => { toast({ title: "Response saved", description: "The student and parent were notified." }); setOpen(null); refresh(); },
    onError: (e) => toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <PageHeader title="Reports">
        {isFamily && children.length > 0 && <Button onClick={() => { setError(null); setRaising(true); }}><Plus className="mr-1 h-4 w-4" aria-hidden /> New report</Button>}
      </PageHeader>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KitStat delay={0} icon={FileText} label="Total Reports" value={all.data ? counts.total : null} sub={isFamily ? "Raised by you or about you" : "Addressed to you"} />
        <KitStat delay={0.06} icon={Clock} tone="warning" label="Pending Report" value={all.data ? counts.pending : null} sub="Waiting or being reviewed" />
        <KitStat delay={0.12} icon={CheckCircle2} tone="success" label="Resolved Report" value={all.data ? counts.resolved : null} sub="Answered and closed" />
      </div>
      <TableCard title="Report" count={total} action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label="Search reports" placeholder="Search report…" className="h-9 w-52 pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div>
          <select aria-label="Status" className={sel} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">All Status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </div>
      }>
        {list.isLoading && <div className="p-5"><LoadingRows rows={4} /></div>}
        {list.isError && <div className="p-5"><ErrorBox message={errMsg(list.error)} onRetry={() => list.refetch()} /></div>}
        {list.data && rows.length === 0 && <div className="p-5"><EmptyState icon={FileText} title="No reports" text={isFamily ? "Raise a concern with the principal or a teacher and track it here." : "Concerns addressed to you appear here."} /></div>}
        {rows.length > 0 && (
          <table className="w-full">
            <thead><tr><th className={th}>Report Title</th>{!isFamily && <th className={th}>Student</th>}<th className={th}>Recipient</th><th className={th}>Date</th><th className={th}>Status</th><th className={th}><span className="sr-only">Action</span></th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => { setOpen(c); setReply({ status: c.status === "pending" ? "in_review" : c.status, response: c.response ?? "" }); }}>
                  <td className={td}><span className="font-medium">{c.title}</span><span className="block text-xs text-muted-foreground">{CATEGORIES[c.category]}</span></td>
                  {!isFamily && <td className={td}>{c.student}</td>}
                  <td className={td}>{c.recipient === "principal" ? "Principal" : c.teacher ?? "Teacher"}</td>
                  <td className={`${td} text-muted-foreground`}>{date(c.created_at)}</td>
                  <td className={td}><StatusPill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</StatusPill></td>
                  <td className={`${td} text-right text-xs text-primary`}>Open</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next <ArrowRight className="ml-1 h-4 w-4" aria-hidden /></Button>
        </div>
      </TableCard>

      <Dialog open={raising} onOpenChange={(o) => { if (!o && !submit.isPending) setRaising(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); setError(null); submit.mutate(); }}>
            <DialogHeader><DialogTitle>New report</DialogTitle><DialogDescription>Raise a concern with the principal or one of the student&apos;s teachers. Only they, the student and the parent can see it.</DialogDescription></DialogHeader>
            <div className="my-4 space-y-3">
              {children.length > 1 && <div className="space-y-1.5"><Label htmlFor="cn-student">About</Label><select id="cn-student" className={`${sel} w-full`} value={student} onChange={(e) => setF({ ...f, student: e.target.value, teacher: "" })}>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="cn-to">Send to</Label><select id="cn-to" className={`${sel} w-full`} value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })}><option value="principal">Principal</option><option value="teacher">A teacher</option></select></div>
                <div className="space-y-1.5"><Label htmlFor="cn-cat">Category</Label><select id="cn-cat" className={`${sel} w-full`} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              {f.recipient === "teacher" && (
                <div className="space-y-1.5"><Label htmlFor="cn-teacher">Teacher</Label>
                  <select id="cn-teacher" className={`${sel} w-full`} value={f.teacher} onChange={(e) => setF({ ...f, teacher: e.target.value })}>
                    <option value="">{teachers.isLoading ? "Loading…" : "Choose a teacher"}</option>{(teachers.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              )}
              <div className="space-y-1.5"><Label htmlFor="cn-title">Title</Label><Input id="cn-title" maxLength={150} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="cn-body">Details</Label><Textarea id="cn-body" rows={5} maxLength={3000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
              {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setRaising(false)} disabled={submit.isPending}>Cancel</Button>
              <Button type="submit" disabled={submit.isPending || f.title.trim().length < 3 || f.body.trim().length < 5 || (f.recipient === "teacher" && !f.teacher)}>{submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send report</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o && !respond.isPending) setOpen(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {open && (
            <>
              <DialogHeader><DialogTitle>{open.title}</DialogTitle><DialogDescription>{CATEGORIES[open.category]} · about {open.student} · raised by {open.raised_by} on {date(open.created_at)}</DialogDescription></DialogHeader>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm">{open.body}</p>
              {open.response && !open.can_handle && <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm"><p className="mb-1 text-xs font-medium text-success">Response</p><p className="whitespace-pre-wrap">{open.response}</p></div>}
              {open.can_handle ? (
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); respond.mutate(); }}>
                  <div className="space-y-1.5"><Label htmlFor="cr-status">Status</Label><select id="cr-status" className={`${sel} w-full`} value={reply.status} onChange={(e) => setReply({ ...reply, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="cr-resp">Response to the family</Label><Textarea id="cr-resp" rows={4} maxLength={3000} value={reply.response} onChange={(e) => setReply({ ...reply, response: e.target.value })} /></div>
                  <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(null)}>Close</Button><Button type="submit" disabled={respond.isPending}>{respond.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save</Button></DialogFooter>
                </form>
              ) : <DialogFooter><Button onClick={() => setOpen(null)}>Close</Button></DialogFooter>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ConcernsPage;
