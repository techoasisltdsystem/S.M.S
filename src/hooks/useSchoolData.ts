import { useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import type { Tables, Enums } from "@/integrations/supabase/types";

// Reads the shared school records. Every query runs as the signed-in user, so
// the database (not this file) decides which rows come back: a teacher gets
// only their classes, a student only themselves, a parent only verified children.

export type SchoolClass = Tables<"classes">;
export type Subject = Tables<"subjects">;
export type Slot = Tables<"timetable_slots">;
export type SchoolEvent = Tables<"events">;
export type Announcement = Tables<"announcements">;
export type Assessment = Tables<"assessments">;
export type Mark = Tables<"marks">;
export type Enrollment = Tables<"enrollments">;
export type AttendanceStatus = Enums<"attendance_status">;

export interface Person {
  profile_id: string;
  full_name: string;
  gender: string | null;
  roles: Enums<"member_role">[];
}

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

/** Rows of one table for a school, or throws with the database's message. */
async function rows<T extends keyof import("@/integrations/supabase/types").Database["public"]["Tables"]>(
  table: T,
  schoolId: string,
  order?: string,
) {
  // The generic table type defeats the query builder's column checks, so go through `any` here only.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (db.from(table) as any).select("*").eq("school_id", schoolId);
  if (order) q = q.order(order);
  const { data, error } = (await q) as { data: unknown[] | null; error: { message: string } | null };
  fail(error);
  return (data ?? []) as unknown as Tables<T>[];
}

const opts = (schoolId: string | undefined) => ({ enabled: !!schoolId, staleTime: 30_000 });

export const useYearAndTerm = (schoolId?: string) =>
  useQuery({
    queryKey: ["year-term", schoolId],
    ...opts(schoolId),
    queryFn: async () => {
      const [years, terms] = await Promise.all([rows("academic_years", schoolId!, "starts_on"), rows("terms", schoolId!, "starts_on")]);
      return { years, terms, year: years.find((y) => y.is_current) ?? null, term: terms.find((t) => t.is_current) ?? null };
    },
  });

export const useClasses = (schoolId?: string) =>
  useQuery({ queryKey: ["classes", schoolId], ...opts(schoolId), queryFn: () => rows("classes", schoolId!, "name") });

export const useSubjects = (schoolId?: string) =>
  useQuery({ queryKey: ["subjects", schoolId], ...opts(schoolId), queryFn: () => rows("subjects", schoolId!, "name") });

export const useAssignments = (schoolId?: string) =>
  useQuery({ queryKey: ["assignments", schoolId], ...opts(schoolId), queryFn: () => rows("teaching_assignments", schoolId!) });

export const useTimetable = (schoolId?: string) =>
  useQuery({ queryKey: ["timetable", schoolId], ...opts(schoolId), queryFn: () => rows("timetable_slots", schoolId!, "starts_at") });

export const useEvents = (schoolId?: string) =>
  useQuery({ queryKey: ["events", schoolId], ...opts(schoolId), queryFn: () => rows("events", schoolId!, "starts_at") });

export const useAnnouncements = (schoolId?: string) =>
  useQuery({
    queryKey: ["announcements", schoolId],
    ...opts(schoolId),
    queryFn: async () => {
      const list = await rows("announcements", schoolId!, "published_at");
      return list.sort((a, b) => b.published_at.localeCompare(a.published_at));
    },
  });

export const useEnrollments = (schoolId?: string) =>
  useQuery({ queryKey: ["enrollments", schoolId], ...opts(schoolId), queryFn: () => rows("enrollments", schoolId!) });

export const useAssessments = (schoolId?: string) =>
  useQuery({
    queryKey: ["assessments", schoolId],
    ...opts(schoolId),
    queryFn: async () => (await rows("assessments", schoolId!, "created_at")).reverse(),
  });

export const useMarks = (schoolId?: string) =>
  useQuery({ queryKey: ["marks", schoolId], ...opts(schoolId), queryFn: () => rows("marks", schoolId!) });

export const useGuardianLinks = (schoolId?: string) =>
  useQuery({ queryKey: ["guardian-links", schoolId], ...opts(schoolId), queryFn: () => rows("guardian_links", schoolId!) });

export const useAttendance = (schoolId?: string) =>
  useQuery({
    queryKey: ["attendance", schoolId],
    ...opts(schoolId),
    queryFn: async () => {
      const [sessions, records] = await Promise.all([rows("attendance_sessions", schoolId!), rows("attendance_records", schoolId!)]);
      const dateOf = new Map(sessions.map((s) => [s.id, s]));
      return records.map((r) => ({ ...r, date: dateOf.get(r.session_id)?.session_date ?? "", class_id: dateOf.get(r.session_id)?.class_id ?? "" }));
    },
  });

/** People in the school visible to the caller (names only). */
export const useDirectory = (schoolId?: string) =>
  useQuery({
    queryKey: ["directory", schoolId],
    ...opts(schoolId),
    queryFn: async () => {
      const { data, error } = await db.rpc("school_directory", { _school: schoolId! });
      fail(error);
      return (data ?? []) as Person[];
    },
  });

export interface SchoolOverview {
  people: Partial<Record<Enums<"member_role">, number>>;
  invited: number;
  students_by_gender: Record<string, number>;
  current_year: string | null;
  current_term: string | null;
  classes: { id: string; name: string; female: number; male: number; total: number }[];
  attendance_today: { present: number; late: number; absent: number; excused: number; classes_marked: number };
  results_waiting: number;
}

export const useSchoolOverview = (schoolId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["school-overview", schoolId],
    enabled: enabled && !!schoolId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("school_overview", { _school: schoolId! });
      fail(error);
      return data as unknown as SchoolOverview;
    },
  });

export const useStanding = (studentId?: string) =>
  useQuery({
    queryKey: ["standing", studentId],
    enabled: !!studentId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("student_standing", { _student: studentId! });
      fail(error);
      return data as unknown as { average: number | null; rank: number | null; class_size: number };
    },
  });

/** After any change, refresh everything that reads the shared records. */
export const useRefreshSchoolData = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
};

// ---------------------------------------------------------------------------
// Small helpers shared by the dashboards
// ---------------------------------------------------------------------------
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (d = new Date()) => d.getDay() || 7;
export const hhmm = (t: string) => t.slice(0, 5);
export const pct = (score: number, max: number) => (max > 0 ? (score / max) * 100 : 0);
export const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const BANDS = [
  { label: "Excellent (70%+)", min: 70, color: "hsl(var(--success))" },
  { label: "Good (55–69%)", min: 55, color: "hsl(var(--info))" },
  { label: "Average (40–54%)", min: 40, color: "hsl(var(--warning))" },
  { label: "Needs support (<40%)", min: 0, color: "hsl(var(--destructive))" },
] as const;

export const bandCounts = (percentages: number[]) =>
  BANDS.map((b, i) => ({
    label: b.label,
    color: b.color,
    value: percentages.filter((p) => p >= b.min && (i === 0 || p < BANDS[i - 1].min)).length,
  }));

export const relative = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
