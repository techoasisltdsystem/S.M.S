import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  BarChart3, Bell, BookOpen, Calendar, ClipboardList, CreditCard, DollarSign, FileText, GraduationCap, History, Library,
  LifeBuoy, MessageSquare, ShieldCheck, UserCheck, Users,
} from "lucide-react";
import SiteLayout, { CtaBand } from "@/components/site/SiteLayout";
import PageHero from "@/components/site/PageHero";
import { HERO_SETS, SITE_IMAGES } from "@/components/site/siteImages";

type Status = "Available" | "Planned";
interface Item { icon: React.ElementType; title: string; text: string; status: Status }

const GROUPS: { title: string; blurb: string; image: string; items: Item[] }[] = [
  {
    title: "Academics", blurb: "From the first day of term to the report card.", image: SITE_IMAGES.studyDesk,
    items: [
      { icon: GraduationCap, title: "Students and admission numbers", text: "Enrol pupils into classes, give each an admission number, link guardians and keep records in one place.", status: "Available" },
      { icon: BookOpen, title: "Classes, subjects and teachers", text: "Academic years, terms, classes and subjects, with teachers assigned to what they teach.", status: "Available" },
      { icon: UserCheck, title: "Attendance", text: "Teachers take the register in seconds; corrections are logged; parents see their own child's record.", status: "Available" },
      { icon: Calendar, title: "Timetable", text: "The weekly lesson schedule for every class, shown to teachers and students for their own lessons.", status: "Available" },
      { icon: ClipboardList, title: "Exams, results and approval", text: "Enter marks, send for approval, publish, correct with a recorded reason, and download report cards as PDF, Excel or CSV.", status: "Available" },
      { icon: FileText, title: "Assignments and homework", text: "Set homework with a deadline, collect text or file submissions, mark and return them.", status: "Available" },
    ],
  },
  {
    title: "Communication", blurb: "Everyone informed, nobody over-exposed.", image: SITE_IMAGES.learners,
    items: [
      { icon: MessageSquare, title: "Private messaging", text: "Teachers, parents and staff talk inside the platform. Who can message whom is controlled by school settings.", status: "Available" },
      { icon: Bell, title: "Notices, events and notifications", text: "Post notices to chosen audiences, schedule them, and notify people in the app when results or invoices are ready.", status: "Available" },
    ],
  },
  {
    title: "Finance and administration", blurb: "Clear money, clear accountability.", image: SITE_IMAGES.laptopCity,
    items: [
      { icon: DollarSign, title: "Fees, invoices and receipts", text: "Fee structures, invoices for a whole class at once, recorded payments with receipts. Parents see only their own children's balances.", status: "Available" },
      { icon: CreditCard, title: "Subscription billing with Paystack", text: "Pick a package, pay by card or mobile money, and get started the moment Paystack confirms the payment.", status: "Available" },
      { icon: Users, title: "Staff roles and permissions", text: "Finance officers, headteachers, coordinators and more, each with only the permissions you give them.", status: "Available" },
      { icon: History, title: "Audit log", text: "Who did what and when, protected from editing. If the log cannot be written, sensitive actions are refused.", status: "Available" },
      { icon: LifeBuoy, title: "Support", text: "Ask the platform team for help from inside the app, and approve support access only when you choose.", status: "Available" },
    ],
  },
  {
    title: "Coming later", blurb: "Not built yet. We list these so you know what to expect.", image: SITE_IMAGES.laptopBlue,
    items: [
      { icon: Library, title: "Library", text: "Catalogue, loans and returns.", status: "Planned" },
      { icon: BarChart3, title: "Analytics and reports hub", text: "School-wide enrolment, attendance, results and fee collection reports.", status: "Planned" },
      { icon: ShieldCheck, title: "Email and SMS alerts", text: "Delivery of notices and reminders by email and SMS.", status: "Planned" },
    ],
  },
];

const FeaturesPage = () => (
  <SiteLayout>
    <PageHero images={HERO_SETS.features} eyebrow="Features" title={<>Everything a school needs, <span className="text-blue-400">in one place</span></>}
      text="Academics, communication, fees and administration, each built for the people who use it and protected so every school's data stays its own.">
      <Link to="/signup" className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold text-white hover:bg-blue-500">Get started</Link>
      <Link to="/pricing" className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 px-7 text-sm font-semibold text-white hover:bg-white/10">View pricing</Link>
    </PageHero>

    {GROUPS.map((g, gi) => (
      <section key={g.title} className={gi % 2 ? "bg-muted/40" : ""}>
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-10 grid items-center gap-8 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="font-heading text-3xl font-bold">{g.title}</h2>
              <p className="mt-2 text-muted-foreground">{g.blurb}</p>
            </motion.div>
            <motion.img initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} src={g.image} alt="" className="aspect-[16/8] w-full rounded-2xl object-cover shadow-card" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it, i) => (
              <motion.div key={it.title} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 3) * 0.08 }} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><it.icon className="h-5 w-5" aria-hidden /></span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${it.status === "Available" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{it.status}</span>
                </div>
                <h3 className="mt-3 font-heading font-semibold">{it.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{it.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    ))}
    <CtaBand />
  </SiteLayout>
);

export default FeaturesPage;
