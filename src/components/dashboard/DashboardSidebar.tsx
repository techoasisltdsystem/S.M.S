import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import { useNavigate, useLocation } from "react-router-dom";
import Logo from "@/components/ui/logo";
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Calendar, DollarSign,
  ClipboardList, Bell, Library, BarChart3, Settings, LogOut, ChevronLeft,
  UserCheck, FileText, Building2
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ["admin", "teacher", "student", "parent"] },
  { label: "Students", icon: GraduationCap, path: "/students", roles: ["admin", "teacher"] },
  { label: "User Management", icon: Users, path: "/user-management", roles: ["admin"] },
  { label: "Classes", icon: BookOpen, path: "/classes", roles: ["admin", "teacher"] },
  { label: "Timetable", icon: Calendar, path: "/timetable", roles: ["admin", "teacher", "student", "parent"] },
  { label: "Exams & Grades", icon: ClipboardList, path: "/exams", roles: ["admin", "teacher", "student", "parent"] },
  { label: "Attendance", icon: UserCheck, path: "/attendance", roles: ["admin", "teacher", "student", "parent"] },
  { label: "Fees & Payments", icon: DollarSign, path: "/fees", roles: ["admin", "parent"] },
  { label: "Reports", icon: FileText, path: "/reports", roles: ["admin", "teacher"] },
  { label: "Library", icon: Library, path: "/library", roles: ["admin", "teacher", "student"] },
  { label: "Notifications", icon: Bell, path: "/notifications", roles: ["admin", "teacher", "student", "parent"] },
  { label: "Analytics", icon: BarChart3, path: "/analytics", roles: ["admin"] },
  { label: "Audit Logs", icon: FileText, path: "/audit-logs", roles: ["admin"] },
  { label: "School Setup", icon: Building2, path: "/setup", roles: ["admin"] },
  { label: "Settings", icon: Settings, path: "/settings", roles: ["admin"] },
];


const DashboardSidebar = () => {
  const { user, logout } = useAuth();
  const { schoolConfig } = useSchool();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  if (!user) return null;

  const filteredItems = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {schoolConfig?.logo_url ? (
            <img
              src={schoolConfig.logo_url}
              alt={schoolConfig.school_name}
              className="w-8 h-8 shrink-0 rounded-sm object-contain"
            />
          ) : (
            <Logo className="w-8 h-8 shrink-0" />
          )}
          {!collapsed && (
            <div className="min-w-0">
              <span className="font-heading text-sm font-bold text-sidebar-primary-foreground whitespace-nowrap block truncate">
                {schoolConfig?.school_name || 'Tech Oasis'}{' '}
                <span className="text-sidebar-primary">SMS</span>
              </span>
              {schoolConfig?.tagline && (
                <span className="text-[10px] text-sidebar-foreground/50 truncate block">
                  {schoolConfig.tagline}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground/60 hover:text-sidebar-foreground p-1 hidden lg:block"
        >
          <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="w-9 h-9 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-heading font-bold text-sm shrink-0">
            {user.name.split(" ").map((n) => n[0]).join("")}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-primary-foreground truncate">{user.name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{user.role}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={logout} className="text-sidebar-foreground/60 hover:text-destructive p-1" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
