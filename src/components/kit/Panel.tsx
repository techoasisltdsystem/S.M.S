import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  icon?: LucideIcon;
  link?: { to: string; label: string };
  children: ReactNode;
  className?: string;
}

export const Panel = ({ title, icon: Icon, link, children, className }: PanelProps) => (
  <section className={cn("rounded-xl border border-border bg-card p-5 shadow-card", className)}>
    <header className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-card-foreground">
        {Icon && <Icon className="h-4 w-4 text-primary" aria-hidden />}
        {title}
      </h2>
      {link && (
        <Link to={link.to} className="text-xs font-medium text-primary hover:underline">
          {link.label}
        </Link>
      )}
    </header>
    {children}
  </section>
);

interface EmptyProps {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: { to: string; label: string };
}

export const EmptyState = ({ icon: Icon, title, text, action }: EmptyProps) => (
  <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Icon className="h-5 w-5" aria-hidden />
    </span>
    <p className="text-sm font-medium text-card-foreground">{title}</p>
    {text && <p className="max-w-xs text-xs text-muted-foreground">{text}</p>}
    {action && (
      <Link to={action.to} className="mt-1 text-xs font-medium text-primary hover:underline">
        {action.label}
      </Link>
    )}
  </div>
);
