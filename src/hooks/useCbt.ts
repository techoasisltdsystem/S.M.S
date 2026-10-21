import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";

export type QKind = "mcq" | "true_false" | "short" | "essay";
export const KIND_LABEL: Record<QKind, string> = { mcq: "Multiple choice", true_false: "True / false", short: "Short answer", essay: "Essay" };

export interface Question { id: string; subject_id: string; subject: string; kind: QKind; prompt: string; options: string[]; correct: unknown; marks: number; difficulty: string; created_by: string | null; mine: boolean; used: number; image: string | null }
export interface CbtTest {
  id: string; title: string; class_name: string; subject: string; starts_at: string; ends_at: string; duration_min: number; status: "draft" | "published" | "closed";
  phase: "draft" | "upcoming" | "live" | "closed"; questions: number; total_marks: number; results_released: boolean; can_manage: boolean; attempts: number; submitted: number;
  class_size: number; avg_pct: number | null; needs_grading: number; my_attempt: string | null; my_status: string | null; my_score: number | null; my_max: number | null; my_deadline: string | null;
}
export interface CbtDash { tests: number; upcoming: number; live: number; attempts: number; in_progress: number; pending_grading: number; violations: number; avg_pct: number | null; completion_pct: number | null; by_class: { class: string; avg: number }[] }
export interface RosterRow { student_id: string; name: string; attempt_id: string | null; status: string; answered: number; deadline: string | null; last_seen: string | null; violations: number; score: number | null; max_score: number | null; needs_grading: boolean; recent_violations: string[] | null }
export interface Live { server_now: string; questions: number; ends_at: string; status: string; roster: RosterRow[] }

export const useCbtTests = (sid: string) => useQuery({ queryKey: ["cbt-tests", sid], queryFn: () => rpc<CbtTest[]>("cbt_tests_list", { _school: sid }), refetchInterval: 30_000 });
export const useCbtDash = (sid: string, enabled: boolean) => useQuery({ queryKey: ["cbt-dash", sid], enabled, queryFn: () => rpc<CbtDash>("cbt_dashboard", { _school: sid }), refetchInterval: 30_000 });
export const useQuestions = (sid: string, enabled: boolean) => useQuery({ queryKey: ["cbt-questions", sid], enabled, queryFn: () => rpc<Question[]>("cbt_questions_list", { _school: sid, _subject: null, _search: null }) });
export const useLive = (test: string | null) => useQuery({ queryKey: ["cbt-live", test], enabled: !!test, queryFn: () => rpc<Live>("cbt_test_live", { _test: test }), refetchInterval: 5_000 });

export const fmtDT = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
