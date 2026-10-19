import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/hooks/useSchoolData";

export const STATUSES: { value: AttendanceStatus; label: string; chip: string; active: string }[] = [
  { value: "present", label: "Present", chip: "border-success/30 bg-success/10 text-success", active: "bg-success text-success-foreground border-success" },
  { value: "late", label: "Late", chip: "border-warning/30 bg-warning/10 text-warning", active: "bg-warning text-warning-foreground border-warning" },
  { value: "absent", label: "Absent", chip: "border-destructive/30 bg-destructive/10 text-destructive", active: "bg-destructive text-destructive-foreground border-destructive" },
  { value: "excused", label: "Excused", chip: "border-info/30 bg-info/10 text-info", active: "bg-info text-info-foreground border-info" },
];

export const StatusChip = ({ status }: { status: AttendanceStatus | undefined }) => {
  const s = STATUSES.find((x) => x.value === status);
  if (!s) return <Badge variant="outline" className="text-muted-foreground">Not marked</Badge>;
  return (
    <Badge variant="outline" className={cn(s.chip)}>
      {s.label}
    </Badge>
  );
};

export interface Rec {
  student_id: string;
  class_id: string;
  date: string;
  status: AttendanceStatus;
}

export const tally = (recs: { status: AttendanceStatus }[]) => {
  const t = { present: 0, late: 0, absent: 0, excused: 0 };
  recs.forEach((r) => (t[r.status] += 1));
  return t;
};

/** Present and late count as attended; excused days are left out. null when nothing counts. */
export const rateOf = (recs: { status: AttendanceStatus }[]) => {
  const t = tally(recs);
  const counted = t.present + t.late + t.absent;
  return counted ? Math.round(((t.present + t.late) / counted) * 100) : null;
};

export const parseIso = (iso: string) => new Date(`${iso}T00:00:00`);
export const fmtDate = (iso: string) => parseIso(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const isoDaysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
