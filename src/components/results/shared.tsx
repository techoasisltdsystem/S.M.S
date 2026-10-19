import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useClasses, useDirectory, useSubjects } from "@/hooks/useSchoolData";

export const errorText = (err: unknown, fallback = "Try again.") =>
  err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;

export type AssessmentStatus = "draft" | "submitted" | "approved" | "published";

const STATUS_STYLE: Record<AssessmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-info/10 text-info",
  approved: "bg-warning/15 text-warning",
  published: "bg-success/10 text-success",
};

export const StatusChip = ({ status }: { status: string }) => (
  <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLE[status as AssessmentStatus] ?? STATUS_STYLE.draft)}>
    {status}
  </span>
);

export const KINDS = ["classwork", "homework", "quiz", "test", "exam"] as const;

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const LoadError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
    <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
    <p className="max-w-md text-sm text-destructive">{message}</p>
    <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
  </div>
);

export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3" role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
  </div>
);

/** Class, subject and people names, plus loading/error state for the three lookups. */
export const useLookups = (schoolId: string) => {
  const classes = useClasses(schoolId);
  const subjects = useSubjects(schoolId);
  const people = useDirectory(schoolId);
  const className = useMemo(() => new Map((classes.data ?? []).map((c) => [c.id, c.name])), [classes.data]);
  const subjectName = useMemo(() => new Map((subjects.data ?? []).map((s) => [s.id, s.name])), [subjects.data]);
  const personName = useMemo(() => new Map((people.data ?? []).map((p) => [p.profile_id, p.full_name])), [people.data]);
  const all = [classes, subjects, people];
  return {
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    className,
    subjectName,
    personName,
    loading: all.some((q) => q.isLoading),
    error: all.find((q) => q.isError)?.error as Error | undefined,
    refetch: () => all.forEach((q) => q.isError && q.refetch()),
  };
};

export type Lookups = ReturnType<typeof useLookups>;
