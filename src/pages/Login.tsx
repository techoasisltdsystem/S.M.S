import { useState } from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { AuthError } from "@/lib/db";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import schoolHero from "@/assets/school-hero.jpg";
import adminBg from "@/assets/admin-login-bg.webp";
import teacherBg from "@/assets/teacher-login-bg.jpg";
import parentBg from "@/assets/parent-login-bg.jpg";
import Logo from "@/components/ui/logo";
import { LOGIN_ROLES as ROLES } from "@/components/auth/loginRoles";

type Role = Exclude<UserRole, "platform">;
const SIDE: Record<Role, { image: string; title: string; text: string }> = {
  admin: { image: adminBg, title: "School Administration", text: "Run admissions, staff, fees, results and communication from one place." },
  teacher: { image: teacherBg, title: "Teaching Workspace", text: "Take registers, enter marks, share resources and follow every class." },
  student: { image: schoolHero, title: "Learning Platform", text: "Your timetable, results, resources, fees and school notices, all in one place." },
  parent: { image: parentBg, title: "Parent Portal", text: "Follow your child's results, attendance and fees, and talk to the school." },
};

/** One sign-in for administrators, teachers, students and parents. Each screen admits only its own kind of account. */
const Login = ({ initialRole }: { initialRole?: Role }) => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Role>(() => {
    const r = initialRole ?? params.get("role");
    return ROLES.some((x) => x.value === r) ? (r as Role) : "student";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ id?: string; password?: string; form?: string }>({});
  const side = SIDE[role];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.id = "Enter your email address.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (next.id || next.password) return;
    setLoading(true);
    try { await login(email.trim(), password, role); }
    catch (err) { setErrors({ form: err instanceof AuthError ? err.message : "We could not sign you in. Check your details and try again." }); }
    finally { setLoading(false); }
  };

  const field = "h-14 w-full rounded-xl border bg-card pl-12 pr-4 text-sm text-foreground shadow-sm placeholder:text-muted-foreground transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <div className="flex min-h-screen bg-background p-0 lg:p-6">
      <div className="relative hidden w-1/2 overflow-hidden rounded-3xl lg:block">
        <AnimatePresence mode="wait">
          <motion.img key={side.image} src={side.image} alt="" className="absolute inset-0 h-full w-full object-cover"
            initial={{ opacity: 0, scale: 1.05 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} />
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/60 mix-blend-multiply" />
        <div className="absolute inset-0 bg-primary/30" />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          <Link to="/" className="flex items-center gap-3"><Logo className="h-10 w-10" /><span className="font-heading text-xl font-bold">Tech Oasis SMS</span></Link>
          <motion.div key={role} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="font-heading text-2xl font-semibold">Welcome To Tech Oasis</p>
            <h1 className="mt-1 font-heading text-5xl font-bold leading-tight">{side.title}</h1>
            <div className="mt-4 flex gap-1.5" aria-hidden><span className="h-1 w-12 rounded-full bg-white" /><span className="h-1 w-3 rounded-full bg-white/70" /></div>
            <p className="mt-5 max-w-md text-base text-white/85">{side.text}</p>
          </motion.div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 sm:p-12">
        <motion.div className="w-full max-w-lg" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
          <Link to="/" className="mb-8 flex items-center gap-3 lg:hidden"><Logo className="h-9 w-9" /><span className="font-heading text-lg font-bold">Tech Oasis <span className="text-primary">SMS</span></span></Link>

          <h2 id="login-title" className="font-heading text-4xl font-bold text-foreground"><span className="text-primary">Hi</span>, will you sign in now</h2>
          <div className="mt-3 flex gap-1.5" aria-hidden><span className="h-1 w-12 rounded-full bg-primary" /><span className="h-1 w-3 rounded-full bg-primary/50" /></div>
          <p className="mt-4 text-sm text-muted-foreground">New school? <Link to="/signup" className="font-semibold text-primary hover:underline">Sign up your school</Link></p>

          <div role="radiogroup" aria-label="Sign in as" className="mt-6 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
            {ROLES.map((r) => {
              const active = r.value === role;
              return (
                <button key={r.value} type="button" role="radio" aria-checked={active} aria-label={r.label} onClick={() => { setRole(r.value); setErrors({}); }}
                  className={`relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {active && <motion.span layoutId="role-pill" className="absolute inset-0 rounded-lg bg-primary shadow" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <r.icon className="relative h-4 w-4" aria-hidden /><span className="relative">{r.short}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={submit} noValidate aria-labelledby="login-title" className="mt-6 space-y-5">
            {errors.form && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errors.form}</p>}
            <div>
              <label htmlFor="email" className="mb-2 block text-sm text-muted-foreground">Email Address <span className="text-destructive">*</span></label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input id="email" type="email" autoComplete="email" placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.id} aria-describedby={errors.id ? "email-err" : undefined} className={`${field} ${errors.id ? "border-destructive" : "border-input"}`} />
              </div>
              {errors.id && <p id="email-err" className="mt-1 text-xs text-destructive">{errors.id}</p>}
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm text-muted-foreground">Password <span className="text-destructive">*</span></label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input id="password" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-err" : undefined} className={`${field} pr-12 ${errors.password ? "border-destructive" : "border-input"}`} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                  className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p id="password-err" className="mt-1 text-xs text-destructive">{errors.password}</p>}
              <div className="mt-2 text-right">
                <button type="button" onClick={() => navigate(`/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ""}`)} className="text-sm text-muted-foreground hover:text-primary">Forgot my password?</button>
              </div>
            </div>
            <motion.button type="submit" disabled={loading} whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…</> : "Login"}
            </motion.button>
          </form>
          <p className="mt-8 text-center text-xs text-muted-foreground">Signing in as a {ROLES.find((r) => r.value === role)?.label.toLowerCase()}. Each login opens only that kind of account.</p>
          <p className="mt-3 text-center text-xs text-muted-foreground">Running the platform? <Link to="/super-admin/login" className="font-semibold text-primary hover:underline">Platform admin login</Link></p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
