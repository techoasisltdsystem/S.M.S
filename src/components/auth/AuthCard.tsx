import { ReactNode } from "react";
import Logo from "@/components/ui/logo";

// Plain centred card shared by the invitation, password-reset and second-factor screens.
const AuthCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-10">
    <section className="w-full max-w-md rounded-xl border border-border bg-card p-7 shadow-card sm:p-9" aria-labelledby="auth-card-title">
      <div className="mb-6 flex items-center justify-center gap-3">
        <Logo className="h-9 w-9" />
        <span className="font-heading text-lg font-bold text-foreground">
          Tech Oasis <span className="text-primary">SMS</span>
        </span>
      </div>
      <h1 id="auth-card-title" className="font-heading text-2xl font-bold text-foreground">{title}</h1>
      {subtitle && <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      {children}
    </section>
  </div>
);

export const authField =
  "h-12 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
export const authButton =
  "flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70";

export default AuthCard;
