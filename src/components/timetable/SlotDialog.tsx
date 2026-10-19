import { useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { hhmm, type Person, type SchoolClass, type Slot, type Subject } from "@/hooks/useSchoolData";
import { useWrite } from "@/components/classes/common";

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  classes: SchoolClass[];
  subjects: Subject[];
  teachers: Person[];
  slots: Slot[];
  defaultClassId?: string;
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;

const SlotDialog = ({ open, onOpenChange, schoolId, classes, subjects, teachers, slots, defaultClassId }: Props) => {
  const { toast } = useToast();
  const { run, busy } = useWrite();
  const [f, setF] = useState({ cls: defaultClassId ?? "", subject: "", teacher: "", day: "1", start: "08:00", end: "08:40", room: "" });

  const conflicts = useMemo(() => {
    if (!f.start || !f.end || f.end <= f.start) return [];
    const room = f.room.trim().toLowerCase();
    const out: string[] = [];
    for (const s of slots) {
      if (String(s.weekday) !== f.day || !overlaps(f.start, f.end, hhmm(s.starts_at), hhmm(s.ends_at))) continue;
      const cls = classes.find((c) => c.id === s.class_id)?.name ?? "another class";
      if (f.teacher && s.teacher_id === f.teacher) out.push(`This teacher already teaches ${cls} at ${hhmm(s.starts_at)}-${hhmm(s.ends_at)}.`);
      if (room && s.room && s.room.trim().toLowerCase() === room) out.push(`Room ${s.room} is already used by ${cls} at ${hhmm(s.starts_at)}-${hhmm(s.ends_at)}.`);
      if (s.class_id === f.cls) out.push(`This class already has a lesson at ${hhmm(s.starts_at)}-${hhmm(s.ends_at)}.`);
    }
    return out;
  }, [f, slots, classes]);

  const save = async () => {
    if (!f.cls || !f.subject) return toast({ title: "Choose a class and a subject", variant: "destructive" });
    if (!f.start || !f.end || f.end <= f.start) return toast({ title: "The end time must be after the start time", variant: "destructive" });
    const ok = await run(
      () =>
        db.from("timetable_slots").insert({
          school_id: schoolId,
          class_id: f.cls,
          subject_id: f.subject,
          teacher_id: f.teacher || null,
          weekday: Number(f.day),
          starts_at: `${f.start}:00`,
          ends_at: `${f.end}:00`,
          room: f.room.trim() || null,
        }),
      "Lesson added to the timetable",
      "Could not add the lesson",
    );
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Add a lesson</DialogTitle>
          <DialogDescription>Place a subject in the weekly timetable for a class.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Class</Label>
            <Select value={f.cls} onValueChange={(v) => setF({ ...f, cls: v })}>
              <SelectTrigger><SelectValue placeholder="Choose class" /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={f.subject} onValueChange={(v) => setF({ ...f, subject: v })}>
              <SelectTrigger><SelectValue placeholder="Choose subject" /></SelectTrigger>
              <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Teacher</Label>
            <Select value={f.teacher} onValueChange={(v) => setF({ ...f, teacher: v })}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>{teachers.map((t) => <SelectItem key={t.profile_id} value={t.profile_id}>{t.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Day</Label>
            <Select value={f.day} onValueChange={(v) => setF({ ...f, day: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5, 6, 7].map((d) => <SelectItem key={d} value={String(d)}>{DAY_NAMES[d]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-start">Starts</Label>
            <Input id="slot-start" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-end">Ends</Label>
            <Input id="slot-end" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="slot-room">Room (optional)</Label>
            <Input id="slot-room" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} />
          </div>
        </div>
        {conflicts.length > 0 && (
          <div role="alert" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-card-foreground">
            <p className="mb-1 flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5 text-warning" />Possible clash</p>
            <ul className="list-disc space-y-0.5 pl-5">{conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul>
            <p className="mt-1 text-muted-foreground">You can still save this lesson.</p>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add lesson</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SlotDialog;
