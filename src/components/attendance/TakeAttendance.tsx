import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Lock } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { todayIso, useAttendance, useDirectory, useEnrollments, useRefreshSchoolData, type AttendanceStatus, type SchoolClass } from "@/hooks/useSchoolData";
import type { Json } from "@/integrations/supabase/types";
import { ErrorBox, LoadingRows, errMsg, firstError } from "@/components/students/QueryState";
import { STATUSES, tally } from "./shared";

interface Edit {
  status?: AttendanceStatus;
  note?: string;
}

export const TakeAttendance = ({ classes }: { classes: SchoolClass[] }) => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const schoolId = user!.schoolId;
  const enrollments = useEnrollments(schoolId);
  const directory = useDirectory(schoolId);
  const attendance = useAttendance(schoolId);
  const today = todayIso();

  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => setEdits({}), [classId, date]);
  useEffect(() => {
    if (!classes.some((c) => c.id === classId)) setClassId(classes[0]?.id ?? "");
  }, [classes, classId]);

  const readOnly = date < today && !can("attendance.correct");

  const students = useMemo(() => {
    const names = new Map((directory.data ?? []).map((p) => [p.profile_id, p.full_name]));
    return (enrollments.data ?? [])
      .filter((e) => e.class_id === classId && e.status === "active")
      .map((e) => ({ id: e.student_id, name: names.get(e.student_id) ?? "Unknown student" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [enrollments.data, directory.data, classId]);

  const existing = useMemo(
    () => new Map((attendance.data ?? []).filter((r) => r.class_id === classId && r.date === date).map((r) => [r.student_id, r])),
    [attendance.data, classId, date],
  );

  const statusOf = (id: string) => edits[id]?.status ?? existing.get(id)?.status;
  const noteOf = (id: string) => edits[id]?.note ?? existing.get(id)?.note ?? "";
  const set = (id: string, patch: Edit) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));

  const marked = students.flatMap((s) => (statusOf(s.id) ? [{ status: statusOf(s.id)! }] : []));
  const counts = tally(marked);
  const unmarked = students.length - marked.length;
  const dirty = Object.keys(edits).length > 0;

  const markAll = () => setEdits((e) => Object.fromEntries([...Object.entries(e), ...students.map((s) => [s.id, { ...e[s.id], status: "present" as const }])]));

  const save = async () => {
    const records = students.filter((s) => statusOf(s.id)).map((s) => ({ student_id: s.id, status: statusOf(s.id), note: noteOf(s.id) }));
    setSaving(true);
    const { error } = await db.rpc("save_attendance", { _class: classId, _date: date, _records: records as unknown as Json });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save attendance", description: errMsg(error), variant: "destructive" });
      return;
    }
    toast({ title: "Attendance saved", description: `${records.length} record${records.length === 1 ? "" : "s"} for ${date}.` });
    setEdits({});
    refresh();
  };

  const queries = [enrollments, directory, attendance];
  const error = firstError(...queries);

  return (
    <Panel title="Take attendance" icon={ClipboardCheck}>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="att_class">Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger id="att_class">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="att_date">Date</Label>
          <Input id="att_date" type="date" max={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value > today ? today : e.target.value)} />
        </div>
      </div>

      {readOnly && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden /> Past attendance can only be corrected by an authorised administrator. You can view it here.
        </p>
      )}

      {error ? (
        <ErrorBox message={error} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : queries.some((q) => q.isLoading) ? (
        <LoadingRows />
      ) : students.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No students enrolled in this class" text="Enrol students from the Students page, then come back to take attendance." action={can("students.view") ? { to: "/students", label: "Go to Students" } : undefined} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm" aria-live="polite">
              <strong>{counts.present}</strong> present, <strong>{counts.late}</strong> late, <strong>{counts.absent}</strong> absent, <strong>{counts.excused}</strong> excused
              {unmarked > 0 && <span className="text-muted-foreground">, {unmarked} not marked</span>}
            </p>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={markAll}>
                Mark all present
              </Button>
            )}
          </div>
          <ul className="divide-y divide-border">
            {students.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center">
                <p className="text-sm font-medium lg:w-56">{s.name}</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Status for ${s.name}`}>
                  {STATUSES.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={statusOf(s.id) === o.value}
                      onClick={() => set(s.id, { status: o.value })}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                        statusOf(s.id) === o.value ? o.active : "border-border bg-background text-muted-foreground hover:bg-muted disabled:hover:bg-background",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <Input
                  className="lg:ml-auto lg:max-w-xs"
                  placeholder="Note (optional)"
                  aria-label={`Note for ${s.name}`}
                  disabled={readOnly}
                  value={noteOf(s.id)}
                  onChange={(e) => set(s.id, { note: e.target.value })}
                />
              </li>
            ))}
          </ul>
          {!readOnly && (
            <div className="mt-4 flex justify-end">
              <Button onClick={save} disabled={saving || !dirty}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save attendance
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
};
