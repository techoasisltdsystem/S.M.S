import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, RotateCcw, Send } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { useToast } from "@/hooks/use-toast";
import { average, pct, useAssessments, useEnrollments, useMarks, useRefreshSchoolData, type Assessment } from "@/hooks/useSchoolData";
import { errorText, fmtDateTime, fmtNum, ListSkeleton, LoadError, StatusChip, type Lookups } from "./shared";

type Filter = "all" | "submitted" | "approved" | "published" | "draft";
type Target = "approved" | "published" | "draft";

const ReviewQueue = ({ schoolId, lookups }: { schoolId: string; lookups: Lookups }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const assessments = useAssessments(schoolId);
  const marks = useMarks(schoolId);
  const enrollments = useEnrollments(schoolId);
  const refresh = useRefreshSchoolData();
  const [filter, setFilter] = useState<Filter>("submitted");
  const [viewId, setViewId] = useState<string | null>(null);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const list = useMemo(() => {
    const all = assessments.data ?? [];
    return filter === "all" ? all.filter((a) => a.status !== "draft") : all.filter((a) => a.status === filter);
  }, [assessments.data, filter]);

  const queries = [assessments, marks, enrollments];
  if (queries.some((q) => q.isLoading) || lookups.loading) return <ListSkeleton />;
  const failed = queries.find((q) => q.isError);
  if (failed || lookups.error) {
    return <LoadError message={(failed?.error as Error | undefined)?.message ?? lookups.error?.message ?? "Could not load results."} onRetry={() => { queries.forEach((q) => q.isError && q.refetch()); lookups.refetch(); }} />;
  }

  const move = async (a: Assessment, to: Target, why?: string) => {
    setBusy(a.id + to);
    try {
      const { error } = await db.rpc("move_assessment", { _assessment: a.id, _to: to, _reason: why });
      if (error) throw error;
      toast({ title: to === "approved" ? "Results approved" : to === "published" ? "Results published" : "Results reopened" });
      refresh();
      return true;
    } catch (err) {
      toast({ title: "Could not update the results", description: errorText(err), variant: "destructive" });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const statsFor = (a: Assessment) => {
    const ms = (marks.data ?? []).filter((m) => m.assessment_id === a.id && m.score !== null);
    const enrolled = (enrollments.data ?? []).filter((e) => e.class_id === a.class_id && e.status === "active").length;
    return { ms, enrolled, avg: average(ms.map((m) => pct(Number(m.score), a.max_score))) };
  };

  const view = (assessments.data ?? []).find((a) => a.id === viewId) ?? null;
  const reopen = (assessments.data ?? []).find((a) => a.id === reopenId) ?? null;
  const canApprove = can("grades.approve");
  const canPublish = can("grades.publish");
  const canReopen = can("grades.reopen");

  return (
    <>
      <Panel title="Results review" icon={ClipboardCheck}>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="submitted">Submitted</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="draft">Drafts</TabsTrigger>
            <TabsTrigger value="all">All sent in</TabsTrigger>
          </TabsList>
        </Tabs>
        {list.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={filter === "submitted" ? "Nothing is waiting for approval" : "No assessments here"}
            text="Teachers submit results from their Exams page. They show up here for review."
          />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((a) => {
              const s = statsFor(a);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lookups.className.get(a.class_id)} · {lookups.subjectName.get(a.subject_id)} · by {lookups.personName.get(a.created_by ?? "") ?? "a teacher"} · out of {fmtNum(a.max_score)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ms.length}/{s.enrolled} marked{s.avg !== null ? ` · average ${s.avg.toFixed(1)}%` : ""}
                      {a.submitted_at ? ` · submitted ${fmtDateTime(a.submitted_at)}` : ""}
                    </p>
                  </div>
                  <StatusChip status={a.status} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setViewId(a.id)}>Review marks</Button>
                    {a.status === "submitted" && canApprove && (
                      <Button size="sm" disabled={busy !== null} onClick={() => move(a, "approved")}>
                        {busy === a.id + "approved" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                        Approve
                      </Button>
                    )}
                    {a.status === "approved" && canPublish && (
                      <Button size="sm" disabled={busy !== null} onClick={() => move(a, "published")}>
                        {busy === a.id + "published" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                        Publish
                      </Button>
                    )}
                    {a.status !== "draft" && canReopen && (
                      <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => { setReason(""); setReopenId(a.id); }}>
                        <RotateCcw className="mr-1 h-4 w-4" /> Reopen
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!canApprove && !canPublish && !canReopen && (
          <p className="mt-4 text-xs text-muted-foreground">You have read-only access to results. Approving and publishing is done by school administrators.</p>
        )}
      </Panel>

      <Dialog open={!!view} onOpenChange={(o) => !o && setViewId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{view.title}</DialogTitle>
                <DialogDescription>
                  {lookups.className.get(view.class_id)} · {lookups.subjectName.get(view.subject_id)} · out of {fmtNum(view.max_score)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <StatusChip status={view.status} />
                <span>Teacher: {lookups.personName.get(view.created_by ?? "") ?? "—"}</span>
                <span>Submitted: {fmtDateTime(view.submitted_at)}</span>
                {view.approved_at && <span>Approved by {lookups.personName.get(view.approved_by ?? "") ?? "an administrator"}, {fmtDateTime(view.approved_at)}</span>}
                {view.published_at && <span>Published: {fmtDateTime(view.published_at)}</span>}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 font-medium">Student</th><th className="py-2 font-medium">Score</th><th className="py-2 font-medium">%</th><th className="py-2 font-medium">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {(marks.data ?? [])
                    .filter((m) => m.assessment_id === view.id)
                    .map((m) => ({ m, name: lookups.personName.get(m.student_id) ?? "Unnamed student" }))
                    .sort((x, y) => x.name.localeCompare(y.name))
                    .map(({ m, name }) => (
                      <tr key={m.id} className="border-b border-border last:border-0">
                        <td className="py-2 font-medium">{name}</td>
                        <td className="py-2">{m.score === null ? "—" : fmtNum(Number(m.score))}</td>
                        <td className="py-2 text-muted-foreground">{m.score === null ? "—" : `${pct(Number(m.score), view.max_score).toFixed(0)}%`}</td>
                        <td className="py-2 text-muted-foreground">{m.comment || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {statsFor(view).ms.length === 0 && <p className="text-sm text-muted-foreground">No marks have been entered for this assessment.</p>}
              <DialogFooter className="gap-2">
                {view.status === "submitted" && canApprove && (
                  <Button disabled={busy !== null} onClick={async () => { if (await move(view, "approved")) setViewId(null); }}>Approve</Button>
                )}
                {view.status === "approved" && canPublish && (
                  <Button disabled={busy !== null} onClick={async () => { if (await move(view, "published")) setViewId(null); }}>Publish</Button>
                )}
                <Button variant="outline" onClick={() => setViewId(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reopen} onOpenChange={(o) => !o && setReopenId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Reopen results</DialogTitle>
            <DialogDescription>
              {reopen?.title}: this returns the results to draft so the teacher can correct them. Students and parents will no longer see them. The reason is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reopen-reason">Reason</Label>
            <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReopenId(null)}>Cancel</Button>
            <Button
              disabled={!reason.trim() || busy !== null}
              onClick={async () => { if (reopen && (await move(reopen, "draft", reason.trim()))) setReopenId(null); }}
            >
              Reopen results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReviewQueue;
