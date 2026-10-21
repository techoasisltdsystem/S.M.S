import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar, DollarSign, ClipboardList,
  Library, Settings, UserCheck, Building2, History, Megaphone, School, MessageSquare, ShieldCheck, ShieldAlert, CreditCard, LifeBuoy, Activity, CalendarClock, Tags, Receipt, UserCog, HeartPulse, KeyRound, BarChart3, ClipboardCheck, FileText, type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/contexts/AuthContext";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  /** Hidden from people without this permission (the database checks every request anyway). */
  permission?: string;
}
export interface NavGroup {
  title?: string;
  items: NavItem[];
}

// One menu per layout, grouped like the school admin reference. Every path is
// a page that exists in App.tsx; unbuilt modules open an honest "not built yet" page.
export const NAV: Record<UserRole, NavGroup[]> = {
  platform: [
    {
      title: "Overview",
      items: [
        { label: "Platform overview", icon: LayoutDashboard, path: "/platform", permission: "clients.view" },
        { label: "Analytics and reports", icon: BarChart3, path: "/platform/reports", permission: "billing.view" },
        { label: "System health", icon: HeartPulse, path: "/platform/health", permission: "health.view" },
      ],
    },
    {
      title: "Clients and schools",
      items: [
        { label: "Clients and schools", icon: Building2, path: "/platform/clients", permission: "clients.view" },
        { label: "Create and suspend", icon: School, path: "/platform/schools", permission: "clients.create" },
        { label: "School onboarding", icon: ClipboardCheck, path: "/platform/onboarding", permission: "clients.view" },
        { label: "School administrators", icon: UserCheck, path: "/platform/school-admins", permission: "clients.view" },
        { label: "School usage", icon: Users, path: "/platform/usage", permission: "clients.view" },
      ],
    },
    {
      title: "Subscriptions and billing",
      items: [
        { label: "Subscriptions", icon: CreditCard, path: "/platform/subscriptions", permission: "clients.view" },
        { label: "Renewals and expiry", icon: CalendarClock, path: "/platform/renewals", permission: "clients.view" },
        { label: "Pricing and packages", icon: Tags, path: "/platform/packages", permission: "billing.view" },
        { label: "Payments", icon: Receipt, path: "/platform/billing", permission: "billing.view" },
        { label: "Invoices and receipts", icon: FileText, path: "/platform/invoices", permission: "billing.view" },
      ],
    },
    {
      title: "Platform management",
      items: [
        { label: "Platform administrators", icon: UserCog, path: "/platform/admins", permission: "admins.manage" },
        { label: "Roles and permissions", icon: ShieldCheck, path: "/platform/roles", permission: "admins.manage" },
        { label: "Platform settings", icon: Settings, path: "/platform/settings", permission: "billing.view" },
        { label: "Announcements", icon: Megaphone, path: "/platform/announcements", permission: "announcements.manage" },
      ],
    },
    {
      title: "Security and oversight",
      items: [
        { label: "Audit and security", icon: ShieldAlert, path: "/platform/audit", permission: "audit.view" },
        { label: "Administrative activity", icon: Activity, path: "/platform/activity", permission: "audit.view" },
        { label: "Security events and sign-ins", icon: History, path: "/platform/events", permission: "audit.view" },
      ],
    },
    {
      title: "Support",
      items: [{ label: "Support", icon: LifeBuoy, path: "/platform/support", permission: "support.view" }],
    },
    {
      title: "Account",
      items: [{ label: "Account and security", icon: KeyRound, path: "/platform/profile" }],
    },
  ],
  admin: [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] },
    {
      title: "Academics Department",
      items: [
        { label: "Students", icon: GraduationCap, path: "/students" },
        { label: "Classes", icon: BookOpen, path: "/classes" },
        { label: "Attendance", icon: UserCheck, path: "/attendance", permission: "attendance.view" },
        { label: "Results & Grades", icon: ClipboardList, path: "/exams", permission: "grades.view" },
        { label: "Timetable", icon: Calendar, path: "/timetable" },
      ],
    },
    {
      title: "Student Services",
      items: [
        { label: "Messages", icon: MessageSquare, path: "/messages" },
        { label: "Calendar & Notices", icon: Megaphone, path: "/calendar" },
        { label: "Library", icon: Library, path: "/library" },
      ],
    },
    { title: "Finance Office", items: [{ label: "Fees & Payments", icon: DollarSign, path: "/fees" }] },
    {
      title: "Administration",
      items: [
        { label: "User Management", icon: Users, path: "/user-management", permission: "users.manage" },
        { label: "Roles & Permissions", icon: ShieldCheck, path: "/role-permissions", permission: "staff.manage" },
        { label: "Audit Logs", icon: History, path: "/audit-logs", permission: "audit.view" },
        { label: "School Setup", icon: Building2, path: "/setup", permission: "school.settings.manage" },
        { label: "Settings", icon: Settings, path: "/settings", permission: "school.settings.manage" },
        { label: "Plan & Billing", icon: CreditCard, path: "/subscription", permission: "staff.manage" },
        { label: "Platform Support", icon: LifeBuoy, path: "/support", permission: "staff.manage" },
      ],
    },
  ],
  teacher: [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] },
    {
      title: "Teaching",
      items: [
        { label: "My Classes", icon: BookOpen, path: "/classes" },
        { label: "Students", icon: GraduationCap, path: "/students" },
        { label: "Attendance", icon: UserCheck, path: "/attendance" },
        { label: "Results & Grades", icon: ClipboardList, path: "/exams" },
        { label: "Timetable", icon: Calendar, path: "/timetable" },
      ],
    },
    { title: "Communication", items: [{ label: "Messages", icon: MessageSquare, path: "/messages" }, { label: "Calendar & Notices", icon: Megaphone, path: "/calendar" }] },
  ],
  student: [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] },
    {
      title: "My Learning",
      items: [
        { label: "Assignments", icon: BookOpen, path: "/assignments" },
        { label: "Results", icon: ClipboardList, path: "/exams" },
        { label: "Attendance", icon: UserCheck, path: "/attendance" },
        { label: "Timetable", icon: Calendar, path: "/timetable" },
        { label: "Messages", icon: MessageSquare, path: "/messages" },
        { label: "Notices & Calendar", icon: Megaphone, path: "/calendar" },
      ],
    },
  ],
  parent: [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] },
    {
      title: "My Children",
      items: [
        { label: "Results", icon: ClipboardList, path: "/exams" },
        { label: "Attendance", icon: UserCheck, path: "/attendance" },
        { label: "Timetable", icon: Calendar, path: "/timetable" },
        { label: "Messages", icon: MessageSquare, path: "/messages" },
        { label: "Notices & Calendar", icon: Megaphone, path: "/calendar" },
      ],
    },
    { title: "Finance", items: [{ label: "Fees & Payments", icon: DollarSign, path: "/fees" }] },
  ],
};
