import { Link } from "react-router-dom";
import { CalendarClock, Check, LifeBuoy, Lock, Minus, ShieldCheck, Smartphone, Users } from "lucide-react";
import SiteLayout, { CtaBand } from "@/components/site/SiteLayout";
import PageHero from "@/components/site/PageHero";
import { HERO_SETS } from "@/components/site/siteImages";
import PricingCards, { limitText } from "@/components/billing/PricingCards";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FEATURES } from "@/hooks/usePlatformConsole";
import { usePricing } from "@/hooks/useBilling";

const BENEFITS = [
  { icon: Users, title: "One place for the whole school", text: "Admissions, attendance, results, fees, messages and notices for staff, parents and students." },
  { icon: ShieldCheck, title: "Built to keep records safe", text: "Every school is separate, every change is logged, and parents see only their own children." },
  { icon: Smartphone, title: "Works on any device", text: "Phones, tablets and computers, with no software to install." },
  { icon: LifeBuoy, title: "Help when you need it", text: "Contact our team from inside the app or by phone and email." },
];

const Comparison = () => {
  const plans = usePricing().data?.plans ?? [];
  if (plans.length === 0) return null;
  return (
    <section aria-labelledby="compare" className="mt-20">
      <h2 id="compare" className="text-center font-heading text-2xl font-bold text-foreground">Compare packages</h2>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">What is included</th>
              {plans.map((p) => <th key={p.code} scope="col" className="px-4 py-3 text-center font-heading font-semibold text-card-foreground">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border"><th scope="row" className="px-4 py-3 text-left font-normal">Students</th>{plans.map((p) => <td key={p.code} className="px-4 py-3 text-center">{limitText(p).replace("Up to ", "")}</td>)}</tr>
            <tr className="border-b border-border"><th scope="row" className="px-4 py-3 text-left font-normal">Staff accounts</th>{plans.map((p) => <td key={p.code} className="px-4 py-3 text-center">{p.staff_limit ?? "Unlimited"}</td>)}</tr>
            {FEATURES.map((f) => (
              <tr key={f.key} className="border-b border-border last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-normal">{f.label}</th>
                {plans.map((p) => (
                  <td key={p.code} className="px-4 py-3 text-center">
                    {p.entitlements[f.key] ? <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" /> : <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not included" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const PricingPage = () => {
  const s = usePricing().data?.settings;
  const faqs = [
    { q: "How does payment work?", a: "You pay securely through Paystack. The payment methods you see at checkout (such as card or mobile money) are the ones enabled for our account in your country. We never see or store your card details." },
    { q: "When does my plan start?", a: "As soon as Paystack confirms your payment to our server. We do not activate a plan on a promise or a browser redirect." },
    { q: "Do you renew automatically?", a: "No. We remind you before your plan ends and you renew in one click, so you are never charged without your action." },
    { q: "What if I do not renew?", a: `Your school gets a grace period, then becomes read-only. Nothing is deleted: renew and everything is back as it was.` },
    { q: "Can I change package later?", a: "Yes. Choose another package from the Subscription page. The new package and price apply from the payment you make." },
    { q: "Can I get a refund?", a: s?.refund_text ?? "Contact support to ask about a refund." },
  ];
  return (
    <SiteLayout>
      <PageHero images={HERO_SETS.pricing} eyebrow="Pricing" title={<>Simple pricing for <span className="text-blue-400">every school</span></>}
        text="Pick a package, pay securely with Paystack, and start the same day. Prices are per school and shown before you pay, with nothing added at the end." />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div><PricingCards /></div>

      <section aria-label="Benefits" className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b) => (
          <div key={b.title} className="rounded-xl border border-border bg-card p-5">
            <b.icon className="h-6 w-6 text-primary" aria-hidden />
            <h3 className="mt-3 font-heading font-semibold text-card-foreground">{b.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
          </div>
        ))}
      </section>

      <Comparison />

      <section aria-label="Payment and renewal" className="mt-20 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><Lock className="h-5 w-5 text-primary" aria-hidden /> Secure payment</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Payments are processed by Paystack on its own secure page. Card and mobile money details go to Paystack, never to our servers. Your plan is activated only after our server confirms the payment with Paystack.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-heading text-lg font-semibold"><CalendarClock className="h-5 w-5 text-primary" aria-hidden /> Renewal and cancellation</h2>
          <p className="mt-2 text-sm text-muted-foreground">{s?.cancellation_text}</p>
        </div>
      </section>

      <section aria-labelledby="faq" className="mt-20">
        <h2 id="faq" className="text-center font-heading text-2xl font-bold text-foreground">Questions, answered plainly</h2>
        <Accordion type="single" collapsible className="mx-auto mt-6 max-w-3xl rounded-xl border border-border bg-card px-5">
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}>
              <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Need help choosing? {s?.support_email ? <a className="font-medium text-primary hover:underline" href={`mailto:${s.support_email}`}>{s.support_email}</a> : <Link className="font-medium text-primary hover:underline" to="/#contact">Contact us</Link>}
          {s?.support_phone ? <> or call <a className="font-medium text-primary hover:underline" href={`tel:${s.support_phone}`}>{s.support_phone}</a></> : null}.
        </p>
      </section>
      </div>
      <CtaBand />
    </SiteLayout>
  );
};

export default PricingPage;
