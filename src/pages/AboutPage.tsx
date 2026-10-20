import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, GraduationCap, HeartHandshake, ShieldCheck, Users } from "lucide-react";
import SiteLayout, { CtaBand } from "@/components/site/SiteLayout";
import PageHero from "@/components/site/PageHero";
import { HERO_SETS, SITE_IMAGES } from "@/components/site/siteImages";

const ROLES = [
  { icon: ShieldCheck, title: "School administrators", text: "Set up the school, add staff and students, control who can do what, manage fees and watch the audit log.", to: "/login?role=admin" },
  { icon: BookOpen, title: "Teachers", text: "Take attendance, set assignments, enter marks, send results for approval and message parents.", to: "/login?role=teacher" },
  { icon: GraduationCap, title: "Students", text: "See your timetable, hand in homework, read published results and notices.", to: "/login?role=student" },
  { icon: Users, title: "Parents", text: "Follow your child's attendance and results, see fees and talk to teachers. Only your own children, never anyone else's.", to: "/login?role=parent" },
];

const VALUES = [
  { icon: ShieldCheck, title: "Every school is separate", text: "Each school's records are walled off from every other school, enforced in the database itself, not only on the screen." },
  { icon: HeartHandshake, title: "Plain and honest", text: "We say what works and what does not. Payments are confirmed with Paystack before anything is activated, and nothing is deleted when a subscription lapses." },
  { icon: Users, title: "Built around roles", text: "Administrators, teachers, students and parents each get a dashboard made for them, and each signs in separately." },
];

const AboutPage = () => (
  <SiteLayout>
    <PageHero images={HERO_SETS.about} eyebrow="About Tech Oasis SMS" title={<>Software that lets schools <span className="text-blue-400">focus on learning</span></>}
      text="Tech Oasis SMS brings admissions, attendance, results, fees and messaging into one secure place, so staff spend less time on paperwork and families stay informed.">
      <Link to="/signup" className="inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-7 text-sm font-semibold text-white hover:bg-blue-500">Create your school account</Link>
      <Link to="/features" className="inline-flex h-12 items-center justify-center rounded-full border border-white/40 px-7 text-sm font-semibold text-white hover:bg-white/10">See the features</Link>
    </PageHero>

    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Our story</p>
        <h2 className="mt-2 font-heading text-3xl font-bold">Made for the way schools in Ghana really work</h2>
        <p className="mt-4 text-muted-foreground">
          Many schools still keep registers, marks and fee books on paper or in scattered spreadsheets. Tech Oasis SMS replaces that with one system that every role can use from a phone or a computer, with prices in Ghana cedis and payment by card or mobile money through Paystack.
        </p>
        <p className="mt-3 text-muted-foreground">
          The platform is built by Tech Oasis Web Solutions. We add features in small, tested steps and say exactly what each one does.
        </p>
      </motion.div>
      <motion.img initial={{ opacity: 0, scale: 0.97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
        src={SITE_IMAGES.learners} alt="Learners working together with laptops" className="aspect-[4/3] w-full rounded-2xl object-cover shadow-prominent" />
    </section>

    <section className="bg-muted/40 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center font-heading text-3xl font-bold">What we stand for</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {VALUES.map((v, i) => (
            <motion.div key={v.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><v.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 font-heading text-lg font-semibold">{v.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{v.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="text-center font-heading text-3xl font-bold">A home for every role</h2>
      <p className="mx-auto mt-2 max-w-2xl text-center text-muted-foreground">Each group signs in on its own login and sees only what belongs to them.</p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r, i) => (
          <motion.div key={r.title} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
            <Link to={r.to} className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-elevated">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><r.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 font-heading text-lg font-semibold">{r.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{r.text}</p>
              <span className="mt-4 text-sm font-medium text-primary">Sign in →</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
    <CtaBand />
  </SiteLayout>
);

export default AboutPage;
