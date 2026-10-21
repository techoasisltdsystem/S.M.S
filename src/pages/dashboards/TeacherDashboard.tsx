import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FolderOpen, BarChart3, Bell, BookOpen, Calendar, CalendarClock, ChevronRight, ClipboardCheck, ClipboardList, Clock, FileText, MessageSquare, ShieldAlert, UserCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import KitStat from "@/components/kit/KitStat";
import { Chip, PageHeader, Progress, QuickActions, StatusPill, TableCard, td, th, todayLabel } from "@/components/kit/Dash";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { Panel, EmptyState } from "@/components/kit/Panel";
import Donut from "@/components/kit/Donut";
import BarChart from "@/components/kit/BarChart";
import MonthCalendar from "@/components/kit/MonthCalendar";
import EventList, { upcoming } from "@/components/kit/EventList";
import QuickLinks from "@/components/kit/QuickLinks";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeworkSummary } from "@/hooks/useAssignments";
import { useNotifications } from "@/hooks/useResults";
import {
  average, hhmm, isoWeekday, pct, relative, todayIso, useAnnouncements, useAssessments, useAssignments, useAttendance,
  useClasses, useDirectory, useEnrollments, useEvents, useMarks, useSubjects, useTimetable,
} from "@/hooks/useSchoolData";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const ACTIVITY: Record<string, string> = {
  attendance_corrected: "Corrected attendance", results_submitted: "Submitted results", results_approved: "Approved results", results_published: "Published results",
  resource_added: "Added a learning resource", concern_updated: "Answered a report", student_enrolled: "Enrolled a student", assessment_created: "Created an assessment",
};

