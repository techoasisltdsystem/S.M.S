import { motion } from "framer-motion";
import { UserPlus, FileText, Calendar, DollarSign, Send, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, UserRole } from "@/contexts/AuthContext";

interface Action {
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const ACTIONS: Action[] = [
  { label: "Add Student", icon: UserPlus, roles: ["admin"] },
  { label: "Create Exam", icon: ClipboardList, roles: ["admin", "teacher"] },
  { label: "Generate Report", icon: FileText, roles: ["admin", "teacher"] },
  { label: "Schedule Event", icon: Calendar, roles: ["admin"] },
  { label: "Record Payment", icon: DollarSign, roles: ["admin"] },
  { label: "Send Notice", icon: Send, roles: ["admin", "teacher"] },
];

const QuickActions = () => {
  const { user } = useAuth();
  if (!user) return null;

  const filtered = ACTIONS.filter((a) => a.roles.includes(user.role));
  if (filtered.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.4 }}
      className="bg-card rounded-xl border border-border p-5 shadow-card"
    >
      <h3 className="font-heading text-base font-semibold text-card-foreground mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {filtered.map((action) => (
          <Button
            key={action.label}
            variant="outline"
            className="h-auto py-3 flex flex-col items-center gap-2 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
          >
            <action.icon className="w-5 h-5" />
            {action.label}
          </Button>
        ))}
      </div>
    </motion.div>
  );
};

export default QuickActions;
