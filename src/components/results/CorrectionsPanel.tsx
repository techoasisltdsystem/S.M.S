import { useState } from "react";
import { CheckCircle2, Loader2, PencilLine, XCircle } from "lucide-react";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCorrections, useResultsActions, type Correction } from "@/hooks/useResults";
import { useAssessments } from "@/hooks/useSchoolData";
import { errorText, fmtDateTime, fmtNum, ListSkeleton, LoadError, type Lookups } from "./shared";

const STATUS: Record<Correction["status"], string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

/** Correction requests the signed-in person may see. Approvers can decide pending ones. */
const CorrectionsPanel = ({ schoolId, lookups }: { schoolId: string; lookups: Lookups }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const corrections = useCorrections(schoolId);
  const assessments = useAssessments(schoolId);
  const { decide } = useResultsActions(schoolId);
  const [rejecting, setRejecting] = useState<Correction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const canDecide = can("grades.approve");

  if (corrections.isLoading || assessments.isLoading) return <ListSkeleton rows={2} />;
  if (corrections.isError) return <LoadError message={errorText(corrections.error)} onRetry={() => corrections.refetch()} />;
  const list = corrections.data ?? [];
  const title = (id: string) => assessments.data?.find((a) => a.id === id)?.title ?? "Assessment";
  const pending = list.filter((c) => c.status === "pending");

  const act = async (c: Correction, approve: boolean, why: string) => {
    setBusy(c.id);
    try {
      await decide.mutateAsync({ id: c.id, approve, note: why });
      toast({ title: approve ? "Correction approved and published" : "Correction rejected" });
      setRejecting(null);
    } catch (e) {
      toast({ title: "Could not save the decision", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Panel title={pending.length > 0 ? `Corrections (${pending.length} waiting)` : "Corrections"} icon={PencilLine}>
        {list.length === 0 ? (
          <EmptyState icon={PencilLine} title="No corrections yet" text="Changes to published results appear here with the old and new score, the reason and who approved them." />
        ) : (
          <ul className="divide-y divide-border">
            {list.slice(0, 30).map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-card-foreground">
                    {lookups.personName.get(c.student_id) ?? "Student"} · {title(c.assessment_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.old_score === null ? "—" : fmtNum(Number(c.old_score))} → {c.new_score === null ? "—" : fmtNum(Number(c.new_score))}
                    {c.old_grade || c.new_grade ? ` (grade ${c.old_grade ?? "—"} → ${c.new_grade ?? "—"})` : ""} · requested by {lookups.personName.get(c.requested_by) ?? "staff"} {fmtDateTime(c.requested_at)}
                  </p>
                  <p className="text-xs">Reason: {c.reason}</p>
                  {c.decision_note && <p className="text-xs text-muted-foreground">Decision note: {c.decision_note}</p>}
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${STATUS[c.status]}`}>{c.status}</span>
                {c.status === "pending" && canDecide && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy !== null} onClick={() => act(c, true, "")}>
                      {busy === c.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />} Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setNote(""); setRejecting(c); }}>
                      <XCircle className="mr-1 h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Reject this correction</DialogTitle>
            <DialogDescription>The published result stays as it is. The teacher is told why.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">Reason</Label>
            <Textarea id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button disabled={!note.trim() || busy !== null} onClick={() => rejecting && act(rejecting, false, note.trim())}>Reject correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CorrectionsPanel;
