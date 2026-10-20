import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import AuthCard, { authButton, authField } from "@/components/auth/AuthCard";
import { AuthError, passwordResetAvailable, requestPasswordReset } from "@/lib/db";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Separate sign-in for Tech Oasis platform administrators. The address is a convenience, not the
 * protection: the database decides who is a platform administrator, and a school login (admin,
 * teacher, parent, student) cannot open this area.
 */
const SuperAdminLogin = () => {
  const { platformLogin, isAuthenticated, isPlatform, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);

  if (!loading && isAuthenticated) return <Navigate to={isPlatform ? "/platform" : "/dashboard"} replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) return setError("Enter your email and password.");
    setBusy(true); setError(null);
    try { await platformLogin(email.trim(), password); }
    catch (err) { setError(err instanceof AuthError ? err.message : "We could not sign you in. Check your details and try again."); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim()) return setHelp("Enter your email above, then choose Forgot password again.");
    try { await requestPasswordReset(email.trim()); setHelp("If that address belongs to a platform administrator, a reset link has been sent. It works once and expires in an hour."); }
    catch { setHelp("We could not send the reset email right now."); }
  };

  return (
    <AuthCard title="Platform administration" subtitle="For Tech Oasis administrators only. School staff, parents and students sign in from the main login.">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4" aria-describedby="sa-note">
        <div>
          <label htmlFor="sa-email" className="mb-1.5 block text-sm font-medium">Email</label>
          <input id="sa-email" type="email" autoComplete="username" className={authField} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sa-password" className="mb-1.5 block text-sm font-medium">Password</label>
          <div className="relative">
            <input id="sa-password" type={show ? "text" : "password"} autoComplete="current-password" className={`${authField} pr-11`} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className={authButton}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ShieldCheck className="h-5 w-5" aria-hidden />} Sign in to the console
        </button>
        {passwordResetAvailable && (
          <div className="text-center">
            <button type="button" onClick={forgot} className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Forgot password?</button>
          </div>
        )}
        {help && <p className="rounded-md bg-muted px-3 py-2 text-sm">{help}</p>}
        <p id="sa-note" className="text-center text-xs text-muted-foreground">Sign-in attempts are recorded. Repeated failures lock the account for a while.</p>
      </form>
      <p className="mt-6 text-center text-sm"><Link to="/login" className="text-muted-foreground hover:text-foreground hover:underline">← Back to school login</Link></p>
    </AuthCard>
  );
};

export default SuperAdminLogin;
