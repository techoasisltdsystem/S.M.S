import { Link } from "react-router-dom";
import { BookOpen, ClipboardCheck, FileText, School } from "lucide-react";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Enrollment, Person, SchoolClass, Subject } from "@/hooks/useSchoolData";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  mode: "teacher" | "viewer";
  userId: string;
  classes: SchoolClass[];
  subjects: Subject[];
  assignments: Tables<"teaching_assignments">[];
  people: Person[];
  enrollments: Enrollment[];
}

/** Teacher "My classes" and the read-only class list for students and parents. The database already limits the rows. */
const MemberClasses = ({ mode, userId, classes, subjects, assignments, people, enrollments }: Props) => {
  const nameOf = (id: string | null) => people.find((p) => p.profile_id === id)?.full_name ?? "Not assigned";
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";

  const visible =
    mode === "teacher"
      ? classes.filter((c) => c.form_teacher_id === userId || assignments.some((a) => a.class_id === c.id && a.teacher_id === userId))
      : classes.filter((c) => enrollments.some((e) => e.class_id === c.id && e.status === "active"));

  if (visible.length === 0) {
    return (
      <Panel title={mode === "teacher" ? "My classes" : "Class"} icon={School}>
        <EmptyState
          icon={School}
          title={mode === "teacher" ? "You are not assigned to any class yet" : "No class to show yet"}
          text={mode === "teacher" ? "Ask your school administrator to make you a form teacher or assign you a subject." : "Once the school enrols the student in a class, it appears here."}
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      {visible.map((c) => {
        const mine = assignments.filter((a) => a.class_id === c.id && (mode === "viewer" || a.teacher_id === userId));
        const roster = enrollments.filter((e) => e.class_id === c.id && e.status === "active");
        const students = roster
          .map((e) => people.find((p) => p.profile_id === e.student_id))
          .filter((p): p is Person => !!p && p.roles.includes("student"));
        return (
          <Panel key={c.id} title={c.name} icon={School}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {c.level && <Badge variant="secondary">{c.level}</Badge>}
              <span>Room {c.room ?? "not set"}</span>
              <span>· Form teacher: {nameOf(c.form_teacher_id)}</span>
              {mode === "teacher" && <Badge variant="outline">{roster.length} students</Badge>}
            </div>
            <div className="mt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><BookOpen className="h-3.5 w-3.5" />{mode === "teacher" ? "Subjects you teach" : "Subjects and teachers"}</p>
              {mine.length === 0 ? (
                <p className="text-xs text-muted-foreground">{mode === "teacher" ? "You are the form teacher; no subject assigned in this class." : "No subjects assigned yet."}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {mine.map((a) => (
                    <Badge key={a.id} variant="secondary">{subjectName(a.subject_id)}{mode === "viewer" ? `: ${nameOf(a.teacher_id)}` : ""}</Badge>
                  ))}
                </div>
              )}
            </div>
            {mode === "teacher" && (
              <>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline"><Link to="/attendance"><ClipboardCheck className="mr-1 h-4 w-4" />Attendance</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to="/exams"><FileText className="mr-1 h-4 w-4" />Exams and marks</Link></Button>
                </div>
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Roster</p>
                  {students.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No students are enrolled in this class yet.</p>
                  ) : (
                    <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {students.map((s, i) => (
                        <li key={s.profile_id}><span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>{s.full_name}</li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            )}
          </Panel>
        );
      })}
    </div>
  );
};

export default MemberClasses;
