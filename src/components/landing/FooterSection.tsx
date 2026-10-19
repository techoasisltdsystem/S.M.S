import Logo from "@/components/ui/logo";

const COLUMNS = [
  { title: "Product", links: ["Features", "Pricing", "Demo", "Changelog", "Integrations"] },
  { title: "Company", links: ["About Us", "Blog", "Careers", "Press", "Contact"] },
  { title: "Resources", links: ["Documentation", "Help Center", "Community", "Webinars", "API Reference"] },
  { title: "Legal", links: ["Privacy Policy", "Terms of Service", "Security", "GDPR", "FERPA"] },
];

const FooterSection = () => (
  <footer className="border-t border-border bg-muted/20 pt-16 pb-8 px-4 sm:px-6">
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5 mb-4">
            <Logo />
            <span className="font-heading text-lg font-bold text-foreground">
              Tech Oasis <span className="text-primary">SMS</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Enterprise-grade school management platform by Tech Oasis Web Solutions. Built for schools that demand excellence.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h4 className="font-heading text-sm font-semibold text-foreground mb-4">{col.title}</h4>
            <ul className="space-y-2.5">
              {col.links.map((link) => (
                <li key={link}>
                  <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">© 2026 Tech Oasis Web Solutions. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Security</a>
        </div>
      </div>
    </div>
  </footer>
);

export default FooterSection;
