import { Mail, MessageCircle, Phone } from "lucide-react";
import SiteLayout from "@/components/site/SiteLayout";
import PageHero from "@/components/site/PageHero";
import { HERO_SETS } from "@/components/site/siteImages";
import ContactForm from "@/components/site/ContactForm";
import { usePricing } from "@/hooks/useBilling";

const ContactPage = () => {
  const s = usePricing().data?.settings;
  return (
    <SiteLayout>
      <PageHero images={HERO_SETS.contact} eyebrow="Contact" title={<>Talk to <span className="text-blue-400">our team</span></>} text="Request a demo, ask for a quote or tell us about your school. We will get back to you." />
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_20rem]">
        <div><h2 className="mb-4 font-heading text-2xl font-bold">Send us a message</h2><ContactForm /></div>
        <aside className="space-y-4">
          <h2 className="font-heading text-2xl font-bold">Other ways to reach us</h2>
          {s?.support_email && <a href={`mailto:${s.support_email}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"><Mail className="h-5 w-5 text-primary" aria-hidden /><span className="text-sm">{s.support_email}</span></a>}
          {s?.support_phone && <a href={`tel:${s.support_phone}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"><Phone className="h-5 w-5 text-primary" aria-hidden /><span className="text-sm">{s.support_phone}</span></a>}
          {!s?.support_email && !s?.support_phone && (
            <p className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card"><MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /> Use the form and we will reply by email. Existing customers can also open a support request from their dashboard.</p>
          )}
        </aside>
      </section>
    </SiteLayout>
  );
};

export default ContactPage;
