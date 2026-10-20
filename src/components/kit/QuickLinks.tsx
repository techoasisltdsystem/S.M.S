import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";

const ICON_TONES = ["bg-primary/10 text-primary", "bg-info/10 text-info", "bg-success/10 text-success", "bg-warning/15 text-warning", "bg-destructive/10 text-destructive"];

export interface QuickLink {
  to: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
}

/** Tiles that open pages that exist. No tile without a destination. */
const QuickLinks = ({ links, row }: { links: QuickLink[]; row?: boolean }) => (
  <div className={row ? "grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7" : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
    {links.map((l, i) => (
      <Link
        key={l.to + l.label}
        to={l.to}
        className={row ? "flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card" : "flex flex-col gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent"}
      >
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${row ? ICON_TONES[i % ICON_TONES.length] : "bg-primary/10 text-primary"}`}>
          <l.icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-medium text-card-foreground">{l.label}</span>
        {l.sub && <span className="text-xs text-muted-foreground">{l.sub}</span>}
      </Link>
    ))}
  </div>
);

export default QuickLinks;
