import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Award, Bell, BookOpen, Calendar, CalendarCheck, ClipboardList, CreditCard, DollarSign, GraduationCap, Medal, UserCheck } from "lucide-react";
import { money, useInvoices } from "@/hooks/useFees";
import { useAuth } from "@/contexts/AuthContext";
import KitStat from "@/components/kit/KitStat";
import { Chip, PageHeader, QuickActions, todayLabel } from "@/components/kit/Dash";
import { Panel, EmptyState } from "@/components/kit/Panel";
import Donut from "@/components/kit/Donut";
import MonthCalendar from "@/components/kit/MonthCalendar";
import EventList, { upcoming } from "@/components/kit/EventList";
import { Skeleton } from "@/components/ui/skeleton";
import PerformancePanel from "@/components/results/PerformancePanel";
import { useSchool } from "@/contexts/SchoolContext";
import {
  average, bandCounts, pct, useAnnouncements, useAssessments, useAssignments, useAttendance, useClasses, useDirectory,
  useEnrollments, useEvents, useGuardianLinks, useMarks, useStanding, useSubjects,
} from "@/hooks/useSchoolData";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** One student's dashboard. Students see themselves; parents see a verified child. The database enforces both. */
export const StudentView = ({ studentId, name, viewer }: { studentId: string; name: string; viewer: "student" | "parent" }) => {
  const { user } = useAuth();
  const { schoolConfig } = useSchool();
  const sid = user!.schoolId;
  const classes = useClasses(sid);
  const subjects = useSubjects(sid);
  const assignments = useAssignments(sid);
  const enrollments = useEnrollments(sid);
  const assessments = useAssessments(sid);
  const marks = useMarks(sid);
  const attendance = useAttendance(sid);
  const events = useEvents(sid);
  const notices = useAnnouncements(sid);
  const standing = useStanding(studentId);
  const invoices = useInvoices(sid, { student: studentId });

  const loading = [classes, subjects, assignments, enrollments, assessments, marks, attendance].some((q) => q.isLoading);
  const failed = [classes, enrollments, assessments, marks, attendance].find((q) => q.isError);

  const d = useMemo(() => {
    const enr = (enrollments.data ?? []).find((e) => e.student_id === studentId && e.status === "active");
    const cls = (classes.data ?? []).find((c) => c.id === enr?.class_id);
    const subjectName = new Map((subjects.data ?? []).map((s) => [s.id, s.name]));
    const aMap = new Map((assessments.data ?? []).map((a) => [a.id, a]));
    const results = (marks.data ?? [])
      .filter((m) => m.student_id === studentId && m.score !== null && aMap.get(m.assessment_id)?.status === "published")
      .map((m) => {
        const a = aMap.get(m.assessment_id)!;
        return { id: m.id, subject: subjectName.get(a.subject_id) ?? "Subject", title: a.title, kind: a.kind, score: m.score!, max: a.max_score, p: pct(m.score!, a.max_score), at: a.published_at ?? a.created_at };
      })
      .sort((a, b) => b.at.localeCompare(a.at));
    const recs = (attendance.data ?? []).filter((r) => r.student_id === studentId);
    const attended = recs.filter((r) => r.status !== "absent").length;
    const subjectCount = new Set((assignments.data ?? []).filter((a) => a.class_id === enr?.class_id).map((a) => a.subject_id)).size;
    return { cls, results, attendancePct: recs.length ? Math.round((attended / recs.length) * 100) : null, recs: recs.length, subjectCount, bands: bandCounts(results.map((r) => r.p)), avg: average(results.map((r) => r.p)) };
  }, [enrollments.data, classes.data, subjects.data, assessments.data, marks.data, attendance.data, assignments.data, studentId]);

  const feeRows = (invoices.data ?? []).filter((i) => i.status !== "cancelled");
  const owed = feeRows.reduce((n, r) => n + r.balance, 0);
  const billed = feeRows.reduce((n, r) => n + r.total, 0);
  const paidTotal = feeRows.reduce((n, r) => n + r.paid, 0);
  const overdueRows = feeRows.filter((r) => r.status === "overdue");
  const nextDue = feeRows.filter((r) => r.balance > 0).map((r) => r.due_on).sort()[0];
  const [picked, setPicked] = useState<string | null>(null);
  const first = (viewer === "student" ? user!.name : name).split(" ")[0];

  if (failed) {
    return <Panel title="Dashboard" icon={AlertTriangle}><EmptyState icon={AlertTriangle} title="Could not load records" text={(failed.error as Error).message} /></Panel>;
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={viewer === "student" ? "Dashboard" : `${name}`}>
        {d.cls && <Chip icon={GraduationCap}>{d.cls.name}{d.cls.level ? ` · ${d.cls.level}` : ""}</Chip>}
        <Chip>{todayLabel()}</Chip>
      </PageHeader>
      {viewer === "student" && <p className="-mt-3 text-sm text-muted-foreground">{greeting()}, {first}. Stay updated with your academic journey.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {loading || standing.isLoading ? [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />) : (
          <>
            <KitStat delay={0} to="/exams" icon={Award} label="Average" value={standing.data?.average != null ? `${standing.data.average}%` : null} sub={d.results.length ? "Published results" : "No published results yet"} />
            <KitStat delay={0.06} to="/timetable" icon={BookOpen} tone="success" label="Subjects" value={d.cls ? d.subjectCount : null} sub={d.cls ? "This year" : "Not in a class"} />
            <KitStat delay={0.12} to="/exams" icon={ClipboardList} tone="info" label="Results Published" value={d.results.length} sub="Assessments marked" />
            <KitStat delay={0.18} to="/exams" icon={Medal} tone="warning" label="Class Position" value={standing.data?.rank != null ? `${standing.data.rank}` : null} sub={standing.data?.rank != null ? `out of ${standing.data.class_size}` : "Needs published results"} />
            <KitStat delay={0.3} to="/fees" icon={CreditCard} tone={overdueRows.length ? "destructive" : owed > 0 ? "warning" : "success"} label="School Fees"
              value={invoices.isError ? null : feeRows.length ? money(owed) : null}
              sub={invoices.isError ? "Fees are not available" : !feeRows.length ? "No invoices yet" : owed <= 0 ? "Paid in full" : overdueRows.length ? `${overdueRows.length} overdue` : nextDue ? `Next due ${new Date(`${nextDue}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Outstanding"}
              meter={billed > 0 ? (paidTotal / billed) * 100 : undefined} />
            <KitStat delay={0.24} to="/attendance" icon={UserCheck} tone="destructive" label="Attendance" value={d.attendancePct != null ? `${d.attendancePct}%` : null} sub={d.recs ? `${d.recs} day${d.recs === 1 ? "" : "s"} recorded` : "No register yet"} />
          </>
        )}
      </div>

      <QuickActions text={viewer === "student" ? "Jump to what you need." : "Everything about your child, one click away."} actions={[
        { to: "/exams", label: "Results", icon: ClipboardList, tone: "purple" },
        { to: "/resources", label: "Learning Resources", icon: BookOpen, tone: "blue" },
        { to: "/fees", label: viewer === "student" ? "My Fees" : "Pay Fees", icon: CreditCard, tone: "orange" },
        { to: "/concerns", label: "Reports", icon: Bell, tone: "pink" },
        { to: "/timetable", label: "Timetable", icon: Calendar, tone: "green" },
      ]} />

      <Panel title={viewer === "student" ? "My School Fees" : "School Fees"} icon={DollarSign} link={{ to: "/fees", label: viewer === "student" ? "Open my fees" : "Open fees and pay" }}>
        {invoices.isLoading ? <Skeleton className="h-20" /> : invoices.isError ? (
          <EmptyState icon={DollarSign} title="Fees are not available" text="The school's plan may not include fees." />
        ) : feeRows.length === 0 ? (
          <EmptyState icon={DollarSign} title="No invoices yet" text="Invoices the school issues appear here, the same for the student and the parent." />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Billed</p><p className="font-heading text-lg font-bold">{money(billed)}</p></div>
              <div><p className="text-xs text-muted-foreground">Paid</p><p className="font-heading text-lg font-bold text-success">{money(paidTotal)}</p></div>
              <div><p className="text-xs text-muted-foreground">Outstanding</p><p className={`font-heading text-lg font-bold ${owed > 0 ? "text-warning" : "text-success"}`}>{money(owed)}</p></div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Fees paid" aria-valuenow={Math.round(billed ? (paidTotal / billed) * 100 : 0)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all duration-700" style={{ width: `${billed ? Math.round((paidTotal / billed) * 100) : 0}%` }} />
            </div>
            <ul className="divide-y divide-border text-sm">
              {feeRows.slice(0, 4).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><Link to="/fees" className="font-medium hover:underline">{r.title}</Link><span className="block text-xs text-muted-foreground">{r.number} · due {new Date(`${r.due_on}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                  <span className="text-right"><span className="font-medium">{money(r.balance)}</span><span className={`block text-xs ${r.status === "overdue" ? "text-destructive" : r.status === "paid" ? "text-success" : "text-muted-foreground"}`}>{r.status === "paid" ? "Paid" : r.status === "overdue" ? "Overdue" : r.status === "part_paid" ? "Part paid" : "Unpaid"}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {!loading && (
        <PerformancePanel data={{
          studentId, studentName: name, className: d.cls?.name ?? null, average: standing.data?.average ?? d.avg, rank: standing.data?.rank ?? null,
          classSize: standing.data?.class_size ?? null, attendancePct: d.attendancePct, attendanceDays: d.recs, results: d.results.map((r) => ({ subject: r.subject, title: r.title, kind: r.kind, at: r.at, score: r.score, max: r.max, p: r.p })),
          schoolName: schoolConfig?.school_name || user!.schoolName, logoUrl: schoolConfig?.logo_url ?? null,
        }} />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel title="Recent Results" icon={ClipboardList} link={{ to: "/exams", label: "View All Results" }} className="xl:col-span-3">
          {d.results.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No published results yet" text="Results appear here once the school has approved and published them." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="bg-muted/60 text-xs text-muted-foreground"><th className="px-3 py-2">Subject</th><th className="px-3 py-2">Assessment</th><th className="px-3 py-2">Score</th><th className="px-3 py-2">%</th><th className="px-3 py-2">Date</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {d.results.slice(0, 5).map((r) => (
                    <tr key={r.id}><td className="px-3 py-2.5 font-medium">{r.subject}</td><td className="px-3 py-2.5">{r.title} <span className="text-xs capitalize text-muted-foreground">({r.kind})</span></td>
                      <td className="px-3 py-2.5">{r.score}/{r.max}</td><td className="px-3 py-2.5">{Math.round(r.p)}%</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{new Date(r.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Notice Board" icon={Bell} link={{ to: "/calendar", label: "View All Notices" }} className="xl:col-span-2">
          {(notices.data ?? []).length === 0 ? <EmptyState icon={Bell} title="No notices yet" /> : (
            <ul className="divide-y divide-border">
              {notices.data!.slice(0, 3).map((n) => (
                <li key={n.id} className="py-2.5"><p className="text-sm font-medium">{n.title}</p>{n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-xs font-medium text-primary">{new Date(n.published_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Academic Calendar" icon={Calendar} link={{ to: "/calendar", label: "View Calendar" }}>
          <MonthCalendar marked={(events.data ?? []).map((e) => e.starts_at.slice(0, 10))} selected={picked ?? undefined} onPick={(iso) => setPicked(iso === picked ? null : iso)} />
          <div className="mt-3">
            {picked ? ((events.data ?? []).filter((e) => e.starts_at.slice(0, 10) === picked).length ? <EventList events={(events.data ?? []).filter((e) => e.starts_at.slice(0, 10) === picked)} /> : <p className="text-xs text-muted-foreground">Nothing scheduled on {picked}.</p>)
              : upcoming(events.data ?? [], 2).length > 0 && <EventList events={upcoming(events.data ?? [], 2)} />}
          </div>
        </Panel>
        <Panel title="Quick Access" icon={CalendarCheck}>
          <div className="grid grid-cols-3 gap-3">
            {[
              { to: "/exams", label: "Results", icon: ClipboardList },
              { to: "/attendance", label: "Attendance", icon: UserCheck },
              { to: "/timetable", label: "Timetable", icon: Calendar },
              { to: "/calendar", label: "Notices", icon: Bell },
              { to: "/fees", label: "Fees", icon: DollarSign },
            ].map((l) => (
              <Link key={l.to} to={l.to} className="group flex flex-col items-center gap-2 rounded-xl bg-muted/50 p-3 text-center text-xs font-medium transition-all duration-200 hover:-translate-y-1 hover:bg-primary/10 hover:shadow-elevated">
                <l.icon className="h-6 w-6 text-primary transition-transform duration-200 group-hover:scale-125" aria-hidden /> {l.label}
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Performance Overview" icon={Award}>
          {d.results.length === 0 ? <EmptyState icon={Award} title="No results to chart yet" /> : (
            <Donut size={140} center={`${Math.round(d.avg ?? 0)}%`} centerLabel="Average of published results" segments={d.bands} />
          )}
        </Panel>
      </div>
    </div>
  );
};

/** Student dashboard: the signed-in student's own records. */
export const StudentDashboard = () => {
  const { user } = useAuth();
  return <StudentView studentId={user!.id} name={user!.name} viewer="student" />;
};

/** Parent dashboard: children whose link the school has verified. */
/** One line per child with what is owed, so a parent with several children sees the whole family at a glance. Each figure is that child's own account. */
const ChildSummary = ({ schoolId, studentId, name, active, onPick }: { schoolId: string; studentId: string; name: string; active: boolean; onPick: () => void }) => {
  const q = useInvoices(schoolId, { student: studentId });
  const rows = (q.data ?? []).filter((i) => i.status !== "cancelled");
  const owed = rows.reduce((n, r) => n + r.balance, 0);
  return (
    <button type="button" onClick={onPick} aria-pressed={active}
      className={`rounded-2xl border p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-1 hover:shadow-elevated ${active ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
      <p className="font-heading text-sm font-semibold">{name}</p>
      <p className="text-xs text-muted-foreground">{q.isLoading ? "Loading fees…" : rows.length === 0 ? "No invoices" : owed > 0 ? `Owes ${money(owed)}` : "Fees paid in full"}</p>
    </button>
  );
};

export const ParentDashboard = () => {
  const { user } = useAuth();
  const sid = user!.schoolId;
  const links = useGuardianLinks(sid);
  const people = useDirectory(sid);
  const [chosen, setChosen] = useState<string | null>(null);
  const name = new Map((people.data ?? []).map((p) => [p.profile_id, p.full_name]));
  const mine = (links.data ?? []).filter((l) => l.guardian_id === user!.id);
  const verified = mine.filter((l) => l.status === "verified");
  const pending = mine.filter((l) => l.status === "pending");

  if (links.isLoading || people.isLoading) return <Skeleton className="h-40" />;
  if (links.isError) return <Panel title="My children" icon={AlertTriangle}><EmptyState icon={AlertTriangle} title="Could not load your children" text={(links.error as Error).message} /></Panel>;
  if (verified.length === 0) {
    return (
      <Panel title="Parent Dashboard" icon={UserCheck}>
        <EmptyState icon={UserCheck} title={pending.length ? "Waiting for the school to verify your link" : "No children linked yet"}
          text={pending.length ? "The school office checks your identity before showing a child's records. You will see them here as soon as it is done." : "Ask the school office to link your account to your child."} />
      </Panel>
    );
  }
  const active = verified.find((l) => l.student_id === chosen) ?? verified[0];
  return (
    <div className="grid gap-4">
      {verified.length > 1 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="My children">
          {verified.map((l) => <ChildSummary key={l.id} schoolId={sid} studentId={l.student_id} name={name.get(l.student_id) ?? "Child"} active={l.id === active.id} onPick={() => setChosen(l.student_id)} />)}
        </div>
      )}
      <StudentView studentId={active.student_id} name={name.get(active.student_id) ?? "Your child"} viewer="parent" />
    </div>
  );
};
