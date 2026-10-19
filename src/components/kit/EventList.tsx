import type { SchoolEvent } from "@/hooks/useSchoolData";
import { cn } from "@/lib/utils";

const CATEGORY_STYLE: Record<string, string> = {
  academic: "bg-primary/10 text-primary",
  exam: "bg-destructive/10 text-destructive",
  sports: "bg-warning/15 text-warning",
  holiday: "bg-success/10 text-success",
  meeting: "bg-info/10 text-info",
  other: "bg-muted text-muted-foreground",
};

export const upcoming = (events: SchoolEvent[], limit = 4) =>
  events.filter((e) => new Date(e.ends_at ?? e.starts_at).getTime() >= Date.now() - 3600_000).slice(0, limit);

/** Date tile, title, time and category chip, in the style of the reference dashboards. */
const EventList = ({ events }: { events: SchoolEvent[] }) => (
  <ul className="divide-y divide-border">
    {events.map((e) => {
      const d = new Date(e.starts_at);
      return (
        <li key={e.id} className="flex items-center gap-3 py-2.5">
          <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center leading-none">
            <span className="font-heading text-base font-bold text-card-foreground">{String(d.getDate()).padStart(2, "0")}</span>
            <span className="mt-0.5 text-[10px] font-medium uppercase text-muted-foreground">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-card-foreground">{e.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              {e.location ? ` · ${e.location}` : ""}
            </p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", CATEGORY_STYLE[e.category])}>{e.category}</span>
        </li>
      );
    })}
  </ul>
);

export default EventList;
