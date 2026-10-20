import { Calendar, Library, MessageSquare, Megaphone } from "lucide-react";
import Welcome from "@/components/kit/Welcome";
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

  return (
    <>
      <Welcome name={user?.name.split(" ")[0] ?? ""} sub={user ? MEMBER_ROLE_LABEL[user.memberRole] : undefined} />
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
    </>
  );
};

export default StaffHome;
