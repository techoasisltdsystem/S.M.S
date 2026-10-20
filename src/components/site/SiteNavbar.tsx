import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import Logo from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "#top", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#modules", label: "Modules" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];

const SiteNavbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Over the dark hero photo the bar is transparent with light text; once the
  // page scrolls (or the mobile menu opens) it becomes a solid light bar.
  const solid = scrolled || open;

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-colors ${
        solid ? "border-b border-border bg-background/95 backdrop-blur" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-20" aria-label="Main">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Tech Oasis SMS home">
          <Logo />
          <span className={`font-heading text-lg font-bold ${solid ? "text-foreground" : "text-white"}`}>
            Tech Oasis <span className={solid ? "text-primary" : "text-blue-400"}>SMS</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`text-sm font-medium transition-colors ${
                solid ? "text-muted-foreground hover:text-foreground" : "text-white/85 hover:text-white"
              }`}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            to="/login"
            className={`inline-flex h-11 items-center rounded-full border px-6 text-sm font-semibold transition ${
              solid
                ? "border-border text-foreground hover:bg-muted"
                : "border-white/50 bg-white/5 text-white backdrop-blur hover:bg-white/15"
            }`}
          >
            Login
          </Link>
          <a
            href="#contact"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500"
          >
            Get Started <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className={`lg:hidden ${solid ? "" : "text-white hover:bg-white/10 hover:text-white"}`}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </nav>

      {open && (
        <div id="mobile-menu" className="space-y-1 border-t border-border bg-background px-4 pb-4 pt-2 lg:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-sm text-muted-foreground hover:bg-muted">
              {l.label}
            </a>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild className="rounded-full bg-blue-600 hover:bg-blue-500">
              <a href="#contact" onClick={() => setOpen(false)}>
                Get Started
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};

export default SiteNavbar;
