import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Lock, User, ShieldCheck } from "lucide-react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import Logo from "@/components/ui/logo";
import adminBg from "@/assets/admin-login-bg.webp";
import teacherBg from "@/assets/site/study-desk.webp";
import parentBg from "@/assets/site/learners.webp";

type PanelRole = "admin" | "teacher" | "parent";

// Tailwind needs whole class names, so each role lists its own full strings.
const THEMES: Record<PanelRole, {
  bg: string; flip: string; page: string; overlay: string; panel: string; text: string; soft: string;
  accent: string; button: string; ring: string; title: string; subtitle: string; aside: string; asideBody: string;
  login: string; label: string;
}> = {
  admin: {
    bg: adminBg, flip: "-scale-x-100", page: "bg-blue-950",
    overlay: "from-blue-950/90 via-blue-900/75 to-blue-700/55", panel: "bg-blue-600/35",
    text: "text-blue-100", soft: "text-blue-200", accent: "text-sky-300",
    button: "bg-sky-500 hover:bg-sky-400 focus:ring-offset-blue-700", ring: "focus:ring-sky-400",
    title: "Administrator sign in", subtitle: "Sign in to manage your school.",
    aside: "Restricted area", asideBody: "Administrator access only.", login: "LOGIN", label: "Administrator",
  },
  teacher: {
    bg: teacherBg, flip: "", page: "bg-emerald-950",
    overlay: "from-emerald-950/90 via-emerald-900/75 to-teal-700/50", panel: "bg-emerald-700/35",
    text: "text-emerald-100", soft: "text-emerald-200", accent: "text-emerald-300",
    button: "bg-emerald-500 hover:bg-emerald-400 focus:ring-offset-emerald-800", ring: "focus:ring-emerald-300",
    title: "Teacher sign in", subtitle: "Your classes, students and grading in one place.",
    aside: "Staff access", asideBody: "For teachers and teaching staff.", login: "SIGN IN", label: "Teacher",
  },
  parent: {
    bg: parentBg, flip: "", page: "bg-amber-950",
    overlay: "from-amber-950/90 via-orange-900/70 to-amber-700/45", panel: "bg-orange-700/35",
    text: "text-orange-100", soft: "text-orange-200", accent: "text-amber-300",
    button: "bg-amber-500 hover:bg-amber-400 focus:ring-offset-orange-800", ring: "focus:ring-amber-300",
    title: "Parent sign in", subtitle: "Follow your child's progress.",
    aside: "Parent portal", asideBody: "For parents and guardians.", login: "SIGN IN", label: "Parent",
  },
};

const ROLE_LABELS: Record<UserRole, string> = { admin: "Administrator", teacher: "Teacher", student: "Student", parent: "Parent" };

