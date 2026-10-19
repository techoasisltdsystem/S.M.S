import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

const LINKS = [
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

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-colors ${
        scrolled || open ? "border-b border-border bg-background/95 backdrop-blur" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <a href="#top" className="flex items-center gap-2.5" aria-label="Tech Oasis SMS home">
          <Logo />
          <span className="font-heading text-lg font-bold text-foreground">
            Tech Oasis <span className="text-primary">SMS</span>
          </span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <a href="#contact">Request a demo</a>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </nav>

      {open && (
        <div id="mobile-menu" className="space-y-1 border-t border-border bg-background px-4 pb-4 pt-2 md:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-3 text-sm text-muted-foreground hover:bg-muted">
              {l.label}
            </a>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <a href="#contact" onClick={() => setOpen(false)}>
                Request a demo
              </a>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
};

export default SiteNavbar;
