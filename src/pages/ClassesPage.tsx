import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useAssignments, useClasses, useDirectory, useEnrollments, useSubjects, useYearAndTerm } from "@/hooks/useSchoolData";
import AdminSetup from "@/components/classes/AdminSetup";
import MemberClasses from "@/components/classes/MemberClasses";
import { ErrorBlock, LoadingBlock, combine } from "@/components/classes/common";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { ShieldAlert } from "lucide-react";

const ClassesPage = () => {
  const { user, can } = useAuth();
  const sid = user?.schoolId;
  const yt = useYearAndTerm(sid);
  const classes = useClasses(sid);
  const subjects = useSubjects(sid);
  const assignments = useAssignments(sid);
  const directory = useDirectory(sid);
  const enrollments = useEnrollments(sid);
  const state = combine([yt, classes, subjects, assignments, directory, enrollments]);

  const manage = can("academics.manage");
  const mode = manage ? "admin" : user?.role === "teacher" ? "teacher" : user?.role === "student" || user?.role === "parent" ? "viewer" : null;

  const title = manage ? "Classes and academic setup" : mode === "teacher" ? "My classes" : "Classes";
  const sub = manage
    ? "Set up academic years, subjects, classes and who teaches what."
    : mode === "teacher"
      ? "The classes you teach, with their rosters."
      : "Your class, its subjects and teachers.";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </div>
        {!user || !sid ? (
          <LoadingBlock />
        ) : mode === null ? (
          <Panel title="Classes" icon={ShieldAlert}>
            <EmptyState icon={ShieldAlert} title="You do not have permission to manage classes" text="Ask a school administrator if you need access." />
          </Panel>
        ) : state.loading ? (
          <LoadingBlock rows={4} />
        ) : state.error ? (
          <ErrorBlock message={state.error} onRetry={state.retry} />
        ) : mode === "admin" ? (
          <AdminSetup
            schoolId={sid}
            years={yt.data?.years ?? []}
            terms={yt.data?.terms ?? []}
            subjects={subjects.data ?? []}
            classes={classes.data ?? []}
            assignments={assignments.data ?? []}
            people={directory.data ?? []}
            enrollments={enrollments.data ?? []}
          />
        ) : (
          <MemberClasses
            mode={mode}
            userId={user.id}
            classes={classes.data ?? []}
            subjects={subjects.data ?? []}
            assignments={assignments.data ?? []}
            people={directory.data ?? []}
            enrollments={enrollments.data ?? []}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default ClassesPage;
