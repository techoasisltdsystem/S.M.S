import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Calendar, DollarSign, GraduationCap, History, Megaphone, UserCheck, Users, UserPlus, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import KitStat from "@/components/kit/KitStat";
import { Panel, EmptyState } from "@/components/kit/Panel";
import Donut from "@/components/kit/Donut";
import BarChart from "@/components/kit/BarChart";
import EventList, { upcoming } from "@/components/kit/EventList";
import { Button } from "@/components/ui/button";
import { useAdminOverview } from "@/hooks/useAdminOverview";
import { useEnrollments, useEvents, useSchoolOverview, relative } from "@/hooks/useSchoolData";
import { Skeleton } from "@/components/ui/skeleton";

const ACTION_LABEL: Record<string, string> = {
  user_created: "created an account", user_updated: "updated an account", user_deleted: "deleted an account",
  user_banned: "banned an account", user_suspended: "suspended an account", user_activated: "activated an account",
  role_changed: "changed a role", config_updated: "updated school settings", login: "signed in", logout: "signed out",
  password_reset: "reset a password", permission_changed: "changed permissions", school_created: "created the school",
  school_updated: "updated the school", member_invited: "invited", invitation_accepted: "accepted an invitation",
  student_enrolled: "enrolled", enrollment_changed: "changed the class of", guardian_linked: "updated a guardian link for",
  attendance_corrected: "corrected attendance for", results_submitted: "submitted results", results_approved: "approved results",
  results_published: "published results", results_reopened: "reopened results",
};

