import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthCard, { authButton, authField } from "@/components/auth/AuthCard";
import { passwordResetAvailable, updatePassword } from "@/lib/db";

// Landing page for the reset link Supabase Auth emails. The link signs the
// person in for this one purpose; here they choose the new password.
const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!passwordResetAvailable) {
    return (
      <AuthCard title="Reset your password" subtitle="Password reset by email is not available on this server yet.">
        <p className="text-sm text-muted-foreground">Ask your school administrator to send you a new invitation.</p>
      </AuthCard>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
    } catch {
      setError("This reset link is invalid or has expired. Request a new one from the sign-in page.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Password changed" subtitle="You can now sign in with your new password.">
        <Link to="/dashboard" className={authButton}>Continue</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} noValidate className="mt-6 space-y-4">
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div>
          <label htmlFor="reset-pass" className="mb-1 block text-sm font-medium">New password</label>
          <input id="reset-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authField} />
        </div>
        <div>
          <label htmlFor="reset-confirm" className="mb-1 block text-sm font-medium">Confirm password</label>
          <input id="reset-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authField} />
        </div>
        <button type="submit" disabled={busy} className={authButton}>
          {busy ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Saving…</> : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
};

export default ResetPassword;
