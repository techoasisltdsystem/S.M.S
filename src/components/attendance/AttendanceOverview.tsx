import { useMemo } from "react";
import { BarChart3, TrendingDown } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Progress } from "@/components/ui/progress";
import { useAttendance, useClasses, useDirectory } from "@/hooks/useSchoolData";
import { ErrorBox, LoadingRows, firstError } from "@/components/students/QueryState";
import { isoDaysAgo, rateOf } from "./shared";

const MIN_RECORDS = 3;

export const AttendanceOverview = () => {
  const { user } = useAuth();
  const schoolId = user!.schoolId;
  const attendance = useAttendance(schoolId);
  const classes = useClasses(schoolId);
  const directory = useDirectory(schoolId);
  const queries = [attendance, classes, directory];
  const error = firstError(...queries);

  const { perClass, lowest, total } = useMemo(() => {
    const since = isoDaysAgo(30);
    const recent = (attendance.data ?? []).filter((r) => r.date >= since);
    const perClass = (classes.data ?? [])
      .map((c) => {
        const recs = recent.filter((r) => r.class_id === c.id);
        return { id: c.id, name: c.name, count: recs.length, rate: rateOf(recs) };
      })
      .filter((c) => c.rate !== null);
    const ids = [...new Set(recent.map((r) => r.student_id))];
    const names = new Map((directory.data ?? []).map((p) => [p.profile_id, p.full_name]));
    const lowest = ids
      .map((id) => {
        const recs = recent.filter((r) => r.student_id === id);
        return { id, name: names.get(id) ?? "Unknown student", count: recs.length, rate: rateOf(recs) };
      })
      .filter((s) => s.rate !== null && s.count >= MIN_RECORDS)
      .sort((a, b) => a.rate! - b.rate!)
      .slice(0, 10);
    return { perClass, lowest, total: recent.length };
  }, [attendance.data, classes.data, directory.data]);

  if (error) return <ErrorBox message={error} onRetry={() => queries.forEach((q) => q.refetch())} />;
  if (queries.some((q) => q.isLoading)) return <LoadingRows />;
  if (total === 0)
    return <EmptyState icon={BarChart3} title="Not enough records yet" text="Attendance rates appear once teachers have recorded attendance in the last 30 days." />;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Attendance rate by class (last 30 days)" icon={BarChart3}>
        <p className="mb-3 text-xs text-muted-foreground">Present and late count as attended. Excused days are left out.</p>
        <ul className="space-y-3">
          {perClass
            .sort((a, b) => a.rate! - b.rate!)
            .map((c) => (
              <li key={c.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span>{c.rate}%</span>
                </div>
                <Progress value={c.rate!} aria-label={`${c.name} attendance rate`} />
              </li>
            ))}
        </ul>
      </Panel>
      <Panel title="Lowest attendance (last 30 days)" icon={TrendingDown}>
        {lowest.length === 0 ? (
          <EmptyState icon={TrendingDown} title="Not enough records yet" text={`A student needs at least ${MIN_RECORDS} records in 30 days to be ranked.`} />
        ) : (
          <ol className="divide-y divide-border">
            {lowest.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">
                  {s.rate}% <span className="text-xs">({s.count} records)</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
};
