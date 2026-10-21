import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { ArrowUpRight, LucideIcon } from "lucide-react";
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

const glow: Record<Tone, string> = {
  primary: "bg-primary/20", success: "bg-success/20", warning: "bg-warning/25", info: "bg-info/20", destructive: "bg-destructive/20",
};

/** Counts a number up when it first appears. Text without a number (a dash, a name) is shown as it is. */
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
  /** Soft coloured background. */
  tinted?: boolean;
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  /** null means "no data yet": shown as a dash, never as a made-up number. */
  value: string | number | null;
  sub?: string;
  /** Where the figure lives. The whole card links there. */
  to?: string;
  /** 0 to 100 */
  meter?: number;
  /** Stagger the entrance (seconds). */
  delay?: number;
}

/** A figure card: lifts and tilts toward the pointer, counts up, and opens the page where the figure comes from. */
const KitStat = ({ icon: Icon, tone = "primary", label, value, sub, to, meter, tinted = true, delay = 0 }: KitStatProps) => {
  const reduced = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 220, damping: 20 });
  const sy = useSpring(py, { stiffness: 220, damping: 20 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [-7, 7]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [7, -7]);
  const sheenX = useTransform(sx, [-0.5, 0.5], ["15%", "85%"]);

  const move = (e: React.PointerEvent) => {
    if (reduced || e.pointerType === "touch" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const leave = () => { px.set(0); py.set(0); };

  const body = (
    <>
      <span aria-hidden className={cn("pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300 group-hover:opacity-100", glow[tone], "opacity-60")} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-2xl font-bold text-card-foreground">{value === null ? "–" : <CountUp value={value} reduced={reduced} />}</p>
        </div>
        <motion.span style={{ translateZ: 30 }} whileHover={reduced ? undefined : { rotate: [0, -8, 8, 0], scale: 1.12 }} transition={{ duration: 0.5 }}
          className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-white/40", tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </motion.span>
      </div>
      {meter !== undefined && (
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
          <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, meter))}%` }} transition={{ duration: 0.9, delay: delay + 0.2 }} />
        </div>
      )}
      {sub && <p className="relative mt-2 text-xs text-muted-foreground">{sub}</p>}
      {to && <ArrowUpRight aria-hidden className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />}
      <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(240px circle at var(--sx) 0%, hsl(0 0% 100% / 0.35), transparent 60%)", ["--sx" as string]: sheenX }} />
    </>
  );

  const cls = cn("group relative block overflow-hidden rounded-2xl border p-5 shadow-card transition-shadow duration-300 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
    tinted ? tints[tone] : "border-border bg-card");

  return (
    <motion.div
      ref={ref} onPointerMove={move} onPointerLeave={leave}
      initial={reduced ? false : { opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, delay, ease: "easeOut" }}
      whileHover={reduced ? undefined : { y: -4 }}
      style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 900, transformStyle: "preserve-3d" }}
    >
      {to ? <Link to={to} aria-label={`${label}: ${value ?? "no data yet"}. Open`} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}
    </motion.div>
  );
};

export default KitStat;
