import { Bell, Calendar, Library, MessageSquare, Megaphone, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import HeroBanner from "@/components/kit/HeroBanner";
import KitStat from "@/components/kit/KitStat";
import QuickLinks from "@/components/kit/QuickLinks";
import { Panel } from "@/components/kit/Panel";
import { useAuth, MEMBER_ROLE_LABEL } from "@/contexts/AuthContext";
import { useUnreadCount } from "@/hooks/useMessaging";

// Home for staff roles that have no student records to summarise (librarian,
// receptionist). Their school can switch on more access in Roles and permissions.
const StaffHome = () => {
  const { user, can } = useAuth();
  const unread = useUnreadCount(user?.schoolId);
  const n = unread.data ?? 0;
  const hour = new Date().getHours();

  return (
    <div className="grid gap-4">
      <HeroBanner
        eyebrow={hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}
        title={`${user?.name.split(" ")[0] ?? ""}!`}
        text={`${user ? MEMBER_ROLE_LABEL[user.memberRole] : ""} · ${user?.schoolName ?? ""}`}
        icons={[UserRound, ShieldCheck, Sparkles]}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KitStat delay={0} to="/messages" icon={MessageSquare} tone="info" label="Unread Messages" value={n} sub={n > 0 ? "Open your inbox" : "You are up to date"} />
        <KitStat delay={0.06} to="/calendar" icon={Calendar} tone="success" label="Calendar" value="View" sub="School events and dates" />
        <KitStat delay={0.12} to="/calendar" icon={Bell} tone="warning" label="Notices" value="Read" sub="Announcements for you" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Quick links" icon={Megaphone}>
          <QuickLinks
            links={[
              { to: "/messages", label: "Messages", sub: n > 0 ? `${n} unread` : "No unread messages", icon: MessageSquare },
              { to: "/calendar", label: "Calendar & notices", sub: "School events", icon: Calendar },
              { to: "/library", label: "Library", sub: "Not built yet", icon: Library },
            ]}
          />
        </Panel>
        <Panel title="Your access" icon={MessageSquare}>
          <p className="text-sm text-muted-foreground">
            {can("students.view") || can("attendance.view") || can("grades.view")
              ? "Your school has given you access to some records. They appear in the menu."
              : "Your role does not include student records. Your school administrator can change this in Roles and permissions."}
          </p>
        </Panel>
      </div>
    </div>
  );
};

export default StaffHome;
