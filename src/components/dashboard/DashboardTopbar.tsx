import { Link } from "react-router-dom";
import { useAuth, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardTopbarProps {
  onMenuToggle?: () => void;
}

const DashboardTopbar = ({ onMenuToggle }: DashboardTopbarProps) => {
  const { user, memberships, switchMembership } = useAuth();

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const keyOf = (m: { schoolId: string; memberRole: string }) => `${m.schoolId}:${m.memberRole}`;

  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuToggle} aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {greeting()}, {user?.name.split(" ")[0]}
          </h2>
          <p className="text-sm text-muted-foreground hidden sm:block">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {user && memberships.length > 1 && (
          <select
            aria-label="Switch school or role"
            className="h-9 max-w-[16rem] rounded-md border border-input bg-background px-2 text-sm"
            value={keyOf(user)}
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
        <Button variant="ghost" size="icon" asChild>
          <Link to="/notifications" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </Link>
        </Button>
      </div>
    </header>
  );
};

export default DashboardTopbar;
