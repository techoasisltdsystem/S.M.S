import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, BarChart3, Bell, BookOpen, Calendar, CalendarClock, ChevronRight, ClipboardCheck, ClipboardList, Clock, FileText, MessageSquare, ShieldAlert, UserCheck, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import KitStat from "@/components/kit/KitStat";
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
    return { nowHm, myClasses, subjectName, className, slots, nextSlot, studentIds, drafts, flow, unregistered, perClass, alerts, marked, myAssessments };
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

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-5">
        <h1 className="font-heading text-2xl font-bold text-foreground">Teacher Dashboard</h1>

        <div className="grid grid-cols-1 gap-5 min-[1400px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="grid grid-cols-1 items-center gap-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-info/10 p-6 shadow-card sm:grid-cols-[minmax(0,1fr)_auto] sm:p-8">
            <div className="min-w-0">
              <p className="font-heading text-2xl font-bold text-card-foreground sm:text-3xl">{greeting()}, {first}! <span aria-hidden>👋</span></p>
              <p className="mt-2 text-muted-foreground">Empower minds. Inspire futures.</p>
              <p className="mt-5 text-sm text-card-foreground">
                You have {d.slots.length} class{d.slots.length === 1 ? "" : "es"} today and{" "}
                <span className="font-semibold text-primary">{pending} pending task{pending === 1 ? "" : "s"}</span>.
              </p>
              <Button asChild className="mt-5 h-11 rounded-xl px-6"><Link to="/classes">View my classes <ArrowRight className="ml-2 h-4 w-4" aria-hidden /></Link></Button>
            </div>
            <TeacherArt />
          </section>
          <div className="grid gap-5 sm:grid-cols-2 min-[1400px]:grid-cols-1">
            <ActionCard to="/attendance" icon={UserCheck} tone="bg-success/10 text-success" title="Take attendance" text="Record today's class register" cta="Open register" />
            <ActionCard to="/exams" icon={ClipboardCheck} tone="bg-info/10 text-info" title="Enter marks" text="Create an assessment and grade it" cta="Open results" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 min-[1400px]:grid-cols-4">
          {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />) : (
            <>
              <KitStat tinted icon={CalendarClock} label="Today's Classes" value={d.slots.length}
                sub={d.nextSlot ? `Next: ${d.subjectName.get(d.nextSlot.subject_id) ?? "Lesson"}, ${d.className.get(d.nextSlot.class_id) ?? ""} ${hhmm(d.nextSlot.starts_at)}` : d.slots.length ? "All done for today" : "Nothing on the timetable today"} to="/timetable" />
              <KitStat tinted icon={Users} tone="success" label="Student Count" value={d.studentIds.size} sub={`Across ${d.myClasses.length} class${d.myClasses.length === 1 ? "" : "es"}`} to="/students" />
              <KitStat tinted icon={ClipboardList} tone="info" label="Results to Submit" value={d.drafts.length} sub="Draft assessments" to="/exams" />
              <KitStat tinted icon={UserCheck} tone="warning" label="Registers Due" value={d.unregistered.length} sub="Classes not marked today" to="/attendance" />
            </>
          )}
        </div>

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
