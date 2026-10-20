import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCorrections, useResultsActions, useResultsPolicy, useVersions } from "@/hooks/useResults";
import type { Assessment, Mark } from "@/hooks/useSchoolData";
import { errorText, fmtDateTime, fmtNum, type Lookups } from "./shared";

interface CorrectionProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolId: string;
  assessment: Assessment;
  mark: Mark;
  studentName: string;
}

/** Ask for a change to a published score. Whether it applies at once depends on the school's policy and your role. */
export const CorrectionDialog = ({ open, onOpenChange, schoolId, assessment: a, mark, studentName }: CorrectionProps) => {
  const { toast } = useToast();
  const { can } = useAuth();
  const policy = useResultsPolicy(schoolId);
  const { request } = useResultsActions(schoolId);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setScore(mark.score === null ? "" : String(mark.score));
      setComment(mark.comment ?? "");
      setReason("");
    }
  }, [open, mark.score, mark.comment]);

  const n = Number(score);
  const scoreOk = score.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= a.max_score;
  const changed = scoreOk && (n !== Number(mark.score) || comment.trim() !== (mark.comment ?? ""));
  const immediate = can("grades.approve") || policy.data?.correction_approval_required === false;

  const submit = async () => {
    try {
      await request.mutateAsync({ assessmentId: a.id, studentId: mark.student_id, score: n, comment: comment.trim(), reason: reason.trim() });
      toast({
        title: immediate ? "Result corrected" : "Correction sent for approval",
        description: immediate ? "The previous version is kept in the history." : "The published result stays as it is until it is approved.",
      });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Correction not saved", description: errorText(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Correct a published result</DialogTitle>
          <DialogDescription>
            {studentName} · {a.title}. Currently {mark.score === null ? "no score" : `${fmtNum(Number(mark.score))} out of ${fmtNum(a.max_score)}`}.{" "}
            {immediate
              ? "This change applies straight away, and students and parents are told the result was updated."
              : "Your school requires approval: the published result stays unchanged until an administrator approves this."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="corr-score">Corrected score (0 to {fmtNum(a.max_score)})</Label>
            <Input id="corr-score" inputMode="decimal" value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={score !== "" && !scoreOk} />
            {score !== "" && !scoreOk && <p role="alert" className="text-xs text-destructive">Enter a number from 0 to {fmtNum(a.max_score)}.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="corr-comment">Teacher feedback</Label>
            <Textarea id="corr-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="corr-reason">Reason for the correction (required)</Label>
            <Textarea id="corr-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!changed || !reason.trim() || request.isPending} onClick={submit}>
            {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {immediate ? "Save correction" : "Send for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Every value this result has had, newest first, with who changed it and why. */
export const HistoryDialog = ({
  open, onOpenChange, schoolId, assessment, studentId, studentName, lookups,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; schoolId: string; assessment: Assessment; studentId: string; studentName: string; lookups: Lookups;
}) => {
  const versions = useVersions(open ? assessment.id : null, open ? studentId : null);
  const corrections = useCorrections(schoolId, open);
  const mine = (corrections.data ?? []).filter((c) => c.assessment_id === assessment.id && c.student_id === studentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Result history</DialogTitle>
          <DialogDescription>{studentName} · {assessment.title}</DialogDescription>
        </DialogHeader>
        {versions.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {versions.isError && <p role="alert" className="text-sm text-destructive">{errorText(versions.error)}</p>}
        <ol className="space-y-3">
          {(versions.data ?? []).map((v) => (
            <li key={v.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Version {v.version}: {v.score === null ? "—" : `${fmtNum(Number(v.score))} / ${fmtNum(Number(v.max_score))}`}{v.grade ? ` (${v.grade})` : ""}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(v.created_at)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {v.reason ?? "Published"} · by {lookups.personName.get(v.changed_by ?? "") ?? "a staff member"}{v.changed_role ? ` (${v.changed_role.replace(/_/g, " ")})` : ""}
              </p>
              {v.comment && <p className="mt-1 text-xs">Feedback: {v.comment}</p>}
            </li>
          ))}
        </ol>
        {mine.some((c) => c.status !== "approved") && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other correction requests</p>
            <ul className="space-y-2">
              {mine.filter((c) => c.status !== "approved").map((c) => (
                <li key={c.id} className="rounded-lg bg-muted/60 p-3 text-xs">
                  <span className="font-medium capitalize">{c.status}</span>: {c.old_score === null ? "—" : fmtNum(Number(c.old_score))} → {c.new_score === null ? "—" : fmtNum(Number(c.new_score))}. {c.reason}
                  {c.decision_note ? ` Decision: ${c.decision_note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
