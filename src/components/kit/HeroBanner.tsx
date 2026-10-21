import { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroBannerProps {
  eyebrow?: string;
  title: string;
  text?: string;
  /** Icons that float in layers on the right (decorative). */
  icons?: LucideIcon[];
  children?: ReactNode;
  className?: string;
}

/** The welcome banner at the top of a dashboard: layered, softly moving colour and floating icons. Decorative only. */
const HeroBanner = ({ eyebrow, title, text, icons = [], children, className }: HeroBannerProps) => {
  const reduced = !!useReducedMotion();
  return (
    <motion.section
      initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn("relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/15 via-card to-info/15 p-6 shadow-elevated sm:p-8", className)}
    >
      <motion.span aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-primary/25 blur-3xl"
        animate={reduced ? undefined : { x: [0, 30, 0], y: [0, 18, 0] }} transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <motion.span aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-info/25 blur-3xl"
        animate={reduced ? undefined : { x: [0, -26, 0], y: [0, -16, 0] }} transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />
      <motion.span aria-hidden className="pointer-events-none absolute right-1/3 top-0 h-40 w-40 rounded-full bg-warning/20 blur-3xl"
        animate={reduced ? undefined : { scale: [1, 1.25, 1] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} />

      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0 max-w-2xl">
          {eyebrow && <p className="font-heading text-sm font-medium text-muted-foreground">{eyebrow}</p>}
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-card-foreground sm:text-4xl">{title}</h1>
          {text && <p className="mt-2 text-sm text-muted-foreground sm:text-base">{text}</p>}
          {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
        </div>
        {icons.length > 0 && (
          <div aria-hidden className="relative hidden h-28 w-44 shrink-0 md:block" style={{ perspective: 600 }}>
            {icons.slice(0, 3).map((Icon, i) => (
              <motion.span key={i}
                className={cn("absolute flex h-16 w-16 items-center justify-center rounded-2xl border border-white/50 bg-white/60 shadow-elevated backdrop-blur", i === 0 ? "left-0 top-6 text-primary" : i === 1 ? "left-14 top-0 text-info" : "right-0 top-10 text-warning")}
                animate={reduced ? undefined : { y: [0, -10, 0], rotateY: [-14, 14, -14], rotateZ: [i % 2 ? 4 : -4, i % 2 ? -4 : 4, i % 2 ? 4 : -4] }}
                transition={{ duration: 6 + i * 1.5, repeat: Infinity, ease: "easeInOut", delay: i * 0.6 }}>
                <Icon className="h-8 w-8" />
              </motion.span>
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
};

export default HeroBanner;
