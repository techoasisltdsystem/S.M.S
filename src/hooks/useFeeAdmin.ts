import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { rpc } from "@/lib/rpc";

export interface YearRow { id: string; name: string; starts_on: string; ends_on: string; is_current: boolean; status: "draft" | "published" | "completed" | "archived" }
export interface TermRow {
  id: string; academic_year_id: string; name: string; starts_on: string; ends_on: string; is_current: boolean; status: "draft" | "published" | "closed";
  fee_due_on: string | null; reminder_days: number[]; exams_start: string | null; exams_end: string | null; break_start: string | null; break_end: string | null;
}

/** Academic years and periods of a school, drafts included (managers' view). */
export const usePeriods = (schoolId: string) =>
  useQuery({
    queryKey: ["periods", schoolId], enabled: !!schoolId,
    queryFn: async () => {
      const [y, t] = await Promise.all([
        db.from("academic_years").select("*").eq("school_id", schoolId).order("starts_on", { ascending: false }),
        db.from("terms").select("*").eq("school_id", schoolId).order("starts_on"),
      ]);
      if (y.error) throw new Error(y.error.message);
      if (t.error) throw new Error(t.error.message);
      return { years: y.data as unknown as YearRow[], terms: t.data as unknown as TermRow[] };
    },
  });

export interface CurrentPeriod { year: string | null; year_id?: string; year_status?: string; term?: string | null; term_id?: string | null; starts_on?: string | null; ends_on?: string | null; fee_due_on?: string | null }
export const useCurrentPeriod = (schoolId: string | undefined) =>
  useQuery({ queryKey: ["current-period", schoolId], enabled: !!schoolId, staleTime: 60_000, retry: false, queryFn: () => rpc<CurrentPeriod>("current_period", { _school: schoolId }) });

export interface CalendarPeriod { term_id: string; term: string; year: string; starts_on: string; ends_on: string; fee_due_on: string | null; exams_start: string | null; exams_end: string | null; break_start: string | null; break_end: string | null; status: string }
export const useCalendarPeriods = (schoolId: string | undefined) =>
  useQuery({ queryKey: ["calendar-periods", schoolId], enabled: !!schoolId, retry: false, queryFn: () => rpc<CalendarPeriod[]>("calendar_periods", { _school: schoolId }) });

export interface FeeSettings { student_pay: boolean; offline_approval: boolean; overdue_days: number[] }
export const useFeeSettings = (schoolId: string | undefined) =>
  useQuery({ queryKey: ["fee-settings", schoolId], enabled: !!schoolId, retry: false, queryFn: () => rpc<FeeSettings>("fee_settings", { _school: schoolId }) });

export interface FeeReport {
  invoices: number; assessed: number; discounts: number; charges: number; net_assessed: number;
  online_collected: number; offline_collected: number; net_collected: number; refunds: number; reversals: number; gross_collected: number; pending_offline: number;
  outstanding: number; overdue_amount: number; overdue_accounts: number; students_paid: number; students_part_paid: number; students_unpaid: number;
  by_class: { class: string; assessed: number; collected: number; outstanding: number }[];
  by_term: { term: string; assessed: number; collected: number; outstanding: number }[];
  by_category: { category: string; amount: number }[];
  by_method: { method: string; amount: number; payments: number }[];
  daily: { day: string; amount: number }[]; monthly: { month: string; amount: number }[];
  recent_adjustments: { kind: string; amount: number; reason: string; at: string }[];
  upcoming_deadlines: { due_on: string; accounts: number; outstanding: number }[];
}
export const useFeeReport = (schoolId: string, f: { year: string; term: string; cls: string; from: string; to: string }) =>
  useQuery({
    queryKey: ["fee-report", schoolId, f], enabled: !!schoolId, placeholderData: (p) => p,
    queryFn: () => rpc<FeeReport>("fee_report", { _school: schoolId, _year: f.year || null, _term: f.term || null, _class: f.cls || null, _from: f.from || null, _to: f.to || null }),
  });

export interface StatementData {
  school: { name: string; currency: string }; student: { name: string; admission_number: string | null };
  invoices: { number: string; title: string; term: string | null; year: string | null; issued_on: string; due_on: string; total: number; paid: number; status: string;
    payments: { receipt: string; amount: number; method: string; paid_on: string; status: string }[] }[];
}
export const loadStatement = (schoolId: string, student: string) => rpc<StatementData>("student_statement", { _school: schoolId, _student: student });

export interface ClassStatusRow { student_id: string; student_name: string; status: "none" | "overdue" | "part_paid" | "not_yet_due" | "paid" }
export const useClassStatus = (schoolId: string, cls: string) =>
  useQuery({ queryKey: ["class-status", schoolId, cls], enabled: !!cls, retry: false, queryFn: () => rpc<ClassStatusRow[]>("fee_class_status", { _school: schoolId, _class: cls }) });
