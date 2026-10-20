import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import AuthCard, { authButton, authField } from "@/components/auth/AuthCard";
import { acceptInvitation, dbProvider } from "@/lib/db";

// Opened from the link a school administrator shares. The person chooses a
// password; the database checks the token, its expiry and the email it was sent to.
const AcceptInvite = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("This link is missing its invitation code. Ask for a new invitation.");
    if (dbProvider !== "local" && !email.trim()) return setError("Enter the email address the invitation was sent to.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await acceptInvitation(token, email.trim(), password);
      // Reload so the session and school access are read fresh from the server.
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not accept this invitation.");
      setBusy(false);
    }
  };

  return (
    <AuthCard title="Accept your invitation" subtitle="Choose a password to finish setting up your school account.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {dbProvider !== "local" && (
          <div>
            <label htmlFor="invite-email" className="mb-1 block text-sm font-medium">Email address</label>
            <input id="invite-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={authField} />
          </div>
        )}
        <div>
          <label htmlFor="invite-pass" className="mb-1 block text-sm font-medium">New password</label>
          <input id="invite-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={authField} />
          <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="invite-confirm" className="mb-1 block text-sm font-medium">Confirm password</label>
          <input id="invite-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={authField} />
        </div>
        <button type="submit" disabled={busy} className={authButton}>
          {busy ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Setting up…</> : "Accept and sign in"}
        </button>
        <p className="text-center text-sm text-muted-foreground">
          Already set up? <Link to="/login" className="font-medium text-primary underline-offset-2 hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthCard>
  );
};

export default AcceptInvite;
