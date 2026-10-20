import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";

export const FEATURES: { key: string; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "timetable", label: "Timetable" },
  { key: "exams", label: "Exams and results" },
  { key: "assignments", label: "Assignments and online exams" },
  { key: "exports", label: "Report downloads" },
  { key: "messaging", label: "Messaging" },
  { key: "parent_portal", label: "Parent sign-in" },
  { key: "fees", label: "Fees and payments" },
  { key: "role_permissions", label: "Custom role permissions" },
  { key: "audit_log", label: "Audit log" },
];

export interface Plan {
  id: string; code: string; name: string; description: string | null; student_limit: number | null; staff_limit: number | null;
  monthly_price: number; currency: string; entitlements: Record<string, boolean>; is_active: boolean; sort_order: number;
}
export interface SubscriptionRow {
  school_id: string; school_name: string; school_status: "active" | "suspended"; plan_code: string | null; plan_name: string | null;
  status: string | null; state: "ok" | "grace" | "blocked"; trial_ends_on: string | null; current_period_end: string | null;
  students: number; student_limit: number | null; staff: number; staff_limit: number | null; created_at: string;
}
export interface CommercialOverview {
  by_status: Record<string, number>; by_plan: { code: string; name: string; count: number }[]; on_trial: number;
  expiring_14d: number; in_grace: number; blocked: number; new_30d: number; open_support: number; access_pending: number;
}
export interface HistoryRow { at: string; actor_label: string; kind: string; note: string | null; details: Record<string, unknown> }
export interface SupportRequestRow {
  id: string; school_id: string; school_name: string; subject: string; priority: string; status: string; created_at: string; updated_at: string; messages: number;
}
export interface SupportRequestDetail {
  id: string; subject: string; priority: string; status: string; created_at: string; school_name: string;
  messages: { author_kind: "school" | "platform"; author: string; body: string; at: string }[];
}
export interface AccessGrant {
  id: string; school_id: string; school_name: string; requested_label: string; reason: string; hours: number; status: string;
  effective_status: string; created_at: string; decided_at: string | null; decision_note: string | null; starts_at: string | null;
  expires_at: string | null; uses: number; mine: boolean;
}
export interface ActivityRow {
  id: string; created_at: string; school_id: string | null; school_name: string | null; actor_name: string | null; actor_role: string | null;
  action: string; target_type: string; target_name: string | null; details: Record<string, unknown>; total: number;
}
export interface MySubscription {
  managed: boolean;
  plan?: { code: string; name: string; description: string | null; student_limit: number | null; staff_limit: number | null; monthly_price: number; annual_price?: number | null; currency: string; entitlements: Record<string, boolean> };
  label?: string; started_on?: string | null; grace_ends_on?: string | null; school_status?: "active" | "suspended";
  status?: string; state?: "ok" | "grace" | "blocked"; trial_ends_on?: string | null; current_period_end?: string | null; grace_days?: number;
  usage?: { students: number; staff: number };
}

export const usePlans = () => useQuery({ queryKey: ["plans"], queryFn: () => rpc<Plan[]>("platform_plans") });
export const useSubscriptions = () => useQuery({ queryKey: ["subscriptions"], queryFn: () => rpc<SubscriptionRow[]>("platform_subscriptions") });
export const useCommercial = () => useQuery({ queryKey: ["commercial"], refetchInterval: 60_000, queryFn: () => rpc<CommercialOverview>("platform_commercial_overview") });
export const useSubscriptionHistory = (schoolId: string | null) =>
  useQuery({ queryKey: ["subscription-history", schoolId], enabled: !!schoolId, queryFn: () => rpc<HistoryRow[]>("subscription_history", { _school: schoolId }) });
export const useSchoolAdmins = (schoolId: string | null) =>
  useQuery({
    queryKey: ["school-admins", schoolId], enabled: !!schoolId,
    queryFn: () => rpc<{ profile_id: string; full_name: string; email: string | null; status: string; last_sign_in: string | null }[]>("platform_school_admins", { _school: schoolId }),
  });