// onSwitchRole is passed when this panel is shown inside the main sign-in page.
const AdminLogin = ({ role = "admin", onSwitchRole }: { role?: PanelRole; onSwitchRole?: (role: UserRole) => void }) => {
  const t = THEMES[role];
  const { login } = useAuth();
  const { schoolConfig } = useSchool();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [help, setHelp] = useState(false);
  const [errors, setErrors] = useState<{ id?: string; password?: string; form?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!id.trim()) next.id = "Enter your email or username.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (next.id || next.password) return;

    setLoading(true);
    try {
      await login(id.trim(), password, role);
    } catch {
      setErrors({ form: "We could not sign you in. Check your details and try again." });
    } finally {
      setLoading(false);
    }
  };

  const contact = [schoolConfig?.email, schoolConfig?.phone_number].filter(Boolean).join(" · ");
  const field =
    `h-12 w-full rounded-md border bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${t.ring}`;

  return (
    <div className={`relative flex min-h-screen items-center justify-center overflow-hidden ${t.page} px-4 py-10 lg:justify-end lg:px-[8vw]`}>
      <img src={t.bg} alt="" aria-hidden className={`absolute inset-0 h-full w-full object-cover ${t.flip}`} />
      <div className={`absolute inset-0 bg-gradient-to-br ${t.overlay}`} aria-hidden />

      <div className={`relative z-10 mr-auto hidden max-w-sm self-end pb-6 text-sm ${t.text} lg:block`}>
        <p className="mb-1 flex items-center gap-2 font-medium text-white">
          <ShieldCheck className="h-4 w-4" aria-hidden /> {t.aside}
        </p>
        <p>{t.asideBody} {onSwitchRole ? "Other roles can switch below the form." : "Other roles sign in from the main sign-in page."}</p>
        {contact && <p className={`mt-3 ${t.soft}`}>{contact}</p>}
      </div>

      <motion.form
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className={`relative z-10 w-full max-w-md rounded-xl border border-white/25 ${t.panel} p-7 text-white shadow-2xl backdrop-blur-md sm:p-9`}
        aria-labelledby="admin-login-title"
        data-role={role}
      >
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo className="h-10 w-10" />
          <span className="font-heading text-xl font-bold tracking-wide">
            Tech Oasis <span className={t.accent}>SMS</span>
          </span>
        </div>

        <h1 id="admin-login-title" className="font-heading text-2xl font-bold">
          {t.title}
        </h1>
        <p className={`mb-6 mt-1 text-sm ${t.text}`}>{t.subtitle}</p>

        {errors.form && (
          <p role="alert" className="mb-4 rounded-md bg-red-500/25 px-3 py-2 text-sm text-white">
            {errors.form}
          </p>
        )}

        <div className="mb-4">
          <label htmlFor="admin-id" className="sr-only">
            Email or username
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="admin-id"
              type="text"
              autoComplete="username"
              placeholder="Email or username"
              value={id}
              onChange={(e) => setId(e.target.value)}
              aria-invalid={!!errors.id}
              aria-describedby={errors.id ? "admin-id-err" : undefined}
              className={`${field} ${errors.id ? "border-red-400" : "border-transparent"}`}
            />
          </div>
          {errors.id && (
            <p id="admin-id-err" className="mt-1 text-xs text-red-200">
              {errors.id}
            </p>
          )}
        </div>

        <div className="mb-2">
          <label htmlFor="admin-pass" className="sr-only">
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="admin-pass"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "admin-pass-err" : undefined}
              className={`${field} pr-11 ${errors.password ? "border-red-400" : "border-transparent"}`}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-2 ${t.ring}`}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="admin-pass-err" className="mt-1 text-xs text-red-200">
              {errors.password}
            </p>
          )}
        </div>

        <div className="mb-5 text-right">
          <button
            type="button"
            onClick={() => setHelp((h) => !h)}
            aria-expanded={help}
            className={`text-sm ${t.text} underline-offset-2 hover:text-white hover:underline focus:outline-none focus:ring-2 ${t.ring}`}
          >
            Forgot password?
          </button>
        </div>
        {help && (
          <p className="mb-5 rounded-md bg-white/15 px-3 py-2 text-sm text-white">
            Password recovery by email is not set up yet. Please contact your Tech Oasis administrator{contact ? ` (${contact})` : ""} to reset your password.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-md ${t.button} text-base font-semibold tracking-wide text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70`}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…
            </>
          ) : (
            t.login
          )}
        </button>

        <p className={`mt-4 text-center text-xs ${t.text}`}>
          Demo mode: sign-in is not verified against a password yet.
        </p>
        {onSwitchRole ? (
          <div className="mt-4">
            <p className={`mb-2 text-center text-sm ${t.text}`}>Not {role === "admin" ? "an administrator" : `a ${t.label.toLowerCase()}`}?</p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(ROLE_LABELS) as UserRole[]).filter((r) => r !== role).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onSwitchRole(r)}
                  className={`rounded-md border border-white/30 bg-white/10 px-2 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 ${t.ring}`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className={`mt-3 text-center text-sm ${t.text}`}>
            Teacher, student or parent?{" "}
            <Link to="/login" className="font-medium text-white underline underline-offset-2">
              Use the main sign in
            </Link>
          </p>
        )}
      </motion.form>
    </div>
  );
};

export default AdminLogin;