const TeacherDashboard = () => {
  const { user } = useAuth();
  const sid = user!.schoolId;
  const me = user!.id;
  const classes = useClasses(sid);
  const subjects = useSubjects(sid);
  const assignments = useAssignments(sid);
  const timetable = useTimetable(sid);
  const enrollments = useEnrollments(sid);
  const assessments = useAssessments(sid);
  const marks = useMarks(sid);
  const attendance = useAttendance(sid);
  const events = useEvents(sid);
  const notices = useAnnouncements(sid);
  const people = useDirectory(sid);
  const hw = useHomeworkSummary(sid);
  const alertsFeed = useNotifications(sid);
  const [picked, setPicked] = useState<string | null>(null);
  const recent = useQuery({ queryKey: ["my-activity", sid], queryFn: () => rpc<{ id: string; at: string; action: string; target: string | null }[]>("my_recent_activity", { _school: sid, _limit: 6 }) });

  const loading = [classes, subjects, assignments, timetable, enrollments, assessments, marks, attendance, events, notices].some((q) => q.isLoading);
  const failed = [classes, assignments, timetable, enrollments, assessments, marks, attendance].find((q) => q.isError);

  const d = useMemo(() => {
    const cls = classes.data ?? [];
    const mine = (assignments.data ?? []).filter((a) => a.teacher_id === me);
    const myClassIds = new Set([...mine.map((a) => a.class_id), ...cls.filter((c) => c.form_teacher_id === me).map((c) => c.id)]);
    const myClasses = cls.filter((c) => myClassIds.has(c.id));
    const subjectName = new Map((subjects.data ?? []).map((s) => [s.id, s.name]));
    const className = new Map(cls.map((c) => [c.id, c.name]));
    const personName = new Map((people.data ?? []).map((p) => [p.profile_id, p.full_name]));
    const now = new Date();
    const nowHm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const slots = (timetable.data ?? [])
      .filter((s) => s.teacher_id === me && s.weekday === isoWeekday())
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const nextSlot = slots.find((s) => hhmm(s.ends_at) > nowHm) ?? null;

    const active = (enrollments.data ?? []).filter((e) => e.status === "active" && myClassIds.has(e.class_id));
    const studentIds = new Set(active.map((e) => e.student_id));

    const mySubjectKeys = new Set(mine.map((a) => `${a.class_id}|${a.subject_id}`));
    const myAssessments = (assessments.data ?? []).filter((a) => mySubjectKeys.has(`${a.class_id}|${a.subject_id}`));
    const drafts = myAssessments.filter((a) => a.status === "draft");
    const flow = ["draft", "submitted", "approved", "published"].map((st) => myAssessments.filter((a) => a.status === st).length);

    const today = todayIso();
    const takenToday = new Set((attendance.data ?? []).filter((r) => r.date === today).map((r) => r.class_id));
    const unregistered = myClasses.filter((c) => !takenToday.has(c.id));

    // Marks as percentages, by class and by student.
    const maxOf = new Map(myAssessments.map((a) => [a.id, a]));
    const scored = (marks.data ?? []).flatMap((m) => {
      const a = maxOf.get(m.assessment_id);
      return a && m.score !== null ? [{ cls: a.class_id, student: m.student_id, p: pct(m.score, a.max_score) }] : [];
    });
    const perClass = myClasses.map((c) => {
      const ps = scored.filter((s) => s.cls === c.id).map((s) => s.p);
      return { name: c.name, avg: average(ps), top: ps.length ? Math.max(...ps) : null };
    }).filter((c) => c.avg !== null);

    // Rule-based alerts (not predictions): attendance under 80% or average under 50%.
    const alerts = [...studentIds].flatMap((id) => {
      const recs = (attendance.data ?? []).filter((r) => r.student_id === id);
      const present = recs.filter((r) => r.status === "present" || r.status === "late" || r.status === "excused").length;
      const rate = recs.length >= 3 ? (present / recs.length) * 100 : null;
      const avg = average(scored.filter((s) => s.student === id).map((s) => s.p));
      const reasons = [rate !== null && rate < 80 ? `Attendance ${Math.round(rate)}%` : "", avg !== null && avg < 50 ? `Average ${Math.round(avg)}%` : ""].filter(Boolean);
      if (!reasons.length) return [];
      const cid = active.find((e) => e.student_id === id)?.class_id ?? "";
      const level = reasons.length === 2 || (rate !== null && rate < 65) || (avg !== null && avg < 35) ? "High" : "Medium";
      return [{ id, name: personName.get(id) ?? "Student", cls: className.get(cid) ?? "", reasons: reasons.join(" · "), level }];
    }).sort((a, b) => (a.level === b.level ? 0 : a.level === "High" ? -1 : 1));

    const marked = [...(events.data ?? []).map((e) => e.starts_at.slice(0, 10)), ...myAssessments.flatMap((a) => (a.due_on ? [a.due_on] : []))];
    const rosterOf = (cid: string) => active.filter((e) => e.class_id === cid).length;
    const teaching = mine.map((a) => {
      const list = myAssessments.filter((x) => x.class_id === a.class_id && x.subject_id === a.subject_id);
      const published = list.filter((x) => x.status === "published").length;
      return { key: a.id, subject: subjectName.get(a.subject_id) ?? "Subject", cls: className.get(a.class_id) ?? "Class", students: rosterOf(a.class_id), total: list.length, published, drafts: list.filter((x) => x.status === "draft").length };
    });
    return { nowHm, myClasses, subjectName, className, slots, nextSlot, studentIds, drafts, flow, unregistered, perClass, alerts, marked, myAssessments, takenToday, teaching };
  }, [classes.data, subjects.data, assignments.data, timetable.data, enrollments.data, assessments.data, marks.data, attendance.data, events.data, people.data, me]);

  const pending = d.drafts.length + d.unregistered.length;
  const first = user!.name.split(" ")[0];
  const evOn = (events.data ?? []).filter((e) => picked && e.starts_at.slice(0, 10) === picked);

  if (failed) {
    return (
      <Panel title="Teacher dashboard" icon={AlertTriangle}>
        <EmptyState icon={AlertTriangle} title="Could not load your classes" text={(failed.error as Error).message} />
      </Panel>
    );
  }

  const slotStatus = (st: string, en: string, cls: string) =>
    d.nowHm >= hhmm(en) ? (d.takenToday.has(cls) ? { label: "Completed", tone: "green" as const } : { label: "Pending", tone: "orange" as const })
      : d.nowHm >= hhmm(st) ? { label: "In progress", tone: "purple" as const } : { label: "Upcoming", tone: "grey" as const };

  return (
    <>
    <PageHeader title="Dashboard">
      <Chip>{todayLabel()}</Chip>
      <Chip to="/timetable" icon={CalendarClock}>{new Date().getFullYear()}</Chip>
    </PageHeader>

    <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] rounded-xl" />) : (
        <>
          <KitStat delay={0} to="/classes" icon={BookOpen} label="Assigned Classes" value={d.myClasses.length} sub="Classes assigned to you" />
          <KitStat delay={0.06} to="/students" icon={Users} tone="info" label="Total Students" value={d.studentIds.size} sub="Across all classes" />
          <KitStat delay={0.12} to="/timetable" icon={CalendarClock} tone="success" label="Today's Classes" value={d.slots.length} sub={d.nextSlot ? `Next: ${d.subjectName.get(d.nextSlot.subject_id) ?? "Lesson"} at ${hhmm(d.nextSlot.starts_at)}` : "Scheduled today"} />
          <KitStat delay={0.18} to={d.unregistered.length ? "/attendance" : "/exams"} icon={ClipboardList} tone="warning" label="Pending Tasks" value={pending} sub="Attendance / results not completed" />
        </>
      )}
    </div>

    <div className="mb-5">
      <TableCard title="Today's Classes" count={d.slots.length} action={<Link to="/timetable" className="text-xs font-medium text-primary hover:underline">Full timetable</Link>}>
        {d.slots.length === 0 ? <div className="p-5"><EmptyState icon={CalendarClock} title="No lessons on your timetable today" /></div> : (
          <table className="w-full">
            <thead><tr><th className={th}>Subject</th><th className={th}>Class</th><th className={th}>Time</th><th className={th}>Room</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">
              {d.slots.map((s) => { const st = slotStatus(s.starts_at, s.ends_at, s.class_id); return (
                <tr key={s.id} className="transition-colors hover:bg-muted/40">
                  <td className={`${td} font-medium`}>{d.subjectName.get(s.subject_id) ?? "Lesson"}</td>
                  <td className={td}>{d.className.get(s.class_id)}</td>
                  <td className={`${td} whitespace-nowrap`}>{hhmm(s.starts_at)} – {hhmm(s.ends_at)}</td>
                  <td className={`${td} text-muted-foreground`}>{s.room ?? "-"}</td>
                  <td className={td}><StatusPill tone={st.tone}>{st.label}</StatusPill></td>
                  <td className={`${td} text-right`}><Link to="/attendance" className="text-xs font-medium text-primary hover:underline">{d.takenToday.has(s.class_id) ? "View register" : "Take register"}</Link></td>
                </tr>
              ); })}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>

    <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <QuickActions layout="list" text="Easily access important teaching tasks." actions={[
        { to: "/attendance", label: "Mark Attendance", icon: UserCheck, tone: "green" },
        { to: "/exams", label: "Upload Results", icon: ClipboardCheck, tone: "pink" },
        { to: "/resources", label: "Add Learning Resource", icon: FolderOpen, tone: "orange" },
        { to: "/assignments", label: "Set Homework", icon: FileText, tone: "blue" },
      ]} />
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="font-heading text-base font-semibold text-card-foreground">Recent Activity</h2>
        <p className="mb-4 text-xs text-muted-foreground">What you did most recently.</p>
        {(recent.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet. Your registers, results and resources will show here.</p> : (
          <ul className="space-y-3">
            {recent.data!.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><ClipboardCheck className="h-4 w-4" aria-hidden /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{ACTIVITY[r.action] ?? r.action.replace(/_/g, " ")}{r.target ? ` · ${r.target}` : ""}</span><span className="text-xs text-muted-foreground">{relative(r.at)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>

    <div className="mb-5">
      <TableCard title="My Classes" count={d.teaching.length} action={<Link to="/classes" className="text-xs font-medium text-primary hover:underline">Open classes</Link>}>
        {d.teaching.length === 0 ? <div className="p-5"><EmptyState icon={BookOpen} title="No classes assigned yet" text="Your school administrator assigns your classes and subjects." /></div> : (
          <table className="w-full">
            <thead><tr><th className={th}>Subject</th><th className={th}>Class</th><th className={th}>Students</th><th className={th}>Results Progress</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-border">
              {d.teaching.map((c) => (
                <tr key={c.key} className="transition-colors hover:bg-muted/40">
                  <td className={`${td} font-medium`}>{c.subject}</td>
                  <td className={td}>{c.cls}</td>
                  <td className={td}>{c.students}</td>
                  <td className={`${td} w-1/3`}>{c.total ? <Progress value={(c.published / c.total) * 100} label={`${c.subject} ${c.cls} results published`} /> : <span className="text-xs text-muted-foreground">No assessments yet</span>}</td>
                  <td className={td}>{c.total > 0 && c.published === c.total ? <StatusPill tone="grey">Completed</StatusPill> : c.drafts > 0 ? <StatusPill tone="orange">Drafts open</StatusPill> : <StatusPill tone="green">Active</StatusPill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableCard>
    </div>

    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-5">
        <Panel title="Quick Links" icon={BookOpen}>
          <QuickLinks row links={[
            { to: "/classes", label: "Class Roster", icon: Users },
            { to: "/timetable", label: "Timetable", icon: CalendarClock },
            { to: "/attendance", label: "Attendance", icon: UserCheck },
            { to: "/assignments", label: "Assignments", icon: FileText },
            { to: "/exams", label: "Results", icon: BarChart3 },
            { to: "/messages", label: "Messages", icon: MessageSquare },
            { to: "/calendar", label: "Notices", icon: Bell },
          ]} />
        </Panel>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[1500px]:grid-cols-3">
          <Panel title="Upcoming Activities" icon={Calendar} link={{ to: "/calendar", label: "View all" }} className="flex flex-col">
            {upcoming(events.data ?? [], 4).length === 0 ? <EmptyState icon={Calendar} title="No upcoming events" /> : <EventList events={upcoming(events.data ?? [], 4)} />}
            <Button asChild variant="outline" size="sm" className="mt-auto w-full"><Link to="/calendar"><Calendar className="mr-2 h-4 w-4" aria-hidden /> View Full Calendar</Link></Button>
          </Panel>
          <Panel title="Homework Submissions" icon={FileText} link={{ to: "/assignments", label: "View all" }}>
            {hw.isLoading && <Skeleton className="h-36" />}
            {hw.isError && <EmptyState icon={FileText} title="Could not load homework" />}
            {hw.data && hw.data.total === 0 && <EmptyState icon={FileText} title="No homework set yet" text="Release an assignment from Results & grades and its submissions appear here." action={{ to: "/exams", label: "Set homework" }} />}
            {hw.data && hw.data.total > 0 && (
              <div className="flex flex-wrap items-center gap-5">
                <Donut size={120} center={`${Math.round((hw.data.submitted / hw.data.total) * 100)}%`} segments={[
                  { label: "Submitted", value: hw.data.submitted, color: "hsl(var(--success))" },
                  { label: "Pending", value: hw.data.pending, color: "hsl(var(--warning))" },
                  { label: "Overdue", value: hw.data.overdue, color: "hsl(var(--destructive))" },
                ]} centerLabel={`${hw.data.total} expected across ${hw.data.assignments} assignment${hw.data.assignments === 1 ? "" : "s"}`} />
              </div>
            )}
          </Panel>
          <Panel title="Student Performance Overview" icon={BarChart3} className="md:col-span-2 min-[1500px]:col-span-1">
            {d.perClass.length === 0 ? <EmptyState icon={BarChart3} title="No marks entered yet" text="Class averages appear once you enter marks." /> : (
              <BarChart max={100} height={150} format={(n) => `${Math.round(n)}`}
                bars={d.perClass.map((c) => ({ label: c.name, values: [c.avg ?? 0, c.top ?? 0] }))}
                series={[{ name: "Class average %", color: "hsl(var(--primary))" }, { name: "Top score %", color: "hsl(var(--info) / 0.5)" }]} />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Students Needing Attention" icon={ShieldAlert}>
            {d.alerts.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No alerts" text="Flags appear when a student's attendance falls under 80% or their average under 50%. These are simple rules on recorded data, not predictions." />
            ) : (
              <ul className="divide-y divide-border">
                {d.alerts.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">{a.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.name} <span className="text-muted-foreground">({a.cls})</span></p><p className="truncate text-xs text-muted-foreground">{a.reasons}</p></div>
                    <span className={a.level === "High" ? "rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive" : "rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning"}>{a.level}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Notifications" icon={Bell} link={{ to: "/notifications", label: "View all" }}>
            {(alertsFeed.data ?? []).length === 0 ? <EmptyState icon={Bell} title="No notifications yet" /> : (
              <ul className="divide-y divide-border">
                {alertsFeed.data!.slice(0, 4).map((n) => (
                  <li key={n.id} className="flex items-start gap-3 py-2.5">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bell className="h-4 w-4" aria-hidden /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{n.title}</p>{n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}</div>
                    <div className="flex shrink-0 flex-col items-end gap-1"><span className="text-[11px] text-muted-foreground">{relative(n.created_at)}</span>{!n.read_at && <span className="h-2 w-2 rounded-full bg-primary" aria-label="Unread" />}</div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <aside className="grid content-start gap-5">
        <Panel title="Calendar" icon={Calendar}>
          <MonthCalendar marked={d.marked} selected={picked ?? undefined} onPick={(iso) => setPicked(iso === picked ? null : iso)} />
          {picked && (evOn.length ? <div className="mt-3"><EventList events={evOn} /></div> : <p className="mt-3 text-xs text-muted-foreground">Nothing scheduled on {picked}.</p>)}
        </Panel>
        <Panel title="Today's Schedule" icon={CalendarClock} link={{ to: "/timetable", label: "View Timetable" }}>
          {d.slots.length === 0 ? <EmptyState icon={CalendarClock} title="No lessons today" /> : (
            <ul className="space-y-2">
              {d.slots.map((s) => {
                const now = d.nowHm >= hhmm(s.starts_at) && d.nowHm < hhmm(s.ends_at);
                return (
                  <li key={s.id} className={`flex items-center gap-3 rounded-xl border-l-4 px-3 py-2.5 ${now ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-muted/40"}`}>
                    <div className="w-16 shrink-0 text-xs leading-tight text-muted-foreground"><span className="block font-medium text-card-foreground">{hhmm(s.starts_at)}</span>{hhmm(s.ends_at)}</div>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.className.get(s.class_id)} – {d.subjectName.get(s.subject_id)}</p>{s.room && <p className="text-xs text-muted-foreground">{s.room}</p>}</div>
                    {now && <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Now</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Smart Reminders" icon={Bell}>
          <ul className="space-y-2">
            {d.nextSlot && <Reminder to="/timetable" icon={Clock} title="Next lesson" text={`${d.subjectName.get(d.nextSlot.subject_id) ?? "Lesson"}, ${d.className.get(d.nextSlot.class_id) ?? ""} at ${hhmm(d.nextSlot.starts_at)}`} />}
            {d.unregistered.length > 0 && <Reminder to="/attendance" icon={UserCheck} title="Registers due" text={`${d.unregistered.length} register${d.unregistered.length === 1 ? "" : "s"} still to take today`} />}
            {d.drafts.length > 0 && <Reminder to="/exams" icon={ClipboardList} title="Pending results" text={`${d.drafts.length} assessment${d.drafts.length === 1 ? "" : "s"} still in draft`} />}
            {!d.nextSlot && d.unregistered.length === 0 && d.drafts.length === 0 && <li className="text-sm text-muted-foreground">You are all caught up.</li>}
          </ul>
        </Panel>
      </aside>
    </div>
    </>
  );
};

const ActionCard = ({ to, icon: Icon, tone, title, text, cta }: { to: string; icon: typeof Bell; tone: string; title: string; text: string; cta: string }) => (
  <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-card p-5 shadow-card">
    <div className="flex items-start gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden /></span>
      <div><p className="font-heading text-sm font-semibold text-card-foreground">{title}</p><p className="text-xs text-muted-foreground">{text}</p></div>
    </div>
    <Button asChild variant="outline" size="sm" className="justify-between"><Link to={to}>{cta} <ChevronRight className="h-4 w-4" aria-hidden /></Link></Button>
  </div>
);

const Reminder = ({ to, icon: Icon, title, text }: { to: string; icon: typeof Bell; title: string; text: string }) => (
  <li>
    <Link to={to} className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 transition-colors hover:bg-accent">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="block truncate text-xs text-muted-foreground">{text}</span></span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  </li>
);

/** Decorative picture for the welcome card (no data, no meaning). */
const TeacherArt = () => (
  <svg viewBox="0 0 220 180" aria-hidden className="hidden h-40 w-auto self-end opacity-90 sm:block">
    <rect x="20" y="120" width="150" height="16" rx="3" fill="hsl(var(--primary))" opacity="0.85" />
    <rect x="30" y="102" width="130" height="16" rx="3" fill="hsl(var(--info))" opacity="0.8" />
    <rect x="24" y="84" width="140" height="16" rx="3" fill="hsl(var(--warning))" opacity="0.8" />
    <path d="M95 22 L170 50 L95 78 L20 50 Z" fill="hsl(var(--primary))" />
    <path d="M52 64 V88 C52 96 138 96 138 88 V64 L95 80 Z" fill="hsl(var(--primary))" opacity="0.7" />
    <path d="M170 50 V84" stroke="hsl(var(--warning))" strokeWidth="3" />
    <circle cx="170" cy="88" r="5" fill="hsl(var(--warning))" />
  </svg>
);

export default TeacherDashboard;
