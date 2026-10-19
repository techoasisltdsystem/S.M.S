import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, BookOpen, Calendar, CalendarClock, ClipboardCheck, ClipboardList, GraduationCap, ShieldAlert, UserCheck, Users } from "lucide-react";
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
    return { myClasses, subjectName, className, slots, nextSlot, studentIds, drafts, flow, unregistered, perClass, alerts, marked, myAssessments };
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-4">
        <h1 className="font-heading text-2xl font-bold text-foreground">Teacher Dashboard</h1>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-border bg-gradient-to-br from-primary/10 via-card to-info/10 p-6 shadow-card lg:col-span-2">
            <p className="font-heading text-3xl font-bold text-card-foreground">{greeting()}, {first}</p>
            <p className="mt-1 text-muted-foreground">Empower minds. Inspire futures.</p>
            <p className="mt-4 text-sm text-card-foreground">
              You have {d.slots.length} class{d.slots.length === 1 ? "" : "es"} today and{" "}
              <span className="font-semibold text-primary">{pending} pending task{pending === 1 ? "" : "s"}</span>.
            </p>
            <Button asChild className="mt-4"><Link to="/classes">View my classes</Link></Button>
          </section>
          <div className="grid gap-4">
            <Link to="/attendance" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success"><UserCheck className="h-5 w-5" /></span>
              <span><span className="block text-sm font-semibold">Take attendance</span><span className="text-xs text-muted-foreground">Record today's class register</span></span>
            </Link>
            <Link to="/exams" className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-elevated">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info"><ClipboardCheck className="h-5 w-5" /></span>
              <span><span className="block text-sm font-semibold">Enter marks</span><span className="text-xs text-muted-foreground">Create an assessment and grade it</span></span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px]" />) : (
            <>
              <KitStat icon={CalendarClock} label="Today's Classes" value={d.slots.length}
                sub={d.nextSlot ? `Next: ${d.subjectName.get(d.nextSlot.subject_id) ?? "Lesson"}, ${d.className.get(d.nextSlot.class_id) ?? ""} ${hhmm(d.nextSlot.starts_at)}` : d.slots.length ? "All done for today" : "Nothing on the timetable today"} to="/timetable" />
              <KitStat icon={Users} tone="success" label="Student Count" value={d.studentIds.size} sub={`Across ${d.myClasses.length} class${d.myClasses.length === 1 ? "" : "es"}`} to="/students" />
              <KitStat icon={ClipboardList} tone="info" label="Results to Submit" value={d.drafts.length} sub="Draft assessments" to="/exams" />
              <KitStat icon={UserCheck} tone="warning" label="Registers Due" value={d.unregistered.length} sub="Classes not marked today" to="/attendance" />
            </>
          )}
        </div>

        <Panel title="Quick Links" icon={BookOpen}>
          <QuickLinks links={[
            { to: "/classes", label: "My classes", icon: BookOpen },
            { to: "/students", label: "Students", icon: GraduationCap },
            { to: "/attendance", label: "Attendance", icon: UserCheck },
            { to: "/exams", label: "Results & grades", icon: ClipboardList },
            { to: "/timetable", label: "Timetable", icon: Calendar },
            { to: "/calendar", label: "Notices", icon: Bell },
          ]} />
        </Panel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="Upcoming Activities" icon={Calendar} link={{ to: "/calendar", label: "View all" }}>
            {upcoming(events.data ?? [], 4).length === 0 ? <EmptyState icon={Calendar} title="No upcoming events" /> : <EventList events={upcoming(events.data ?? [], 4)} />}
          </Panel>
          <Panel title="Results Workflow" icon={ClipboardList} link={{ to: "/exams", label: "Open" }}>
            {d.myAssessments.length === 0 ? <EmptyState icon={ClipboardList} title="No assessments yet" action={{ to: "/exams", label: "Create one" }} /> : (
              <Donut center={String(d.myAssessments.length)} centerLabel="assessments" segments={[
                { label: "Draft", value: d.flow[0], color: "hsl(var(--warning))" },
                { label: "Submitted", value: d.flow[1], color: "hsl(var(--info))" },
                { label: "Approved", value: d.flow[2], color: "hsl(var(--primary))" },
                { label: "Published", value: d.flow[3], color: "hsl(var(--success))" },
              ]} />
            )}
          </Panel>
          <Panel title="Student Performance Overview" icon={ClipboardList}>
            {d.perClass.length === 0 ? <EmptyState icon={ClipboardList} title="No marks entered yet" text="Class averages appear once you enter marks." /> : (
              <BarChart max={100} height={150} format={(n) => `${Math.round(n)}`}
                bars={d.perClass.map((c) => ({ label: c.name, values: [c.avg ?? 0, c.top ?? 0] }))}
                series={[{ name: "Class average %", color: "hsl(var(--primary))" }, { name: "Top score %", color: "hsl(var(--info) / 0.5)" }]} />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Students Needing Attention" icon={ShieldAlert}>
            {d.alerts.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No alerts" text="Flags appear when a student's attendance falls under 80% or their average under 50%. These are simple rules on recorded data, not predictions." />
            ) : (
              <ul className="divide-y divide-border">
                {d.alerts.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{a.name} <span className="text-muted-foreground">({a.cls})</span></p><p className="text-xs text-muted-foreground">{a.reasons}</p></div>
                    <span className={a.level === "High" ? "text-xs font-semibold text-destructive" : "text-xs font-semibold text-warning"}>{a.level}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Notices" icon={Bell} link={{ to: "/calendar", label: "View all" }}>
            {(notices.data ?? []).length === 0 ? <EmptyState icon={Bell} title="No notices yet" /> : (
              <ul className="divide-y divide-border">
                {notices.data!.slice(0, 4).map((n) => (
                  <li key={n.id} className="py-2.5"><p className="text-sm font-medium">{n.title}</p><p className="text-xs text-muted-foreground">{n.author_name ?? "School"} · {relative(n.published_at)}</p></li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <aside className="grid content-start gap-4">
        <Panel title="Calendar" icon={Calendar}>
          <MonthCalendar marked={d.marked} selected={picked ?? undefined} onPick={(iso) => setPicked(iso === picked ? null : iso)} />
          {picked && (evOn.length ? <div className="mt-3"><EventList events={evOn} /></div> : <p className="mt-3 text-xs text-muted-foreground">Nothing scheduled on {picked}.</p>)}
        </Panel>
        <Panel title="Today's Schedule" icon={CalendarClock} link={{ to: "/timetable", label: "View Timetable" }}>
          {d.slots.length === 0 ? <EmptyState icon={CalendarClock} title="No lessons today" /> : (
            <ul className="space-y-2">
              {d.slots.map((s) => (
                <li key={s.id} className={`rounded-lg border-l-4 bg-muted/50 px-3 py-2 ${d.nextSlot?.id === s.id ? "border-primary bg-primary/5" : "border-border"}`}>
                  <p className="text-xs text-muted-foreground">{hhmm(s.starts_at)} – {hhmm(s.ends_at)}{s.room ? ` · ${s.room}` : ""}</p>
                  <p className="text-sm font-medium">{d.className.get(s.class_id)} – {d.subjectName.get(s.subject_id)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Reminders" icon={Bell}>
          <ul className="space-y-2 text-sm">
            {d.nextSlot && <li>Next lesson: {d.subjectName.get(d.nextSlot.subject_id)}, {d.className.get(d.nextSlot.class_id)} at {hhmm(d.nextSlot.starts_at)}</li>}
            {d.unregistered.length > 0 && <li><Link className="text-primary hover:underline" to="/attendance">{d.unregistered.length} register{d.unregistered.length === 1 ? "" : "s"} still to take today</Link></li>}
            {d.drafts.length > 0 && <li><Link className="text-primary hover:underline" to="/exams">{d.drafts.length} assessment{d.drafts.length === 1 ? "" : "s"} still in draft</Link></li>}
            {!d.nextSlot && d.unregistered.length === 0 && d.drafts.length === 0 && <li className="text-muted-foreground">You are all caught up.</li>}
          </ul>
        </Panel>
      </aside>
    </div>
  );
};

export default TeacherDashboard;
