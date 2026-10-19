import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/db";
import { useClasses, useDirectory, useEnrollments, useSubjects, useTimetable, type Slot } from "@/hooks/useSchoolData";
import { ErrorBlock, LoadingBlock, combine, useWrite } from "@/components/classes/common";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TimetableGrid from "@/components/timetable/TimetableGrid";
import SlotDialog from "@/components/timetable/SlotDialog";

const ALL = "__all";

const TimetablePage = () => {
  const { user, can } = useAuth();
  const sid = user?.schoolId;
  const slotsQ = useTimetable(sid);
  const classesQ = useClasses(sid);
  const subjectsQ = useSubjects(sid);
  const dirQ = useDirectory(sid);
  const enrQ = useEnrollments(sid);
  const state = combine([slotsQ, classesQ, subjectsQ, dirQ, enrQ]);
  const { run, busy } = useWrite();
  const [allSlots, setAllSlots] = useState(false);
  const [classFilter, setClassFilter] = useState(ALL);
  const [dialog, setDialog] = useState(false);

  const manage = can("academics.manage");
  const isTeacher = user?.role === "teacher" && !manage;
  const isFamily = user?.role === "student" || user?.role === "parent";

  const classes = classesQ.data ?? [];
  const slots = slotsQ.data ?? [];
  const people = dirQ.data ?? [];

  let shown: Slot[] = slots;
  let note = "";
  if (isFamily) {
    const mine = new Set((enrQ.data ?? []).filter((e) => e.status === "active").map((e) => e.class_id));
    shown = slots.filter((s) => mine.has(s.class_id));
    note = "Showing the timetable of the class you are enrolled in.";
  } else if (isTeacher && !allSlots) {
    shown = slots.filter((s) => s.teacher_id === user?.id);
    note = "Showing your own lessons.";
  } else if (classFilter !== ALL) {
    shown = slots.filter((s) => s.class_id === classFilter);
  }

  const remove = (s: Slot) =>
    run(() => db.from("timetable_slots").delete().eq("id", s.id).eq("school_id", sid ?? ""), "Lesson removed", "Could not remove the lesson");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Timetable</h1>
            <p className="text-sm text-muted-foreground">{note || "The weekly lesson schedule."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isTeacher && (
              <div className="flex items-center gap-2">
                <Switch id="all-slots" checked={allSlots} onCheckedChange={setAllSlots} />
                <Label htmlFor="all-slots" className="text-sm">Show all lessons</Label>
              </div>
            )}
            {!isFamily && !isTeacher && classes.length > 0 && (
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-44" aria-label="Filter by class"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All classes</SelectItem>
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {manage && (
              <Button onClick={() => setDialog(true)} disabled={state.loading || !!state.error}>
                <Plus className="mr-1 h-4 w-4" />Add lesson
              </Button>
            )}
          </div>
        </div>

        {!user || !sid || state.loading ? (
          <LoadingBlock rows={4} />
        ) : state.error ? (
          <ErrorBlock message={state.error} onRetry={state.retry} />
        ) : shown.length === 0 ? (
          <Panel title="This week" icon={CalendarDays}>
            {manage ? (
              <EmptyState
                icon={CalendarDays}
                title="No lessons scheduled yet"
                text={classes.length === 0 ? "Create classes and subjects first, then add lessons here." : "Use Add lesson to build the weekly timetable."}
                action={classes.length === 0 ? { to: "/classes", label: "Set up classes" } : undefined}
              />
            ) : isFamily ? (
              <EmptyState icon={CalendarDays} title="No timetable to show yet" text="It appears here once the student is enrolled in a class and the school adds lessons." />
            ) : (
              <EmptyState icon={CalendarDays} title={isTeacher && !allSlots ? "You have no lessons scheduled" : "No lessons scheduled yet"} text="The school administrator adds lessons to the timetable." />
            )}
          </Panel>
        ) : (
          <TimetableGrid
            slots={shown}
            classes={classes}
            subjects={subjectsQ.data ?? []}
            people={people}
            showClass={!isFamily || (enrQ.data ?? []).filter((e) => e.status === "active").length > 1}
            onRemove={manage ? remove : undefined}
            busy={busy}
          />
        )}

        {manage && sid && (
          <SlotDialog
            key={String(dialog)}
            open={dialog}
            onOpenChange={setDialog}
            schoolId={sid}
            classes={classes}
            subjects={subjectsQ.data ?? []}
            teachers={people.filter((p) => p.roles.includes("teacher"))}
            slots={slots}
            defaultClassId={classFilter === ALL ? undefined : classFilter}
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default TimetablePage;
