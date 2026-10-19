import { Link } from "react-router-dom";
import { useAuth, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardTopbarProps {
  onMenuToggle?: () => void;
}

const DashboardTopbar = ({ onMenuToggle }: DashboardTopbarProps) => {
  const { user, memberships, switchMembership, isPlatform } = useAuth();
  const { schoolConfig } = useSchool();
  const keyOf = (m: { schoolId: string; memberRole: string }) => `${m.schoolId}:${m.memberRole}`;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuToggle} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
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
        {!isPlatform && (
          <Button variant="ghost" size="icon" asChild>
            <Link to="/calendar" aria-label="Notices and events" title="Notices and events">
              <Bell className="h-5 w-5" />
            </Link>
          </Button>
        )}
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium leading-tight text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user ? MEMBER_ROLE_LABEL[user.memberRole] : ""}</p>
        </div>
      </div>
    </header>
  );
};

export default DashboardTopbar;
