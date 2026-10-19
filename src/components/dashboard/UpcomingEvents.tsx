import { motion } from "framer-motion";
import { Calendar } from "lucide-react";

const events = [
  { title: "Mid-Term Exams Begin", date: "Mar 15, 2026", type: "exam" },
  { title: "Parent-Teacher Meeting", date: "Mar 20, 2026", type: "meeting" },
  { title: "Science Fair", date: "Mar 28, 2026", type: "event" },
  { title: "Spring Break", date: "Apr 1, 2026", type: "holiday" },
];

const typeColors: Record<string, string> = {
  exam: "bg-destructive/10 text-destructive",
  meeting: "bg-info/10 text-info",
  event: "bg-primary/10 text-primary",
  holiday: "bg-success/10 text-success",
};

const UpcomingEvents = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.4 }}
      className="bg-card rounded-xl border border-border p-5 shadow-card"
    >
      <h3 className="font-heading text-base font-semibold text-card-foreground mb-4">Upcoming Events</h3>
      <div className="space-y-3">
        {events.map((event, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeColors[event.type]}`}>
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-card-foreground truncate">{event.title}</p>
              <p className="text-xs text-muted-foreground">{event.date}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default UpcomingEvents;
