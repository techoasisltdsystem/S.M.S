import { ShieldAlert } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState } from "@/components/kit/Panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useAssignments, useClasses } from "@/hooks/useSchoolData";
import { ErrorBox, LoadingRows, firstError } from "@/components/students/QueryState";
import { TakeAttendance } from "@/components/attendance/TakeAttendance";
import { AttendanceOverview } from "@/components/attendance/AttendanceOverview";
import { MyAttendance } from "@/components/attendance/MyAttendance";

const Staff = () => {
  const { user, can } = useAuth();
  const isTeacher = user!.role === "teacher";
  const classes = useClasses(user!.schoolId);
  const assignments = useAssignments(user!.schoolId);
  const canRecord = can("attendance.record");
  const canView = can("attendance.view") && !isTeacher;
  const queries = [classes, assignments];
  const error = firstError(...queries);

  if (!canRecord && !canView) return <EmptyState icon={ShieldAlert} title="You do not have access to attendance" text="Ask a school administrator if you need it." />;
  if (error) return <ErrorBox message={error} onRetry={() => queries.forEach((q) => q.refetch())} />;
  if (queries.some((q) => q.isLoading)) return <LoadingRows />;

  const taught = new Set((assignments.data ?? []).filter((a) => a.teacher_id === user!.id).map((a) => a.class_id));
  const mine = isTeacher ? (classes.data ?? []).filter((c) => c.form_teacher_id === user!.id || taught.has(c.id)) : (classes.data ?? []);

  const record = canRecord ? (
    mine.length === 0 ? (
      <EmptyState
        icon={ShieldAlert}
        title={isTeacher ? "No classes assigned to you yet" : "No classes yet"}
        text={isTeacher ? "Ask an administrator to assign you to a class." : "Create a class first, then enrol students."}
        action={!isTeacher && can("academics.manage") ? { to: "/classes", label: "Go to Classes" } : undefined}
      />
    ) : (
      <TakeAttendance classes={mine} />
    )
  ) : null;

  return canRecord && canView ? (
    <Tabs defaultValue="record">
      <TabsList>
        <TabsTrigger value="record">Take attendance</TabsTrigger>
        <TabsTrigger value="overview">Overview</TabsTrigger>
      </TabsList>
      <TabsContent value="record">{record}</TabsContent>
      <TabsContent value="overview">
        <AttendanceOverview />
      </TabsContent>
    </Tabs>
  ) : canRecord ? (
    record
  ) : (
    <AttendanceOverview />
  );
};

const AttendancePage = () => {
  const { user } = useAuth();
  const personal = user?.role === "student" || user?.role === "parent";
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Attendance</h1>
          <p className="text-sm text-muted-foreground">{personal ? "Days present, late, absent and excused." : "Record and review attendance."}</p>
        </div>
        {user && (personal ? <MyAttendance /> : <Staff />)}
      </div>
    </DashboardLayout>
  );
};

export default AttendancePage;
