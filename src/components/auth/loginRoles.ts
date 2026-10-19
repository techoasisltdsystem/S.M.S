import { GraduationCap, ShieldCheck, BookOpen, Users } from "lucide-react";
import type { UserRole } from "@/contexts/AuthContext";
import adminBg from "@/assets/admin-login-bg.webp";
import teacherBg from "@/assets/teacher-login-bg.jpg";
import parentBg from "@/assets/parent-login-bg.jpg";

export const LOGIN_ROLES: { value: UserRole; label: string; short: string; icon: React.ElementType; desc: string }[] = [
  { value: "admin", label: "Administrator", short: "Admin", icon: ShieldCheck, desc: "Full system access" },
  { value: "teacher", label: "Teacher", short: "Teacher", icon: BookOpen, desc: "Classes & grading" },
  { value: "student", label: "Student", short: "Student", icon: GraduationCap, desc: "Portal access" },
  { value: "parent", label: "Parent", short: "Parent", icon: Users, desc: "Monitor progress" },
];

// Roles that use the full-screen photo sign-in; students keep the split layout.
export type GlassRole = Exclude<UserRole, "student">;

interface GlassTheme {
  image: string;
  mirror?: boolean;
  page: string;
  overlay: string;
  card: string;
  accent: string;
  muted: string;
  ring: string;
  button: string;
  title: string;
  subtitle: string;
  sideIcon: React.ElementType;
  sideTitle: string;
  sideText: string;
}

// Class names are written out in full so Tailwind can see them.
export const GLASS_THEMES: Record<GlassRole, GlassTheme> = {
  admin: {
    image: adminBg,
    mirror: true,
    page: "bg-blue-950",
    overlay: "from-blue-950/90 via-blue-900/75 to-blue-700/55",
    card: "bg-blue-600/35",
    accent: "text-sky-300",
    muted: "text-blue-100",
    ring: "focus:ring-sky-400",
    button: "bg-sky-500 hover:bg-sky-400 focus:ring-offset-blue-700",
    title: "Administrator sign in",
    subtitle: "Sign in to manage your school.",
    sideIcon: ShieldCheck,
    sideTitle: "Restricted area",
    sideText: "Administrator access only. Full control of users, settings and school records.",
  },
  teacher: {
    image: teacherBg,
    page: "bg-emerald-950",
    overlay: "from-emerald-950/90 via-emerald-900/70 to-teal-700/45",
    card: "bg-emerald-700/35",
    accent: "text-emerald-300",
    muted: "text-emerald-100",
    ring: "focus:ring-emerald-400",
    button: "bg-emerald-500 hover:bg-emerald-400 focus:ring-offset-emerald-700",
    title: "Teacher sign in",
    subtitle: "Take attendance, manage your classes and record grades.",
    sideIcon: BookOpen,
    sideTitle: "Staff portal",
    sideText: "For teaching staff. Your classes, timetable and gradebook in one place.",
  },
  parent: {
    image: parentBg,
    page: "bg-violet-950",
    overlay: "from-violet-950/90 via-purple-900/70 to-fuchsia-800/40",
    card: "bg-violet-700/35",
    accent: "text-fuchsia-300",
    muted: "text-violet-100",
    ring: "focus:ring-fuchsia-400",
    button: "bg-violet-500 hover:bg-violet-400 focus:ring-offset-violet-700",
    title: "Parent sign in",
    subtitle: "Follow your child's attendance, results and fees.",
    sideIcon: Users,
    sideTitle: "Parent portal",
    sideText: "For parents and guardians. Stay close to your child's progress at school.",
  },
};
