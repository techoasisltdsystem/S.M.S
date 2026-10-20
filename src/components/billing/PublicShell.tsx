import { ReactNode } from "react";
import SiteNavbar from "@/components/site/SiteNavbar";
import { SiteFooter } from "@/components/site/SiteLayout";

/** Header and footer for the sign-up, checkout and payment-result pages (no hero, so the header is always solid). */
const PublicShell = ({ children, narrow }: { children: ReactNode; narrow?: boolean }) => (
  <div className="flex min-h-screen flex-col bg-background">
    <SiteNavbar forceSolid />
    <main className={`mx-auto w-full flex-1 px-4 pb-8 pt-24 sm:px-6 sm:pb-12 sm:pt-28 ${narrow ? "max-w-3xl" : "max-w-6xl"}`}>{children}</main>
    <SiteFooter />
  </div>
);

export default PublicShell;
