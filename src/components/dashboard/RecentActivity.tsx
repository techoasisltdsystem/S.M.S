import { motion } from "framer-motion";
import { UserPlus, FileCheck, DollarSign, AlertCircle, BookOpen } from "lucide-react";

const activities = [
  { icon: UserPlus, color: "text-primary", bg: "bg-primary/10", text: "New student Emily Chen enrolled in Grade 10", time: "2 min ago" },
  { icon: FileCheck, color: "text-success", bg: "bg-success/10", text: "Math exam results published for Grade 9", time: "15 min ago" },
  { icon: DollarSign, color: "text-warning", bg: "bg-warning/10", text: "Fee payment received from Parent #2341", time: "32 min ago" },
  { icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/10", text: "3 students marked absent in Class 8B", time: "1 hr ago" },
  { icon: BookOpen, color: "text-info", bg: "bg-info/10", text: "New curriculum uploaded for Science Dept.", time: "2 hrs ago" },
];

const RecentActivity = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="bg-card rounded-xl border border-border p-5 shadow-card"
    >
      <h3 className="font-heading text-base font-semibold text-card-foreground mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${activity.bg}`}>
              <activity.icon className={`w-4 h-4 ${activity.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-card-foreground">{activity.text}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default RecentActivity;
