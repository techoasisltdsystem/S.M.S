import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  GraduationCap, Users, UserCheck, DollarSign, Settings, ClipboardList, Calendar, BookOpen,
  FileText, Building2, Bell, History, PieChart, AlertTriangle, ShieldCheck,
} from "lucide-react";
import { useAuth, UserRole, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import Welcome from "@/components/kit/Welcome";
import KitStat from "@/components/kit/KitStat";
import { Panel, EmptyState } from "@/components/kit/Panel";
import QuickLinks, { QuickLink } from "@/components/kit/QuickLinks";
import Donut from "@/components/kit/Donut";
import { Button } from "@/components/ui/button";
import { useAdminOverview } from "@/hooks/useAdminOverview";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
};

/** Only pages that exist in App.tsx and that the role can open (see DashboardSidebar). */
const LINKS: Record<UserRole, QuickLink[]> = {
  admin: [
    { to: "/students", label: "Students", sub: "Records and admissions", icon: GraduationCap },
    { to: "/user-management", label: "User management", sub: "Accounts and roles", icon: Users },
    { to: "/fees", label: "Fees & payments", sub: "Invoices and balances", icon: DollarSign },
    { to: "/audit-logs", label: "Audit logs", sub: "Who did what", icon: History },
    { to: "/setup", label: "School setup", sub: "Name, logo and terms", icon: Building2 },
    { to: "/settings", label: "Settings", sub: "System preferences", icon: Settings },
  ],
  teacher: [
    { to: "/students", label: "Students", sub: "Your class lists", icon: GraduationCap },
    { to: "/timetable", label: "Timetable", sub: "Your schedule", icon: Calendar },
    { to: "/exams", label: "Exams & grades", sub: "Assessments", icon: ClipboardList },
    { to: "/attendance", label: "Attendance", sub: "Mark and review", icon: UserCheck },
    { to: "/classes", label: "Classes", sub: "Assigned classes", icon: BookOpen },
    { to: "/reports", label: "Reports", sub: "Class reports", icon: FileText },
  ],
  student: [
    { to: "/timetable", label: "Timetable", sub: "Your classes", icon: Calendar },
    { to: "/exams", label: "Exams & grades", sub: "Results", icon: ClipboardList },
    { to: "/attendance", label: "Attendance", sub: "Your record", icon: UserCheck },
    { to: "/library", label: "Library", sub: "Resources", icon: BookOpen },
    { to: "/notifications", label: "Notifications", sub: "School notices", icon: Bell },
  ],
  parent: [
    { to: "/timetable", label: "Timetable", sub: "Your child's classes", icon: Calendar },
    { to: "/exams", label: "Exams & grades", sub: "Results", icon: ClipboardList },
    { to: "/attendance", label: "Attendance", sub: "Your child's record", icon: UserCheck },
    { to: "/fees", label: "Fees & payments", sub: "Balances", icon: DollarSign },
    { to: "/notifications", label: "Notifications", sub: "School notices", icon: Bell },
  ],
};

