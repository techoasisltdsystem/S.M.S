import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, BarChart3, Bell, BookOpen, CalendarDays, ChevronRight, ClipboardList, LayoutDashboard,
  MessageSquare, MessagesSquare, Play, Settings, ShieldCheck, UserCheck, UserPlus, Users, GraduationCap,
} from "lucide-react";
import schoolHero from "@/assets/school-hero.jpg";

const FEATURES = [
  { icon: Users, title: "Student Management", text: "Easily manage student records, profiles and academic progress." },
  { icon: GraduationCap, title: "Teacher Management", text: "Assign classes, track performance and simplify communication." },
  { icon: CalendarDays, title: "Attendance Tracking", text: "Monitor attendance in real-time with simple, accurate reports." },
  { icon: BarChart3, title: "Grades & Performance", text: "Record grades, generate reports and track student growth." },
  { icon: MessagesSquare, title: "Parent Communication", text: "Keep parents informed and engaged every step of the way." },
];

const SIDE = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "Students" },
  { icon: GraduationCap, label: "Teachers" },
  { icon: BookOpen, label: "Classes" },
  { icon: UserCheck, label: "Attendance" },
  { icon: ClipboardList, label: "Grades" },
  { icon: MessageSquare, label: "Messages" },
  { icon: Settings, label: "Settings" },
];

const STATS = [
  { label: "Total Students", value: "1,248", delta: "12%" },
  { label: "Total Teachers", value: "86", delta: "8%" },
  { label: "Total Classes", value: "42", delta: "10%" },
  { label: "Attendance Rate", value: "96%", delta: "2%" },
];

const ACTIVITY = [
  { icon: UserPlus, tone: "bg-blue-50 text-blue-600", title: "New student registration", meta: "Amina Mensah • 10 mins ago" },
  { icon: UserCheck, tone: "bg-rose-50 text-rose-500", title: "Attendance updated", meta: "Form 3B • 25 mins ago" },
  { icon: MessageSquare, tone: "bg-pink-50 text-pink-500", title: "New message from parent", meta: "Mr. Samuel • 1 hour ago" },
];

const SCHEDULE = [
  { color: "border-blue-500", title: "Mathematics (Form 2B)", time: "08:00 - 10:00 AM" },
  { color: "border-blue-500", title: "English (Form 1A)", time: "10:30 - 11:30 AM" },
  { color: "border-emerald-500", title: "Science (Form 3A)", time: "1:00 - 2:00 PM" },
];

