import { Link } from "react-router-dom";
import { AlertTriangle, BookOpen, Calendar, DollarSign, GraduationCap, History, Megaphone, School, Sparkles, TrendingUp, UserCheck, Users, UserPlus, ClipboardList, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import KitStat from "@/components/kit/KitStat";
import HeroBanner from "@/components/kit/HeroBanner";
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

const AdminDashboard = () => {
  const { user, can } = useAuth();
  const schoolId = user!.schoolId;
  const overview = useSchoolOverview(schoolId, true);
  const activity = useAdminOverview(schoolId, can("audit.view"));
  const events = useEvents(schoolId);
  const enrollments = useEnrollments(schoolId);
  const fees = useFeeSummary(schoolId, can("fees.view"));

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
      <HeroBanner
        className="mb-5"
        eyebrow={user!.schoolName}
        title="School Admin Dashboard"
        text={o?.current_year ? `${o.current_year}${o.current_term ? ` · ${o.current_term}` : ""}` : "Set up your academic year to start"}
        icons={[School, TrendingUp, Sparkles]}
      >
        {[
          { to: "/students", label: "Students" },
          { to: "/user-management", label: "Staff & accounts", show: can("users.manage") },
          { to: "/exams", label: "Results", show: can("grades.view") },
          { to: "/fees", label: "Fees", show: can("fees.view") },
          { to: "/calendar", label: "Communications" },
        ].filter((l) => l.show !== false).map((l) => (
          <Button key={l.to} asChild size="sm" variant="outline" className="bg-white/60 backdrop-blur transition-transform hover:-translate-y-0.5"><Link to={l.to}>{l.label}</Link></Button>
        ))}
      </HeroBanner>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px]" />) : (
          <>
            <KitStat delay={0} icon={GraduationCap} label="Students" value={students} sub={`${o!.invited} invited, not yet signed in`} to="/students" />
            <KitStat delay={0.06} icon={BookOpen} tone="success" label="Classes" value={o!.classes.length} sub="This academic year" to="/classes" />
            <KitStat delay={0.12} icon={Users} tone="warning" label="Parents" value={o!.people.parent ?? 0} sub="Guardian accounts" to="/students" />
            <KitStat delay={0.18} icon={Users} tone="info" label="Staff" value={staff} sub="Administrators and teachers" to={can("users.manage") ? "/user-management" : undefined} />
          </>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.isLoading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />) : (
          <>
            <KitStat delay={0.24} icon={UserCheck} tone="success" label="Attendance Today" to={can("attendance.view") ? "/attendance" : undefined}
              value={attTotal ? `${Math.round(((att!.present + att!.late) / attTotal) * 100)}%` : null} sub={attTotal ? `${att!.classes_marked} register${att!.classes_marked === 1 ? "" : "s"} taken` : "No registers taken today"} meter={attTotal ? ((att!.present + att!.late) / attTotal) * 100 : undefined} />
            <KitStat delay={0.3} icon={ClipboardList} tone="info" label="Results Waiting" to={can("grades.view") ? "/exams" : undefined} value={o?.results_waiting ?? 0} sub="Submitted, waiting to be published" />
            {can("fees.view") ? (
              <>
                <KitStat delay={0.36} icon={Wallet} tone="success" label="Fees Collected" to="/fees" value={fees.data ? money(fees.data.collected) : null}
                  sub={fees.data ? `of ${money(fees.data.billed)} billed` : fees.isLoading ? "Loading…" : "Fees are not available"} meter={fees.data && fees.data.billed > 0 ? (fees.data.collected / fees.data.billed) * 100 : undefined} />
                <KitStat delay={0.42} icon={DollarSign} tone={fees.data && fees.data.overdue_count > 0 ? "destructive" : "warning"} label="Fees Outstanding" to="/fees" value={fees.data ? money(fees.data.outstanding) : null}
                  sub={fees.data ? `${fees.data.overdue_count} overdue invoice${fees.data.overdue_count === 1 ? "" : "s"}` : fees.isLoading ? "Loading…" : "Fees are not available"} />
              </>
            ) : (
              <>
                <KitStat delay={0.36} icon={UserPlus} tone="warning" label="New This Month" to="/students" value={newThisMonth} sub="Students placed in a class" />
                <KitStat delay={0.42} icon={Calendar} tone="primary" label="Upcoming Events" to="/calendar" value={upcoming(events.data ?? []).length} sub="On the school calendar" />
              </>
            )}
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
