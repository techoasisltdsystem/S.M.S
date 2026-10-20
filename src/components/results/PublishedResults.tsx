import { useMemo } from "react";
import { GraduationCap, Info } from "lucide-react";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { average, pct, useAssessments, useMarks, useStanding } from "@/hooks/useSchoolData";
import { fmtDate, fmtNum, ListSkeleton, LoadError, type Lookups } from "./shared";
import DownloadMenu from "./DownloadMenu";

/** Published results for one student (the signed-in student, or a parent's chosen child). */
const PublishedResults = ({ schoolId, studentId, lookups }: { schoolId: string; studentId: string; lookups: Lookups }) => {
  const assessments = useAssessments(schoolId);
  const marks = useMarks(schoolId);
  const standing = useStanding(studentId);

  const bySubject = useMemo(() => {
    const aMap = new Map((assessments.data ?? []).filter((a) => a.status === "published").map((a) => [a.id, a]));
    const groups = new Map<string, { id: string; title: string; score: number; max: number; date: string; comment: string | null }[]>();
    for (const m of marks.data ?? []) {
      const a = aMap.get(m.assessment_id);
      if (!a || m.student_id !== studentId || m.score === null) continue;
      const list = groups.get(a.subject_id) ?? [];
      list.push({ id: a.id, title: a.title, score: Number(m.score), max: a.max_score, date: a.published_at ?? a.due_on ?? a.created_at, comment: m.comment });
      groups.set(a.subject_id, list);
    }
    return [...groups.entries()]
      .map(([subjectId, items]) => ({ subjectId, name: lookups.subjectName.get(subjectId) ?? "Subject", items: items.sort((x, y) => y.date.localeCompare(x.date)) }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }, [assessments.data, marks.data, studentId, lookups.subjectName]);

  const queries = [assessments, marks];
  if (queries.some((q) => q.isLoading) || lookups.loading) return <ListSkeleton />;
  const failed = queries.find((q) => q.isError);
  if (failed || lookups.error) {
    return <LoadError message={(failed?.error as Error | undefined)?.message ?? lookups.error?.message ?? "Could not load results."} onRetry={() => { queries.forEach((q) => q.isError && q.refetch()); lookups.refetch(); }} />;
  }

  const s = standing.data;
  const overall = average(bySubject.flatMap((g) => g.items.map((i) => pct(i.score, i.max))));
  const shownAvg = s?.average ?? overall;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Results appear here after the school has checked and published them.
        </p>
        <DownloadMenu target={{ kind: "student", studentId, label: lookups.personName.get(studentId) }} label="Download report" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs text-muted-foreground">Average</p>
          <p className="font-heading text-2xl font-bold">{shownAvg === null ? "—" : `${shownAvg.toFixed(1)}%`}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs text-muted-foreground">Class position</p>
          <p className="font-heading text-2xl font-bold">
            {standing.isLoading ? "…" : s?.rank ? `${s.rank} of ${s.class_size}` : "Not ranked yet"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs text-muted-foreground">Published results</p>
          <p className="font-heading text-2xl font-bold">{bySubject.reduce((n, g) => n + g.items.length, 0)}</p>
        </div>
      </div>
      {standing.isError && <p role="alert" className="text-xs text-destructive">Class position could not be loaded: {(standing.error as Error).message}</p>}

      {bySubject.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No published results yet" text="Check back after your teachers' results have been approved and published." />
      ) : (
        bySubject.map((g) => {
          const subjectAvg = average(g.items.map((i) => pct(i.score, i.max)));
          return (
            <Panel key={g.subjectId} title={g.name} icon={GraduationCap}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Assessment</th>
                      <th className="px-3 py-2 font-medium">Score</th>
                      <th className="px-3 py-2 font-medium">%</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => (
                      <tr key={i.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 font-medium">{i.title}</td>
                        <td className="px-3 py-2">{fmtNum(i.score)} / {fmtNum(i.max)}</td>
                        <td className="px-3 py-2">{pct(i.score, i.max).toFixed(0)}%</td>
                        <td className="px-3 py-2 text-muted-foreground">{fmtDate(i.date)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{i.comment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {subjectAvg !== null && <p className="mt-3 text-xs text-muted-foreground">Subject average: {subjectAvg.toFixed(1)}%</p>}
            </Panel>
          );
        })
      )}
    </div>
  );
};

export default PublishedResults;
