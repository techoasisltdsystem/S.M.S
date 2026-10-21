import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Calendar, DollarSign, FolderOpen, GraduationCap, History, Megaphone, TrendingUp, UserCheck, Users, UserPlus, ClipboardList, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import KitStat from "@/components/kit/KitStat";
import { Chip, LineChart, PageHeader, Progress, QuickActions, TableCard, change, td, th, todayLabel } from "@/components/kit/Dash";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { Panel, EmptyState } from "@/components/kit/Panel";
import Donut from "@/components/kit/Donut";
import BarChart from "@/components/kit/BarChart";
import EventList, { upcoming } from "@/components/kit/EventList";
import { Button } from "@/components/ui/button";
import { useAdminOverview } from "@/hooks/useAdminOverview";
import { money, useFeeSummary } from "@/hooks/useFees";
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

interface Trends {
  students_now: number; students_before: number; staff_now: number; staff_before: number;
  revenue_month: number | null; revenue_last_month: number | null; revenue_total: number | null; outstanding: number | null;
  payments_by_month: { month: string; amount: number }[] | null; attendance_by_month: { month: string; rate: number | null }[];
}
interface Coverage { class_id: string; class_name: string; subjects_covered: number; subjects_total: number; assessments_published: number; assessments_total: number; students: number }

