import { useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, RotateCcw, Send, Trash2, Upload } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAssessmentSubmissions, useAssignment, useAssignmentActions, useSubmissionDetail, type SubmissionRow } from "@/hooks/useAssignments";
import type { Assessment } from "@/hooks/useSchoolData";
import { downloadStoredFile, fileToBase64, formatBytes } from "@/lib/files";
import { errorText, fmtDateTime } from "./shared";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  draft: "bg-info/10 text-info",
  submitted: "bg-success/10 text-success",
  late: "bg-warning/15 text-warning",
  returned: "bg-warning/15 text-warning",
  marked: "bg-primary/10 text-primary",
};
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started", draft: "Working", submitted: "Handed in", late: "Handed in late", returned: "Returned", marked: "Marked",
};

export const SubmissionChip = ({ status }: { status: string }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", STATUS_STYLE[status] ?? STATUS_STYLE.draft)}>{STATUS_LABEL[status] ?? status}</span>
);

const FileLink = ({ id, name, size }: { id: string; name: string; size: number }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await downloadStoredFile(id); } catch (e) { toast({ title: "Could not download", description: errorText(e), variant: "destructive" }); } finally { setBusy(false); }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} {name} <span className="text-muted-foreground">({formatBytes(size)})</span>
    </button>
  );
};
export { FileLink };

