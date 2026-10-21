import { useAuth, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Logo from "@/components/ui/logo";
import { LogOut, Settings, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV } from "@/components/dashboard/nav";

/** The left menu: brand, grouped links with a solid active pill, settings and the signed-in person at the bottom. */
const DashboardSidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, logout, can } = useAuth();
  const { schoolConfig } = useSchool();
  const location = useLocation();

  if (!user) return null;
  const groups = NAV[user.role]
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(i.permission)) }))
    .filter((g) => g.items.length > 0);
  const isPlatform = user.role === "platform";
  const settings = isPlatform
    ? { to: "/platform/profile", label: "Account settings", icon: Settings }
    : can("school.settings.manage") ? { to: "/settings", label: "Settings", icon: Settings } : { to: "/profile", label: "Profile & password", icon: UserRound };
  const isActive = (p: string) => location.pathname === p || (p !== "/dashboard" && p !== "/platform" && location.pathname.startsWith(p + "/"));

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 px-5">
        {schoolConfig?.logo_url && !isPlatform ? (
          <img src={schoolConfig.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        ) : (
          <Logo className="h-9 w-9 shrink-0" />
        )}
        <div className="min-w-0">
          <span className="block truncate font-heading text-base font-bold tracking-tight text-primary">
            {isPlatform ? "Tech Oasis" : schoolConfig?.school_name || user.schoolName}
          </span>
          <span className="block truncate text-[11px] text-sidebar-foreground/70">
            {isPlatform ? "Platform console" : schoolConfig?.tagline || "School management"}
          </span>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
        {groups.map((g, gi) => (
          <div key={g.title ?? gi}>
            {g.title && <p className="mb-1.5 px-3 text-[11px] font-medium text-sidebar-foreground/55">{g.title}</p>}
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link key={item.path} to={item.path} onClick={onNavigate} aria-current={active ? "page" : undefined}
                    className={cn("relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      active ? "font-medium text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
                    {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-lg bg-primary shadow-md shadow-primary/30" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <item.icon className="relative h-[18px] w-[18px] shrink-0" aria-hidden />
                    <span className="relative truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-sidebar-border p-3">
        <Link to={settings.to} onClick={onNavigate} className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors", isActive(settings.to) ? "bg-primary font-medium text-primary-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground")}>
          <settings.icon className="h-[18px] w-[18px] shrink-0" aria-hidden /> {settings.label}
        </Link>
        <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 px-3 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-sm font-bold text-primary-foreground">
            {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">{MEMBER_ROLE_LABEL[user.memberRole]}</p>
          </div>
          <button onClick={() => void logout()} className="rounded p-1 text-sidebar-foreground/70 hover:text-destructive" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default DashboardSidebar;
