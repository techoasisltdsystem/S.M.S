import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, MailCheck } from "lucide-react";
import AuthCard, { authButton, authField } from "@/components/auth/AuthCard";
import { dbProvider, requestPasswordReset } from "@/lib/db";

/** "I forgot my password": asks for the account's email and sends a single-use reset link. */
const ForgotPassword = () => {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter the email address of your account.");
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not send the reset email. Try again later.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="If that address belongs to an account, we have sent a link to choose a new password.">
        <div className="mt-6 space-y-4 text-sm text-muted-foreground">
          <p className="flex items-start gap-3 rounded-lg bg-muted p-3"><MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /> The link works once and expires after an hour. Look in your spam folder if it does not arrive.</p>
          {import.meta.env.DEV && dbProvider === "local" && <p className="rounded-lg border border-dashed border-border p-3 text-xs">Development only: with no email service connected, the link is printed in the dev server&apos;s console window.</p>}
          <button type="button" onClick={() => setSent(false)} className="text-primary hover:underline">Use a different email</button>
          <Link to="/login" className={authButton}>Back to sign in</Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one.">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor="fp-email" className="mb-1.5 block text-sm font-medium">Email address</label>
          <input id="fp-email" type="email" autoComplete="email" className={authField} value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "fp-error" : undefined} />
        </div>
        {error && <p id="fp-error" role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={busy} className={authButton}>{busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />} Send reset link</button>
        <p className="text-center text-sm"><Link to="/login" className="text-muted-foreground hover:text-foreground hover:underline">← Back to sign in</Link></p>
      </form>
    </AuthCard>
  );
};

export default ForgotPassword;
