import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, CreditCard, HelpCircle, Mail, ShieldCheck, Sparkles } from "lucide-react";
import SiteLayout, { CtaBand } from "@/components/site/SiteLayout";
import HeroSection from "@/components/site/HeroSection";
import ProductPreview from "@/components/site/ProductPreview";
import { SITE_IMAGES } from "@/components/site/siteImages";

const EXPLORE = [
  { to: "/features", icon: Sparkles, title: "Features", text: "Academics, communication, fees and administration in detail.", image: SITE_IMAGES.studyDesk },
  { to: "/pricing", icon: CreditCard, title: "Pricing", text: "Clear packages in Ghana cedis. Pay with Paystack.", image: SITE_IMAGES.laptopCity },
  { to: "/about", icon: BookOpen, title: "About", text: "Who it is for and how we build it.", image: SITE_IMAGES.learners },
  { to: "/faq", icon: HelpCircle, title: "FAQ", text: "Sign-up, payment and security explained.", image: SITE_IMAGES.laptopBlue },
  { to: "/contact", icon: Mail, title: "Contact", text: "Request a demo or ask a question.", image: SITE_IMAGES.parentBg },
];

const LandingPage = () => (
  <SiteLayout>
    <HeroSection />

    <section id="preview" className="bg-muted/40 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">Product preview</p>
        <h2 className="mt-2 text-center font-heading text-3xl font-bold">See the dashboard before you sign up</h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">Click through the tabs. The figures are sample data, so nothing here touches a real school.</p>
        <div className="mt-8"><ProductPreview /></div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center font-heading text-3xl font-bold">Explore Tech Oasis SMS</h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EXPLORE.map((e, i) => (
          <motion.div key={e.to} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}>
            <Link to={e.to} className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-1 hover:shadow-elevated">
              <div className="relative h-36 overflow-hidden">
                <img src={e.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#08193a]/70 to-transparent" />
                <span className="absolute bottom-3 left-4 flex items-center gap-2 font-heading text-lg font-bold text-white"><e.icon className="h-5 w-5" aria-hidden /> {e.title}</span>
              </div>
              <p className="flex items-center justify-between gap-3 p-4 text-sm text-muted-foreground">{e.text} <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden /></p>
            </Link>
          </motion.div>
        ))}
        <div className="flex flex-col justify-center rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden />
          <h3 className="mt-3 font-heading text-lg font-bold">Built to keep records safe</h3>
          <p className="mt-1 text-sm text-muted-foreground">Every school is separate, every change is logged, and parents see only their own children.</p>
        </div>
      </div>
    </section>
    <CtaBand />
  </SiteLayout>
);

export default LandingPage;