const ACTION_LABEL: Record<string, string> = {
  user_created: "created an account",
  user_updated: "updated an account",
  user_deleted: "deleted an account",
  user_banned: "banned an account",
  user_suspended: "suspended an account",
  user_activated: "activated an account",
  role_changed: "changed a role",
  config_updated: "updated school settings",
  login: "signed in",
  logout: "signed out",
  password_reset: "reset a password",
  permission_changed: "changed permissions",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse rounded-md bg-muted ${className}`} />;

const AdminSections = () => {
  const { user } = useAuth();
  const overview = useAdminOverview(user?.schoolId, true);
  const { data, isLoading, isError, error, refetch } = overview;

  if (isError) {
    return (
      <Panel title="Account overview" icon={AlertTriangle}>
        <EmptyState
          icon={AlertTriangle}
          title="Could not load the overview"
          text={(error as Error)?.message || "The database did not respond."}
        />
        <div className="mt-3 text-center">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </Panel>
    );
  }

  const roles = data?.roleCounts;
  const segments = roles
    ? [
        { label: "Administrators", value: roles.admin, color: "hsl(var(--primary))" },
        { label: "Teachers", value: roles.teacher, color: "hsl(var(--info))" },
        { label: "Students", value: roles.student, color: "hsl(var(--success))" },
        { label: "Parents", value: roles.parent, color: "hsl(var(--warning))" },
      ]
    : [];

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px]" />)
        ) : (
          <>
            <KitStat icon={Users} label="Accounts" value={data!.accounts} sub="All registered users" to="/user-management" />
            <KitStat
              icon={UserCheck}
              tone="success"
              label="Active accounts"
              value={data!.activeAccounts}
              meter={data!.accounts ? (data!.activeAccounts / data!.accounts) * 100 : 0}
              sub={data!.accounts ? `${Math.round((data!.activeAccounts / data!.accounts) * 100)}% of all accounts` : "No accounts yet"}
              to="/user-management"
            />
            <KitStat icon={GraduationCap} tone="info" label="Student records" value={null} sub="Student data is not connected to the database yet" to="/students" />
            <KitStat icon={DollarSign} tone="warning" label="Fees collected" value={null} sub="Fee data is not connected to the database yet" to="/fees" />
          </>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Recent administrative activity" icon={History} link={{ to: "/audit-logs", label: "View audit logs" }} className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : data!.recent.length === 0 ? (
            <EmptyState icon={History} title="No activity recorded yet" text="Actions such as creating users or changing settings appear here." />
          ) : (
            <ul className="divide-y divide-border">
              {data!.recent.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 text-card-foreground">
                    <strong className="font-medium">{a.actor || "A user"}</strong> {ACTION_LABEL[a.action] ?? a.action}
                    {a.target ? <span className="text-muted-foreground"> · {a.target}</span> : null}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.at}>
                    {when(a.at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Accounts by role" icon={PieChart} link={{ to: "/user-management", label: "Manage" }}>
          {isLoading ? (
            <Skeleton className="h-32" />
          ) : data!.accounts === 0 ? (
            <EmptyState icon={Users} title="No accounts yet" action={{ to: "/user-management", label: "Add a user" }} />
          ) : (
            <Donut segments={segments} />
          )}
        </Panel>
      </div>
    </>
  );
};

const NotConnected = ({ role }: { role: UserRole }) => (
  <Panel title="Your overview" icon={ShieldCheck} className="mb-6">
    <EmptyState
      icon={ClipboardList}
      title="Nothing to show yet"
      text={`Your ${ROLE_LABEL[role].toLowerCase()} figures (attendance, results, schedule and fees) will appear here once those modules are connected to the school database. No sample numbers are shown.`}
    />
  </Panel>
);

const Dashboard = () => {
  const { user, can } = useAuth();
  const { isSetupComplete, loading: schoolLoading } = useSchool();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <DashboardLayout>
      <Welcome
        name={user.name}
        sub={`${MEMBER_ROLE_LABEL[user.memberRole]} · ${user.schoolName}${user.schoolSuspended ? " (suspended: read-only)" : ""}`}
      />

      {can("school.settings.manage") && !isSetupComplete && !schoolLoading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20">
              <Settings className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Complete your school setup</p>
              <p className="text-xs text-muted-foreground">Configure school information, branding, and academic settings.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate("/setup")} className="shrink-0">
            Set Up Now
          </Button>
        </motion.div>
      )}

      {can("users.manage") ? <AdminSections /> : <NotConnected role={user.role} />}

      <Panel title="Quick access" icon={Calendar}>
        <QuickLinks links={LINKS[user.role]} />
        <p className="mt-3 text-xs text-muted-foreground">
          Looking for something else? Use the menu on the left, or <Link to="/notifications" className="text-primary hover:underline">open notifications</Link>.
        </p>
      </Panel>
    </DashboardLayout>
  );
};

export default Dashboard;
