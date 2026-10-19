import SiteNavbar from "@/components/site/SiteNavbar";
import { Hero, Preview, Features, Modules, Roles, HowItWorks, Pricing, Faq, Contact, Footer } from "@/components/site/SiteSections";

const LandingPage = () => (
  <div className="min-h-screen bg-background">
    <SiteNavbar />
    <main>
      <Hero />
      <Preview />
      <Features />
      <Modules />
      <Roles />
      <HowItWorks />
      <Pricing />
      <Faq />
      <Contact />
    </main>
    <Footer />
  </div>
);

export default LandingPage;
