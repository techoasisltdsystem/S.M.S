import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import SiteNavbar from "@/components/site/SiteNavbar";
import Logo from "@/components/ui/logo";
import { usePricing } from "@/hooks/useBilling";

export const SiteFooter = () => {
  const s = usePricing().data?.settings;
  return (
    <footer className="border-t border-border bg-muted/30 px-4 py-12 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2.5"><Logo /><span className="font-heading text-lg font-bold">Tech Oasis <span className="text-primary">SMS</span></span></div>
          <p className="mt-3 text-sm text-muted-foreground">One place to run a school: records, attendance, results, fees and communication.</p>
        </div>
        <nav aria-label="Site" className="text-sm">
          <p className="mb-2 font-semibold">Explore</p>
          <ul className="space-y-1.5 text-muted-foreground">
            {[["/", "Home"], ["/about", "About"], ["/features", "Features"], ["/pricing", "Pricing"], ["/faq", "FAQ"], ["/contact", "Contact"]].map(([to, l]) => <li key={to}><Link to={to} className="hover:text-foreground">{l}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Accounts" className="text-sm">
          <p className="mb-2 font-semibold">Accounts</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li><Link to="/signup" className="hover:text-foreground">Create a school account</Link></li>
            <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
            <li><Link to="/super-admin/login" className="hover:text-foreground">Platform administration</Link></li>
          </ul>
        </nav>
        <div className="text-sm text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">Support</p>
          <ul className="space-y-1.5">
            {s?.support_email && <li><a href={`mailto:${s.support_email}`} className="hover:text-foreground">{s.support_email}</a></li>}
            {s?.support_phone && <li><a href={`tel:${s.support_phone}`} className="hover:text-foreground">{s.support_phone}</a></li>}
            {s?.terms_url && <li><a href={s.terms_url} className="hover:text-foreground" target="_blank" rel="noreferrer">Terms and Conditions</a></li>}
            {s?.privacy_url && <li><a href={s.privacy_url} className="hover:text-foreground" target="_blank" rel="noreferrer">Privacy Policy</a></li>}
            {!s?.support_email && !s?.support_phone && <li><Link to="/contact" className="hover:text-foreground">Contact us</Link></li>}
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl border-t border-border pt-6 text-center text-sm text-muted-foreground">© {new Date().getFullYear()} Tech Oasis Web Solutions</p>
    </footer>
  );
};

/** A closing call to action used at the bottom of the marketing pages. */
export const CtaBand = ({ title = "Ready to run your school on one platform?", text = "Create your school account, choose a package and pay securely with Paystack. It takes a few minutes." }: { title?: string; text?: string }) => (
  <section className="bg-gradient-to-r from-[#0a2150] to-blue-700 px-4 py-14 text-center text-white sm:px-6">
    <h2 className="mx-auto max-w-2xl font-heading text-2xl font-bold sm:text-3xl">{title}</h2>
    <p className="mx-auto mt-3 max-w-xl text-white/80">{text}</p>
    <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link to="/signup" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-blue-800 hover:bg-blue-50">Create your school account <ArrowRight className="h-4 w-4" aria-hidden /></Link>
      <Link to="/pricing" className="inline-flex h-12 items-center rounded-full border border-white/50 px-7 text-sm font-semibold hover:bg-white/10">See pricing</Link>
    </div>
  </section>
);

const SiteLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen bg-background">
    <SiteNavbar />
    <main>{children}</main>
    <SiteFooter />
  </div>
);

export default SiteLayout;
