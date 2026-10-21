import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, Maximize, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { errMsg } from "@/components/students/QueryState";
import { mmss, type QKind } from "@/hooks/useCbt";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";
import MathText from "@/components/cbt/MathText";

interface Payload {
  attempt_id: string; status: string; deadline: string; server_now: string; answers: Record<string, unknown>; violations: number;
  test: { id: string; title: string; instructions: string | null; duration_min: number; max_violations: number; subject: string; class: string };
  questions: { id: string; kind: QKind; prompt: string; options: string[]; marks: number; image?: string | null }[];
}
type Kind = "tab_switch" | "window_blur" | "copy" | "paste" | "fullscreen_exit" | "right_click";
const KIND_TEXT: Record<Kind, string> = { tab_switch: "You left the test tab", window_blur: "The test window lost focus", copy: "Copying is not allowed", paste: "Pasting is not allowed", fullscreen_exit: "You left full screen", right_click: "Right-click is disabled" };

/** The exam screen. The server keeps the clock and the answer key; answers save every few seconds and leaving the test is reported. */
const CbtTakePage = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [idx, setIdx] = useState(0);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [violations, setViolations] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const lastViolation = useRef(0);

  useEffect(() => {
    rpc<Payload>("cbt_attempt_start", { _test: testId })
      .then((j) => { setP(j); setAnswers(j.answers ?? {}); setViolations(j.violations); setOffset(new Date(j.server_now).getTime() - Date.now()); })
      .catch((e) => setError(errMsg(e)));
  }, [testId]);

  const left = p ? new Date(p.deadline).getTime() - (now + offset) : 0;

  const save = useCallback(async () => {
    if (!p || finished || !dirty.current) return;
    dirty.current = false; setSaving("saving");
    try {
      const r = await rpc<{ status: string }>("cbt_attempt_save", { _attempt: p.attempt_id, _answers: answersRef.current });
      if (r.status !== "in_progress") setFinished(r.status);
      setSaving("saved");
    } catch { dirty.current = true; setSaving("error"); }
  }, [p, finished]);

  const submit = useCallback(async (auto = false) => {
    if (!p || finished) return;
    setSubmitting(true);
    try { const r = await rpc<{ status: string }>("cbt_attempt_submit", { _attempt: p.attempt_id, _answers: answersRef.current }); setFinished(r.status); }
    catch (e) { if (!auto) setError(errMsg(e)); }
    finally { setSubmitting(false); }
  }, [p, finished]);

  // Clock and autosave.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  useEffect(() => { const t = setInterval(() => void save(), 8000); return () => clearInterval(t); }, [save]);
  useEffect(() => { if (p && !finished && left <= 0) void submit(true); }, [left, p, finished, submit]);

  // Integrity monitoring: each event is reported to the server, which decides when the attempt ends.
  const report = useCallback(async (kind: Kind) => {
    if (!p || finished) return;
    const t = Date.now();
    if (t - lastViolation.current < 1500) return;
    lastViolation.current = t;
    setWarning(KIND_TEXT[kind]);
    try {
      const r = await rpc<{ status: string; violations: number }>("cbt_attempt_violation", { _attempt: p.attempt_id, _kind: kind });
      setViolations(r.violations);
      if (r.status === "terminated") setFinished("terminated");
    } catch { /* the next save will show the real state */ }
  }, [p, finished]);
  useEffect(() => {
    if (!p || finished) return;
    const vis = () => { if (document.visibilityState === "hidden") void report("tab_switch"); };
    const blur = () => void report("window_blur");
    const copy = (e: ClipboardEvent) => { e.preventDefault(); void report("copy"); };
    const paste = (e: ClipboardEvent) => { e.preventDefault(); void report("paste"); };
    const ctx = (e: MouseEvent) => { e.preventDefault(); void report("right_click"); };
    const fs = () => { if (!document.fullscreenElement) void report("fullscreen_exit"); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("blur", blur);
    document.addEventListener("copy", copy); document.addEventListener("paste", paste); document.addEventListener("contextmenu", ctx); document.addEventListener("fullscreenchange", fs);
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", vis); window.removeEventListener("blur", blur);
      document.removeEventListener("copy", copy); document.removeEventListener("paste", paste); document.removeEventListener("contextmenu", ctx); document.removeEventListener("fullscreenchange", fs);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [p, finished, report]);

  const set = (qid: string, v: unknown) => { setAnswers((a) => ({ ...a, [qid]: v })); dirty.current = true; setSaving("idle"); };

  if (error) return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-card">
      <AlertTriangle className="mx-auto h-8 w-8 text-destructive" aria-hidden /><p className="mt-3 font-medium">{error}</p><Button asChild className="mt-4"><Link to="/cbt">Back to tests</Link></Button></div></main>
  );
  if (!p) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading the test" /></main>;
  if (finished) return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-elevated">
      {finished === "terminated" ? <ShieldAlert className="mx-auto h-10 w-10 text-destructive" aria-hidden /> : <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden />}
      <h1 className="mt-3 font-heading text-2xl font-bold">{finished === "terminated" ? "Your attempt was ended" : "Test submitted"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{finished === "terminated" ? "There were too many integrity alerts (leaving the test, copying or pasting). Your saved answers were submitted and your teacher can see what happened." : finished === "auto_submitted" ? "Time ran out, so your saved answers were submitted automatically." : "Your answers are in. Your teacher releases results after marking."}</p>
      <Button className="mt-5" onClick={() => navigate("/cbt")}>Back to tests</Button></div></main>
  );

  const q = p.questions[idx];
  const answered = p.questions.filter((x) => answers[x.id] !== undefined && answers[x.id] !== "").length;
  const low = left < 5 * 60000;
  return (
    <main className="min-h-screen select-none bg-background">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="min-w-0"><p className="truncate font-heading text-lg font-semibold">{p.test.title}</p><p className="text-xs text-muted-foreground">{p.test.subject} · {p.test.class} · {answered}/{p.questions.length} answered</p></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved, retrying" : ""}</span>
          {!document.fullscreenElement && <Button size="sm" variant="outline" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}><Maximize className="mr-1 h-4 w-4" aria-hidden /> Full screen</Button>}
          <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold tabular-nums", low ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")} role="timer" aria-live="off">
            <Clock className="h-4 w-4" aria-hidden /> {mmss(left)}</span>
          <Button size="sm" disabled={submitting} onClick={() => { if (window.confirm(`Submit now? ${p.questions.length - answered} question(s) unanswered.`)) void submit(); }}>{submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />} Submit</Button>
        </div>
      </header>
      {warning && (
        <div role="alert" className="flex items-center justify-between gap-3 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-8">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden /> {warning}. This has been recorded ({violations}{p.test.max_violations ? ` of ${p.test.max_violations} allowed` : ""}).</span>
          <button type="button" className="text-xs underline" onClick={() => setWarning(null)}>Dismiss</button>
        </div>
      )}
      <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-8 lg:grid-cols-[1fr_16rem]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
          {idx === 0 && p.test.instructions && <p className="mb-4 rounded-lg bg-muted/50 p-3 text-sm">{p.test.instructions}</p>}
          <p className="text-xs font-medium text-muted-foreground">Question {idx + 1} of {p.questions.length} · {q.marks} mark{Number(q.marks) === 1 ? "" : "s"}</p>
          <h2 className="mt-2 text-lg font-medium"><MathText text={q.prompt} /></h2>
          {q.image && <img src={q.image} alt={`Picture for question ${idx + 1}`} draggable={false} className="mt-3 max-h-80 rounded-lg border border-border object-contain" />}
          <div className="mt-5 space-y-2">
            {q.kind === "mcq" && q.options.map((o, i) => (
              <label key={i} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors", answers[q.id] === i ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                <input type="radio" name={q.id} checked={answers[q.id] === i} onChange={() => set(q.id, i)} /> <MathText text={o} />
              </label>
            ))}
            {q.kind === "true_false" && [true, false].map((v) => (
              <label key={String(v)} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3", answers[q.id] === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                <input type="radio" name={q.id} checked={answers[q.id] === v} onChange={() => set(q.id, v)} /> {v ? "True" : "False"}
              </label>
            ))}
            {q.kind === "short" && <Input aria-label="Your answer" value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} maxLength={500} />}
            {q.kind === "essay" && <Textarea aria-label="Your answer" rows={10} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} maxLength={5000} />}
          </div>
          <div className="mt-6 flex justify-between">
            <Button variant="outline" disabled={idx === 0} onClick={() => { void save(); setIdx(idx - 1); }}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Previous</Button>
            {idx + 1 < p.questions.length ? <Button onClick={() => { void save(); setIdx(idx + 1); }}>Next <ChevronRight className="ml-1 h-4 w-4" aria-hidden /></Button>
              : <Button disabled={submitting} onClick={() => { if (window.confirm(`Submit now? ${p.questions.length - answered} question(s) unanswered.`)) void submit(); }}>Finish and submit</Button>}
          </div>
        </section>
        <aside className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="mb-3 text-sm font-semibold">Questions</p>
          <div className="grid grid-cols-5 gap-2">
            {p.questions.map((x, i) => {
              const done = answers[x.id] !== undefined && answers[x.id] !== "";
              return <button key={x.id} type="button" onClick={() => { void save(); setIdx(i); }} aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                className={cn("h-9 rounded-lg text-sm font-medium transition-colors", i === idx ? "ring-2 ring-primary" : "", done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")}>{i + 1}</button>;
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Answers save automatically. Leaving this tab, copying or pasting is recorded and reported to your teacher.</p>
        </aside>
      </div>
    </main>
  );
};

export default CbtTakePage;
