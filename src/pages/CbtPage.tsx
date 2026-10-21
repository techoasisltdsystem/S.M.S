import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Clock, FilePlus2, HelpCircle, ListChecks, Loader2, Percent, Play, Plus, Square, Trash2, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import BarChart from "@/components/kit/BarChart";
import { PageHeader, Progress, QuickActions, StatusPill, TableCard, td, th } from "@/components/kit/Dash";
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
import { KIND_LABEL, fmtDT, mmss, useCbtDash, useCbtTests, useLive, useQuestions, type CbtTest, type QKind, type Question } from "@/hooks/useCbt";
import { rpc } from "@/lib/rpc";

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const PHASE: Record<string, { label: string; tone: "grey" | "blue" | "green" | "purple" }> = { draft: { label: "Draft", tone: "grey" }, upcoming: { label: "Upcoming", tone: "blue" }, live: { label: "Live", tone: "green" }, closed: { label: "Closed", tone: "purple" } };
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

// ------------------------------------------------------------------ live monitor
const LiveMonitor = ({ test }: { test: CbtTest }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const live = useLive(test.id);
  const l = live.data;
  const roster = l?.roster ?? [];
  const started = roster.filter((r) => r.status !== "not_started").length;
  const submitted = roster.filter((r) => ["submitted", "auto_submitted", "terminated"].includes(r.status)).length;
  const violations = roster.reduce((n, r) => n + r.violations, 0);
  const offset = l ? new Date(l.server_now).getTime() - Date.now() : 0;
  const left = l ? new Date(l.ends_at).getTime() - (Date.now() + offset) : 0;
  const end = useMutation({
    mutationFn: () => rpc("cbt_test_set_status", { _test: test.id, _status: "closed" }),
    onSuccess: () => { toast({ title: "Test ended for everyone", description: "Unfinished attempts were submitted with their saved answers." }); void qc.invalidateQueries({ queryKey: ["cbt-tests"] }); void qc.invalidateQueries({ queryKey: ["cbt-live"] }); },
    onError: (e) => toast({ title: "Not ended", description: errMsg(e), variant: "destructive" }),
  });
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-heading text-base font-semibold"><span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden /> Live Test</p>
          <p className="mt-1 font-medium">{test.title}</p>
          <p className="text-xs text-muted-foreground">{test.class_name} · {test.duration_min} min · opened {fmtDT(test.starts_at)} · closes {fmtDT(test.ends_at)}</p>
        </div>
        <Button variant="destructive" size="sm" disabled={end.isPending} onClick={() => { if (window.confirm("End this test for everyone now? Unfinished attempts are submitted.")) end.mutate(); }}><Square className="mr-1 h-4 w-4" aria-hidden /> End for all</Button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KitStat icon={Users} tone="info" label="Students" value={`${started}/${roster.length}`} sub="Started" />
        <KitStat icon={CheckCircle2} tone="success" label="Submitted" value={submitted} />
        <KitStat icon={Clock} tone="warning" label="Time Left" value={l ? mmss(left) : null} sub="Until the window closes" />
        <KitStat icon={AlertTriangle} tone="destructive" label="Violations" value={violations} sub="Tab switches, copy, paste…" />
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <p className="px-4 pt-3 text-sm font-semibold">Live roster <span className="block text-xs font-normal text-muted-foreground">Updating every 5 seconds</span></p>
        {live.isLoading ? <div className="p-4"><LoadingRows rows={3} /></div> : (
          <table className="mt-2 w-full">
            <thead><tr><th className={th}>Students</th><th className={th}>Status</th><th className={th}>Progress</th><th className={th}>Time Remaining</th><th className={th}>Violations</th></tr></thead>
            <tbody className="divide-y divide-border">
              {roster.map((r) => {
                const rem = r.deadline && r.status === "in_progress" ? new Date(r.deadline).getTime() - (Date.now() + offset) : 0;
                return (
                  <tr key={r.student_id}>
                    <td className={`${td} font-medium`}>{r.name}</td>
                    <td className={td}>{r.status === "in_progress" ? <StatusPill tone="green" dot>In Progress</StatusPill> : r.status === "not_started" ? <StatusPill tone="grey">Not started</StatusPill>
                      : r.status === "terminated" ? <StatusPill tone="red">Terminated</StatusPill> : <StatusPill tone="purple">Submitted</StatusPill>}</td>
                    <td className={`${td} w-1/4`}>{r.status === "not_started" ? "-" : <Progress value={(r.answered / Math.max(l?.questions ?? 1, 1)) * 100} label={`${r.name} progress`} />}</td>
                    <td className={`${td} tabular-nums`}>{r.status === "in_progress" ? mmss(rem) : "00:00"}</td>
                    <td className={td}>{r.violations ? <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" title={(r.recent_violations ?? []).join(", ")}><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {r.violations}</span> : <span className="text-xs text-muted-foreground">None</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};

// ------------------------------------------------------------------ question editor
const blankQ = { id: null as string | null, subject: "", kind: "mcq" as QKind, prompt: "", options: ["", "", "", ""], correctIdx: 0, tf: "true", accepted: "", marks: "1", difficulty: "medium" };
const QuestionDialog = ({ sid, open, onClose, editing, subjects }: { sid: string; open: boolean; onClose: () => void; editing: Question | null; subjects: { id: string; name: string }[] }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(blankQ);
  const [seed, setSeed] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  if (open && seed !== (editing ?? "new")) {
    setSeed(editing ?? "new"); setError(null);
    setF(editing ? { id: editing.id, subject: editing.subject_id, kind: editing.kind, prompt: editing.prompt, options: editing.kind === "mcq" ? [...editing.options] : ["", "", "", ""],
      correctIdx: editing.kind === "mcq" ? Number(editing.correct) : 0, tf: editing.kind === "true_false" ? String(editing.correct) : "true",
      accepted: editing.kind === "short" ? (editing.correct as string[]).join(", ") : "", marks: String(editing.marks), difficulty: editing.difficulty } : { ...blankQ, subject: subjects[0]?.id ?? "" });
  }
  const save = useMutation({
    mutationFn: () => {
      const opts = f.options.map((o) => o.trim()).filter(Boolean);
      const correct = f.kind === "mcq" ? f.correctIdx : f.kind === "true_false" ? f.tf === "true" : f.kind === "short" ? f.accepted.split(",").map((a) => a.trim()).filter(Boolean) : null;
      return rpc("cbt_question_save", { _school: sid, _id: f.id, _subject: f.subject, _kind: f.kind, _prompt: f.prompt, _options: f.kind === "mcq" ? opts : [], _correct: correct, _marks: Number(f.marks), _difficulty: f.difficulty });
    },
    onSuccess: () => { toast({ title: "Question saved" }); void qc.invalidateQueries({ queryKey: ["cbt-questions"] }); setSeed(null); onClose(); },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !save.isPending) { setSeed(null); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
          <DialogHeader><DialogTitle>{f.id ? "Edit question" : "Add question"}</DialogTitle><DialogDescription>The answer key stays on the server: students never receive it.</DialogDescription></DialogHeader>
          <div className="my-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="q-subj">Subject</Label><select id="q-subj" className={sel} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="q-kind">Type</Label><select id="q-kind" className={sel} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as QKind })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="q-prompt">Question</Label><Textarea id="q-prompt" rows={3} value={f.prompt} onChange={(e) => setF({ ...f, prompt: e.target.value })} /></div>
            {f.kind === "mcq" && (
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Options (select the correct one)</legend>
                {f.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="q-correct" aria-label={`Option ${i + 1} is correct`} checked={f.correctIdx === i} onChange={() => setF({ ...f, correctIdx: i })} />
                    <Input aria-label={`Option ${i + 1}`} value={o} onChange={(e) => { const next = [...f.options]; next[i] = e.target.value; setF({ ...f, options: next }); }} />
                  </div>
                ))}
                {f.options.length < 8 && <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, options: [...f.options, ""] })}><Plus className="mr-1 h-4 w-4" aria-hidden /> Option</Button>}
              </fieldset>
            )}
            {f.kind === "true_false" && <div className="space-y-1.5"><Label htmlFor="q-tf">Correct answer</Label><select id="q-tf" className={sel} value={f.tf} onChange={(e) => setF({ ...f, tf: e.target.value })}><option value="true">True</option><option value="false">False</option></select></div>}
            {f.kind === "short" && <div className="space-y-1.5"><Label htmlFor="q-acc">Accepted answers (comma separated, not case-sensitive)</Label><Input id="q-acc" value={f.accepted} onChange={(e) => setF({ ...f, accepted: e.target.value })} /></div>}
            {f.kind === "essay" && <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">Essays are marked by the teacher after the test.</p>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="q-marks">Marks</Label><Input id="q-marks" inputMode="decimal" value={f.marks} onChange={(e) => setF({ ...f, marks: e.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="q-diff">Difficulty</Label><select id="q-diff" className={sel} value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setSeed(null); onClose(); }}>Cancel</Button><Button type="submit" disabled={save.isPending || f.prompt.trim().length < 3 || !f.subject}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save question</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ------------------------------------------------------------------ test editor
const TestDialog = ({ sid, open, onClose, classes, subjects, questions }: { sid: string; open: boolean; onClose: () => void; classes: { id: string; name: string }[]; subjects: { id: string; name: string }[]; questions: Question[] }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [f, setF] = useState({ title: "", instructions: "", cls: "", subject: "", duration: "30", starts: localInput(new Date(now.getTime() + 10 * 60000)), ends: localInput(new Date(now.getTime() + 24 * 3600000)), maxv: "5", shuffle: true, picked: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const pool = questions.filter((q) => q.subject_id === f.subject);
  const total = pool.filter((q) => f.picked.includes(q.id)).reduce((n, q) => n + Number(q.marks), 0);
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const id = await rpc<string>("cbt_test_save", { _school: sid, _id: null, _class: f.cls, _subject: f.subject, _title: f.title, _instructions: f.instructions, _duration: Number(f.duration),
        _starts: new Date(f.starts).toISOString(), _ends: new Date(f.ends).toISOString(), _shuffle: f.shuffle, _max_violations: Number(f.maxv), _questions: f.picked });
      if (publish) await rpc("cbt_test_set_status", { _test: id, _status: "published" });
      return publish;
    },
    onSuccess: (p) => { toast({ title: p ? "Test published" : "Test saved as a draft", description: p ? "The class was notified." : undefined }); void qc.invalidateQueries({ queryKey: ["cbt-tests"] }); onClose(); },
    onError: (e) => setError(errMsg(e)),
  });
  const ok = f.title.trim().length >= 3 && f.cls && f.subject && f.picked.length > 0;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !save.isPending) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Create new exam</DialogTitle><DialogDescription>Students can start any time inside the window and get the full duration, ending no later than the window closes.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="t-title">Title</Label><Input id="t-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="SS2 Mathematics Mid-Term" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="t-class">Class</Label><select id="t-class" className={sel} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })}><option value="">Choose…</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="t-subj">Subject</Label><select id="t-subj" className={sel} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value, picked: [] })}><option value="">Choose…</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="t-start">Opens</Label><Input id="t-start" type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-end">Closes</Label><Input id="t-end" type="datetime-local" value={f.ends} onChange={(e) => setF({ ...f, ends: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-dur">Duration (minutes)</Label><Input id="t-dur" inputMode="numeric" value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="t-maxv">Violations allowed before the attempt ends (0 = never end)</Label><Input id="t-maxv" inputMode="numeric" value={f.maxv} onChange={(e) => setF({ ...f, maxv: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.shuffle} onChange={(e) => setF({ ...f, shuffle: e.target.checked })} /> Shuffle question order for each student</label>
          <div className="space-y-1.5"><Label htmlFor="t-ins">Instructions (optional)</Label><Textarea id="t-ins" rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></div>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Questions ({f.picked.length} chosen · {total} marks)</legend>
            {!f.subject ? <p className="text-sm text-muted-foreground">Choose a subject to see its questions.</p> : pool.length === 0 ? <p className="text-sm text-muted-foreground">No questions for this subject yet. Add some in the Question Bank.</p> : (
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {pool.map((q) => (
                  <li key={q.id}><label className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="mt-1" checked={f.picked.includes(q.id)} onChange={(e) => setF({ ...f, picked: e.target.checked ? [...f.picked, q.id] : f.picked.filter((x) => x !== q.id) })} />
                    <span className="min-w-0"><span className="line-clamp-2">{q.prompt}</span><span className="text-xs text-muted-foreground">{KIND_LABEL[q.kind]} · {q.marks} mark{Number(q.marks) === 1 ? "" : "s"}</span></span>
                  </label></li>
                ))}
              </ul>
            )}
          </fieldset>
          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="outline" disabled={!ok || save.isPending} onClick={() => { setError(null); save.mutate(false); }}>Save draft</Button>
          <Button disabled={!ok || save.isPending} onClick={() => { setError(null); save.mutate(true); }}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ------------------------------------------------------------------ grading
interface Review { attempt_id: string; student: string; status: string; score: number; max_score: number; violations: number; essay_scores: Record<string, number>;
  questions: { id: string; kind: QKind; prompt: string; options: string[]; correct: unknown; marks: number; answer: unknown }[] }
const ReviewDialog = ({ attempt, onClose }: { attempt: string | null; onClose: () => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["cbt-review", attempt], enabled: !!attempt, queryFn: () => rpc<Review>("cbt_attempt_review", { _attempt: attempt }) });
  const [scores, setScores] = useState<Record<string, string>>({});
  const grade = useMutation({
    mutationFn: (v: { qid: string; score: number }) => rpc("cbt_grade_essay", { _attempt: attempt, _question: v.qid, _score: v.score }),
    onSuccess: () => { toast({ title: "Essay graded" }); void q.refetch(); ["cbt-live", "cbt-tests", "cbt-dash"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }),
  });
  const r = q.data;
  const shown = (qq: Review["questions"][number]) => qq.answer === undefined || qq.answer === null ? "No answer" : qq.kind === "mcq" ? qq.options[Number(qq.answer)] ?? "-" : String(qq.answer);
  const key = (qq: Review["questions"][number]) => qq.kind === "mcq" ? qq.options[Number(qq.correct)] : qq.kind === "true_false" ? String(qq.correct) : qq.kind === "short" ? (qq.correct as string[]).join(" / ") : null;
  return (
    <Dialog open={!!attempt} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {q.isLoading && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {r && (
          <>
            <DialogHeader><DialogTitle>{r.student}</DialogTitle><DialogDescription>Score {r.score}/{r.max_score} · {r.violations} violation{r.violations === 1 ? "" : "s"} · {r.status.replace("_", " ")}</DialogDescription></DialogHeader>
            <ol className="space-y-3">
              {r.questions.map((qq, i) => (
                <li key={qq.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{i + 1}. {qq.prompt} <span className="text-xs text-muted-foreground">({qq.marks} marks)</span></p>
                  <p className="mt-1"><span className="text-muted-foreground">Answer:</span> <span className="whitespace-pre-wrap">{shown(qq)}</span></p>
                  {key(qq) !== null && <p className="text-xs text-success">Key: {key(qq)}</p>}
                  {qq.kind === "essay" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Input className="h-8 w-24" inputMode="decimal" aria-label="Essay score" placeholder={`/ ${qq.marks}`} value={scores[qq.id] ?? (r.essay_scores[qq.id] !== undefined ? String(r.essay_scores[qq.id]) : "")} onChange={(e) => setScores({ ...scores, [qq.id]: e.target.value })} />
                      <Button size="sm" disabled={grade.isPending || scores[qq.id] === undefined} onClick={() => grade.mutate({ qid: qq.id, score: Number(scores[qq.id]) })}>Save score</Button>
                      {r.essay_scores[qq.id] !== undefined && <span className="text-xs text-success">Graded</span>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const GradingTest = ({ test, onOpen }: { test: CbtTest; onOpen: (a: string) => void }) => {
  const live = useLive(test.id);
  const rows = (live.data?.roster ?? []).filter((r) => r.attempt_id && r.status !== "in_progress" && r.status !== "not_started");
  return (
    <TableCard title={test.title} count={rows.length} subtitle={`${test.class_name} · ${test.subject}`}>
      {rows.length === 0 ? <p className="px-5 pb-4 text-sm text-muted-foreground">No finished attempts yet.</p> : (
        <table className="w-full"><thead><tr><th className={th}>Student</th><th className={th}>Score</th><th className={th}>Status</th><th className={th} /></tr></thead>
          <tbody className="divide-y divide-border">{rows.map((r) => (
            <tr key={r.student_id}><td className={`${td} font-medium`}>{r.name}</td><td className={td}>{r.score ?? "-"}/{r.max_score ?? "-"}</td>
              <td className={td}>{r.needs_grading ? <StatusPill tone="orange">Needs grading</StatusPill> : <StatusPill tone="green">Marked</StatusPill>}</td>
              <td className={`${td} text-right`}><Button size="sm" variant="outline" onClick={() => onOpen(r.attempt_id!)}>Review</Button></td></tr>
          ))}</tbody></table>
      )}
    </TableCard>
  );
};

// ------------------------------------------------------------------ page
const CbtPage = () => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sid = user!.schoolId;
  const [params] = useSearchParams();
  const tab = params.get("tab") ?? "dashboard";
  const tests = useCbtTests(sid);
  const assignments = useAssignments(sid);
  const classes = useClasses(sid);
  const subjects = useSubjects(sid);
  const mine = (assignments.data ?? []).filter((a) => a.teacher_id === user!.id);
  const manager = can("cbt.manage");
  const staff = user!.role === "teacher" || user!.role === "admin";
  const teacherMode = staff && (manager || mine.length > 0);
  const dash = useCbtDash(sid, teacherMode);
  const questions = useQuestions(sid, teacherMode);
  const myClasses = (classes.data ?? []).filter((c) => manager || mine.some((a) => a.class_id === c.id));
  const mySubjects = (subjects.data ?? []).filter((s) => manager || mine.some((a) => a.subject_id === s.id));
  const [qOpen, setQOpen] = useState<{ q: Question | null } | null>(null);
  const [tOpen, setTOpen] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const all = tests.data ?? [];
  const live = all.filter((t) => t.can_manage && t.phase === "live");

  const act = useMutation({
    mutationFn: (v: { fn: string; args: Record<string, unknown>; ok: string }) => rpc(v.fn, v.args).then(() => v.ok),
    onSuccess: (ok) => { toast({ title: ok }); ["cbt-tests", "cbt-dash", "cbt-questions"].forEach((k) => void qc.invalidateQueries({ queryKey: [k] })); },
    onError: (e) => toast({ title: "Not done", description: errMsg(e), variant: "destructive" }),
  });

  const studentView = useMemo(() => !teacherMode, [teacherMode]);

  if (studentView) {
    const isParent = user!.role === "parent";
    return (
      <DashboardLayout>
        <PageHeader title={isParent ? "Tests (CBT)" : "CBT"} />
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KitStat icon={Play} tone="success" label="Live Now" value={all.filter((t) => t.phase === "live" && !t.my_status?.match(/submitted|terminated/)).length} sub="Open for you" />
          <KitStat delay={0.06} icon={Clock} tone="info" label="Upcoming Tests" value={all.filter((t) => t.phase === "upcoming").length} sub="Scheduled" />
          <KitStat delay={0.12} icon={CheckCircle2} label="Completed" value={all.filter((t) => t.my_status && t.my_status !== "in_progress").length} sub="Submitted" />
        </div>
        <TableCard title="My Tests" count={all.length}>
          {tests.isLoading ? <div className="p-5"><LoadingRows rows={3} /></div> : tests.isError ? <div className="p-5"><ErrorBox message={errMsg(tests.error)} onRetry={() => tests.refetch()} /></div> : all.length === 0 ? (
            <div className="p-5"><EmptyState icon={ClipboardCheck} title="No tests yet" text="Tests your teachers schedule appear here." /></div>
          ) : (
            <table className="w-full"><thead><tr><th className={th}>Test</th><th className={th}>Subject</th><th className={th}>Window</th><th className={th}>Duration</th><th className={th}>Status</th><th className={th}>Result</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-border">{all.map((t) => {
                const done = t.my_status && t.my_status !== "in_progress";
                return (
                  <tr key={t.id}>
                    <td className={`${td} font-medium`}>{t.title}</td><td className={td}>{t.subject}</td>
                    <td className={`${td} text-xs text-muted-foreground`}>{fmtDT(t.starts_at)} – {fmtDT(t.ends_at)}</td><td className={td}>{t.duration_min} min</td>
                    <td className={td}>{done ? <StatusPill tone={t.my_status === "terminated" ? "red" : "purple"}>{t.my_status === "terminated" ? "Ended (violations)" : "Submitted"}</StatusPill> : t.my_status === "in_progress" ? <StatusPill tone="green" dot>In progress</StatusPill> : <StatusPill tone={PHASE[t.phase].tone}>{PHASE[t.phase].label}</StatusPill>}</td>
                    <td className={td}>{t.my_score !== null ? <span className="font-semibold">{t.my_score}/{t.my_max}</span> : done ? <span className="text-xs text-muted-foreground">Awaiting release</span> : "-"}</td>
                    <td className={`${td} text-right`}>{!isParent && t.phase === "live" && !done && <Button asChild size="sm"><Link to={`/cbt/take/${t.id}`}>{t.my_status === "in_progress" ? "Continue" : "Start test"}</Link></Button>}</td>
                  </tr>
                );
              })}</tbody></table>
          )}
        </TableCard>
      </DashboardLayout>
    );
  }

  const d = dash.data;
  return (
    <DashboardLayout>
      <PageHeader title="CBT" tabs={[{ to: "/cbt", label: "Dashboard" }, { to: "/cbt?tab=bank", label: "Question Bank" }, { to: "/cbt?tab=tests", label: "Tests" }, { to: "/cbt?tab=grading", label: "Grading" }]}>
        {tab === "bank" && <Button onClick={() => setQOpen({ q: null })}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add question</Button>}
        {tab === "tests" && <Button onClick={() => setTOpen(true)}><FilePlus2 className="mr-1 h-4 w-4" aria-hidden /> Create test</Button>}
      </PageHeader>

      {tab === "dashboard" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KitStat to="/cbt?tab=tests" icon={BookOpen} label="Total Tests Created" value={d ? d.tests : null} sub="Across all classes" />
            <KitStat delay={0.06} to="/cbt?tab=tests" icon={Clock} tone="info" label="Upcoming Tests" value={d ? d.upcoming : null} sub={d ? `${d.live} live now` : undefined} />
            <KitStat delay={0.12} to="/cbt?tab=tests" icon={Users} tone="success" label="Total Attempts" value={d ? d.attempts : null} sub={d ? `${d.in_progress} in progress` : undefined} />
            <KitStat delay={0.18} to="/cbt?tab=grading" icon={ListChecks} tone="warning" label="Pending Grading" value={d ? d.pending_grading : null} sub="Essays to mark" />
            <KitStat delay={0.24} icon={Percent} tone="primary" label="Average Score" value={d?.avg_pct != null ? `${d.avg_pct}%` : null} sub={d?.completion_pct != null ? `${d.completion_pct}% completion rate` : "No marked attempts yet"} />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <QuickActions layout="list" text="Easily access important test tasks." actions={[
              { to: "/cbt?tab=tests", label: "Create New Exam", icon: FilePlus2, tone: "orange" },
              { to: "/cbt?tab=bank", label: "Add Question", icon: HelpCircle, tone: "green" },
              { to: "/cbt?tab=grading", label: "Grade Essays", icon: ClipboardCheck, tone: "pink" },
            ]} />
            <Panel title="Average Class Performance" icon={Percent}>
              {!d || d.by_class.length === 0 ? <EmptyState icon={Percent} title="No marked attempts yet" /> : <BarChart max={100} height={160} bars={d.by_class.map((c) => ({ label: c.class, values: [Number(c.avg)] }))} series={[{ name: "Average %", color: "hsl(var(--primary))" }]} format={(n) => `${Math.round(n)}%`} />}
            </Panel>
          </div>
          {live.length === 0 ? <Panel title="Live Test" icon={Play}><EmptyState icon={Play} title="No test is live right now" text="When a published test's window opens, its live roster appears here and updates every few seconds." /></Panel>
            : live.map((t) => <LiveMonitor key={t.id} test={t} />)}
        </div>
      )}

      {tab === "bank" && (
        <TableCard title="Question Bank" count={questions.data?.length}>
          {questions.isLoading ? <div className="p-5"><LoadingRows rows={4} /></div> : (questions.data ?? []).length === 0 ? <div className="p-5"><EmptyState icon={HelpCircle} title="No questions yet" text="Add multiple-choice, true/false, short-answer or essay questions." /></div> : (
            <table className="w-full"><thead><tr><th className={th}>Question</th><th className={th}>Subject</th><th className={th}>Type</th><th className={th}>Marks</th><th className={th}>Used</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-border">{questions.data!.map((q) => (
                <tr key={q.id}><td className={`${td} max-w-md`}><span className="line-clamp-2">{q.prompt}</span><span className="text-xs capitalize text-muted-foreground">{q.difficulty}</span></td>
                  <td className={td}>{q.subject}</td><td className={td}><StatusPill tone="purple">{KIND_LABEL[q.kind]}</StatusPill></td><td className={td}>{q.marks}</td><td className={td}>{q.used}</td>
                  <td className={`${td} whitespace-nowrap text-right`}><Button size="sm" variant="ghost" onClick={() => setQOpen({ q })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" aria-label="Remove question" onClick={() => { if (window.confirm("Remove this question from the bank? Tests already set keep their copy.")) act.mutate({ fn: "cbt_question_archive", args: { _id: q.id }, ok: "Question removed" }); }}><Trash2 className="h-4 w-4" /></Button></td></tr>
              ))}</tbody></table>
          )}
        </TableCard>
      )}

      {tab === "tests" && (
        <TableCard title="Tests" count={all.filter((t) => t.can_manage).length}>
          {tests.isLoading ? <div className="p-5"><LoadingRows rows={4} /></div> : all.filter((t) => t.can_manage).length === 0 ? <div className="p-5"><EmptyState icon={BookOpen} title="No tests yet" text="Create a test from questions in your bank." /></div> : (
            <table className="w-full"><thead><tr><th className={th}>Test</th><th className={th}>Class</th><th className={th}>Window</th><th className={th}>Status</th><th className={th}>Submitted</th><th className={th}>Average</th><th className={th} /></tr></thead>
              <tbody className="divide-y divide-border">{all.filter((t) => t.can_manage).map((t) => (
                <tr key={t.id}>
                  <td className={td}><span className="font-medium">{t.title}</span><span className="block text-xs text-muted-foreground">{t.subject} · {t.questions} questions · {t.total_marks} marks · {t.duration_min} min</span></td>
                  <td className={td}>{t.class_name}</td><td className={`${td} text-xs text-muted-foreground`}>{fmtDT(t.starts_at)} – {fmtDT(t.ends_at)}</td>
                  <td className={td}><StatusPill tone={PHASE[t.phase].tone} dot={t.phase === "live"}>{PHASE[t.phase].label}</StatusPill>{t.results_released && <span className="ml-1 text-xs text-success">· released</span>}</td>
                  <td className={td}>{t.submitted}/{t.class_size}</td><td className={td}>{t.avg_pct != null ? `${t.avg_pct}%` : "-"}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    {t.status === "draft" && <Button size="sm" onClick={() => act.mutate({ fn: "cbt_test_set_status", args: { _test: t.id, _status: "published" }, ok: "Test published" })}>Publish</Button>}
                    {t.phase === "live" && <Button size="sm" variant="outline" asChild><Link to="/cbt">Monitor</Link></Button>}
                    {t.status === "published" && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm("Close this test now? Unfinished attempts are submitted.")) act.mutate({ fn: "cbt_test_set_status", args: { _test: t.id, _status: "closed" }, ok: "Test closed" }); }}>Close</Button>}
                    {t.phase === "closed" && <Button size="sm" variant="outline" disabled={t.needs_grading > 0} title={t.needs_grading ? "Grade essays first" : undefined} onClick={() => act.mutate({ fn: "cbt_release_results", args: { _test: t.id, _release: !t.results_released }, ok: t.results_released ? "Results hidden" : "Results released to students" })}>{t.results_released ? "Hide results" : "Release results"}</Button>}
                  </td>
                </tr>
              ))}</tbody></table>
          )}
        </TableCard>
      )}

      {tab === "grading" && (
        <div className="space-y-4">
          {all.filter((t) => t.can_manage && t.attempts > 0).length === 0 ? <Panel title="Grading" icon={ListChecks}><EmptyState icon={ListChecks} title="Nothing to grade yet" text="Finished attempts appear here for review and essay marking." /></Panel>
            : all.filter((t) => t.can_manage && t.attempts > 0).map((t) => <GradingTest key={t.id} test={t} onOpen={setReview} />)}
        </div>
      )}

      <QuestionDialog sid={sid} open={!!qOpen} editing={qOpen?.q ?? null} onClose={() => setQOpen(null)} subjects={mySubjects} />
      {tOpen && <TestDialog sid={sid} open={tOpen} onClose={() => setTOpen(false)} classes={myClasses} subjects={mySubjects} questions={questions.data ?? []} />}
      <ReviewDialog attempt={review} onClose={() => setReview(null)} />
    </DashboardLayout>
  );
};

export default CbtPage;
