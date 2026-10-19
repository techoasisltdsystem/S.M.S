import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "info" | "destructive";

const tones: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
};

interface KitStatProps {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  /** null means "no data yet": shown as a dash, never as a made-up number. */
  value: string | number | null;
  sub?: string;
  to?: string;
  /** 0 to 100 */
  meter?: number;
}

const KitStat = ({ icon: Icon, tone = "primary", label, value, sub, to, meter }: KitStatProps) => {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 font-heading text-2xl font-bold text-card-foreground">{value ?? "–"}</p>
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      </div>
      {meter !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </>
  );
  const cls = "block rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-elevated";
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

export default KitStat;
