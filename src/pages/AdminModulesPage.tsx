import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import {
  Search,
  Plus,
  Download,
  BookOpen,
  Calendar,
  ClipboardList,
  UserCheck,
  Library,
  Bell,
  BarChart3,
  Settings,
  Clock,
  Users,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import DashboardLayout from "@/components/dashboard/DashboardLayout";
import StatCard from "@/components/dashboard/StatCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type StatColor = "primary" | "success" | "warning" | "destructive" | "info";
type ChangeType = "positive" | "negative" | "neutral";

interface ModuleStat {
  title: string;
  value: string;
  change: string;
  changeType: ChangeType;
  color: StatColor;
  icon: LucideIcon;
}

interface ModuleItem {
  title: string;
  meta: string;
  status: "Active" | "Scheduled" | "Pending" | "Completed";
}

interface ModuleConfig {
  title: string;
  description: string;
  primaryAction: string;
  stats: ModuleStat[];
  items: ModuleItem[];
}

const MODULE_CONFIG: Record<string, ModuleConfig> = {
  "/classes": {
    title: "Classes",
    description: "Manage class sections, advisors, and current enrollment.",
    primaryAction: "New Class",
    stats: [
      { title: "Active Classes", value: "94", change: "All running", changeType: "positive", color: "primary", icon: BookOpen },
      { title: "Homeroom Teachers", value: "62", change: "2 newly assigned", changeType: "neutral", color: "info", icon: Users },
      { title: "Avg Class Size", value: "30", change: "Within target", changeType: "neutral", color: "success", icon: TrendingUp },
      { title: "Need Review", value: "5", change: "Schedule conflicts", changeType: "negative", color: "warning", icon: Clock },
    ],
    items: [
      { title: "10A — Science", meta: "Advisor: Mr. James Wilson", status: "Active" },
      { title: "11B — Commerce", meta: "Advisor: Ms. Laura Reed", status: "Active" },
      { title: "9C — General", meta: "Advisor: Mr. Ethan Cole", status: "Pending" },
      { title: "12A — STEM", meta: "Advisor: Dr. Sarah Mitchell", status: "Active" },
    ],
  },
  "/timetable": {
    title: "Timetable",
    description: "Track period scheduling, substitutions, and room assignments.",
    primaryAction: "Create Timetable",
    stats: [
      { title: "Today's Periods", value: "48", change: "6 completed", changeType: "neutral", color: "primary", icon: Calendar },
      { title: "Room Changes", value: "3", change: "Updated this morning", changeType: "negative", color: "warning", icon: Clock },
      { title: "Substitutions", value: "2", change: "Covered", changeType: "positive", color: "success", icon: Users },
      { title: "On-Time Start", value: "98%", change: "+1.2% week-over-week", changeType: "positive", color: "info", icon: TrendingUp },
    ],
    items: [
      { title: "Grade 10A Morning Block", meta: "Room 204 • 08:30 AM", status: "Scheduled" },
      { title: "Grade 11B Physics", meta: "Lab 2 • 10:15 AM", status: "Scheduled" },
      { title: "Grade 9C English", meta: "Room 109 • 11:15 AM", status: "Active" },
      { title: "Grade 12A Math", meta: "Room 301 • 01:30 PM", status: "Pending" },
    ],
  },
  "/exams": {
    title: "Exams & Grades",
    description: "Plan exams, monitor grading progress, and publish results.",
    primaryAction: "Create Exam",
    stats: [
      { title: "Upcoming Exams", value: "12", change: "This month", changeType: "neutral", color: "primary", icon: ClipboardList },
      { title: "Grading Pending", value: "23", change: "Due in 3 days", changeType: "negative", color: "warning", icon: Clock },
      { title: "Published Results", value: "41", change: "Across all grades", changeType: "positive", color: "success", icon: TrendingUp },
      { title: "Avg Pass Rate", value: "86%", change: "+2% this term", changeType: "positive", color: "info", icon: Users },
    ],
    items: [
      { title: "Midterm Physics — Grade 11", meta: "Open for grading", status: "Active" },
      { title: "Algebra Quiz — Grade 9", meta: "Results published", status: "Completed" },
      { title: "Chemistry Practical — Grade 12", meta: "Scheduled for Mar 15", status: "Scheduled" },
      { title: "History Assessment — Grade 10", meta: "Awaiting invigilator", status: "Pending" },
    ],
  },
  "/attendance": {
    title: "Attendance",
    description: "Review daily attendance and identify absences or late trends.",
    primaryAction: "Mark Attendance",
    stats: [
      { title: "Attendance Today", value: "95%", change: "+1% vs yesterday", changeType: "positive", color: "success", icon: UserCheck },
      { title: "Late Arrivals", value: "14", change: "Mostly Grade 11", changeType: "negative", color: "warning", icon: Clock },
      { title: "Excused Absences", value: "9", change: "All verified", changeType: "neutral", color: "info", icon: Users },
      { title: "Weekly Trend", value: "Up", change: "Steady improvement", changeType: "positive", color: "primary", icon: TrendingUp },
    ],
    items: [
      { title: "Grade 10A", meta: "28/30 present", status: "Completed" },
      { title: "Grade 11B", meta: "31/33 present", status: "Completed" },
      { title: "Grade 9C", meta: "26/29 present", status: "Pending" },
      { title: "Grade 12A", meta: "29/31 present", status: "Completed" },
    ],
  },
  "/library": {
    title: "Library",
    description: "Track book inventory, returns, and overdue items.",
    primaryAction: "Add Book",
    stats: [
      { title: "Books Issued", value: "312", change: "This week", changeType: "neutral", color: "primary", icon: Library },
      { title: "Overdue", value: "18", change: "Need reminders", changeType: "negative", color: "destructive", icon: Clock },
      { title: "Returns Today", value: "44", change: "On schedule", changeType: "positive", color: "success", icon: TrendingUp },
      { title: "Catalog Size", value: "8.4K", change: "+120 new titles", changeType: "positive", color: "info", icon: BookOpen },
    ],
    items: [
      { title: "Modern Physics — Halliday", meta: "Issued to Grade 12A", status: "Active" },
      { title: "World History Atlas", meta: "Due on Mar 14", status: "Scheduled" },
      { title: "Calculus Basics", meta: "Overdue by 4 days", status: "Pending" },
      { title: "English Grammar Pro", meta: "Returned today", status: "Completed" },
    ],
  },
  "/notifications": {
    title: "Notifications",
    description: "Send notices to staff, students, and parents by priority.",
    primaryAction: "New Notification",
    stats: [
      { title: "Sent Today", value: "27", change: "Across 4 channels", changeType: "neutral", color: "primary", icon: Bell },
      { title: "Unread", value: "83", change: "Parents segment high", changeType: "negative", color: "warning", icon: Clock },
      { title: "Delivery Rate", value: "99.2%", change: "Stable", changeType: "positive", color: "success", icon: TrendingUp },
      { title: "Drafts", value: "6", change: "Needs approval", changeType: "neutral", color: "info", icon: ClipboardList },
    ],
    items: [
      { title: "PTA Meeting Reminder", meta: "Parents • High Priority", status: "Scheduled" },
      { title: "Exam Hall Allocation", meta: "Students • Medium Priority", status: "Active" },
      { title: "Fee Due Notice", meta: "Parents • High Priority", status: "Pending" },
      { title: "Sports Day Circular", meta: "All users • Sent", status: "Completed" },
    ],
  },
  "/analytics": {
    title: "Analytics",
    description: "Monitor academic and operational performance insights.",
    primaryAction: "Generate Report",
    stats: [
      { title: "Overall GPA", value: "3.41", change: "+0.08 vs last term", changeType: "positive", color: "primary", icon: BarChart3 },
      { title: "Attendance Avg", value: "93%", change: "+1.4% month-over-month", changeType: "positive", color: "success", icon: UserCheck },
      { title: "Fee Collection", value: "82%", change: "Target 90%", changeType: "negative", color: "warning", icon: TrendingUp },
      { title: "At-Risk Students", value: "34", change: "Needs intervention", changeType: "negative", color: "destructive", icon: Users },
    ],
    items: [
      { title: "Grade 12 Board Exam Trend", meta: "Performance up in STEM", status: "Completed" },
      { title: "Chronic Absence Heatmap", meta: "Grade 10 flagged", status: "Active" },
      { title: "Fee Recovery Projection", meta: "Forecast updated", status: "Scheduled" },
      { title: "Teacher Workload Balance", meta: "Review pending", status: "Pending" },
    ],
  },
  "/settings": {
    title: "Settings",
    description: "Configure institution profile, policies, and system preferences.",
    primaryAction: "Save Changes",
    stats: [
      { title: "Active Integrations", value: "4", change: "All healthy", changeType: "positive", color: "success", icon: Settings },
      { title: "Users with Access", value: "62", change: "2 updated roles", changeType: "neutral", color: "info", icon: Users },
      { title: "Policy Updates", value: "3", change: "Pending approval", changeType: "negative", color: "warning", icon: ClipboardList },
      { title: "Backups", value: "Daily", change: "Last: 02:00 AM", changeType: "positive", color: "primary", icon: Clock },
    ],
    items: [
      { title: "Academic Year Configuration", meta: "2026–2027", status: "Active" },
      { title: "Role Permission Matrix", meta: "Last updated 2 days ago", status: "Completed" },
      { title: "Email Templates", meta: "2 drafts pending", status: "Pending" },
      { title: "SMS Gateway", meta: "Connected and verified", status: "Scheduled" },
    ],
  },
};

const statusClasses: Record<ModuleItem["status"], string> = {
  Active: "bg-success/10 text-success border-success/20",
  Scheduled: "bg-info/10 text-info border-info/20",
  Pending: "bg-warning/10 text-warning border-warning/20",
  Completed: "bg-primary/10 text-primary border-primary/20",
};

const AdminModulesPage = () => {
  const { pathname } = useLocation();
  const [search, setSearch] = useState("");

  const module = MODULE_CONFIG[pathname] ?? MODULE_CONFIG["/classes"];

  const filteredItems = useMemo(
    () => module.items.filter((item) => `${item.title} ${item.meta}`.toLowerCase().includes(search.toLowerCase())),
    [module, search],
  );

  return (
    <DashboardLayout>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {module.stats.map((stat, index) => (
          <StatCard key={stat.title} {...stat} delay={index * 0.08} />
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl border border-border shadow-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 border-b border-border">
          <div>
            <h1 className="font-heading text-xl font-bold text-card-foreground">{module.title}</h1>
            <p className="text-sm text-muted-foreground">{module.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1.5" />
              Export
            </Button>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              {module.primaryAction}
            </Button>
          </div>
        </div>

        <div className="p-4 border-b border-border bg-muted/30">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${module.title.toLowerCase()}...`} className="pl-9 h-9" />
          </div>
        </div>

        <div className="divide-y divide-border">
          {filteredItems.map((item, index) => (
            <div key={`${item.title}-${index}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-muted/30 transition-colors">
              <div>
                <p className="text-sm font-medium text-card-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.meta}</p>
              </div>
              <Badge variant="outline" className={`text-xs ${statusClasses[item.status]}`}>
                {item.status}
              </Badge>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-muted-foreground">No records found for this search.</p>
            </div>
          )}
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default AdminModulesPage;
