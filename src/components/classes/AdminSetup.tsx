import { useState } from "react";
import { BookOpen, CalendarRange, GraduationCap, Plus, School, Trash2, Users } from "lucide-react";
import { db } from "@/lib/db";
import { Panel, EmptyState } from "@/components/kit/Panel";
import KitStat from "@/components/kit/KitStat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Enrollment, Person, SchoolClass, Subject } from "@/hooks/useSchoolData";
import type { Tables } from "@/integrations/supabase/types";
import { useWrite } from "./common";

type Year = Tables<"academic_years">;
type Term = Tables<"terms">;
type Assignment = Tables<"teaching_assignments">;

interface Props {
  schoolId: string;
  years: Year[];
  terms: Term[];
  subjects: Subject[];
  classes: SchoolClass[];
  assignments: Assignment[];
  people: Person[];
  enrollments: Enrollment[];
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

const AdminSetup = ({ schoolId, years, terms, subjects, classes, assignments, people, enrollments }: Props) => {
  const { toast } = useToast();
  const { run, busy } = useWrite();
  const teachers = people.filter((p) => p.roles.includes("teacher"));
  const nameOf = (id: string | null) => people.find((p) => p.profile_id === id)?.full_name ?? "Not assigned";
  const yearName = (id: string) => years.find((y) => y.id === id)?.name ?? "Unknown year";
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? "Unknown subject";
  const activeCount = (classId: string) => enrollments.filter((e) => e.class_id === classId && e.status === "active").length;

  // ---- years ----
  const [yr, setYr] = useState({ name: "", start: "", end: "", current: false });
  const addYear = async () => {
    if (!yr.name.trim() || !yr.start || !yr.end) return toast({ title: "Name, start and end dates are required", variant: "destructive" });
    if (yr.end <= yr.start) return toast({ title: "The end date must be after the start date", variant: "destructive" });
    if (yr.current) {
      const ok = await run(() => db.from("academic_years").update({ is_current: false }).eq("school_id", schoolId).eq("is_current", true), "Previous current year cleared", "Could not clear the current year");
      if (!ok) return;
    }
    const ok = await run(
      () => db.from("academic_years").insert({ school_id: schoolId, name: yr.name.trim(), starts_on: yr.start, ends_on: yr.end, is_current: yr.current }),
      "Academic year added",
      "Could not add the academic year",
    );
    if (ok) setYr({ name: "", start: "", end: "", current: false });
  };
  const makeYearCurrent = async (id: string) => {
    if (!(await run(() => db.from("academic_years").update({ is_current: false }).eq("school_id", schoolId).eq("is_current", true), "Previous current year cleared", "Could not clear the current year"))) return;
    await run(() => db.from("academic_years").update({ is_current: true }).eq("id", id).eq("school_id", schoolId), "Current year updated", "Could not set the current year");
  };

  // ---- terms ----
  const [tm, setTm] = useState({ year: "", name: "", start: "", end: "", current: false });
  const addTerm = async () => {
    if (!tm.year || !tm.name.trim() || !tm.start || !tm.end) return toast({ title: "Year, name, start and end dates are required", variant: "destructive" });
    if (tm.end <= tm.start) return toast({ title: "The end date must be after the start date", variant: "destructive" });
    if (tm.current) {
      if (!(await run(() => db.from("terms").update({ is_current: false }).eq("school_id", schoolId).eq("is_current", true), "Previous current term cleared", "Could not clear the current term"))) return;
    }
    const ok = await run(
      () => db.from("terms").insert({ school_id: schoolId, academic_year_id: tm.year, name: tm.name.trim(), starts_on: tm.start, ends_on: tm.end, is_current: tm.current }),
      "Term added",
      "Could not add the term",
    );
    if (ok) setTm({ ...tm, name: "", start: "", end: "", current: false });
  };
  const makeTermCurrent = async (id: string) => {
    if (!(await run(() => db.from("terms").update({ is_current: false }).eq("school_id", schoolId).eq("is_current", true), "Previous current term cleared", "Could not clear the current term"))) return;
    await run(() => db.from("terms").update({ is_current: true }).eq("id", id).eq("school_id", schoolId), "Current term updated", "Could not set the current term");
  };

  // ---- subjects ----
  const [sb, setSb] = useState({ name: "", code: "" });
  const addSubject = async () => {
    if (!sb.name.trim()) return toast({ title: "Subject name is required", variant: "destructive" });
    const ok = await run(
      () => db.from("subjects").insert({ school_id: schoolId, name: sb.name.trim(), code: sb.code.trim() || null }),
      "Subject added",
      "Could not add the subject",
    );
    if (ok) setSb({ name: "", code: "" });
  };

  // ---- classes ----
  const currentYear = years.find((y) => y.is_current)?.id ?? "";
  const [cl, setCl] = useState({ name: "", level: "", room: "", year: "", teacher: "" });
  const addClass = async () => {
    const year = cl.year || currentYear;
    if (!cl.name.trim() || !year) return toast({ title: "Class name and academic year are required", variant: "destructive" });
    const ok = await run(
      () =>
        db.from("classes").insert({
          school_id: schoolId,
          academic_year_id: year,
          name: cl.name.trim(),
          level: cl.level.trim() || null,
          room: cl.room.trim() || null,
          form_teacher_id: cl.teacher || null,
        }),
      "Class added",
      "Could not add the class",
    );
    if (ok) setCl({ name: "", level: "", room: "", year: cl.year, teacher: "" });
  };

  // ---- assignments ----
  const [as, setAs] = useState({ cls: "", subject: "", teacher: "" });
  const addAssignment = async () => {
    if (!as.cls || !as.subject || !as.teacher) return toast({ title: "Pick a class, a subject and a teacher", variant: "destructive" });
    const ok = await run(
      () => db.from("teaching_assignments").insert({ school_id: schoolId, class_id: as.cls, subject_id: as.subject, teacher_id: as.teacher }),
      "Teaching assignment added",
      "Could not add the assignment",
    );
    if (ok) setAs({ ...as, subject: "", teacher: "" });
  };
  const removeAssignment = (id: string) =>
    run(() => db.from("teaching_assignments").delete().eq("id", id).eq("school_id", schoolId), "Assignment removed", "Could not remove the assignment");

  const totalStudents = enrollments.filter((e) => e.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KitStat icon={School} label="Classes" value={classes.length} />
        <KitStat icon={BookOpen} tone="info" label="Subjects" value={subjects.length} />
        <KitStat icon={GraduationCap} tone="success" label="Active students" value={totalStudents} />
        <KitStat icon={Users} tone="warning" label="Teaching assignments" value={assignments.length} />
      </div>

      <Panel title="Classes" icon={School}>
        {classes.length === 0 ? (
          <EmptyState icon={School} title="No classes yet" text="Add an academic year first, then create your first class below." />
        ) : (
          <ul className="divide-y divide-border">
            {classes.map((c) => {
              const mine = assignments.filter((a) => a.class_id === c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-card-foreground">
                      {c.name} {c.level && <span className="text-xs font-normal text-muted-foreground">· {c.level}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {yearName(c.academic_year_id)} · Room {c.room ?? "not set"} · Form teacher: {nameOf(c.form_teacher_id)}
                    </p>
                    {mine.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {mine.map((a) => `${subjectName(a.subject_id)} (${nameOf(a.teacher_id)})`).join(", ")}
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary">{activeCount(c.id)} students</Badge>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Class name">
            <Input value={cl.name} onChange={(e) => setCl({ ...cl, name: e.target.value })} placeholder="e.g. Form 1A" />
          </Field>
          <Field label="Level">
            <Input value={cl.level} onChange={(e) => setCl({ ...cl, level: e.target.value })} />
          </Field>
          <Field label="Room">
            <Input value={cl.room} onChange={(e) => setCl({ ...cl, room: e.target.value })} />
          </Field>
          <Field label="Academic year">
            <Select value={cl.year || currentYear} onValueChange={(v) => setCl({ ...cl, year: v })}>
              <SelectTrigger><SelectValue placeholder="Choose year" /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Form teacher">
            <Select value={cl.teacher} onValueChange={(v) => setCl({ ...cl, teacher: v })}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{teachers.map((t) => <SelectItem key={t.profile_id} value={t.profile_id}>{t.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button onClick={addClass} disabled={busy || years.length === 0} className="w-full"><Plus className="mr-1 h-4 w-4" />Add class</Button>
          </div>
        </div>
        {years.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Create an academic year below before adding classes.</p>}
      </Panel>

      <Panel title="Academic years and terms" icon={CalendarRange}>
        {years.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No academic years yet" text="Create the school year first, then add its terms." />
        ) : (
          <ul className="space-y-3">
            {years.map((y) => (
              <li key={y.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-card-foreground">
                    {y.name} <span className="text-xs font-normal text-muted-foreground">{y.starts_on} to {y.ends_on}</span>
                  </p>
                  {y.is_current ? <Badge>Current</Badge> : <Button size="sm" variant="outline" disabled={busy} onClick={() => makeYearCurrent(y.id)}>Mark current</Button>}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {terms.filter((t) => t.academic_year_id === y.id).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{t.name} <span className="text-xs text-muted-foreground">{t.starts_on} to {t.ends_on}</span></span>
                      {t.is_current ? <Badge variant="secondary">Current term</Badge> : <Button size="sm" variant="ghost" disabled={busy} onClick={() => makeTermCurrent(t.id)}>Mark current</Button>}
                    </li>
                  ))}
                  {terms.every((t) => t.academic_year_id !== y.id) && <li className="text-xs text-muted-foreground">No terms yet for this year.</li>}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="New year name"><Input value={yr.name} onChange={(e) => setYr({ ...yr, name: e.target.value })} placeholder="e.g. 2026/2027" /></Field>
          <Field label="Starts"><Input type="date" value={yr.start} onChange={(e) => setYr({ ...yr, start: e.target.value })} /></Field>
          <Field label="Ends"><Input type="date" value={yr.end} onChange={(e) => setYr({ ...yr, end: e.target.value })} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={yr.current} onCheckedChange={(v) => setYr({ ...yr, current: v === true })} />Mark current</label>
          <div className="flex items-end"><Button onClick={addYear} disabled={busy} className="w-full"><Plus className="mr-1 h-4 w-4" />Add year</Button></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Term of year">
            <Select value={tm.year} onValueChange={(v) => setTm({ ...tm, year: v })}>
              <SelectTrigger><SelectValue placeholder="Choose year" /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Term name"><Input value={tm.name} onChange={(e) => setTm({ ...tm, name: e.target.value })} placeholder="e.g. Term 1" /></Field>
          <Field label="Starts"><Input type="date" value={tm.start} onChange={(e) => setTm({ ...tm, start: e.target.value })} /></Field>
          <Field label="Ends"><Input type="date" value={tm.end} onChange={(e) => setTm({ ...tm, end: e.target.value })} /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm"><Checkbox checked={tm.current} onCheckedChange={(v) => setTm({ ...tm, current: v === true })} />Mark current</label>
          <div className="flex items-end"><Button onClick={addTerm} disabled={busy || years.length === 0} className="w-full"><Plus className="mr-1 h-4 w-4" />Add term</Button></div>
        </div>
      </Panel>

      <Panel title="Subjects" icon={BookOpen}>
        {subjects.length === 0 ? (
          <EmptyState icon={BookOpen} title="No subjects yet" text="Add the subjects your school teaches." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => <Badge key={s.id} variant="secondary">{s.name}{s.code ? ` (${s.code})` : ""}</Badge>)}
          </div>
        )}
        <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <Field label="Subject name"><Input value={sb.name} onChange={(e) => setSb({ ...sb, name: e.target.value })} /></Field>
          <Field label="Code (optional)"><Input value={sb.code} onChange={(e) => setSb({ ...sb, code: e.target.value })} /></Field>
          <div className="flex items-end"><Button onClick={addSubject} disabled={busy} className="w-full"><Plus className="mr-1 h-4 w-4" />Add subject</Button></div>
        </div>
      </Panel>

      <Panel title="Teaching assignments" icon={Users}>
        {assignments.length === 0 ? (
          <EmptyState icon={Users} title="No teaching assignments yet" text="Assign a teacher to a subject in a class so they can reach that class." />
        ) : (
          <ul className="divide-y divide-border">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{classes.find((c) => c.id === a.class_id)?.name ?? "Unknown class"}</span> · {subjectName(a.subject_id)} · {nameOf(a.teacher_id)}
                </span>
                <Button size="icon" variant="ghost" aria-label="Remove assignment" disabled={busy} onClick={() => removeAssignment(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Class">
            <Select value={as.cls} onValueChange={(v) => setAs({ ...as, cls: v })}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={as.subject} onValueChange={(v) => setAs({ ...as, subject: v })}>
              <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Teacher">
            <Select value={as.teacher} onValueChange={(v) => setAs({ ...as, teacher: v })}>
              <SelectTrigger><SelectValue placeholder="Choose teacher" /></SelectTrigger>
              <SelectContent>{teachers.map((t) => <SelectItem key={t.profile_id} value={t.profile_id}>{t.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <div className="flex items-end"><Button onClick={addAssignment} disabled={busy} className="w-full"><Plus className="mr-1 h-4 w-4" />Assign</Button></div>
        </div>
        {teachers.length === 0 && <p className="mt-2 text-xs text-muted-foreground">No teachers in the school yet. Invite teachers from User management.</p>}
      </Panel>
    </div>
  );
};

export default AdminSetup;
