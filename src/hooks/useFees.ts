import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";

export type InvoiceStatus = "unpaid" | "part_paid" | "paid" | "overdue" | "cancelled";
export const METHODS: { value: string; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];
export const methodLabel = (m: string) => (m === "paystack" ? "Paystack (online)" : METHODS.find((x) => x.value === m)?.label ?? m);

export interface InvoiceRow {
  id: string; number: string; student_id: string; student_name: string; class_name: string | null; title: string;
  issued_on: string; due_on: string; total: number; paid: number; balance: number; status: InvoiceStatus; total_rows: number;
}
export interface FeeStructure {
  id: string; name: string; description: string | null; amount: number; class_id: string | null; class_name: string | null;
  term_id: string | null; due_on: string; is_active: boolean; invoiced: number;
}
export interface InvoiceDetail {
  invoice: { id: string; number: string; title: string; issued_on: string; due_on: string; total: number; paid: number; balance: number; status: InvoiceStatus; cancel_reason: string | null };
  school: { name: string; currency: string; logo_url: string | null };
  student: { id: string; name: string; admission_number: string | null; class: string | null };
  lines: { description: string; amount: number }[];
  payments: { id: string; receipt: string; amount: number; method: string; reference: string | null; paid_on: string; status: "recorded" | "voided" | "pending"; void_reason: string | null; recorded_by: string | null }[];
  can_record: boolean; can_void: boolean; can_cancel: boolean;
}
export interface FeeSummary {
  billed: number; collected: number; outstanding: number; overdue_amount: number; overdue_count: number; invoices: number; paid_in_full: number;
  by_class: { class: string; billed: number; collected: number; outstanding: number }[];
  recent_payments: { receipt: string; amount: number; method: string; paid_on: string; student: string }[];
}

export const PAGE = 20;

export const useFeeSummary = (schoolId: string, enabled: boolean) =>
  useQuery({ queryKey: ["fee-summary", schoolId], enabled: !!schoolId && enabled, queryFn: () => rpc<FeeSummary>("fee_summary", { _school: schoolId }) });

export const useInvoices = (schoolId: string, opts: { student?: string | null; status?: string; search?: string; page?: number }) =>
  useQuery({
    queryKey: ["invoices", schoolId, opts],
    enabled: !!schoolId,
    queryFn: () => rpc<InvoiceRow[]>("list_invoices", {
      _school: schoolId, _student: opts.student ?? null, _status: opts.status || null, _search: opts.search?.trim() || null,
      _limit: PAGE, _offset: (opts.page ?? 0) * PAGE,
    }),
  });

export const useInvoice = (id: string | null) =>
  useQuery({ queryKey: ["invoice", id], enabled: !!id, queryFn: () => rpc<InvoiceDetail>("get_invoice", { _invoice: id }) });

export const useFeeStructures = (schoolId: string, enabled: boolean) =>
  useQuery({ queryKey: ["fee-structures", schoolId], enabled: !!schoolId && enabled, queryFn: () => rpc<FeeStructure[]>("list_fee_structures", { _school: schoolId }) });

export const useFeeActions = (schoolId: string) => {
  const qc = useQueryClient();
  const refresh = () => ["fee-summary", "invoices", "invoice", "fee-structures", "notifications", "unread-notifications"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const useAction = <A, R = unknown>(fn: (a: A) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    saveStructure: useAction((v: { id: string | null; name: string; description: string; amount: number; classId: string | null; termId?: string | null; dueOn: string; active: boolean }) =>
      rpc("save_fee_structure", { _school: schoolId, _id: v.id, _name: v.name, _description: v.description, _amount: v.amount, _class: v.classId, _term: v.termId ?? null, _due: v.dueOn, _active: v.active })),
    generate: useAction((v: { structure: string; classId: string }) => rpc<{ created: number; skipped: number }>("generate_invoices", { _structure: v.structure, _class: v.classId })),
    createInvoice: useAction((v: { student: string; title: string; dueOn: string; lines: { description: string; amount: number }[] }) =>
      rpc<string>("create_invoice", { _student: v.student, _title: v.title, _due: v.dueOn, _lines: v.lines })),
    cancelInvoice: useAction((v: { id: string; reason: string }) => rpc("cancel_invoice", { _invoice: v.id, _reason: v.reason })),
    recordPayment: useAction((v: { invoice: string; amount: number; method: string; reference: string; paidOn: string; note: string }) =>
      rpc<{ receipt: string; balance: number }>("record_payment", { _invoice: v.invoice, _amount: v.amount, _method: v.method, _reference: v.reference, _paid_on: v.paidOn, _note: v.note })),
    voidPayment: useAction((v: { id: string; reason: string }) => rpc("void_payment", { _payment: v.id, _reason: v.reason })),
    remind: useAction(() => rpc<number>("send_fee_reminders", { _school: schoolId })),
  };
};

export const money = (n: number, currency = "GHS") => `${currency === "GHS" ? "GH₵" : currency + " "}${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
