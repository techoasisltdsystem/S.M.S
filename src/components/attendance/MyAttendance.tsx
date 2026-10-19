import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAttendance, useDirectory, useGuardianLinks } from "@/hooks/useSchoolData";
import { ErrorBox, LoadingRows, firstError } from "@/components/students/QueryState";
import { StatusChip, STATUSES, fmtDate, parseIso, rateOf, tally } from "./shared";

/** Attendance history for a student, or for each verified child of a parent. */
export const MyAttendance = () => {
  const { user } = useAuth();
  const schoolId = user!.schoolId;
  const isParent = user!.role === "parent";
  const attendance = useAttendance(schoolId);
  const links = useGuardianLinks(isParent ? schoolId : undefined);
  const directory = useDirectory(schoolId);
  const queries = isParent ? [attendance, links, directory] : [attendance];
  const error = firstError(...queries);
  const [picked, setPicked] = useState<string | null>(null);

  const children = useMemo(() => {
    if (!isParent) return [];
    const names = new Map((directory.data ?? []).map((p) => [p.profile_id, p.full_name]));
    return (links.data ?? [])
      .filter((l) => l.guardian_id === user!.id && l.status === "verified")
      .map((l) => ({ id: l.student_id, name: names.get(l.student_id) ?? "Your child" }));
  }, [isParent, links.data, directory.data, user]);

  const studentId = isParent ? (children.find((c) => c.id === picked) ?? children[0])?.id : user!.id;
  const recs = useMemo(
    () => (attendance.data ?? []).filter((r) => r.student_id === studentId && r.date).sort((a, b) => b.date.localeCompare(a.date)),
    [attendance.data, studentId],
  );
  const months = useMemo(() => {
    const m = new Map<string, typeof recs>();
    recs.forEach((r) => m.set(r.date.slice(0, 7), [...(m.get(r.date.slice(0, 7)) ?? []), r]));
    return [...m.entries()];
  }, [recs]);

  if (error) return <ErrorBox message={error} onRetry={() => queries.forEach((q) => q.refetch())} />;
  if (queries.some((q) => q.isLoading)) return <LoadingRows />;
  if (isParent && children.length === 0)
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No verified children yet"
        text="The school must verify your link to a child before you can see their attendance. Contact the school office if you are waiting."
      />
    );

  const counts = tally(recs);
  const rate = rateOf(recs);

  return (
    <div className="space-y-6">
      {isParent && children.length > 1 && (
        <ToggleGroup type="single" value={studentId} onValueChange={(v) => v && setPicked(v)} className="flex-wrap justify-start" aria-label="Choose child">
          {children.map((c) => (
            <ToggleGroupItem key={c.id} value={c.id} variant="outline">
              {c.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {recs.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No attendance recorded yet" text="Records appear here after a teacher takes attendance." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-4 shadow-card lg:col-span-1">
              <p className="text-xs text-muted-foreground">Attendance rate</p>
              <p className="font-heading text-3xl font-bold">{rate === null ? "n/a" : `${rate}%`}</p>
            </div>
            {STATUSES.map((s) => (
              <div key={s.value} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="font-heading text-2xl font-bold">{counts[s.value]}</p>
              </div>
            ))}
          </div>
          {months.map(([month, list]) => (
            <Panel key={month} title={parseIso(`${month}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" })} icon={CalendarCheck}>
              <ul className="divide-y divide-border">
                {list.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5">
                    <span className="text-sm">{fmtDate(r.date)}</span>
                    <StatusChip status={r.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </>
      )}
    </div>
  );
};