const AdminDashboard = () => {
  const { user, can } = useAuth();
  const schoolId = user!.schoolId;
  const overview = useSchoolOverview(schoolId, true);
  const activity = useAdminOverview(schoolId, can("audit.view"));
  const events = useEvents(schoolId);
  const enrollments = useEnrollments(schoolId);
  const fees = useFeeSummary(schoolId, can("fees.view"));
  const trends = useQuery({ queryKey: ["school-trends", schoolId], queryFn: () => rpc<Trends>("school_dashboard_trends", { _school: schoolId }) });
  const coverage = useQuery({ queryKey: ["class-coverage", schoolId], queryFn: () => rpc<Coverage[]>("class_coverage", { _school: schoolId }) });
  const t = trends.data;

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
  const staff = Object.entries(o?.people ?? {}).reduce((n, [role, c]) => (role === "student" || role === "parent" ? n : n + (c as number)), 0);

  return (
    <>
      <PageHeader title="Dashboard">
        <Chip to="/fees">{o?.current_term ? `${o.current_term} · ${o.current_year ?? ""}` : o?.current_year ?? "No academic period yet"}</Chip>
        <Chip>{todayLabel()}</Chip>
      </PageHeader>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading || trends.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] rounded-xl" />) : (
          <>
            <KitStat delay={0} to="/students" icon={GraduationCap} label="Total Students" value={t ? t.students_now : students} trend={t ? change(t.students_now, t.students_before) : null} sub={`${o?.invited ?? 0} invited, not yet signed in`} />
            <KitStat delay={0.06} to={can("users.manage") ? "/user-management" : undefined} icon={Users} tone="info" label="Total Staff" value={t ? t.staff_now : staff} trend={t ? change(t.staff_now, t.staff_before) : null} sub="Administrators and teachers" />
            {can("fees.view") ? (
              <>
                <KitStat delay={0.12} to="/fees" icon={TrendingUp} tone="success" label="Total Revenue" value={t?.revenue_total != null ? money(t.revenue_total) : null}
                  trend={t?.revenue_month != null && t.revenue_last_month != null ? change(t.revenue_month, t.revenue_last_month) : null} sub={t?.revenue_month != null ? `${money(t.revenue_month)} collected this month` : "Verified payments"} />
                <KitStat delay={0.18} to="/fees" icon={Wallet} tone={fees.data && fees.data.overdue_count > 0 ? "destructive" : "warning"} label="Outstanding payments" value={t?.outstanding != null ? money(t.outstanding) : null}
                  sub={fees.data ? `${fees.data.overdue_count} overdue invoice${fees.data.overdue_count === 1 ? "" : "s"}` : "Unpaid balances"} />
              </>
            ) : (
              <>
                <KitStat delay={0.12} to={can("attendance.view") ? "/attendance" : undefined} icon={UserCheck} tone="success" label="Attendance Today" value={attTotal ? `${Math.round(((att!.present + att!.late) / attTotal) * 100)}%` : null} sub={attTotal ? `${att!.classes_marked} registers taken` : "No registers taken today"} />
                <KitStat delay={0.18} to={can("grades.view") ? "/exams" : undefined} icon={ClipboardList} tone="warning" label="Results Waiting" value={o?.results_waiting ?? 0} sub="Waiting to be published" />
              </>
            )}
          </>
        )}
      </div>

      <div className="mb-5">
        <QuickActions text="Easily access important administrative tasks." actions={[
          ...(can("users.manage") ? [{ to: "/user-management", label: "Add Student", icon: UserPlus, tone: "green" as const }] : []),
          ...(can("communications.manage") ? [{ to: "/calendar", label: "Announcement", icon: Megaphone, tone: "blue" as const }] : []),
          ...(can("users.manage") ? [{ to: "/user-management", label: "Manage Staff", icon: Users, tone: "purple" as const }] : []),
          ...(can("attendance.view") ? [{ to: "/attendance", label: "Mark Attendance", icon: UserCheck, tone: "indigo" as const }] : []),
          ...(can("payments.record") ? [{ to: "/fees", label: "Record Payment", icon: Wallet, tone: "orange" as const }] : []),
          { to: "/resources", label: "Learning Resources", icon: FolderOpen, tone: "pink" as const },
        ].slice(0, 5)} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Payments Collected" icon={Wallet} link={can("fees.view") ? { to: "/fees", label: "Open fees" } : undefined}>
          <p className="-mt-3 mb-3 text-xs text-muted-foreground">Monthly fee payments, last six months</p>
          {!can("fees.view") ? <EmptyState icon={Wallet} title="Finance figures are for the finance office" /> : !t?.payments_by_month || t.payments_by_month.every((m) => !Number(m.amount)) ? (
            <EmptyState icon={Wallet} title="No payments yet" text="Recorded and verified fee payments appear here by month." />
          ) : <BarChart height={170} bars={t.payments_by_month.map((m) => ({ label: m.month, values: [Number(m.amount)] }))} series={[{ name: "Collected", color: "hsl(var(--primary))" }]} format={(n) => money(n)} />}
        </Panel>
        <Panel title="Attendance Rate" icon={UserCheck} link={can("attendance.view") ? { to: "/attendance", label: "Open" } : undefined}>
          <p className="-mt-3 mb-3 text-xs text-muted-foreground">Monthly average attendance (%)</p>
          {!t || t.attendance_by_month.every((m) => m.rate === null) ? <EmptyState icon={UserCheck} title="No registers yet" text="Each month's rate appears once registers are taken." /> : (
            <LineChart max={100} points={t.attendance_by_month.filter((m) => m.rate !== null).map((m) => ({ label: m.month, value: Number(m.rate) }))} format={(n) => `${Math.round(n)}%`} />
          )}
        </Panel>
      </div>

      <div className="mb-5">
        <TableCard title="Class Coverage Breakdown" count={coverage.data?.length} subtitle="Subjects with a teacher, and how much assessment work has been published" action={<Link to="/classes" className="text-xs font-medium text-primary hover:underline">Manage classes</Link>}>
          {coverage.isLoading ? <div className="p-5"><Skeleton className="h-24" /></div> : (coverage.data ?? []).length === 0 ? (
            <div className="p-5"><EmptyState icon={BookOpen} title="No classes yet" action={{ to: "/classes", label: "Set up classes" }} /></div>
          ) : (
            <table className="w-full">
              <thead><tr><th className={th}>Class</th><th className={th}>Subjects Covered</th><th className={th}>Students</th><th className={th}>Assessment Progress</th></tr></thead>
              <tbody className="divide-y divide-border">
                {coverage.data!.map((c) => (
                  <tr key={c.class_id} className="transition-colors hover:bg-muted/40">
                    <td className={`${td} font-medium`}><Link to="/classes" className="hover:text-primary">{c.class_name}</Link></td>
                    <td className={td}>{c.subjects_covered}/{c.subjects_total}</td>
                    <td className={td}>{c.students}</td>
                    <td className={`${td} w-1/3`}>{Number(c.assessments_total) > 0 ? <Progress value={(Number(c.assessments_published) / Number(c.assessments_total)) * 100} label={`${c.class_name} assessments published`} /> : <span className="text-xs text-muted-foreground">No assessments yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableCard>
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
            {!can("fees.view") ? (
              <EmptyState icon={DollarSign} title="Finance is for the finance office" text="Your role does not include fee figures." />
            ) : fees.isLoading ? <Skeleton className="h-24" /> : fees.isError || !fees.data ? (
              <EmptyState icon={DollarSign} title="Fees are not available" text={fees.error instanceof Error ? fees.error.message : "Your plan may not include fees."} action={{ to: "/fees", label: "Open fees" }} />
            ) : fees.data.invoices === 0 ? (
              <EmptyState icon={DollarSign} title="No invoices yet" text="Set up a fee and generate invoices for a class." action={{ to: "/fees", label: "Set up fees" }} />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Billed</p><p className="font-heading text-lg font-bold">{money(fees.data.billed)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Collected</p><p className="font-heading text-lg font-bold text-success">{money(fees.data.collected)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-heading text-lg font-bold">{money(fees.data.outstanding)}</p></div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((fees.data.collected / Math.max(fees.data.billed, 1)) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Fees collected">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((fees.data.collected / Math.max(fees.data.billed, 1)) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{fees.data.overdue_count} overdue invoice{fees.data.overdue_count === 1 ? "" : "s"}{fees.data.overdue_count ? ` (${money(fees.data.overdue_amount)})` : ""}.</p>
              </div>
            )}
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
