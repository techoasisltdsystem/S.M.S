import { Link } from "react-router-dom";
import SiteLayout, { CtaBand } from "@/components/site/SiteLayout";
import PageHero from "@/components/site/PageHero";
import { HERO_SETS } from "@/components/site/siteImages";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { usePricing } from "@/hooks/useBilling";

const FaqPage = () => {
  const s = usePricing().data?.settings;
  const groups: { title: string; items: { q: string; a: string }[] }[] = [
    { title: "Getting started", items: [
      { q: "How do I start?", a: "Choose Sign up, enter your school's and administrator's details, pick a package and pay with Paystack. When the payment is confirmed we email you a link to confirm your account and choose your password." },
      { q: "Which roles are supported?", a: "School administrators and other staff roles, teachers, students and parents. Each signs in on its own login and sees only what belongs to them." },
      { q: "Can a teacher or parent sign in as a student?", a: "No. Each login accepts only its own kind of account, and the database enforces who can see which records." },
    ] },
    { title: "Payments and plans", items: [
      { q: "How does payment work?", a: "You pay on Paystack's secure page and choose a method there, such as card, mobile money or bank transfer, depending on what is available for your payment. We never see or store your card details." },
      { q: "When does my plan start?", a: "As soon as our server confirms the payment with Paystack. A redirect or a success message on its own never activates a plan." },
      { q: "Do you renew automatically?", a: "No. We remind you before your plan ends and you renew in one click." },
      { q: "What if I do not renew?", a: "Your school gets a grace period, then becomes read-only. Nothing is deleted. Renew and everything is back as it was." },
      { q: "Can I change package later?", a: "Yes, from the Plan and billing page in your dashboard." },
      { q: "Can I get a refund?", a: s?.refund_text ?? "Contact support to ask about a refund." },
    ] },
    { title: "Data and security", items: [
      { q: "Is our data separate from other schools?", a: "Yes. Every school's records are isolated from every other school's inside the database." },
      { q: "Who can see what?", a: "Parents see only their own children. Teachers see their own classes. Administrators manage their own school. Platform staff see counts and settings, not pupils' records." },
      { q: "Is there an audit trail?", a: "Yes. Sensitive actions are recorded and the log cannot be edited. If an action cannot be recorded, it is refused." },
    ] },
  ];
  return (
    <SiteLayout>
      <PageHero images={HERO_SETS.faq} eyebrow="FAQ" title={<>Questions, <span className="text-blue-400">answered plainly</span></>} text="How sign-up, payment, plans and security work. If your question is not here, we are happy to help.">
        <Link to="/contact" className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold text-white hover:bg-blue-500">Ask us</Link>
      </PageHero>
      <section className="mx-auto max-w-3xl space-y-10 px-4 py-16 sm:px-6">
        {groups.map((g) => (
          <div key={g.title}>
            <h2 className="mb-3 font-heading text-xl font-bold">{g.title}</h2>
            <Accordion type="single" collapsible className="rounded-xl border border-border bg-card px-5">
              {g.items.map((f, i) => (
                <AccordionItem key={f.q} value={`${g.title}-${i}`}>
                  <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </section>
      <CtaBand />
    </SiteLayout>
  );
};

export default FaqPage;
