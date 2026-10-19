import { motion } from "framer-motion";
import { useState } from "react";
import {
  GraduationCap, Users, Calendar, ClipboardList, DollarSign,
  Bell, Library, BarChart3, Shield, BookOpen,
} from "lucide-react";

const FEATURES = [
  {
    icon: GraduationCap, title: "Student Management", tag: "Core",
    desc: "Complete enrollment, profiles, academic history, promotions, alumni & transfer tracking in one place.",
    highlights: ["Online Admissions", "Academic History", "Alumni Tracking"],
  },
  {
    icon: Users, title: "Staff & HR", tag: "Core",
    desc: "Manage staff profiles, attendance, payroll processing, and fine-grained role-based access control.",
    highlights: ["Payroll", "Biometric Attendance", "RBAC"],
  },
  {
    icon: Calendar, title: "Timetable & Scheduling", tag: "Automation",
    desc: "AI-powered timetable generation with automatic conflict detection, room & lab allocation.",
    highlights: ["Auto-generate", "Conflict Detection", "Room Allocation"],
  },
  {
    icon: ClipboardList, title: "Exams & Grading", tag: "Academic",
    desc: "Create exams, enter grades, auto-generate report cards, and track performance analytics.",
    highlights: ["Report Cards", "Grade Analytics", "Custom Exams"],
  },
  {
    icon: DollarSign, title: "Fee & Payments", tag: "Finance",
    desc: "Tuition setup, online payments via cards & mobile money, invoices, receipts, and reminders.",
    highlights: ["Online Payments", "Auto Invoicing", "Fee Reminders"],
  },
  {
    icon: Bell, title: "Communication", tag: "Engagement",
    desc: "Multi-channel notifications via SMS, email, and in-app alerts with emergency broadcast.",
    highlights: ["SMS & Email", "Push Notifications", "Emergency Alerts"],
  },
  {
    icon: Library, title: "Library & Assets", tag: "Operations",
    desc: "Book inventory, borrow/return tracking, overdue management, and full asset lifecycle tracking.",
    highlights: ["Inventory", "Borrow/Return", "Asset Lifecycle"],
  },
  {
    icon: BarChart3, title: "Analytics & Reports", tag: "Intelligence",
    desc: "Real-time dashboards for academic performance, financial KPIs, and custom report generation.",
    highlights: ["Live Dashboards", "Financial KPIs", "Custom Reports"],
  },
  {
    icon: Shield, title: "Security & Compliance", tag: "Enterprise",
    desc: "End-to-end encryption, audit logs, RBAC, and full GDPR/FERPA compliance readiness.",
    highlights: ["Encryption", "Audit Logs", "GDPR/FERPA"],
  },
  {
    icon: BookOpen, title: "Parent & Student Portal", tag: "Engagement",
    desc: "Self-service portal for attendance, grades, fee statements, event announcements, and more.",
    highlights: ["Attendance View", "Grade Access", "Fee Statements"],
  },
];

const FeaturesSection = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = FEATURES[activeIndex];

  return (
    <section id="features" className="py-24 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-medium text-primary uppercase tracking-widest">Modules</span>
          <h2 className="font-heading text-3xl sm:text-5xl font-bold text-foreground mt-3 mb-5">
            Everything Your School Needs
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            10 integrated modules working seamlessly together to automate every aspect of school management.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-[340px_1fr] gap-8">
          {/* Feature list */}
          <div className="space-y-1.5">
            {FEATURES.map((feature, i) => (
              <motion.button
                key={feature.title}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setActiveIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  activeIndex === i
                    ? "bg-primary/10 border border-primary/20 shadow-card"
                    : "hover:bg-muted border border-transparent"
                }`}
              >
                <feature.icon
                  className={`w-5 h-5 shrink-0 ${
                    activeIndex === i ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    activeIndex === i ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {feature.title}
                </span>
                <span
                  className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    activeIndex === i
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {feature.tag}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Feature detail */}
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="bg-card rounded-2xl border border-border p-8 lg:p-10 shadow-elevated relative overflow-hidden"
          >
            <div
              className="absolute top-0 right-0 w-64 h-64 rounded-full -z-0 blur-3xl opacity-30"
              style={{ background: `hsl(var(--primary) / 0.15)` }}
            />
            <div className="relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <active.icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-heading text-2xl font-bold text-card-foreground mb-3">
                {active.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-lg">
                {active.desc}
              </p>
              <div className="grid sm:grid-cols-3 gap-4">
                {active.highlights.map((h) => (
                  <div
                    key={h}
                    className="bg-muted/50 rounded-xl px-4 py-3 border border-border"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary mb-2" />
                    <p className="text-sm font-medium text-card-foreground">{h}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
