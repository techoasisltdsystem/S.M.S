import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Film, Link2, Loader2, Plus, Radio, Users, Video } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import BarChart from "@/components/kit/BarChart";
import { LineChart, PageHeader, StatusPill, TableCard, td, th } from "@/components/kit/Dash";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAssignments, useClasses, useSubjects } from "@/hooks/useSchoolData";
import { fmtDT } from "@/hooks/useCbt";
import { rpc } from "@/lib/rpc";

export interface VClass { id: string; title: string; description: string | null; class_name: string; subject: string | null; teacher: string; starts_at: string; duration_min: number;
  status: "scheduled" | "live" | "ended" | "cancelled"; can_host: boolean; can_join: boolean; participants: number; online: number; class_size: number; minutes: number | null; recordings: { id: string; title: string; url: string; at: string }[] }
interface Stats { total: number; live: number; upcoming_today: number; recordings: number; online: number; avg_minutes: number | null; by_month: { month: string; sessions: number; attendance: number | null }[] }
const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const STATUS: Record<VClass["status"], { label: string; tone: "red" | "blue" | "grey" | "purple" }> = { live: { label: "Live", tone: "red" }, scheduled: { label: "Scheduled", tone: "blue" }, ended: { label: "Ended", tone: "purple" }, cancelled: { label: "Cancelled", tone: "grey" } };
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Live online lessons: schedule, start, join, attendance and recordings. */
const VirtualClassPage = () => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sid = user!.schoolId;
  const upcoming = useQuery({ queryKey: ["vclass", sid, "upcoming"], queryFn: () => rpc<VClass[]>("vclass_list", { _school: sid, _scope: "upcoming" }), refetchInterval: 20_000 });
  const past = useQuery({ queryKey: ["vclass", sid, "past"], queryFn: () => rpc<VClass[]>("vclass_list", { _school: sid, _scope: "past" }) });
  const stats = useQuery({ queryKey: ["vclass-stats", sid], queryFn: () => rpc<Stats>("vclass_stats", { _school: sid }), refetchInterval: 30_000 });
  const assignments = useAssignments(sid);
  const classes = useClasses(sid);
  const subjects = useSubjects(sid);
  const mine = (assignments.data ?? []).filter((a) => a.teacher_id === user!.id);
  const manager = can("vclass.manage");
  const canCreate = manager || mine.length > 0;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["vclass"] }); void qc.invalidateQueries({ queryKey: ["vclass-stats"] }); };

  const act = useMutation({
    mutationFn: (v: { id: string; status: string }) => rpc("vclass_set_status", { _id: v.id, _status: v.status }),
    onSuccess: (_d, v) => { refresh(); if (v.status === "live") navigate(`/virtual-class/${v.id}`); else toast({ title: v.status === "ended" ? "Class ended" : "Class cancelled" }); },
    onError: (e) => toast({ title: "Not done", description: errMsg(e), variant: "destructive" }),
  });

  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ title: "", description: "", cls: "", subject: "", starts: localInput(new Date(Date.now() + 15 * 60000)), duration: "40" });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => rpc("vclass_save", { _school: sid, _id: null, _class: f.cls, _subject: f.subject || null, _title: f.title, _description: f.description, _starts: new Date(f.starts).toISOString(), _duration: Number(f.duration) }),
    onSuccess: () => { toast({ title: "Class scheduled", description: "Students in the class were notified." }); setCreating(false); refresh(); },
    onError: (e) => setError(errMsg(e)),
  });

  const [attendance, setAttendance] = useState<VClass | null>(null);
  const att = useQuery({ queryKey: ["vclass-att", attendance?.id], enabled: !!attendance, queryFn: () => rpc<{ profile_id: string; name: string; role: string; joined_at: string; minutes: number; online: boolean }[]>("vclass_attendance", { _id: attendance!.id }) });
  const [rec, setRec] = useState<{ v: VClass; title: string; url: string } | null>(null);
  const addRec = useMutation({
    mutationFn: () => rpc("vclass_add_recording", { _id: rec!.v.id, _title: rec!.title, _url: rec!.url }),
    onSuccess: () => { toast({ title: "Recording added" }); setRec(null); refresh(); },
    onError: (e) => toast({ title: "Not added", description: errMsg(e), variant: "destructive" }),
  });

  const s = stats.data;
  const rows = upcoming.data ?? [];
  return (
    <DashboardLayout>
      <PageHeader title="Virtual Class">{canCreate && <Button onClick={() => { setError(null); setCreating(true); }}><Plus className="mr-1 h-4 w-4" aria-hidden /> Create Class</Button>}</PageHeader>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KitStat icon={Video} label="Total Virtual Classes" value={s ? s.total : null} sub="All sessions" />
        <KitStat delay={0.06} icon={Radio} tone="destructive" label="Live Class" value={s ? s.live : null} sub="Currently active" />
        <KitStat delay={0.12} icon={CalendarClock} tone="info" label="Upcoming Classes" value={s ? s.upcoming_today : null} sub="Scheduled today" />
        <KitStat delay={0.18} icon={Users} tone="success" label="Students Online" value={s ? s.online : null} sub="Joined active sessions" />
      </div>

      <div className="mb-5">
        <TableCard title="Live and upcoming sessions" count={rows.length}>
          {upcoming.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : upcoming.isError ? <div className="p-5"><ErrorBox message={errMsg(upcoming.error)} onRetry={() => upcoming.refetch()} /></div> : rows.length === 0 ? (
            <div className="p-5"><EmptyState icon={Video} title="No classes scheduled" text={canCreate ? "Create a class to teach live online." : "Live classes your teachers schedule appear here."} /></div>
          ) : (
            <table className="w-full"><thead><tr><th className={th}>Class</th><th className={th}>Subject</th><th className={th}>Teacher</th><th className={th}>Class group</th><th className={th}>Participants</th><th className={th}>Starts</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-border">{rows.map((v) => (
                <tr key={v.id} className="transition-colors hover:bg-muted/40">
                  <td className={`${td} font-medium`}>{v.title}</td><td className={td}>{v.subject ?? "-"}</td><td className={td}>{v.teacher}</td><td className={td}>{v.class_name}</td>
                  <td className={td}>{v.status === "live" ? `${v.online}/${v.class_size}` : `0/${v.class_size}`}</td>
                  <td className={`${td} text-xs text-muted-foreground`}>{fmtDT(v.starts_at)} · {v.duration_min} min</td>
                  <td className={td}><StatusPill tone={STATUS[v.status].tone} dot={v.status === "live"}>{STATUS[v.status].label}</StatusPill></td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {v.can_host && v.status === "scheduled" && <Button size="sm" onClick={() => act.mutate({ id: v.id, status: "live" })} disabled={act.isPending}><Radio className="mr-1 h-4 w-4" aria-hidden /> Start</Button>}
                    {v.status === "live" && (v.can_host || v.can_join || manager) && <Button size="sm" asChild><Link to={`/virtual-class/${v.id}`}>{v.can_host ? "Open class" : "Join class"}</Link></Button>}
                    {v.can_host && v.status === "live" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act.mutate({ id: v.id, status: "ended" })}>End</Button>}
                    {v.can_host && v.status === "scheduled" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm("Cancel this class? Students are told.")) act.mutate({ id: v.id, status: "cancelled" }); }}>Cancel</Button>}
                    {v.can_host && v.status === "live" && <Button size="sm" variant="ghost" onClick={() => setAttendance(v)}>Attendance</Button>}
                  </td>
                </tr>
              ))}</tbody></table>
          )}
        </TableCard>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Sessions per month" icon={Film}>
          {!s || s.by_month.every((m) => !m.sessions) ? <EmptyState icon={Film} title="No finished sessions yet" /> : <BarChart height={160} bars={s.by_month.map((m) => ({ label: m.month, values: [Number(m.sessions)] }))} series={[{ name: "Sessions held", color: "hsl(var(--primary))" }]} />}
          {s?.avg_minutes != null && <p className="mt-2 text-xs text-muted-foreground">Average session length {s.avg_minutes} min</p>}
        </Panel>
        <Panel title="Total Attendance Rate" icon={Users}>
          {!s || s.by_month.every((m) => m.attendance === null) ? <EmptyState icon={Users} title="No attendance yet" text="Students who join a live class are counted automatically." /> :
            <LineChart max={100} color="hsl(var(--primary))" points={s.by_month.filter((m) => m.attendance !== null).map((m) => ({ label: m.month, value: Number(m.attendance) }))} format={(n) => `${Math.round(n)}%`} />}
        </Panel>
      </div>

      <TableCard title="Class Recordings" count={(past.data ?? []).reduce((n, v) => n + v.recordings.length, 0)} subtitle="Finished and cancelled sessions">
        {past.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : (past.data ?? []).length === 0 ? <div className="p-5"><EmptyState icon={Film} title="No past sessions" /></div> : (
          <table className="w-full"><thead><tr><th className={th}>Session</th><th className={th}>Class</th><th className={th}>Date</th><th className={th}>Duration</th><th className={th}>Attended</th><th className={th}>Recordings</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-border">{past.data!.map((v) => (
              <tr key={v.id}>
                <td className={td}><span className="font-medium">{v.title}</span><span className="block text-xs text-muted-foreground">{v.subject ?? ""} · {v.teacher}</span></td>
                <td className={td}>{v.class_name}</td><td className={`${td} text-xs text-muted-foreground`}>{fmtDT(v.starts_at)}</td>
                <td className={td}>{v.status === "cancelled" ? <StatusPill tone="grey">Cancelled</StatusPill> : `${v.minutes ?? 0} min`}</td><td className={td}>{v.participants}</td>
                <td className={td}>{v.recordings.length === 0 ? <span className="text-xs text-muted-foreground">None</span> : v.recordings.map((r) => <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="mr-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Link2 className="h-3 w-3" aria-hidden />{r.title}</a>)}</td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  {v.can_host && v.status === "ended" && <Button size="sm" variant="ghost" onClick={() => setRec({ v, title: v.title, url: "" })}>Add recording</Button>}
                  {v.can_host && v.status === "ended" && <Button size="sm" variant="ghost" onClick={() => setAttendance(v)}>Attendance</Button>}
                </td>
              </tr>
            ))}</tbody></table>
        )}
      </TableCard>

      <Dialog open={creating} onOpenChange={(o) => { if (!o && !create.isPending) setCreating(false); }}>
        <DialogContent>
          <form onSubmit={(e) => { e.preventDefault(); setError(null); create.mutate(); }}>
            <DialogHeader><DialogTitle>Create class</DialogTitle><DialogDescription>Students of the class are notified and can join once you start it.</DialogDescription></DialogHeader>
            <div className="my-4 space-y-3">
              <div className="space-y-1.5"><Label htmlFor="v-title">Title</Label><Input id="v-title" value={f.title} placeholder="SS2 Mathematics – Quadratic Equations" onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="v-class">Class</Label><select id="v-class" className={sel} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })}><option value="">Choose…</option>{(classes.data ?? []).filter((c) => manager || mine.some((a) => a.class_id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="v-subj">Subject</Label><select id="v-subj" className={sel} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="">General</option>{(subjects.data ?? []).filter((s2) => manager || mine.some((a) => a.subject_id === s2.id && (!f.cls || a.class_id === f.cls))).map((s2) => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="v-start">Starts</Label><Input id="v-start" type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="v-dur">Duration (minutes)</Label><Input id="v-dur" inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="v-desc">Description (optional)</Label><Textarea id="v-desc" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
              {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={create.isPending || f.title.trim().length < 3 || !f.cls}>{create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Schedule</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!attendance} onOpenChange={(o) => { if (!o) setAttendance(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attendance · {attendance?.title}</DialogTitle><DialogDescription>Recorded automatically when people join and leave.</DialogDescription></DialogHeader>
          {att.isLoading ? <LoadingRows rows={3} /> : (att.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nobody has joined yet.</p> : (
            <ul className="divide-y divide-border text-sm">{att.data!.map((a) => <li key={a.profile_id} className="flex justify-between py-2"><span>{a.name} <span className="text-xs capitalize text-muted-foreground">{a.role?.replace("_", " ")}</span></span><span className="text-xs text-muted-foreground">{a.online ? "Online now · " : ""}{a.minutes} min</span></li>)}</ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rec} onOpenChange={(o) => { if (!o) setRec(null); }}>
        <DialogContent>
          {rec && (
            <form onSubmit={(e) => { e.preventDefault(); addRec.mutate(); }}>
              <DialogHeader><DialogTitle>Add recording</DialogTitle><DialogDescription>Paste the link to the recording (for example Google Drive or YouTube unlisted). Students of the class can then watch it.</DialogDescription></DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="r-title">Title</Label><Input id="r-title" value={rec.title} onChange={(e) => setRec({ ...rec, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="r-url">Link</Label><Input id="r-url" type="url" placeholder="https://…" value={rec.url} onChange={(e) => setRec({ ...rec, url: e.target.value })} /></div>
              </div>
              <DialogFooter><Button type="button" variant="outline" onClick={() => setRec(null)}>Cancel</Button><Button type="submit" disabled={addRec.isPending || !rec.url}>Add</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default VirtualClassPage;