const AdminDashboard = () => {
  const { user, can } = useAuth();
  const schoolId = user!.schoolId;
  const overview = useSchoolOverview(schoolId, true);
  const activity = useAdminOverview(schoolId, can("audit.view"));
  const events = useEvents(schoolId);
  const enrollments = useEnrollments(schoolId);

  if (overview.isError) {
    return (
      <Panel title="School overview" icon={AlertTriangle}>
        <EmptyState icon={AlertTriangle} title="Could not load the overview" text={(overview.error as Error).message} />
        <div className="mt-3 text-center"><Button size="sm" variant="outline" onClick={() => overview.refetch()}>Try again</Button></div>
      </Panel>
    );
  }
  const o = overview.data;
  const g = o?.students_by_gender ?? {};
  const students = o?.people.student ?? 0;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const newThisMonth = (enrollments.data ?? []).filter((e) => e.enrolled_on >= monthStart).length;
  const att = o?.attendance_today;
  const attTotal = att ? att.present + att.late + att.absent + att.excused : 0;
  const staff = (o?.people.school_admin ?? 0) + (o?.people.teacher ?? 0) + (o?.people.finance_officer ?? 0) + (o?.people.auditor ?? 0);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">School Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {o?.current_year ? `${o.current_year}${o.current_term ? ` · ${o.current_term}` : ""}` : "Set up your academic year to start"}
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Shortcuts">
          {[
            { to: "/students", label: "Students" },
            { to: "/user-management", label: "Staff & accounts", show: can("users.manage") },
            { to: "/exams", label: "Results", show: can("grades.view") },
            { to: "/calendar", label: "Communications" },
          ].filter((l) => l.show !== false).map((l) => (
            <Button key={l.to} asChild size="sm" variant="outline"><Link to={l.to}>{l.label}</Link></Button>
          ))}
        </nav>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px]" />) : (
          <>
            <KitStat icon={GraduationCap} label="Students" value={students} sub={`${o!.invited} invited, not yet signed in`} to="/students" />
            <KitStat icon={BookOpen} tone="success" label="Classes" value={o!.classes.length} sub="This academic year" to="/classes" />
            <KitStat icon={Users} tone="warning" label="Parents" value={o!.people.parent ?? 0} sub="Guardian accounts" to="/students" />
            <KitStat icon={Users} tone="info" label="Staff" value={staff} sub="Administrators and teachers" to={can("users.manage") ? "/user-management" : undefined} />
          </>
        )}
      </div>

      {o && students > 0 && (
        <p className="mb-6 rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground shadow-card">
          Enrollment stands at {students} student{students === 1 ? "" : "s"} ({g.male ?? 0} boys, {g.female ?? 0} girls
          {g.unknown ? `, ${g.unknown} not recorded` : ""}).
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="grid gap-4 xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Panel title="Student Counts" icon={Users} className="lg:col-span-2">
              {students === 0 ? (
                <EmptyState icon={GraduationCap} title="No students yet" action={{ to: "/user-management", label: "Add students" }} />
              ) : (
                <Donut
                  segments={[
                    { label: "Boys", value: g.male ?? 0, color: "hsl(var(--warning))" },
                    { label: "Girls", value: g.female ?? 0, color: "hsl(var(--info))" },
                    { label: "Not recorded", value: g.unknown ?? 0, color: "hsl(var(--muted-foreground) / 0.4)" },
                  ]}
                  centerLabel="Total students"
                />
              )}
            </Panel>
            <Panel title="Class-wise Student Distribution" icon={BookOpen} link={{ to: "/classes", label: "View all" }} className="lg:col-span-3">
              {!o || o.classes.length === 0 ? (
                <EmptyState icon={BookOpen} title="No classes yet" text="Create the academic year and classes to see the distribution." action={{ to: "/classes", label: "Set up classes" }} />
              ) : (
                <BarChart
                  bars={o.classes.map((c) => ({ label: c.name, values: [c.total] }))}
                  series={[{ name: "Students", color: "hsl(var(--primary))" }]}
                />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Attendance Today" icon={UserCheck} link={can("attendance.view") ? { to: "/attendance", label: "Open" } : undefined}>
              {!att || attTotal === 0 ? (
                <EmptyState icon={UserCheck} title="No registers taken today" text="Teachers record attendance from their dashboard." />
              ) : (
                <Donut
                  segments={[
                    { label: "Present", value: att.present, color: "hsl(var(--success))" },
                    { label: "Late", value: att.late, color: "hsl(var(--warning))" },
                    { label: "Absent", value: att.absent, color: "hsl(var(--destructive))" },
                    { label: "Excused", value: att.excused, color: "hsl(var(--info))" },
                  ]}
                  center={`${Math.round(((att.present + att.late) / attTotal) * 100)}%`}
                  centerLabel={`${att.classes_marked} class register${att.classes_marked === 1 ? "" : "s"} taken`}
                />
              )}
            </Panel>
            <Panel title="Results Waiting" icon={ClipboardList} link={can("grades.view") ? { to: "/exams", label: "Review" } : undefined}>
              {(o?.results_waiting ?? 0) === 0 ? (
                <EmptyState icon={ClipboardList} title="Nothing waiting" text="Submitted results appear here for approval and publishing." />
              ) : (
                <div className="py-4 text-center">
                  <p className="font-heading text-4xl font-bold text-card-foreground">{o!.results_waiting}</p>
                  <p className="mt-1 text-sm text-muted-foreground">assessment{o!.results_waiting === 1 ? "" : "s"} submitted or approved, waiting to be published</p>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Finance Overview" icon={DollarSign} link={{ to: "/fees", label: "View Finance" }}>
            <EmptyState icon={DollarSign} title="Fees and payments are not built yet" text="Fee collection, balances and defaulters arrive in Phase 5 with Paystack. No sample figures are shown here." />
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Upcoming Events" icon={Calendar} link={{ to: "/calendar", label: "View Calendar" }}>
            {events.isLoading ? <Skeleton className="h-24" /> : upcoming(events.data ?? []).length === 0 ? (
              <EmptyState icon={Calendar} title="No upcoming events" action={can("communications.manage") ? { to: "/calendar", label: "Add an event" } : undefined} />
            ) : <EventList events={upcoming(events.data ?? [])} />}
          </Panel>
          <Panel title="New Enrollments (This Month)" icon={UserPlus}>
            <p className="font-heading text-3xl font-bold text-card-foreground">{newThisMonth}</p>
            <p className="text-sm text-muted-foreground">students placed in a class this month</p>
          </Panel>
          {can("audit.view") && (
            <Panel title="Recent Activity" icon={History} link={{ to: "/audit-logs", label: "View all" }}>
              {activity.isLoading ? <Skeleton className="h-24" /> : (activity.data?.recent.length ?? 0) === 0 ? (
                <EmptyState icon={History} title="No activity yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {activity.data!.recent.map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <span className="font-medium">{a.actor || "A user"}</span> {ACTION_LABEL[a.action] ?? a.action}
                      {a.target ? <span className="text-muted-foreground"> {a.target}</span> : null}
                      <span className="block text-xs text-muted-foreground">{relative(a.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          <Panel title="Communications" icon={Megaphone} link={{ to: "/calendar", label: "Open" }}>
            <p className="text-sm text-muted-foreground">Post a notice to everyone, staff, students or parents. It reaches their dashboards at once.</p>
          </Panel>
        </div>
      </div>
    </>
  );
};

export default AdminDashboard;
