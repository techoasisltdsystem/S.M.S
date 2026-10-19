import { useEffect, useState } from "react";
import { Clock, DoorOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { hhmm, isoWeekday, type Person, type SchoolClass, type Slot, type Subject } from "@/hooks/useSchoolData";
import { DAY_NAMES } from "./SlotDialog";

interface Props {
  slots: Slot[];
  classes: SchoolClass[];
  subjects: Subject[];
  people: Person[];
  showClass: boolean;
  onRemove?: (slot: Slot) => void;
  busy?: boolean;
}

const nowHm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const TimetableGrid = ({ slots, classes, subjects, people, showClass, onRemove, busy }: Props) => {
  const [now, setNow] = useState(nowHm);
  useEffect(() => {
    const t = setInterval(() => setNow(nowHm()), 60_000);
    return () => clearInterval(t);
  }, []);
  const today = isoWeekday();
  const hasWeekend = slots.some((s) => s.weekday > 5);
  const days = hasWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", hasWeekend ? "xl:grid-cols-7" : "lg:grid-cols-5")}>
      {days.map((d) => {
        const list = slots.filter((s) => s.weekday === d).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        return (
          <section key={d} aria-label={DAY_NAMES[d]} className={cn("rounded-xl border bg-card p-3 shadow-card", d === today ? "border-primary ring-1 ring-primary/30" : "border-border")}>
            <h3 className="mb-2 flex items-center justify-between font-heading text-sm font-semibold">
              {DAY_NAMES[d]}
              {d === today && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Today</span>}
            </h3>
            {list.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No lessons</p>
            ) : (
              <ul className="space-y-2">
                {list.map((s) => {
                  const live = d === today && now >= hhmm(s.starts_at) && now < hhmm(s.ends_at);
                  const subject = subjects.find((x) => x.id === s.subject_id)?.name ?? "Subject";
                  const cls = classes.find((x) => x.id === s.class_id)?.name;
                  const teacher = people.find((p) => p.profile_id === s.teacher_id)?.full_name;
                  return (
                    <li key={s.id} className={cn("rounded-lg border p-2.5 text-xs", live ? "border-primary bg-primary/10" : "border-border bg-muted/30")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-card-foreground">{subject}</p>
                        {live && <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">Now</span>}
                        {onRemove && (
                          <Button size="icon" variant="ghost" className="-mr-1 -mt-1 h-6 w-6" aria-label={`Remove ${subject} lesson`} disabled={busy} onClick={() => onRemove(s)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" />{hhmm(s.starts_at)} - {hhmm(s.ends_at)}</p>
                      {showClass && cls && <p className="text-muted-foreground">{cls}</p>}
                      {teacher && <p className="text-muted-foreground">{teacher}</p>}
                      {s.room && <p className="flex items-center gap-1 text-muted-foreground"><DoorOpen className="h-3 w-3" />{s.room}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default TimetableGrid;
