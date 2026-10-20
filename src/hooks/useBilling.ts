import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";
import { dbProvider, requestPasswordReset } from "@/lib/db";

export type Interval = "monthly" | "yearly";

export interface PublicPlan {
  code: string; name: string; description: string | null; currency: string; monthly_price: number; annual_price: number | null;
  student_limit: number | null; staff_limit: number | null; storage_limit_mb: number | null; trial_days: number; recommended: boolean;
  highlights: string[]; entitlements: Record<string, boolean>;
}
export interface PublicSettings {
  business_name: string; support_email: string | null; support_phone: string | null; terms_url: string | null; privacy_url: string | null;
  tax_rate_percent: number; tax_label: string; cancellation_text: string; refund_text: string;
}
export interface Pricing { plans: PublicPlan[]; settings: PublicSettings }

export interface OrderStart {
  reference: string; claim: string; plan: string; interval: Interval; currency: string;
  base_minor: number; tax_minor: number; total_minor: number; tax_label: string | null;
}
export type OrderState = "created" | "pending" | "paid" | "failed" | "abandoned" | "mismatch" | "refunded";
export interface OrderStatus {
  reference: string; status: OrderState; purpose: "new_school" | "renewal" | "change_plan"; plan: string; interval: Interval; currency: string;
  base_minor: number; tax_minor: number; total_minor: number; tax_label: string | null; school: string | null; admin_email: string | null;
  channel: string | null; demo: boolean; paid_at: string | null; period_start: string | null; period_end: string | null;
  gateway_response: string | null; invite_ready: boolean;
}

/** Amounts are stored in the smallest unit (pesewas). */
export const money = (minor: number, currency = "GHS") =>
  `${currency === "GHS" ? "GH₵" : currency + " "}${(Number(minor) / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const priceText = (major: number, currency = "GHS") => money(Math.round(major * 100), currency);
export const day = (d: string | null | undefined) =>
  d ? new Date(d.length <= 10 ? `${d}T00:00:00` : d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—";
export const stamp = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";



const get = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/api/billing/${path}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "The service did not respond.");
  return json as T;
};

// Signed-out visitors have no token, so these go through the server (see server/billing/core.mjs).
export const usePricing = () => useQuery({ queryKey: ["pricing"], queryFn: () => get<Pricing>("pricing"), staleTime: 60_000 });

// ----- checkout -----------------------------------------------------------------------------------
const post = async <T,>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(`/api/billing/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "The payment service did not respond.");
  return json as T;
};

export const startSignup = (v: { plan: string; interval: Interval; school: string; admin: string; email: string; phone: string }) =>
  post<OrderStart>("signup", v);
export const startOrder = (v: { school: string; plan: string; interval: Interval }) =>
  rpc<OrderStart>("billing_start_order", { _school: v.school, _plan: v.plan, _interval: v.interval });
export const beginPayment = (reference: string, claim: string) => post<{ status?: string; mode?: "paystack" | "demo"; url?: string }>("initialize", { reference, claim });
export const confirmPayment = (reference: string, claim: string) => post<{ status: OrderState }>("verify", { reference, claim });
export const demoPay = (reference: string, claim: string, outcome: "success" | "failed" | "abandoned") => post<{ status: OrderState }>("demo-pay", { reference, claim, outcome });
export const orderStatus = (reference: string, claim: string) => post<OrderStatus>("status", { reference, claim });
export const claimInvite = async (reference: string, claim: string) => (await post<{ token: string | null }>("claim", { reference, claim })).token;

