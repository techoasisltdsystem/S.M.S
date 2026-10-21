import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "info" | "destructive";

const tones: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
};

const tints: Record<Tone, string> = {
  primary: "border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card",
  success: "border-success/20 bg-gradient-to-br from-success/10 via-card to-card",
  warning: "border-warning/25 bg-gradient-to-br from-warning/10 via-card to-card",
  info: "border-info/20 bg-gradient-to-br from-info/10 via-card to-card",
  destructive: "border-destructive/20 bg-gradient-to-br from-destructive/10 via-card to-card",
};

/** Counts a number up when it first appears. Text without a number (a dash, a word) is shown as it is. */
const CountUp = ({ value, reduced }: { value: string | number; reduced: boolean }) => {
  const text = String(value);
  const m = text.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!m || reduced) { setShown(text); return; }
    const target = Number(m[2].replace(/,/g, ""));
    const decimals = (m[2].split(".")[1] ?? "").length;
    const grouped = m[2].includes(",");
    if (!Number.isFinite(target)) { setShown(text); return; }
    const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
    const controls = animate(0, target, { duration: 0.9, ease: "easeOut", onUpdate: (v) => setShown(`${m[1]}${fmt(v)}${m[3]}`), onComplete: () => setShown(text) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduced]);
  return <>{shown}</>;
};

interface KitStatProps {
  /** Soft coloured background instead of plain white. */
  tinted?: boolean;
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  /** null means "no data yet": shown as a dash, never as a made-up number. */
  value: string | number | null;
  sub?: string;
  /** Change against the previous period, in percent, worked out from real records. Omitted when there is nothing to compare. */
  trend?: { pct: number; label?: string; goodWhenUp?: boolean } | null;
  /** Where the figure lives. The whole card links there. */
  to?: string;
  /** 0 to 100 */
  meter?: number;
  /** Stagger the entrance (seconds). */
  delay?: number;
}

/** A figure card: label, small icon, the number, and how it moved. Lifts and leans slightly, and opens where the figure comes from. */
const KitStat = ({ icon: Icon, tone = "primary", label, value, sub, trend, to, meter, tinted = false, delay = 0 }: KitStatProps) => {
  const reduced = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useTransform(useSpring(px, { stiffness: 200, damping: 20 }), [-0.5, 0.5], [-4, 4]);
  const rotateX = useTransform(useSpring(py, { stiffness: 200, damping: 20 }), [-0.5, 0.5], [4, -4]);
  const move = (e: React.PointerEvent) => {
    if (reduced || e.pointerType === "touch" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const up = trend ? trend.pct >= 0 : true;
  const good = trend ? (trend.goodWhenUp === false ? !up : up) : true;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 font-heading text-[1.65rem] font-semibold leading-tight text-card-foreground">{value === null ? "–" : <CountUp value={value} reduced={reduced} />}</p>
      {meter !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
          <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, meter))}%` }} transition={{ duration: 0.9, delay: delay + 0.2 }} />
        </div>
      )}
      {trend ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs">
          <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-destructive")}>
            {Math.abs(trend.pct).toFixed(1)}% {up ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}
          </span>
          <span className="text-muted-foreground">{trend.label ?? "vs last month"}</span>
        </p>
      ) : sub ? <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p> : null}
      {trend && sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </>
  );

  const cls = cn("group relative block h-full overflow-hidden rounded-xl border p-4 shadow-card transition-shadow duration-300 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
    tinted ? tints[tone] : "border-border bg-card");

  return (
    <motion.div ref={ref} onPointerMove={move} onPointerLeave={() => { px.set(0); py.set(0); }}
      initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={reduced ? undefined : { y: -3 }}
      style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 900 }}>
      {to ? <Link to={to} aria-label={`${label}: ${value ?? "no data yet"}. Open`} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
    </motion.div>
  );
};

export default KitStat;
