import { ReactNode } from "react";
import { Link } from "react-router-dom";
import Logo from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { usePricing } from "@/hooks/useBilling";

/** Header and footer for the public pricing and checkout pages. */
const PublicShell = ({ children, narrow }: { children: ReactNode; narrow?: boolean }) => {
  const s = usePricing().data?.settings;
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6" aria-label="Main">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Tech Oasis SMS home">
            <Logo />
            <span className="font-heading text-lg font-bold text-foreground">Tech Oasis <span className="text-primary">SMS</span></span>
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link to="/pricing" className="hidden px-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:block">Pricing</Link>
            <Link to="/#contact" className="hidden px-2 text-sm font-medium text-muted-foreground hover:text-foreground sm:block">Contact</Link>
            <Button asChild variant="outline" size="sm"><Link to="/login">Sign in</Link></Button>
          </div>
        </nav>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-12 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>{children}</main>
      <footer className="border-t border-border bg-muted/30 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} {s?.business_name ?? "Tech Oasis"}</p>
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
            {s?.terms_url ? <a href={s.terms_url} className="hover:text-foreground" target="_blank" rel="noreferrer">Terms and Conditions</a> : <span>Terms: ask support</span>}
            {s?.privacy_url ? <a href={s.privacy_url} className="hover:text-foreground" target="_blank" rel="noreferrer">Privacy Policy</a> : <span>Privacy: ask support</span>}
            {s?.support_email && <a href={`mailto:${s.support_email}`} className="hover:text-foreground">{s.support_email}</a>}
            {s?.support_phone && <a href={`tel:${s.support_phone}`} className="hover:text-foreground">{s.support_phone}</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default PublicShell;
