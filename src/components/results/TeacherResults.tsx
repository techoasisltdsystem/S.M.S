import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, EmptyState } from "@/components/kit/Panel";
import {
  average, pct, useAssessments, useAssignments, useEnrollments, useMarks, useRefreshSchoolData,
} from "@/hooks/useSchoolData";
import Gradebook from "./Gradebook";
import NewAssessmentDialog from "./NewAssessmentDialog";
import { fmtDate, fmtNum, ListSkeleton, LoadError, StatusChip, type Lookups } from "./shared";

const TeacherResults = ({ schoolId, me, lookups }: { schoolId: string; me: string; lookups: Lookups }) => {
  const assignments = useAssignments(schoolId);
  const assessments = useAssessments(schoolId);
  const enrollments = useEnrollments(schoolId);
  const marks = useMarks(schoolId);
  const refresh = useRefreshSchoolData();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const pairs = useMemo(() => (assignments.data ?? []).filter((x) => x.teacher_id === me), [assignments.data, me]);
  const mine = useMemo(
    () => (assessments.data ?? []).filter((a) => pairs.some((p) => p.class_id === a.class_id && p.subject_id === a.subject_id)),
    [assessments.data, pairs],
  );

  const queries = [assignments, assessments, enrollments, marks];
  if (queries.some((q) => q.isLoading) || lookups.loading) return <ListSkeleton />;
  const failed = queries.find((q) => q.isError);
  if (failed || lookups.error) {
    return <LoadError message={(failed?.error as Error | undefined)?.message ?? lookups.error?.message ?? "Could not load results."} onRetry={() => { queries.forEach((q) => q.isError && q.refetch()); lookups.refetch(); }} />;
  }

  const open = mine.find((a) => a.id === openId);
  if (open) {
    return (
      <Gradebook
        key={open.id}
        assessment={open}
        enrollments={enrollments.data ?? []}
        marks={marks.data ?? []}
        lookups={lookups}
        schoolId={schoolId}
        onBack={() => setOpenId(null)}
        onChanged={refresh}
      />
    );
  }

  return (
    <>
      <Panel title="Your assessments" icon={ClipboardList}>
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreating(true)} disabled={pairs.length === 0}><Plus className="mr-2 h-4 w-4" /> New assessment</Button>
        </div>
        {pairs.length === 0 ? (
          <EmptyState icon={ClipboardList} title="You are not assigned to teach any subject yet" text="The school administrator assigns you to a class and subject before you can set assessments." action={{ to: "/classes", label: "View classes" }} />
        ) : mine.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No assessments yet" text="Create your first assessment, then enter marks for your students." />
        ) : (
          <ul className="divide-y divide-border">
            {mine.map((a) => {
              const ms = (marks.data ?? []).filter((m) => m.assessment_id === a.id && m.score !== null);
              const avg = average(ms.map((m) => pct(Number(m.score), a.max_score)));
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-card-foreground">{a.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {lookups.className.get(a.class_id)} · {lookups.subjectName.get(a.subject_id)} · <span className="capitalize">{a.kind}</span> · out of {fmtNum(a.max_score)} · due {fmtDate(a.due_on)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ms.length} marked{avg !== null ? ` · average ${avg.toFixed(1)}%` : ""}
                    </p>
                  </div>
                  <StatusChip status={a.status} />
                  <Button variant="outline" size="sm" onClick={() => setOpenId(a.id)}>{a.status === "draft" ? "Enter marks" : "View"}</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <NewAssessmentDialog open={creating} onOpenChange={setCreating} schoolId={schoolId} pairs={pairs} lookups={lookups} onSaved={refresh} />
    </>
  );
};

export default TeacherResults;