export const useSupportRequests = (schoolId: string | null, status: string | null, enabled = true) =>
  useQuery({
    queryKey: ["support-requests", schoolId, status], enabled, refetchInterval: 60_000,
    queryFn: () => rpc<SupportRequestRow[]>("list_support_requests", { _school: schoolId, _status: status }),
  });
export const useSupportRequest = (id: string | null) =>
  useQuery({ queryKey: ["support-request", id], enabled: !!id, queryFn: () => rpc<SupportRequestDetail>("get_support_request", { _id: id }) });
export const useAccessGrants = (schoolId: string | null, enabled = true) =>
  useQuery({ queryKey: ["access-grants", schoolId], enabled, refetchInterval: 60_000, queryFn: () => rpc<AccessGrant[]>("list_support_access", { _school: schoolId }) });
export const useMySubscription = (schoolId: string, enabled = true) =>
  useQuery({ queryKey: ["my-subscription", schoolId], enabled: !!schoolId && enabled, queryFn: () => rpc<MySubscription>("my_subscription", { _school: schoolId }) });

export interface ActivityFilters {
  school: string; actor: string; action: string; targetType: string; from: string; to: string; adminsOnly: boolean; page: number;
}
export const PAGE_SIZE = 25;
export const useActivity = (f: ActivityFilters) =>
  useQuery({
    queryKey: ["platform-activity", f],
    queryFn: () => rpc<ActivityRow[]>("platform_activity_log", {
      _school: f.school || null, _actor: f.actor.trim() || null, _action: f.action || null, _target_type: f.targetType || null,
      _from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : null, _to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : null,
      _admins_only: f.adminsOnly, _limit: PAGE_SIZE, _offset: f.page * PAGE_SIZE,
    }),
  });

export const useConsoleActions = () => {
  const qc = useQueryClient();
  const refresh = () =>
    ["plans", "subscriptions", "commercial", "subscription-history", "school-admins", "support-requests", "support-request", "access-grants", "my-subscription", "platform-alerts", "audit-status"]
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const useAction = <A,>(fn: (a: A) => Promise<unknown>) => useMutation({ mutationFn: fn, onSuccess: refresh });
  return {
    upsertPlan: useAction((p: { code: string; name: string; description: string; studentLimit: number | null; staffLimit: number | null; price: number; entitlements: Record<string, boolean>; active: boolean }) =>
      rpc("upsert_plan", { _code: p.code, _name: p.name, _description: p.description, _student_limit: p.studentLimit, _staff_limit: p.staffLimit, _price: p.price, _entitlements: p.entitlements, _active: p.active })),
    setSubscription: useAction((v: { school: string; plan: string; status: string; periodEnd: string | null; trialEnd: string | null; grace: number; note: string }) =>
      rpc("set_school_subscription", { _school: v.school, _plan: v.plan, _status: v.status, _period_end: v.periodEnd, _trial_end: v.trialEnd, _grace: v.grace, _note: v.note })),
    setAdminStatus: useAction((v: { school: string; profile: string; suspend: boolean; reason: string }) =>
      rpc("platform_set_admin_status", { _school: v.school, _profile: v.profile, _suspend: v.suspend, _reason: v.reason })),
    createRequest: useAction((v: { school: string; subject: string; body: string; priority: string }) =>
      rpc<string>("create_support_request", { _school: v.school, _subject: v.subject, _body: v.body, _priority: v.priority })),
    reply: useAction((v: { id: string; body: string }) => rpc("reply_support_request", { _id: v.id, _body: v.body })),
    setStatus: useAction((v: { id: string; status: string }) => rpc("set_support_status", { _id: v.id, _status: v.status })),
    requestAccess: useAction((v: { school: string; reason: string; hours: number; request: string | null }) =>
      rpc<string>("request_support_access", { _school: v.school, _reason: v.reason, _hours: v.hours, _request: v.request })),
    decideAccess: useAction((v: { id: string; approve: boolean; note: string }) => rpc("decide_support_access", { _grant: v.id, _approve: v.approve, _note: v.note })),
    endAccess: useAction((id: string) => rpc("end_support_access", { _grant: id })),
  };
};
