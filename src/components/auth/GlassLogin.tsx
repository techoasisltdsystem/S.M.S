import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import Logo from "@/components/ui/logo";
import { LOGIN_ROLES, GLASS_THEMES, GlassRole } from "./loginRoles";

interface GlassLoginProps {
  role: GlassRole;
  // When provided, a role switcher is shown inside the card.
  onRoleChange?: (role: UserRole) => void;
}

// Full-screen photo with a frosted sign-in card; used for the administrator,
// teacher and parent sign-in screens, each with its own image and colours.
const GlassLogin = ({ role, onRoleChange }: GlassLoginProps) => {
  const { login } = useAuth();
  const { schoolConfig } = useSchool();
  const t = GLASS_THEMES[role];
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
  const field = `h-12 w-full rounded-md border bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 ${t.ring}`;

  return (
    <div className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 lg:justify-end lg:px-[8vw] ${t.page}`}>
      <img
        key={role}
        src={t.image}
        alt=""
        aria-hidden
        className={`absolute inset-0 h-full w-full object-cover ${t.mirror ? "-scale-x-100" : ""}`}
      />
      <div className={`absolute inset-0 bg-gradient-to-br ${t.overlay}`} aria-hidden />

      <div className={`relative z-10 mr-auto hidden max-w-sm self-end pb-6 text-sm lg:block ${t.muted}`}>
        <p className="mb-1 flex items-center gap-2 font-medium text-white">
          <t.sideIcon className="h-4 w-4" aria-hidden /> {t.sideTitle}
        </p>
        <p>{t.sideText}</p>
        {contact && <p className={`mt-3 ${t.muted}`}>{contact}</p>}
      </div>

      <motion.form
        key={role}
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className={`relative z-10 w-full max-w-md rounded-xl border border-white/25 p-7 text-white shadow-2xl backdrop-blur-md sm:p-9 ${t.card}`}
        aria-labelledby="glass-login-title"
      >
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo className="h-10 w-10" />
          <span className="font-heading text-xl font-bold tracking-wide">
            Tech Oasis <span className={t.accent}>SMS</span>
          </span>
        </div>

        {onRoleChange && (
          <div role="radiogroup" aria-label="Sign in as" className="mb-6 grid grid-cols-4 gap-1 rounded-lg bg-black/20 p-1">
            {LOGIN_ROLES.map((r) => {
              const active = r.value === role;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onRoleChange(r.value)}
                  className={`flex flex-col items-center gap-1 rounded-md px-1 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-white/70 ${
                    active ? "bg-white text-slate-900 shadow" : "text-white/85 hover:bg-white/15"
                  }`}
                >
                  <r.icon className="h-4 w-4" aria-hidden />
                  {r.short}
                </button>
              );
            })}
          </div>
        )}

        <h1 id="glass-login-title" className="font-heading text-2xl font-bold">
          {t.title}
        </h1>
        <p className={`mb-6 mt-1 text-sm ${t.muted}`}>{t.subtitle}</p>

        {errors.form && (
          <p role="alert" className="mb-4 rounded-md bg-red-500/25 px-3 py-2 text-sm text-white">
            {errors.form}
          </p>
        )}

        <div className="mb-4">
          <label htmlFor="glass-id" className="sr-only">
            Email or username
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="glass-id"
              type="text"
              autoComplete="username"
              placeholder="Email or username"
              value={id}
              onChange={(e) => setId(e.target.value)}
              aria-invalid={!!errors.id}
              aria-describedby={errors.id ? "glass-id-err" : undefined}
              className={`${field} ${errors.id ? "border-red-400" : "border-transparent"}`}
            />
          </div>
          {errors.id && (
            <p id="glass-id-err" className="mt-1 text-xs text-red-200">
              {errors.id}
            </p>
          )}
        </div>

        <div className="mb-2">
          <label htmlFor="glass-pass" className="sr-only">
            Password
          </label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="glass-pass"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "glass-pass-err" : undefined}
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
            <p id="glass-pass-err" className="mt-1 text-xs text-red-200">
              {errors.password}
            </p>
          )}
        </div>

        <div className="mb-5 text-right">
          <button
            type="button"
            onClick={() => setHelp((h) => !h)}
            aria-expanded={help}
            className={`text-sm underline-offset-2 hover:text-white hover:underline focus:outline-none focus:ring-2 focus:ring-white/70 ${t.muted}`}
          >
            Forgot password?
          </button>
        </div>
        {help && (
          <p className="mb-5 rounded-md bg-white/15 px-3 py-2 text-sm text-white">
            Password recovery by email is not set up yet. Please contact your school administrator{contact ? ` (${contact})` : ""} to reset your password.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-md text-base font-semibold tracking-wide text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${t.button}`}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Signing in…
            </>
          ) : (
            "LOGIN"
          )}
        </button>

        <p className={`mt-4 text-center text-xs ${t.muted}`}>Demo mode: sign-in is not verified against a password yet.</p>
        {!onRoleChange && (
          <p className={`mt-3 text-center text-sm ${t.muted}`}>
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

export default GlassLogin;
