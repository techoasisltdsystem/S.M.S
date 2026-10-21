import { CalendarClock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentPeriod } from "@/hooks/useFeeAdmin";

const d = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The academic year and period the school is in now, so every dashboard says where the school is in the year. */
const ActivePeriod = () => {
  const { user, isPlatform } = useAuth();
  const q = useCurrentPeriod(user && !isPlatform ? user.schoolId : undefined);
  const p = q.data;
  if (!p?.year) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground">
      <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-medium text-foreground">{p.year}</span>
      {p.term && <span>{p.term}{p.starts_on && p.ends_on ? `, ${d(p.starts_on)} to ${d(p.ends_on)}` : ""}</span>}
      {p.fee_due_on && <span>Fees due {d(p.fee_due_on)}</span>}
    </p>
  );
};

export default ActivePeriod;
