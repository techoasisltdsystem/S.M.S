import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar, DollarSign, ClipboardList,
  Library, Settings, UserCheck, Building2, History, Megaphone, School, type LucideIcon,
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
    { items: [{ label: "Platform overview", icon: LayoutDashboard, path: "/platform" }] },
    { title: "Platform", items: [{ label: "Schools", icon: School, path: "/platform/schools" }] },
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
        { label: "Calendar & Notices", icon: Megaphone, path: "/calendar" },
        { label: "Library", icon: Library, path: "/library" },
      ],
    },
    { title: "Finance Office", items: [{ label: "Fees & Payments", icon: DollarSign, path: "/fees" }] },
    {
      title: "Administration",
      items: [
        { label: "User Management", icon: Users, path: "/user-management", permission: "users.manage" },
        { label: "Audit Logs", icon: History, path: "/audit-logs", permission: "audit.view" },
        { label: "School Setup", icon: Building2, path: "/setup", permission: "school.settings.manage" },
        { label: "Settings", icon: Settings, path: "/settings", permission: "school.settings.manage" },
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
    { title: "Communication", items: [{ label: "Calendar & Notices", icon: Megaphone, path: "/calendar" }] },
  ],
  student: [
    { items: [{ label: "Dashboard", icon: LayoutDashboard, path: "/dashboard" }] },
    {
      title: "My Learning",
      items: [
        { label: "Results", icon: ClipboardList, path: "/exams" },
        { label: "Attendance", icon: UserCheck, path: "/attendance" },
        { label: "Timetable", icon: Calendar, path: "/timetable" },
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
        { label: "Notices & Calendar", icon: Megaphone, path: "/calendar" },
      ],
    },
    { title: "Finance", items: [{ label: "Fees & Payments", icon: DollarSign, path: "/fees" }] },
  ],
};
