import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, Clock, Loader2, Save, Send, Trash2, Upload } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { FileLink, SubmissionChip } from "@/components/results/AssignmentPanel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAssignment, useAssignmentActions, useMyAssignments, type AssignmentDetail } from "@/hooks/useAssignments";
import { fileToBase64 } from "@/lib/files";
import { cn } from "@/lib/utils";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "No deadline";

const useCountdown = (iso: string | null | undefined) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  return ms;
};

const clock = (ms: number) => {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const Workspace = ({ assessmentId, onBack }: { assessmentId: string; onBack: () => void }) => {
  const { toast } = useToast();
  const detail = useAssignment(assessmentId);
  const { start, save, upload, submit } = useAssignmentActions();
  const { removeFile } = useAssignmentActions();
  const d = detail.data as AssignmentDetail | undefined;
  const sub = d?.submission ?? null;
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [receipt, setReceipt] = useState<{ receipt: string; late: boolean; penalty_percent: number | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const left = useCountdown(sub && ["draft", "returned"].includes(sub.status) ? sub.due_by : null);

  useEffect(() => {
    if (sub) { setText(sub.text_answer ?? ""); setDirty(false); }
  }, [sub?.id, sub?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = !!sub && ["draft", "returned"].includes(sub.status);
  const a = d?.assessment;
  const allowsText = !!a && a.submission_format !== "file";
  const allowsFiles = !!a && ["file", "file_or_text"].includes(a.submission_format);

  const saveNow = async (quiet = false) => {
    if (!sub || !dirty || !allowsText) return true;
    try {
      await save.mutateAsync({ submissionId: sub.id, text });
      setDirty(false);
      if (!quiet) toast({ title: "Draft saved" });
      return true;
    } catch (e) {
      toast({ title: "Draft not saved", description: errMsg(e), variant: "destructive" });
      return false;
    }
  };

  // Typed answers are saved automatically so nothing is lost if the page closes.
  useEffect(() => {
    if (!editable || !dirty) return;
    const t = window.setTimeout(() => void saveNow(true), 8000);
    return () => window.clearTimeout(t);
  }, [text, dirty, editable]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSubmit = async () => {
    if (!sub) return;
    setConfirm(false);
    if (!(await saveNow(true))) return;
    try {
      const r = await submit.mutateAsync(sub.id);
      setReceipt({ receipt: r.receipt, late: r.late, penalty_percent: r.penalty_percent });
      toast({ title: "Submitted", description: `Receipt ${r.receipt}` });
    } catch (e) {
      toast({ title: "Could not submit", description: errMsg(e), variant: "destructive" });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !sub) return;
    try {
      await upload.mutateAsync({ submissionId: sub.id, name: file.name, b64: await fileToBase64(file) });
      toast({ title: "File uploaded" });
    } catch (e) {
      toast({ title: "File not uploaded", description: errMsg(e), variant: "destructive" });
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (detail.isLoading) return <LoadingRows rows={4} />;
  if (detail.isError || !a) return <ErrorBox message={errMsg(detail.error, "Could not open this assignment.")} onRetry={() => detail.refetch()} />;

  const online = a.submission_format === "online";
  const canAnother = !!sub && !editable && a.attempts_allowed > sub.attempt;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" /> All assignments</Button>
      <Panel title={a.title}>
        <p className="text-sm text-muted-foreground">{a.subject} · {a.class} · out of {a.max_score}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" aria-hidden /> Deadline {fmt(a.deadline_at)}</span>
          {a.duration_minutes && <span>Time allowed: {a.duration_minutes} minutes</span>}
          {sub && <SubmissionChip status={sub.status} />}
          {left !== null && editable && (
            <span role="timer" aria-live="off" className={cn("rounded-full px-3 py-1 font-semibold tabular-nums", left < 5 * 60_000 ? "bg-destructive/10 text-destructive" : "bg-muted")}>
              {left <= 0 ? "Time is up" : `Time left ${clock(left)}`}
            </span>
          )}
        </div>
        {a.description && <p className="mt-3 whitespace-pre-wrap text-sm">{a.description}</p>}
        {a.instructions && (
          <div className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instructions</p>
            <p className="whitespace-pre-wrap">{a.instructions}</p>
          </div>
        )}
        {a.rubric.length > 0 && (
          <div className="mt-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">How it will be marked</p>
            <ul className="list-disc pl-5">{a.rubric.map((r, i) => <li key={i}>{r.criterion}: {r.points} points</li>)}</ul>
          </div>
        )}
        {d!.files.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files from your teacher</p>
            <div className="flex flex-wrap gap-2">{d!.files.map((f) => <FileLink key={f.id} id={f.id} name={f.name} size={f.size} />)}</div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {a.late_policy === "not_allowed" ? "Work handed in after the deadline is not accepted." : "Late work is accepted and marked as late."}
          {a.attempts_allowed > 1 ? ` You may attempt this up to ${a.attempts_allowed} times.` : ""}
        </p>
      </Panel>

      {!sub && (
        <Panel title="Your work">
          <p className="mb-3 text-sm text-muted-foreground">
            {online ? `The timer starts as soon as you press Start and lasts ${a.duration_minutes} minutes.` : "Start when you are ready. Your draft is saved as you go."}
          </p>
          <Button
            disabled={start.isPending}
            onClick={async () => {
              try { await start.mutateAsync(assessmentId); } catch (e) { toast({ title: "Cannot start", description: errMsg(e), variant: "destructive" }); }
            }}
          >
            {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} {online ? "Start the exam" : "Start"}
          </Button>
        </Panel>
      )}

      {sub && (
        <Panel title={editable ? "Your work" : "Your submission"}>
          {sub.status === "returned" && sub.return_note && (
            <p role="status" className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">Your teacher returned this for changes: {sub.return_note}</p>
          )}
          {(receipt || (!editable && sub.submitted_at)) && (
            <p role="status" className="mb-3 flex items-start gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                Handed in {fmt(sub.submitted_at)}. Receipt {receipt?.receipt ?? sub.receipt}.
                {(receipt?.late ?? sub.is_late) ? " Marked as late." : ""}
              </span>
            </p>
          )}

          {allowsText && (
            <div className="space-y-2">
              <label htmlFor="answer" className="text-sm font-medium">Your answer</label>
              <Textarea
                id="answer" rows={online ? 14 : 8} value={text} readOnly={!editable} maxLength={20000}
                onChange={(e) => { setText(e.target.value); setDirty(true); }}
                onBlur={() => void saveNow(true)}
              />
              {editable && <p className="text-xs text-muted-foreground">{text.length.toLocaleString()} / 20,000 characters{dirty ? " · unsaved changes" : " · saved"}</p>}
            </div>
          )}

          {allowsFiles && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Your files</p>
                {editable && (
                  <>
                    <input ref={fileInput} type="file" id="upload" className="sr-only" accept={a.allowed_file_types.map((t) => `.${t}`).join(",")} onChange={(e) => onFile(e.target.files?.[0])} />
                    <Button size="sm" variant="outline" disabled={upload.isPending || sub.files.length >= a.max_files} onClick={() => fileInput.current?.click()}>
                      {upload.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Upload className="mr-1 h-4 w-4" aria-hidden />} Upload a file
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Allowed: {a.allowed_file_types.map((t) => `.${t}`).join(", ")} · up to {a.max_file_mb} MB each · at most {a.max_files} files.</p>
              {sub.files.length === 0 ? <p className="text-sm text-muted-foreground">No files yet.</p> : (
                <ul className="flex flex-wrap gap-2">
                  {sub.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-1">
                      <FileLink id={f.id} name={f.name} size={f.size} />
                      {editable && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${f.name}`} disabled={removeFile.isPending}
                          onClick={async () => { try { await removeFile.mutateAsync(f.id); } catch (e) { toast({ title: "Could not remove", description: errMsg(e), variant: "destructive" }); } }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {editable && (
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {allowsText && <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => void saveNow()}><Save className="mr-2 h-4 w-4" aria-hidden /> Save draft</Button>}
              <Button disabled={submit.isPending} onClick={() => setConfirm(true)}>
                {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />} Submit
              </Button>
            </div>
          )}
          {!editable && sub.status === "marked" && <p className="mt-3 text-xs text-muted-foreground">Your work has been marked. The score appears under Results once your school publishes it.</p>}
          {canAnother && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs text-muted-foreground">You have used {sub!.attempt} of {a.attempts_allowed} attempts.</p>
              <Button variant="outline" size="sm" disabled={start.isPending}
                onClick={async () => { try { await start.mutateAsync(assessmentId); } catch (e) { toast({ title: "Cannot start another attempt", description: errMsg(e), variant: "destructive" }); } }}>
                Start another attempt
              </Button>
            </div>
          )}
        </Panel>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hand in your work?</AlertDialogTitle>
            <AlertDialogDescription>You cannot change it after handing it in unless your teacher returns it. You will get a receipt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit}>Hand in</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const AssignmentsPage = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? "";
  const list = useMyAssignments(schoolId, user?.role === "student");
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => list.data ?? [], [list.data]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Assignments</h1>
          <p className="text-sm text-muted-foreground">Homework, assignments and online exams from your teachers.</p>
        </div>
        {user?.role !== "student" ? (
          <EmptyState icon={ClipboardList} title="Assignments are for students" text="Teachers create and release assignments from Exams and results." action={{ to: "/exams", label: "Open Exams and results" }} />
        ) : open ? (
          <Workspace key={open} assessmentId={open} onBack={() => setOpen(null)} />
        ) : (
          <>
            {list.isLoading && <LoadingRows />}
            {list.isError && <ErrorBox message={errMsg(list.error)} onRetry={() => list.refetch()} />}
            {!list.isLoading && !list.isError && rows.length === 0 && <EmptyState icon={ClipboardList} title="No assignments yet" text="When a teacher releases one it appears here and you get a notification." />}
            <ul className="space-y-3">
              {rows.map((r) => {
                const overdue = r.deadline_at && new Date(r.deadline_at) < new Date() && !["submitted", "late", "marked"].includes(r.submission_status ?? "");
                return (
                  <li key={r.assessment_id}>
                    <button type="button" onClick={() => setOpen(r.assessment_id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-card hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-card-foreground">{r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.subject_name} · <span className="capitalize">{r.kind}</span> · {r.submission_format === "online" ? `timed, ${r.duration_minutes} min` : r.submission_format.replace(/_/g, " ")}
                        </p>
                        <p className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>Deadline {fmt(r.deadline_at)}{overdue ? " (passed)" : ""}</p>
                      </div>
                      <SubmissionChip status={r.submission_status ?? "not_started"} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AssignmentsPage;
