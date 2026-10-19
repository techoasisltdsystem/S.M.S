import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthCalendarProps {
  /** Dates (YYYY-MM-DD) that have something on them. */
  marked: string[];
  onPick?: (iso: string) => void;
  selected?: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

const MonthCalendar = ({ marked, onPick, selected }: MonthCalendarProps) => {
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1).getDay(); // Sunday first, like the references
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const set = new Set(marked);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="rounded p-1 hover:bg-muted" onClick={() => setCursor(new Date(y, m - 1, 1))} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-heading text-sm font-semibold">{cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
        <button className="rounded p-1 hover:bg-muted" onClick={() => setCursor(new Date(y, m + 1, 1))} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <span key={d} className="pb-1 font-medium text-muted-foreground">{d}</span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={i} />;
          const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
          const isToday = iso === todayIso;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onPick?.(iso)}
              aria-label={iso + (set.has(iso) ? ", has events" : "")}
              className={cn(
                "relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors hover:bg-muted",
                isToday && "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                selected === iso && !isToday && "ring-2 ring-primary",
              )}
            >
              {d}
              {set.has(iso) && <span className={cn("absolute bottom-0.5 h-1 w-1 rounded-full", isToday ? "bg-primary-foreground" : "bg-primary")} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthCalendar;
