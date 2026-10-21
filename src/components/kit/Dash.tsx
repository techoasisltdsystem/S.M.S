import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarDays, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Purple page title with optional controls on the right (period, date) and section tabs underneath. */
export const PageHeader = ({ title, children, tabs }: { title: string; children?: ReactNode; tabs?: { to: string; label: string }[] }) => {
  const { pathname, search } = useLocation();
  return (
    <div className="mb-5 space-y-4">
      {tabs && tabs.length > 0 && (
        <nav className="-mx-1 flex flex-wrap gap-1 border-b border-border pb-3" aria-label="Sections">
          {tabs.map((t) => {
            const active = (pathname + search) === t.to || pathname === t.to;
            return <Link key={t.to} to={t.to} className={cn("rounded-lg px-3 py-1.5 text-sm transition-colors", active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{t.label}</Link>;
          })}
        </nav>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-primary">{title}</h1>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
};

/** A small rounded chip like "First Term · 2026/2027" or today's date. */
export const Chip = ({ icon: Icon = CalendarDays, children, to }: { icon?: LucideIcon; children: ReactNode; to?: string }) => {
  const cls = "inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-card";
  return to ? <Link to={to} className={cn(cls, "hover:border-primary/40")}><Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{children}</Link>
    : <span className={cls}><Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />{children}</span>;
};

export const todayLabel = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

type ActionTone = "green" | "blue" | "purple" | "indigo" | "orange" | "pink";
const actionTone: Record<ActionTone, { tile: string; icon: string }> = {
  green: { tile: "bg-success/10 hover:bg-success/15", icon: "bg-success text-white" },
  blue: { tile: "bg-info/10 hover:bg-info/15", icon: "bg-info text-white" },
  purple: { tile: "bg-primary/10 hover:bg-primary/15", icon: "bg-primary text-primary-foreground" },
  indigo: { tile: "bg-indigo-500/10 hover:bg-indigo-500/15", icon: "bg-indigo-500 text-white" },
  orange: { tile: "bg-warning/10 hover:bg-warning/20", icon: "bg-warning text-white" },
  pink: { tile: "bg-pink-500/10 hover:bg-pink-500/15", icon: "bg-pink-500 text-white" },
};
export interface QuickAction { to: string; label: string; icon: LucideIcon; tone: ActionTone }

/** Coloured shortcut tiles ("Quick Actions"). Tiles across, or a stacked list for narrow columns. */
export const QuickActions = ({ actions, layout = "tiles", title = "Quick Actions", text = "Easily access important tasks." }: { actions: QuickAction[]; layout?: "tiles" | "list"; title?: string; text?: string }) => {
  const reduced = !!useReducedMotion();
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
      <h2 className="font-heading text-base font-semibold text-card-foreground">{title}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{text}</p>
      <div className={layout === "tiles" ? "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" : "space-y-2.5"}>
        {actions.map((a, i) => (
          <motion.div key={a.to + a.label} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} whileHover={reduced ? undefined : { y: -3 }}>
            <Link to={a.to} className={cn("group flex rounded-xl transition-colors", actionTone[a.tone].tile,
              layout === "tiles" ? "h-full flex-col items-center justify-center gap-3 px-3 py-6 text-center" : "items-center gap-3 px-3 py-2.5")}>
              <span className={cn("flex shrink-0 items-center justify-center rounded-lg shadow-sm transition-transform duration-300 group-hover:scale-110", actionTone[a.tone].icon, layout === "tiles" ? "h-10 w-10" : "h-7 w-7")}>
                <a.icon className={layout === "tiles" ? "h-5 w-5" : "h-4 w-4"} aria-hidden />
              </span>
              <span className="text-sm font-medium text-card-foreground">{a.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const pillTone: Record<string, string> = {
  green: "bg-success/10 text-success", orange: "bg-warning/15 text-warning", red: "bg-destructive/10 text-destructive",
  grey: "bg-muted text-muted-foreground", blue: "bg-info/10 text-info", purple: "bg-primary/10 text-primary",
};
export const StatusPill = ({ tone, children, dot }: { tone: keyof typeof pillTone; children: ReactNode; dot?: boolean }) => (
  <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", pillTone[tone])}>
    {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}{children}
  </span>
);

export const Progress = ({ value, label }: { value: number; label?: string }) => (
  <div className="flex items-center gap-3">
    <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ duration: 0.8 }} />
    </div>
    <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">{Math.round(value)}%</span>
  </div>
);

/** A titled white table card with a count badge, like "Today's Classes 4". */
export const TableCard = ({ title, count, subtitle, action, children }: { title: string; count?: number; subtitle?: string; action?: ReactNode; children: ReactNode }) => (
  <section className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
      <div>
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-card-foreground">{title}{count !== undefined && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">{count}</span>}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
    <div className="mt-3 overflow-x-auto">{children}</div>
  </section>
);
export const th = "bg-muted/50 px-5 py-2.5 text-left text-xs font-medium text-muted-foreground";
export const td = "px-5 py-3 text-sm";

/** Simple line chart (percentages or amounts). Points come from real records only. */
export const LineChart = ({ points, height = 170, max, format = (n: number) => `${Math.round(n)}`, color = "hsl(var(--success))" }:
  { points: { label: string; value: number }[]; height?: number; max?: number; format?: (n: number) => string; color?: string }) => {
  const w = 520, h = height, padL = 34, padB = 22, padT = 10;
  const top = max ?? Math.max(1, ...points.map((p) => p.value)) * 1.1;
  const x = (i: number) => padL + (points.length <= 1 ? (w - padL) / 2 : (i * (w - padL - 10)) / (points.length - 1));
  const y = (v: number) => padT + (h - padB - padT) * (1 - v / top);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => top * t);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={points.map((p) => `${p.label} ${format(p.value)}`).join(", ")}>
      {ticks.map((t) => <g key={t}><line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeDasharray="3 3" /><text x={0} y={y(t) + 3} fontSize="9" fill="hsl(var(--muted-foreground))">{format(t)}</text></g>)}
      <motion.path d={path} fill="none" stroke={color} strokeWidth={2.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
      {points.map((p, i) => <g key={p.label + i}><circle cx={x(i)} cy={y(p.value)} r={4} fill={color}><title>{`${p.label}: ${format(p.value)}`}</title></circle><text x={x(i)} y={h - 6} fontSize="9" textAnchor="middle" fill="hsl(var(--muted-foreground))">{p.label}</text></g>)}
    </svg>
  );
};

/** Percent change between two counts; null when there is no earlier figure to compare with. */
export const change = (now: number, before: number) => (before > 0 ? { pct: ((now - before) / before) * 100 } : null);
