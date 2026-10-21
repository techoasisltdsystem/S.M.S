import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/rpc";

export interface PlatformEvent {
  id: string; at: string; actor_email: string | null; category: string; action: string; subject: string | null;
  detail: Record<string, unknown>; outcome: string; total_rows: number;
}
export const EVENT_CATEGORIES: Record<string, string> = {
  access: "Sign-ins and account", administrators: "Administrators", billing: "Billing", announcements: "Announcements", support: "Support", data: "Reports and exports",
};
export const useEvents = (f: { search: string; category: string; from: string; to: string; mine: boolean; page: number }, size = 20) =>
  useQuery({
    queryKey: ["platform-events", f], placeholderData: (p) => p,
    queryFn: () => rpc<PlatformEvent[]>("platform_events_list", {
      _search: f.search || null, _category: f.category || null, _from: f.from || null, _to: f.to || null, _mine: f.mine, _limit: size, _offset: f.page * size,
    }),
  });

export interface Announcement {
  id: string; title: string; body: string; kind: "notice" | "maintenance" | "update"; audience: "all" | "school_admins" | "teachers" | "students" | "parents";
  status: "draft" | "published" | "archived"; starts_at: string | null; ends_at: string | null; created_at: string; published_at: string | null;
  created_by_email: string | null; reach: number;
}
export const useAnnouncements = () => useQuery({ queryKey: ["platform-announcements"], queryFn: () => rpc<Announcement[]>("platform_announcements_list") });
export const useMyAnnouncements = (school: string | undefined) =>
  useQuery({
    queryKey: ["my-announcements", school], enabled: !!school, staleTime: 60_000, retry: false,
    queryFn: () => rpc<{ id: string; title: string; body: string; kind: Announcement["kind"]; published_at: string }[]>("my_platform_announcements", { _school: school }),
  });

export interface Report {
  schools_registered: number; orders_paid: number; orders_failed: number; orders_pending: number;
  revenue: { currency: string; total_minor: number; orders: number }[];
  revenue_by_month: { month: string; currency: string; total_minor: number }[];
  revenue_by_package: { plan: string; currency: string; total_minor: number; orders: number }[];
  registrations_by_month: { month: string; schools: number }[];
  purposes: { purpose: string; orders: number }[];
}
export const useReport = (from: string, to: string) =>
  useQuery({ queryKey: ["platform-report", from, to], enabled: !!from && !!to && to >= from, retry: false, queryFn: () => rpc<Report>("platform_report", { _from: from, _to: to }) });

export interface OnboardingRow { school_id: string; school_name: string; registered_at: string; status: string; admin_joined: boolean; classes: number; teachers: number; students: number }
export const useOnboarding = () => useQuery({ queryKey: ["platform-onboarding"], queryFn: () => rpc<OnboardingRow[]>("platform_onboarding") });
export interface SchoolAdminRow { profile_id: string; school_id: string; school_name: string; school_status: string; name: string; email: string | null; membership_status: string; last_sign_in: string | null; total_rows: number }
export const useSchoolAdmins = (search: string, page: number, size = 20) =>
  useQuery({ queryKey: ["platform-school-admins", search, page], placeholderData: (p) => p, queryFn: () => rpc<SchoolAdminRow[]>("platform_school_admins", { _search: search || null, _limit: size, _offset: page * size }) });
export interface UsageRow { school_id: string; school_name: string; status: string; active_people: number; students: number; staff: number; events_30d: number; sign_ins_30d: number; last_activity: string | null }
export const useUsage = () => useQuery({ queryKey: ["platform-usage"], queryFn: () => rpc<UsageRow[]>("platform_usage") });
