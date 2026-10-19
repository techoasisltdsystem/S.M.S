import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AuthCard, { authButton, authField } from "@/components/auth/AuthCard";
import { useAuth } from "@/contexts/AuthContext";
import { mfaEnroll, mfaVerify } from "@/lib/db";

// Administrators must pass an authenticator-app code before their admin
// powers work; the database refuses them to a password-only session.
const MfaGate = () => {
  const { mfa, refreshMfa, logout } = useAuth();
  const [factor, setFactor] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mfa?.kind === "enroll" && !factor) {
      mfaEnroll().then(setFactor).catch((e: Error) => setError(e.message));
    }
  }, [mfa, factor]);

  const factorId = mfa?.kind === "challenge" ? mfa.factorId : factor?.factorId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    try {
      await mfaVerify(factorId, code);
      await refreshMfa();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setBusy(false);
    }
  };

  const enrolling = mfa?.kind === "enroll";
  return (
    <AuthCard
      title={enrolling ? "Set up two-step sign-in" : "Enter your security code"}
      subtitle={
        enrolling
          ? "Administrator accounts need an authenticator app. Scan this code with Google Authenticator, Microsoft Authenticator or similar."
          : "Open your authenticator app and enter the 6-digit code for Tech Oasis SMS."
      }
    >
      {enrolling && factor && (
        <div className="mb-5 text-center">
          <img src={factor.qrCode} alt="QR code for your authenticator app" className="mx-auto h-44 w-44 rounded bg-white p-2" />
          <p className="mt-2 break-all text-xs text-muted-foreground">Or type this key: {factor.secret}</p>
        </div>
      )}
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <div>
          <label htmlFor="mfa-code" className="mb-1 block text-sm font-medium">6-digit code</label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={authField} />
        </div>
        <button type="submit" disabled={busy || !factorId} className={authButton}>
          {busy ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Checking…</> : "Verify"}
        </button>
        <button type="button" onClick={() => void logout()} className="w-full text-sm text-muted-foreground underline-offset-2 hover:underline">
          Sign out
        </button>
      </form>
    </AuthCard>
  );
};

export default MfaGate;
