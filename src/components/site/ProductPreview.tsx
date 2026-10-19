import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, UserCheck, DollarSign, GraduationCap, LayoutDashboard, ClipboardList } from "lucide-react";
import KitStat from "@/components/kit/KitStat";
import { Panel } from "@/components/kit/Panel";
import Donut from "@/components/kit/Donut";

/**
 * A read-only demonstration of the dashboard. Every number below is SAMPLE DATA that lives in this file.
 * Nothing here reads from, or writes to, a database. The buttons only switch panels.
 */
type Tab = "overview" | "students" | "attendance" | "fees";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "students", label: "Students", icon: GraduationCap },
  { id: "attendance", label: "Attendance", icon: UserCheck },
  { id: "fees", label: "Fees", icon: DollarSign },
];

const ENROLMENT = [38, 52, 47, 61, 58, 70, 66, 74];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
const WEEK = [
  { d: "Mon", v: 94 },
  { d: "Tue", v: 92 },
  { d: "Wed", v: 95 },
  { d: "Thu", v: 90 },
  { d: "Fri", v: 88 },
];
const STUDENTS = [
  { name: "Sample student 1", cls: "Grade 7A", status: "Active" },
  { name: "Sample student 2", cls: "Grade 7A", status: "Active" },
  { name: "Sample student 3", cls: "Grade 8B", status: "Active" },
  { name: "Sample student 4", cls: "Grade 9A", status: "Transferred" },
];

const Bars = ({ values, labels }: { values: number[]; labels: string[] }) => {
  const max = Math.max(...values);
  return (
    <div className="flex h-32 items-end gap-2" role="img" aria-label={`Bar chart: ${labels.map((l, i) => `${l} ${values[i]}`).join(", ")}`}>
      {values.map((v, i) => (
        <div key={labels[i]} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-24 w-full items-end rounded-sm bg-primary/10">
            <div className="w-full rounded-sm bg-primary" style={{ height: `${(v / max) * 100}%` }} />
          </div>
          <span className="text-[10px] text-muted-foreground">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
};

const ProductPreview = () => {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-prominent">
        {/* Browser frame */}
        <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-destructive/60" />
            <span className="h-3 w-3 rounded-full bg-warning/60" />
            <span className="h-3 w-3 rounded-full bg-success/60" />
          </div>
          <div className="mx-auto rounded-md bg-background px-4 py-1 text-xs text-muted-foreground">Tech Oasis SMS · product preview</div>
          <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[11px] font-semibold text-warning">Sample data</span>
        </div>

        <div className="grid md:grid-cols-[180px_1fr]">
          <div role="tablist" aria-label="Preview sections" className="flex gap-1 overflow-x-auto border-b border-border bg-muted/30 p-2 md:flex-col md:border-b-0 md:border-r">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="preview-panel"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                  tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <t.icon className="h-4 w-4" aria-hidden /> {t.label}
              </button>
            ))}
          </div>

          <div id="preview-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-[360px] p-4 sm:p-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {tab === "overview" && (
                  <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <KitStat icon={GraduationCap} label="Students" value={412} sub="Sample" />
                      <KitStat icon={Users} tone="info" label="Staff" value={34} sub="Sample" />
                      <KitStat icon={UserCheck} tone="success" label="Attendance" value="91%" meter={91} />
                      <KitStat icon={DollarSign} tone="warning" label="Fees collected" value="68%" meter={68} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <Panel title="Enrolment by month" className="lg:col-span-2">
                        <Bars values={ENROLMENT} labels={MONTHS} />
                      </Panel>
                      <Panel title="Quick actions">
                        <div className="space-y-2">
                          {[
                            { label: "Add a student", to: "students" as Tab },
                            { label: "Mark attendance", to: "attendance" as Tab },
                            { label: "Record a payment", to: "fees" as Tab },
                          ].map((a) => (
                            <button
                              key={a.label}
                              onClick={() => setTab(a.to)}
                              className="w-full rounded-md bg-muted px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </Panel>
                    </div>
                  </>
                )}

                {tab === "students" && (
                  <Panel title="Student records" icon={ClipboardList}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">Sample student records</caption>
                        <thead>
                          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                            <th className="py-2 pr-3 font-medium">Name</th>
                            <th className="py-2 pr-3 font-medium">Class</th>
                            <th className="py-2 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {STUDENTS.map((s) => (
                            <tr key={s.name} className="border-b border-border/60 last:border-0">
                              <td className="py-2.5 pr-3 text-foreground">{s.name}</td>
                              <td className="py-2.5 pr-3 text-muted-foreground">{s.cls}</td>
                              <td className="py-2.5">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.status === "Active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                                  {s.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                )}

                {tab === "attendance" && (
                  <Panel title="Attendance this week (%)" icon={UserCheck}>
                    <Bars values={WEEK.map((w) => w.v)} labels={WEEK.map((w) => w.d)} />
                  </Panel>
                )}

                {tab === "fees" && (
                  <Panel title="Fee collection" icon={DollarSign}>
                    <Donut
                      segments={[
                        { label: "Paid", value: 68, color: "hsl(var(--success))" },
                        { label: "Partly paid", value: 14, color: "hsl(var(--warning))" },
                        { label: "Overdue", value: 18, color: "hsl(var(--destructive))" },
                      ]}
                      centerLabel="Sample invoices by status"
                    />
                  </Panel>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        This preview shows sample data only. It is separate from any school's records and cannot change anything.
      </p>
    </div>
  );
};

export default ProductPreview;
