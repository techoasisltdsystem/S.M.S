import { Link } from "react-router-dom";
import { ClipboardCheck, GraduationCap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { useAssignments, useAttendance, useClasses, useDirectory, useEnrollments, todayIso } from "@/hooks/useSchoolData";
import { StatusChip } from "@/components/attendance/shared";
import { ErrorBox, LoadingRows, firstError } from "./QueryState";

export const TeacherRoster = () => {
  const { user } = useAuth();
  const schoolId = user!.schoolId;
  const classes = useClasses(schoolId);
  const assignments = useAssignments(schoolId);
  const enrollments = useEnrollments(schoolId);
  const directory = useDirectory(schoolId);
  const attendance = useAttendance(schoolId);
  const queries = [classes, assignments, enrollments, directory, attendance];
  const error = firstError(...queries);
  const today = todayIso();

  const mineIds = new Set((assignments.data ?? []).filter((a) => a.teacher_id === user!.id).map((a) => a.class_id));
  const mine = (classes.data ?? []).filter((c) => c.form_teacher_id === user!.id || mineIds.has(c.id));
  const person = (id: string) => (directory.data ?? []).find((p) => p.profile_id === id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">My students</h1>
          <p className="text-sm text-muted-foreground">Class rosters with today's attendance.</p>
        </div>
        <Button asChild>
          <Link to="/attendance">
            <ClipboardCheck className="mr-2 h-4 w-4" /> Take attendance
          </Link>
        </Button>
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : queries.some((q) => q.isLoading) ? (
        <LoadingRows />
      ) : mine.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No classes assigned to you yet" text="Ask an administrator to assign you to a class." />
      ) : (
        mine.map((c) => {
          const roster = (enrollments.data ?? [])
            .filter((e) => e.class_id === c.id && e.status === "active")
            .map((e) => person(e.student_id) ?? { profile_id: e.student_id, full_name: "Unknown student", gender: null })
            .sort((a, b) => a.full_name.localeCompare(b.full_name));
          const todays = new Map((attendance.data ?? []).filter((r) => r.class_id === c.id && r.date === today).map((r) => [r.student_id, r.status]));
          return (
            <Panel key={c.id} title={`${c.name} (${roster.length})`} icon={GraduationCap} link={{ to: "/attendance", label: "Take attendance" }}>
              {roster.length === 0 ? (
                <EmptyState icon={GraduationCap} title="No students enrolled in this class yet" text="An administrator enrols students from the Students page." />
              ) : (
                <ul className="divide-y divide-border">
                  {roster.map((s) => (
                    <li key={s.profile_id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{s.full_name}</p>
                        <p className="text-xs capitalize text-muted-foreground">{s.gender ?? "Gender not set"}</p>
                      </div>
                      <StatusChip status={todays.get(s.profile_id)} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          );
        })
      )}
    </div>
  );
};
