import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, ShieldCheck, History, Building2, GraduationCap, DollarSign, Users, BookOpen, Calendar,
  ClipboardList, UserCheck, Library, Bell, BarChart3, LayoutDashboard, UserPlus, KeyRound, Rocket, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Logo from "@/components/ui/logo";
import HeroSlideshow from "./HeroSlideshow";
import ProductPreview from "./ProductPreview";
import ContactForm from "./ContactForm";

const Reveal = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45 }}
    >
      {children}
    </motion.div>
  );
};

const Heading = ({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) => (
  <div className="mx-auto mb-10 max-w-2xl text-center">
    <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
    <h2 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">{title}</h2>
    {text && <p className="mt-3 text-muted-foreground">{text}</p>}
  </div>
);

const Section = ({ id, children, tint }: { id: string; children: React.ReactNode; tint?: boolean }) => (
  <section id={id} className={`scroll-mt-16 px-4 py-16 sm:px-6 sm:py-20 ${tint ? "bg-muted/40" : ""}`}>
    <div className="mx-auto max-w-6xl">{children}</div>
  </section>
);

export const Hero = () => (
  <section id="top" className="relative overflow-hidden px-4 pb-16 pt-28 sm:px-6 sm:pt-32">
    <div className="absolute inset-0 -z-10" aria-hidden>
      <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
    </div>
    <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          <Rocket className="h-4 w-4" aria-hidden /> Early access: modules are being added step by step
        </p>
        <h1 className="font-heading text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl">
          One calm place to run your <span className="text-primary">whole school</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Tech Oasis SMS keeps student records, staff and parent accounts, school settings and an audit trail together. Attendance, timetables, exams and fee collection are on the roadmap.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 px-7">
            <a href="#contact">
              Request a demo <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-7">
            <a href="#preview">See the product preview</a>
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
        <HeroSlideshow />
      </motion.div>
    </div>
  </section>
);

export const Preview = () => (
  <Section id="preview" tint>
    <Heading eyebrow="Product preview" title="See the dashboard before you sign up" text="Click through the tabs. The figures are sample data, so nothing here touches a real school." />
    <Reveal>
      <ProductPreview />
    </Reveal>
  </Section>
);

const FEATURES = [
  { icon: ShieldCheck, title: "Role-based access", text: "Administrators, teachers, students and parents each sign in to a dashboard that matches their role." },
  { icon: History, title: "Audit trail", text: "Administrative actions such as creating users or changing settings are recorded, so you can see who did what." },
  { icon: Building2, title: "Your school, your branding", text: "A setup wizard captures your school's name, logo, colours, academic year and grading style." },
  { icon: LayoutDashboard, title: "Clear dashboards", text: "Summary cards, activity and quick links in one place, with loading, empty and error states handled." },
];

export const Features = () => (
  <Section id="features">
    <Heading eyebrow="Features" title="What you can rely on today" />
    <div className="grid gap-5 sm:grid-cols-2">
      {FEATURES.map((f) => (
        <Reveal key={f.title}>
          <div className="h-full rounded-xl border border-border bg-card p-6 shadow-card">
            <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <f.icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="font-heading text-lg font-semibold text-card-foreground">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.text}</p>
          </div>
        </Reveal>
      ))}
    </div>
  </Section>
);

type Status = "Available" | "Early version" | "Planned";
const MODULES: { icon: React.ElementType; title: string; status: Status }[] = [
  { icon: Users, title: "User & role management", status: "Available" },
  { icon: History, title: "Audit log", status: "Available" },
  { icon: Building2, title: "School setup & branding", status: "Available" },
  { icon: GraduationCap, title: "Student records", status: "Early version" },
  { icon: DollarSign, title: "Fees & payments", status: "Early version" },
  { icon: BookOpen, title: "Classes", status: "Planned" },
  { icon: Calendar, title: "Timetable", status: "Planned" },
  { icon: ClipboardList, title: "Exams & grades", status: "Planned" },
  { icon: UserCheck, title: "Attendance", status: "Planned" },
  { icon: Library, title: "Library", status: "Planned" },
  { icon: Bell, title: "Notifications", status: "Planned" },
  { icon: BarChart3, title: "Analytics & reports", status: "Planned" },
];
const STATUS_STYLE: Record<Status, string> = {
  Available: "bg-success/10 text-success",
  "Early version": "bg-warning/15 text-warning",
  Planned: "bg-muted text-muted-foreground",
};

