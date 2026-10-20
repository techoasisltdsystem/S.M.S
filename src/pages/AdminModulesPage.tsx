import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  GraduationCap,
  Library,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";

interface ModuleInfo {
  title: string;
  description: string;
  icon: LucideIcon;
  phase: number;
  phaseName: string;
}

// Modules that are not built yet. Each page says so plainly instead of
// showing sample numbers; the phase follows the TOSMS roadmap.
const MODULES: Record<string, ModuleInfo> = {
  "/students": { title: "Students", description: "Admissions, enrolment, guardians and student records.", icon: GraduationCap, phase: 3, phaseName: "School administration" },
  "/classes": { title: "Classes", description: "Class sections, subjects and teacher assignments.", icon: BookOpen, phase: 3, phaseName: "School administration" },
  "/timetable": { title: "Timetable", description: "Periods, rooms and substitutions.", icon: Calendar, phase: 3, phaseName: "School administration" },
  "/attendance": { title: "Attendance", description: "Daily registers, corrections and absence alerts.", icon: UserCheck, phase: 4, phaseName: "Attendance and academics" },
  "/exams": { title: "Exams and grades", description: "Assessments, gradebooks, approval, publication and report cards.", icon: ClipboardList, phase: 4, phaseName: "Attendance and academics" },
  "/library": { title: "Library", description: "Catalogue, loans and returns.", icon: Library, phase: 7, phaseName: "Operations" },
  "/notifications": { title: "Notifications", description: "In-app, email, SMS and push messages with delivery status.", icon: Bell, phase: 7, phaseName: "Operations" },
  "/analytics": { title: "Analytics", description: "Enrolment, attendance, results and fee collection reports.", icon: BarChart3, phase: 7, phaseName: "Operations" },
  "/reports": { title: "Reports", description: "Permission-scoped reports and logged exports.", icon: FileText, phase: 7, phaseName: "Operations" },
};

const AdminModulesPage = () => {
  const { pathname } = useLocation();
  const module = MODULES[pathname] ?? MODULES["/classes"];
  const Icon = module.icon;

  return (
    <DashboardLayout>
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center shadow-card"
        aria-labelledby="module-title"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <h1 id="module-title" className="font-heading text-xl font-bold text-card-foreground">
          {module.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
        <p className="mt-6 rounded-md bg-muted px-4 py-3 text-sm text-foreground">
          Not built yet. This module arrives in Phase {module.phase} ({module.phaseName}). Nothing shown here is live data.
        </p>
      </motion.section>
    </DashboardLayout>
  );
};

export default AdminModulesPage;