// The browser remembers an unfinished checkout so a cancelled payment does not lose the selection.
const KEY = "tosms.checkout";
export interface Draft { reference: string; claim: string }
export const saveDraft = (d: Draft | null) => {
  try {
    if (d) sessionStorage.setItem(KEY, JSON.stringify(d));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
};
export const loadDraft = (): Draft | null => { try { const r = sessionStorage.getItem(KEY); return r ? (JSON.parse(r) as Draft) : null; } catch { return null; } };

// ----- the school administrator's billing ---------------------------------------------------------
export interface MyOrder {
  reference: string; status: OrderState; purpose: string; plan: string; interval: Interval; currency: string; base_minor: number; tax_minor: number;
  total_minor: number; tax_label: string | null; channel: string | null; demo: boolean; created_at: string; paid_at: string | null;
  period_start: string | null; period_end: string | null;
}
export interface MyBilling {
  orders: MyOrder[]; school: string; label: string; school_status: "active" | "suspended";
  settings: Pick<PublicSettings, "business_name" | "support_email" | "support_phone" | "terms_url" | "privacy_url" | "cancellation_text" | "refund_text">;
}
export const useMyBilling = (school: string, enabled: boolean) =>
  useQuery({ queryKey: ["my-billing", school], enabled: !!school && enabled, queryFn: () => rpc<MyBilling>("my_billing", { _school: school }) });

// ----- the platform --------------------------------------------------------------------------------
export interface BillingOverview {
  clients: number; active: number; expiring_soon: number; expiring_today: number; expired: number; past_due: number; cancelled: number; trials: number;
  suspended: number; awaiting_payment: number; failed_payments: number; demo_paid: number;
  revenue: { currency: string; total_minor: number; orders: number }[]; pending: { currency: string; total_minor: number }[]; refunded: { currency: string; total_minor: number }[];
  growth: { month: string; schools: number }[]; revenue_by_month: { month: string; total_minor: number }[];
  by_package: { name: string; count: number }[]; renewals: { month: string; renewals: number; expiries: number }[];
}
export interface ClientRow {
  school_id: string; school_name: string; slug: string; registered_at: string; admin_name: string | null; admin_email: string | null; admin_status: string | null;
  plan_code: string | null; plan_name: string | null; label: string; started_on: string | null; period_end: string | null; days_left: number | null;
  paid_minor: number; currency: string | null; total_rows: number;
}
export interface ClientDetail {
  school: { id: string; name: string; slug: string; status: string; registered_at: string; country: string | null; currency: string | null };
  admins: { profile_id: string; name: string; email: string; status: string; signed_in: boolean }[];
  subscription: null | {
    plan_code: string; plan_name: string; monthly_price: number; annual_price: number | null; currency: string; student_limit: number | null; staff_limit: number | null;
    entitlements: Record<string, boolean>; status: string; label: string; state: string; started_on: string; trial_ends_on: string | null; period_end: string | null;
    grace_days: number; grace_ends_on: string | null; days_left: number | null; notes: string | null;
  };
  periods: { kind: string; plan_code: string; starts_on: string; ends_on: string; amount_minor: number; currency: string; is_demo: boolean }[];
  orders: { reference: string; status: OrderState; purpose: string; plan: string; interval: string; currency: string; total_minor: number; channel: string | null; demo: boolean; created_at: string; paid_at: string | null; gateway_response: string | null }[];
  events: { at: string; actor: string; kind: string; note: string | null; details: Record<string, unknown> }[];
  reminders: { at: string; audience: string; channel: string; interval_days: number; period_end: string; state: string; attempts: number; error: string | null }[];
  support: { id: string; subject: string; status: string; priority: string; updated_at: string }[];
  usage: { students: number; staff: number };
  resets?: ResetRequest[];
}
export interface ResetRequest { id: string; at: string; email: string; state: string; error: string | null; by: string }
export interface TxRow {
  reference: string; school_id: string | null; school_name: string | null; plan: string; billing_interval: string; purpose: string; currency: string; total_minor: number;
  status: OrderState; channel: string | null; demo: boolean; created_at: string; paid_at: string | null; verified_at: string | null; gateway_response: string | null;
  customer_email: string; total_rows: number;
}
export interface ReconRow { issue: string; reference: string | null; school_name: string | null; detail: string; at: string | null }
export interface PlanFull {
  id: string; code: string; name: string; description: string | null; monthly_price: number; annual_price: number | null; currency: string; trial_days: number;
  student_limit: number | null; staff_limit: number | null; storage_limit_mb: number | null; entitlements: Record<string, boolean>; highlights: string[];
  is_public: boolean; is_recommended: boolean; is_active: boolean; sort_order: number;
}
export interface BillingSettings {
  business_name: string; support_email: string | null; support_phone: string | null; terms_url: string | null; privacy_url: string | null;
  tax_rate_percent: number; tax_label: string; grace_days: number; reminder_days: number[]; cancellation_text: string; refund_text: string;
}
export interface ReminderRow { id: string; at: string; school_id: string; school_name: string; plan: string | null; interval_days: number; period_end: string; status: string | null; label: string; acknowledged: boolean }
export interface ChangeRow { id: string; at: string; actor_label: string; kind: string; subject: string | null; before: unknown; after: unknown; reason: string | null }

export const useBillingOverview = () => useQuery({ queryKey: ["bill-overview"], queryFn: () => rpc<BillingOverview>("platform_billing_overview") });
export const useClients = (f: { search: string; status: string; plan: string; sort: string; page: number }, size = 15) =>
  useQuery({
    queryKey: ["clients", f], placeholderData: (p) => p,
    queryFn: () => rpc<ClientRow[]>("platform_clients", { _search: f.search || null, _status: f.status || null, _plan: f.plan || null, _sort: f.sort, _limit: size, _offset: f.page * size }),
  });
export const useClient = (id: string | undefined) => useQuery({ queryKey: ["client", id], enabled: !!id, queryFn: () => rpc<ClientDetail>("platform_client", { _school: id }) });
export const useTransactions = (f: { status: string; search: string; page: number; school?: string }, size = 20) =>
  useQuery({
    queryKey: ["tx", f], placeholderData: (p) => p,
    queryFn: () => rpc<TxRow[]>("platform_transactions", { _status: f.status || null, _search: f.search || null, _school: f.school ?? null, _limit: size, _offset: f.page * size }),
  });
export const useReconciliation = () => useQuery({ queryKey: ["recon"], queryFn: () => rpc<ReconRow[]>("platform_reconciliation") });
export const usePlatformPlans = () => useQuery({ queryKey: ["plans-full"], queryFn: () => rpc<PlanFull[]>("platform_plans") });
export const useBillingSettings = () => useQuery({ queryKey: ["bill-settings"], queryFn: () => rpc<BillingSettings>("platform_billing_settings") });
export const useBillingChanges = () => useQuery({ queryKey: ["bill-changes"], queryFn: () => rpc<ChangeRow[]>("platform_billing_changes") });
export const useResetRequests = (school: string | undefined) =>
  useQuery({ queryKey: ["resets", school], enabled: !!school, queryFn: () => rpc<ResetRequest[]>("platform_reset_requests", { _school: school }) });
export const useReminders = () => useQuery({ queryKey: ["reminders"], queryFn: () => rpc<ReminderRow[]>("platform_reminders", { _unacknowledged_only: false }) });
export const useUnseenReminders = (enabled: boolean) => useQuery({ queryKey: ["reminders-unseen"], enabled, refetchInterval: 60_000, queryFn: async () => (await rpc<ReminderRow[]>("platform_reminders", { _unacknowledged_only: true })).length });

export const useBillingActions = () => {
  const qc = useQueryClient();
  const refresh = () => ["bill-overview", "clients", "client", "tx", "recon", "plans-full", "bill-settings", "bill-changes", "reminders", "reminders-unseen", "pricing", "resets"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const useAct = <A, R = unknown>(fn: (a: A) => Promise<R>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    savePlan: useAct((v: PlanFull & { reason: string }) => rpc("platform_save_plan", {
      _code: v.code, _name: v.name, _description: v.description, _monthly: v.monthly_price, _annual: v.annual_price, _currency: v.currency, _trial_days: v.trial_days,
      _student_limit: v.student_limit, _staff_limit: v.staff_limit, _storage_mb: v.storage_limit_mb, _entitlements: v.entitlements, _highlights: v.highlights,
      _public: v.is_public, _recommended: v.is_recommended, _active: v.is_active, _reason: v.reason })),
    saveSettings: useAct((v: BillingSettings & { reason: string }) => rpc("platform_save_billing_settings", {
      _business_name: v.business_name, _support_email: v.support_email, _support_phone: v.support_phone, _terms_url: v.terms_url, _privacy_url: v.privacy_url,
      _tax_rate: v.tax_rate_percent, _tax_label: v.tax_label, _grace_days: v.grace_days, _reminder_days: v.reminder_days,
      _cancellation: v.cancellation_text, _refund: v.refund_text, _reason: v.reason })),
    extend: useAct((v: { school: string; days: number; complimentary: boolean; reason: string }) =>
      rpc("platform_extend_subscription", { _school: v.school, _days: v.days, _complimentary: v.complimentary, _reason: v.reason })),
    setSubscription: useAct((v: { school: string; plan: string; status: string; periodEnd: string | null; trialEnd: string | null; grace: number; note: string }) =>
      rpc("set_school_subscription", { _school: v.school, _plan: v.plan, _status: v.status, _period_end: v.periodEnd, _trial_end: v.trialEnd, _grace: v.grace, _note: v.note })),
    setSchoolStatus: useAct((v: { school: string; status: "active" | "suspended"; reason: string }) => rpc("set_school_status", { _school: v.school, _status: v.status, _reason: v.reason })),
    setAdminStatus: useAct((v: { school: string; profile: string; suspend: boolean; reason: string }) =>
      rpc("platform_set_admin_status", { _school: v.school, _profile: v.profile, _suspend: v.suspend, _reason: v.reason })),
    /** Starts a reset for a School Admin. The link goes to their inbox; the outcome returned here is the real one. */
    requestReset: useAct(async (v: { school: string; profile: string }) => {
      const r = await rpc<{ id: string; email: string }>("platform_request_admin_reset", { _school: v.school, _profile: v.profile });
      if (dbProvider === "local") {
        const res = await fetch("/api/billing/recover-send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: r.id }) });
        const j = await res.json().catch(() => ({}));
        return { email: r.email, state: res.ok ? (j.state as string) : "failed", error: res.ok ? (j.error as string | undefined) : (j.error as string | undefined) ?? "The reset service did not respond." };
      }
      try {
        await requestPasswordReset(r.email);
        await rpc("platform_mark_reset", { _request: r.id, _sent: true, _error: null });
        return { email: r.email, state: "sent", error: undefined as string | undefined };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "The email could not be sent.";
        await rpc("platform_mark_reset", { _request: r.id, _sent: false, _error: msg });
        return { email: r.email, state: "failed", error: msg };
      }
    }),
    ackReminders: useAct(() => rpc<number>("platform_ack_reminders")),
  };
};

/** All matching transactions (up to 200) for the CSV export. */
export const rpcExportTransactions = (status: string, search: string) =>
  rpc<TxRow[]>("platform_transactions", { _status: status || null, _search: search || null, _school: null, _limit: 200, _offset: 0 });
