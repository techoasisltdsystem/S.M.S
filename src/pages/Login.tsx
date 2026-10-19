import { useState } from "react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import schoolHero from "@/assets/school-hero.jpg";
import Logo from "@/components/ui/logo";
import GlassLogin from "@/components/auth/GlassLogin";
import { LOGIN_ROLES as ROLES } from "@/components/auth/loginRoles";

const Login = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
  // /login?role=teacher opens straight on that role; students are the default.
  const [role, setRole] = useState<UserRole>(() => {
    const r = params.get("role");
    return ROLES.some((x) => x.value === r) ? (r as UserRole) : "student";
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [help, setHelp] = useState(false);
  const [errors, setErrors] = useState<{ id?: string; password?: string; form?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!email.trim()) next.id = "Enter your email or username.";
    if (!password) next.password = "Enter your password.";
    setErrors(next);
    if (next.id || next.password) return;

    setLoading(true);
    try {
      await login(email.trim(), password, role);
    } catch {
      setErrors({ form: "We could not sign you in. Check your details and try again." });
    } finally {
      setLoading(false);
    }
  };

  // Administrator, teacher and parent each get their own full-screen sign-in;
  // the student view keeps the original split layout below.
  if (role !== "student") return <GlassLogin role={role} onRoleChange={setRole} />;

  const field =
    "h-12 w-full rounded-md border bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="flex min-h-screen">
      {/* Left - Hero Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img src={schoolHero} alt="School campus" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar/90 to-sidebar/70" />
        <div className="relative z-10 flex flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <Logo className="w-10 h-10" />
            <span className="font-heading text-xl font-bold text-sidebar-primary-foreground">
              Tech Oasis <span className="text-sidebar-primary">SMS</span>
            </span>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h1 className="font-heading text-4xl font-bold text-sidebar-primary-foreground leading-tight mb-4">
              Empowering Education <br />
              <span className="text-sidebar-primary">Through Technology</span>
            </h1>
            <p className="text-sidebar-foreground text-lg max-w-md">
              Streamline your school's administration with our comprehensive management platform.
            </p>
          </motion.div>
          <p className="text-sidebar-foreground/60 text-sm">
            © 2026 Tech Oasis Web Solutions. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-background">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <Logo className="w-9 h-9" />
            <span className="font-heading text-lg font-bold text-foreground">
              Tech Oasis <span className="text-primary">SMS</span>
            </span>
          </div>

          {/* Same role switcher as the other sign-in screens */}
          <div role="radiogroup" aria-label="Sign in as" className="mb-8 grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
            {ROLES.map((r) => {
              const active = r.value === role;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setRole(r.value)}
                  className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                    active ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                >
                  <r.icon className="h-4 w-4" aria-hidden />
                  {r.short}
                </button>
              );
            })}
          </div>

          <h2 id="student-login-title" className="font-heading text-2xl font-bold text-foreground mb-1">Student sign in</h2>
          <p className="text-muted-foreground mb-6">Your timetable, results and school notices.</p>

          <form onSubmit={handleSubmit} noValidate aria-labelledby="student-login-title">
            {errors.form && (
              <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.form}
              </p>
            )}

            <div className="mb-4">
              <label htmlFor="email" className="sr-only">Email or username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="email"
                  type="text"
                  autoComplete="username"
                  placeholder="Email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.id}
                  aria-describedby={errors.id ? "email-err" : undefined}
                  className={`${field} ${errors.id ? "border-destructive" : "border-input"}`}
                />
              </div>
              {errors.id && <p id="email-err" className="mt-1 text-xs text-destructive">{errors.id}</p>}
            </div>

            <div className="mb-2">
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? "password-err" : undefined}
                  className={`${field} pr-11 ${errors.password ? "border-destructive" : "border-input"}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p id="password-err" className="mt-1 text-xs text-destructive">{errors.password}</p>}
            </div>

            <div className="mb-5 text-right">
              <button
                type="button"
                onClick={() => setHelp((h) => !h)}
                aria-expanded={help}
                className="text-sm text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Forgot password?
              </button>
            </div>
            {help && (
              <p className="mb-5 rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                Password recovery by email is not set up yet. Please contact your school administrator to reset your password.
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-semibold tracking-wide text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…
                </>
              ) : (
                "LOGIN"
              )}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Demo mode: sign-in is not verified against a password yet.
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
