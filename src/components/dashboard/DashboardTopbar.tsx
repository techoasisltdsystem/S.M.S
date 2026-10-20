import { Link } from "react-router-dom";
import { useAuth, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import { Bell, CalendarClock, ChevronDown, LogOut, Menu, MessageSquare, ShieldAlert } from "lucide-react";
import GlobalSearch from "@/components/dashboard/GlobalSearch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useUnseenReminders } from "@/hooks/useBilling";
import { useUnreadCount } from "@/hooks/useMessaging";
import { useUnreadNotifications } from "@/hooks/useResults";
import { useMonitoringStatus } from "@/hooks/useAuditMonitoring";
import { Button } from "@/components/ui/button";

interface DashboardTopbarProps {
  onMenuToggle?: () => void;
}

const DashboardTopbar = ({ onMenuToggle }: DashboardTopbarProps) => {
  const { user, memberships, switchMembership, isPlatform, logout } = useAuth();
  const { schoolConfig } = useSchool();
  const unread = useUnreadCount(user?.schoolId, !!user && !isPlatform).data ?? 0;
  const renewals = useUnseenReminders(!!user && isPlatform).data ?? 0;
  const monitoring = useMonitoringStatus(!!user && isPlatform).data;
  const platformAttention = (monitoring?.open.critical ?? 0) + (monitoring?.open.high ?? 0) + (monitoring?.stale ? 1 : 0);
  const alerts = useUnreadNotifications(user?.schoolId, !!user && !isPlatform).data ?? 0;
  const keyOf = (m: { schoolId: string; memberRole: string }) => `${m.schoolId}:${m.memberRole}`;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuToggle} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        {!isPlatform && <GlobalSearch />}
        <div className={`min-w-0 ${isPlatform ? "" : "md:hidden xl:block"}`}>
          <p className="truncate font-heading text-sm font-semibold text-foreground">
            {isPlatform ? "Tech Oasis platform" : schoolConfig?.school_name || user?.schoolName}
          </p>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {isPlatform
              ? "Schools and access"
              : [schoolConfig?.tagline, user?.schoolSuspended ? "Suspended: read-only" : ""].filter(Boolean).join(" · ") || "Main campus"}
          </p>
        </div>
        {user && memberships.length > 1 && (
          <select
            aria-label="Switch school or role"
            className="h-9 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm"
            value={keyOf(user as { schoolId: string; memberRole: string })}
            onChange={(e) => {
              const m = memberships.find((x) => keyOf(x) === e.target.value);
              if (m) switchMembership(m);
            }}
          >
            {memberships.map((m) => (
              <option key={keyOf(m)} value={keyOf(m)}>
                {m.schoolName} · {MEMBER_ROLE_LABEL[m.memberRole]}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isPlatform && (
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link to="/platform/renewals" aria-label={renewals > 0 ? `Renewals and expiry, ${renewals} new` : "Renewals and expiry"} title="Renewals and expiry">
              <CalendarClock className="h-5 w-5" />
              {renewals > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">{renewals > 99 ? "99+" : renewals}</span>
              )}
            </Link>
          </Button>
        )}
        {isPlatform && (
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link to="/platform/audit" aria-label={platformAttention > 0 ? `Audit and security, ${platformAttention} need attention` : "Audit and security"} title="Audit and security">
              <ShieldAlert className="h-5 w-5" />
              {platformAttention > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {platformAttention > 99 ? "99+" : platformAttention}
                </span>
              )}
            </Link>
          </Button>
        )}
        {!isPlatform && (
          <>
            <Button variant="ghost" size="icon" asChild className="relative">
              <Link
                to="/messages"
                aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
                title="Messages"
              >
                <MessageSquare className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </Button>
            <Button variant="ghost" size="icon" asChild className="relative">
              <Link
                to="/notifications"
                aria-label={alerts > 0 ? `Notifications, ${alerts} unread` : "Notifications"}
                title="Notifications"
              >
                <Bell className="h-5 w-5" />
                {alerts > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {alerts > 99 ? "99+" : alerts}
                  </span>
                )}
              </Link>
            </Button>
          </>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring" aria-label="Account menu">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 font-heading text-sm font-bold text-primary">
              {(user?.name ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <span className="hidden sm:block">
              <span className="block text-sm font-medium leading-tight text-foreground">{user?.name}</span>
              <span className="block text-xs text-muted-foreground">{user ? MEMBER_ROLE_LABEL[user.memberRole] : ""}</span>
            </span>
            <ChevronDown className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate">{user?.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()} className="text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default DashboardTopbar;