const WorkViewer = ({ id, onClose, canReturn }: { id: string | null; onClose: () => void; canReturn: boolean }) => {
  const { toast } = useToast();
  const detail = useSubmissionDetail(id);
  const { returnWork } = useAssignmentActions();
  const [note, setNote] = useState("");
  const d = detail.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{d?.student ?? "Student work"}</DialogTitle>
          <DialogDescription>
            {d ? `Attempt ${d.attempt} · ${STATUS_LABEL[d.status] ?? d.status}${d.submitted_at ? ` · handed in ${fmtDateTime(d.submitted_at)}` : ""}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>
        {detail.isError && <p role="alert" className="text-sm text-destructive">{errorText(detail.error)}</p>}
        {d && (
          <div className="space-y-4">
            {d.is_late && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                Handed in after the deadline.{d.late_policy === "penalty" && d.late_penalty_percent !== null ? ` Your late rule suggests a ${d.late_penalty_percent}% deduction. Nothing is deducted automatically.` : ""}
              </p>
            )}
            {d.rubric.length > 0 && (
              <div className="rounded-lg bg-muted/60 p-3 text-xs">
                <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Rubric</p>
                <ul>{d.rubric.map((r, i) => <li key={i}>{r.criterion}: {r.points} points</li>)}</ul>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Typed answer</p>
              {d.text_answer ? <p className="whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-sm">{d.text_answer}</p> : <p className="text-sm text-muted-foreground">None.</p>}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Files</p>
              {d.files.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <div className="flex flex-wrap gap-2">{d.files.map((f) => <FileLink key={f.id} id={f.id} name={f.name} size={f.size} />)}</div>}
            </div>
            {d.return_note && <p className="text-xs text-muted-foreground">Last note to the student: {d.return_note}</p>}
            {canReturn && ["submitted", "late", "marked"].includes(d.status) && (
              <div className="space-y-2 border-t border-border pt-3">
                <Label htmlFor="ret-note">Return for resubmission (tell the student what to improve)</Label>
                <Textarea id="ret-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
                <Button
                  variant="outline" size="sm" disabled={!note.trim() || returnWork.isPending}
                  onClick={async () => {
                    try {
                      await returnWork.mutateAsync({ submissionId: d.id, note: note.trim() });
                      toast({ title: "Returned to the student" });
                      setNote("");
                    } catch (e) { toast({ title: "Could not return the work", description: errorText(e), variant: "destructive" }); }
                  }}
                >
                  <RotateCcw className="mr-1 h-4 w-4" /> Return for resubmission
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Release, attachments and student submissions for one assessment (teacher view). */
const AssignmentPanel = ({ assessment: a }: { assessment: Assessment }) => {
  const { toast } = useToast();
  const detail = useAssignment(a.id);
  const takes = a.submission_format !== "none";
  const subs = useAssessmentSubmissions(a.id, takes);
  const { release, attach, removeFile } = useAssignmentActions();
  const [viewing, setViewing] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const editable = a.status === "draft";
  const released = !!a.released_at;
  const files = detail.data?.files ?? [];
  const rows: SubmissionRow[] = subs.data ?? [];
  const handed = rows.filter((r) => ["submitted", "late", "marked"].includes(r.status)).length;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await attach.mutateAsync({ assessmentId: a.id, name: file.name, b64: await fileToBase64(file) });
      toast({ title: "Attachment added" });
    } catch (e) {
      toast({ title: "Could not attach the file", description: errorText(e), variant: "destructive" });
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const toggleRelease = async () => {
    try {
      await release.mutateAsync({ assessmentId: a.id, release: !released });
      toast({ title: released ? "Withdrawn from students" : "Released to your class", description: released ? undefined : "Students and their parents have been notified." });
    } catch (e) {
      toast({ title: released ? "Could not withdraw" : "Could not release", description: errorText(e), variant: "destructive" });
    }
  };

  return (
    <>
      <Panel title={takes ? "Assignment for students" : "Attachments and release"} icon={FileText}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", released ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
            {released ? `Released ${fmtDateTime(a.released_at)}` : "Not released: students cannot see it"}
          </span>
          {takes && a.deadline_at && <span className="text-muted-foreground">Deadline {fmtDateTime(a.deadline_at)}</span>}
          {takes && <span className="text-muted-foreground capitalize">{a.submission_format.replace(/_/g, " ")}</span>}
          {editable && (
            <Button size="sm" variant={released ? "outline" : "default"} className="ml-auto" disabled={release.isPending} onClick={toggleRelease}>
              {release.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              {released ? "Withdraw" : "Release to class"}
            </Button>
          )}
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments for students</p>
            {editable && (
              <>
                <input ref={input} type="file" className="sr-only" id={`att-${a.id}`} accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv,.png,.jpg,.jpeg" onChange={(e) => upload(e.target.files?.[0])} />
                <Button size="sm" variant="outline" disabled={attach.isPending} onClick={() => input.current?.click()}>
                  {attach.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Add file
                </Button>
              </>
            )}
          </div>
          {files.length === 0 ? <p className="text-sm text-muted-foreground">No attachments.</p> : (
            <ul className="flex flex-wrap gap-2">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-1">
                  <FileLink id={f.id} name={f.name} size={f.size} />
                  {editable && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove ${f.name}`} disabled={removeFile.isPending}
                      onClick={async () => { try { await removeFile.mutateAsync(f.id); } catch (e) { toast({ title: "Could not remove", description: errorText(e), variant: "destructive" }); } }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {takes && released && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Submissions ({handed} of {rows.length} handed in)
            </p>
            {subs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {subs.isError && <p role="alert" className="text-sm text-destructive">{errorText(subs.error)}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.student_id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.student_name}</td>
                      <td className="px-3 py-2"><SubmissionChip status={r.status} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {r.submitted_at ? fmtDateTime(r.submitted_at) : "—"}{r.files > 0 ? ` · ${r.files} file${r.files === 1 ? "" : "s"}` : ""}{r.has_text ? " · typed" : ""}
                      </td>
                      <td className="py-2 text-right">
                        {r.submission_id && r.status !== "draft" && (
                          <Button size="sm" variant="outline" onClick={() => setViewing(r.submission_id)}><Paperclip className="mr-1 h-3.5 w-3.5" /> View work</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
      <WorkViewer id={viewing} onClose={() => setViewing(null)} canReturn={editable} />
    </>
  );
};

export default AssignmentPanel;