export const Modules = () => (
  <Section id="modules" tint>
    <Heading eyebrow="Modules" title="What exists and what is coming" text="We label every module honestly. Early versions use sample data until they are connected to the school database." />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {MODULES.map((m) => (
        <Reveal key={m.title}>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <m.icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-card-foreground">{m.title}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[m.status]}`}>{m.status}</span>
          </div>
        </Reveal>
      ))}
    </div>
  </Section>
);

const ROLES = [
  { title: "Administrators", text: "Manage accounts and roles, set up the school and review the audit log." },
  { title: "Teachers", text: "A teacher dashboard with quick links to students, classes and assessments as those modules arrive." },
  { title: "Students", text: "A personal dashboard for timetable, results and notices as those modules arrive." },
  { title: "Parents", text: "A view for following a child's progress and fees as those modules arrive." },
];

export const Roles = () => (
  <Section id="roles">
    <Heading eyebrow="Who it is for" title="A dashboard for every role" />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {ROLES.map((r) => (
        <Reveal key={r.title}>
          <div className="h-full rounded-xl border border-border bg-card p-5">
            <h3 className="font-heading text-base font-semibold text-card-foreground">{r.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{r.text}</p>
          </div>
        </Reveal>
      ))}
    </div>
  </Section>
);

const STEPS = [
  { icon: Mail, title: "Talk to us", text: "Request a demo and tell us about your school." },
  { icon: Building2, title: "Set up your school", text: "Add your school's details, branding and academic settings." },
  { icon: UserPlus, title: "Invite your people", text: "Create accounts and assign roles to staff, students and parents." },
  { icon: KeyRound, title: "Sign in and work", text: "Everyone lands on the dashboard that fits their role." },
];

export const HowItWorks = () => (
  <Section id="how" tint>
    <Heading eyebrow="How it works" title="From first call to first login" />
    <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((s, i) => (
        <li key={s.title}>
          <Reveal>
            <div className="h-full rounded-xl border border-border bg-card p-5">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
              <h3 className="font-heading text-base font-semibold text-card-foreground">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  </Section>
);

export const Pricing = () => (
  <Section id="pricing">
    <Heading eyebrow="Pricing" title="Pricing is being finalised" text="We are still settling our packages, so we are not publishing prices yet. Tell us your school's size and what you need and we will send a quote." />
    <Reveal className="text-center">
      <Button asChild size="lg" className="h-12 px-7">
        <a href="#contact">Ask for a quote</a>
      </Button>
    </Reveal>
  </Section>
);

const FAQS = [
  { q: "Is Tech Oasis SMS ready to run a whole school today?", a: "Not yet. User and role management, the audit log and school setup are in place. Student records and fees are early versions, and attendance, timetables, exams and reports are planned. The modules page shows the current status of each." },
  { q: "Can I try it?", a: "Request a demo and we will show you what exists now and answer your questions. The product preview above uses sample data only." },
  { q: "Which roles are supported?", a: "Administrator, teacher, student and parent." },
  { q: "How much does it cost?", a: "Pricing is not published yet. Use the contact form for a quote based on your school's size." },
  { q: "Where is our data kept?", a: "School data is stored in a hosted PostgreSQL database. We are moving to a new database provider, so we will confirm the details with you before you load real records." },
];

export const Faq = () => (
  <Section id="faq" tint>
    <Heading eyebrow="FAQ" title="Questions, answered plainly" />
    <Accordion type="single" collapsible className="mx-auto max-w-3xl rounded-xl border border-border bg-card px-5">
      {FAQS.map((f, i) => (
        <AccordionItem key={f.q} value={`q${i}`}>
          <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  </Section>
);

export const Contact = () => (
  <Section id="contact">
    <Heading eyebrow="Contact" title="Request a demo or ask a question" text="Tell us about your school and we will get back to you." />
    <div className="mx-auto max-w-2xl">
      <ContactForm />
    </div>
  </Section>
);

export const Footer = () => (
  <footer className="border-t border-border bg-muted/30 px-4 py-10 sm:px-6">
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="flex items-center gap-2.5">
        <Logo />
        <span className="font-heading text-lg font-bold text-foreground">
          Tech Oasis <span className="text-primary">SMS</span>
        </span>
      </div>
      <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <a href="#features" className="hover:text-foreground">Features</a>
        <a href="#modules" className="hover:text-foreground">Modules</a>
        <a href="#faq" className="hover:text-foreground">FAQ</a>
        <a href="#contact" className="hover:text-foreground">Contact</a>
        <Link to="/login" className="hover:text-foreground">Sign in</Link>
      </nav>
      <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} Tech Oasis Web Solutions</p>
    </div>
  </footer>
);
