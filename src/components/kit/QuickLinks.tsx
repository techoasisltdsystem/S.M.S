import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";

export interface QuickLink {
  to: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
}

/** Tiles that open pages that exist. No tile without a destination. */
const QuickLinks = ({ links }: { links: QuickLink[] }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {links.map((l) => (
      <Link
        key={l.to + l.label}
        to={l.to}
        className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 transition-colors hover:border-primary/40 hover:bg-accent"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
          <l.icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-medium text-card-foreground">{l.label}</span>
        {l.sub && <span className="text-xs text-muted-foreground">{l.sub}</span>}
      </Link>
    ))}
  </div>
);

export default QuickLinks;
