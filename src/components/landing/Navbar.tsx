import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import Logo from "@/components/ui/logo";

const Navbar = () => {
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/90 backdrop-blur-xl border-b border-border shadow-card"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-heading text-lg font-bold text-foreground">
            Tech Oasis <span className="text-primary">SMS</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          {["Features", "Pricing", "Testimonials"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              {item}
            </a>
          ))}
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
            Sign In
          </Button>
          <Button size="sm" className="rounded-lg" onClick={() => navigate("/login")}>
            Get Started Free
          </Button>
        </div>

        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)}>
          {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {mobileMenu && (
        <div className="md:hidden border-t border-border bg-background/95 backdrop-blur-xl p-4 space-y-2">
          {["Features", "Pricing", "Testimonials"].map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="block text-sm text-muted-foreground py-3 px-2 rounded-lg hover:bg-muted transition-colors"
              onClick={() => setMobileMenu(false)}
            >
              {item}
            </a>
          ))}
          <div className="pt-2 space-y-2">
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>Sign In</Button>
            <Button className="w-full" onClick={() => navigate("/login")}>Get Started Free</Button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