// A decorative illustration of the product, drawn in markup. The numbers are
// sample values and the preview is labelled as such.
const DashboardMock = () => (
  <div className="relative mx-auto w-full max-w-[640px] lg:max-w-none" aria-hidden>
    <div
      className="overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] lg:[transform:perspective(1800px)_rotateY(-7deg)_rotateX(2deg)]"
    >
      <div className="flex">
        <div className="hidden w-[24%] shrink-0 bg-[#0b2350] px-3 py-4 text-[11px] text-white/80 sm:block">
          <div className="mb-4 flex items-center gap-1.5 px-1 font-semibold text-white">
            <GraduationCap className="h-4 w-4 text-blue-400" /> Tech Oasis
          </div>
          <ul className="space-y-1">
            {SIDE.map((s) => (
              <li
                key={s.label}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${s.active ? "bg-blue-600 text-white" : ""}`}
              >
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 flex-1 bg-slate-50 p-3 sm:p-4">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900 sm:text-sm">Good Morning, Admin 👋</p>
              <p className="text-[10px] text-slate-500">Here's what's happening at your school today.</p>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Bell className="h-3.5 w-3.5" />
              <span className="hidden rounded-full bg-slate-200 px-2 py-0.5 text-[10px] sm:inline">Sample data</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-lg bg-white p-2.5 shadow-sm">
                <p className="text-[9px] text-slate-500">{s.label}</p>
                <p className="text-lg font-bold leading-tight text-slate-900 sm:text-xl">{s.value}</p>
                <p className="text-[9px] font-medium text-emerald-600">↑ {s.delta}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1.15fr_1fr]">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-[10px]">
                <span className="font-semibold text-slate-900">Recent Activities</span>
                <span className="text-blue-600">View all →</span>
              </div>
              <ul className="space-y-2">
                {ACTIVITY.map((a) => (
                  <li key={a.title} className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full ${a.tone}`}>
                      <a.icon className="h-3 w-3" />
                    </span>
                    <span className="min-w-0 text-[10px] leading-tight">
                      <span className="block truncate font-medium text-slate-800">{a.title}</span>
                      <span className="block truncate text-slate-500">{a.meta}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hidden rounded-lg bg-white p-3 shadow-sm sm:block">
              <p className="mb-2 text-[10px] font-semibold text-slate-900">Today's Schedule</p>
              <ul className="space-y-2">
                {SCHEDULE.map((s) => (
                  <li key={s.title} className={`border-l-2 pl-2 text-[10px] leading-tight ${s.color}`}>
                    <span className="block font-medium text-slate-800">{s.title}</span>
                    <span className="block text-slate-500">{s.time}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="absolute -bottom-6 right-[-4px] hidden w-[27%] min-w-[130px] max-w-[170px] rounded-[1.4rem] border-[5px] border-slate-900 bg-white shadow-2xl sm:block">
      <div className="rounded-t-[1rem] bg-[#0b2350] px-3 pb-6 pt-3 text-white">
        <p className="text-center text-[9px] font-semibold">Tech Oasis</p>
        <p className="mt-2 text-[11px] font-semibold">Hello, Amina 👋</p>
        <p className="text-[8px] text-white/60">Student</p>
      </div>
      <div className="-mt-4 rounded-t-xl bg-white px-2.5 pb-3 pt-2.5">
        <p className="mb-1.5 text-[8px] font-semibold text-slate-700">Today's Classes</p>
        {["Mathematics", "English", "Science"].map((c) => (
          <div key={c} className="mb-1.5 flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-[8px] text-slate-700">
            {c} <ChevronRight className="h-2.5 w-2.5 text-slate-400" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

const HeroSection = () => (
  <section id="top">
    <div className="relative isolate overflow-hidden bg-[#08193a] text-white">
      <img
        src={schoolHero}
        alt=""
        aria-hidden
        className="absolute inset-0 -z-20 h-full w-full object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#08193a]/95 via-[#0a2150]/75 to-[#0a2150]/35" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[#08193a]/60 to-transparent" aria-hidden />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-20 pt-28 sm:px-6 lg:grid-cols-[1fr_1.25fr] lg:gap-6 lg:pb-28 lg:pt-36">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">
            <ShieldCheck className="h-4 w-4 text-blue-400" aria-hidden /> Complete School Management System
          </p>
          <h1 className="font-heading text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl xl:text-6xl">
            Smarter School Management for a <span className="text-blue-500">Better Tomorrow</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
            Tech Oasis SMS is a modern, all-in-one school management system designed to simplify administration, improve communication, and support student success, all in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#contact"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-blue-600 px-7 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Get Started <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a
              href="#preview"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/5 px-7 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Play className="h-4 w-4" aria-hidden /> Watch Demo
            </a>
          </div>
          <p className="mt-6 text-sm text-white/70">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-white underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }} className="pb-6">
          <DashboardMock />
        </motion.div>
      </div>
    </div>

    <div className="bg-slate-50">
      <ul className="mx-auto grid max-w-7xl gap-y-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:py-12">
        {FEATURES.map((f) => (
          <li key={f.title} className="px-4 lg:border-l lg:border-slate-200 lg:first:border-l-0">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <f.icon className="h-6 w-6" aria-hidden />
            </span>
            <h3 className="font-heading text-base font-bold text-slate-900">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.text}</p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default HeroSection;
