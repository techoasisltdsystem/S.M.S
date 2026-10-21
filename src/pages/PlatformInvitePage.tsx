import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABEL, type PlatformRole } from "@/lib/platformRoles";

interface Info { email: string; name: string; role: PlatformRole }

const post = async (path: string, body: unknown) => {
  const res = await fetch(`/api/billing/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
};

/** The page an invited administrator opens from their email: they choose their own password. */
const PlatformInvitePage = () => {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("This invitation link is not valid."); return; }
    post("platform-invite-info", { token }).then(setInfo).catch((e: Error) => setError(e.message));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    if (pw.a.length < 12) return setError("Use at least 12 characters.");
    if (pw.a !== pw.b) return setError("The two passwords do not match.");
    setBusy(true);
    try { await post("platform-invite-accept", { token, password: pw.a }); setDone(true); }
    catch (e2) { setError((e2 as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="mb-4 flex items-center gap-2 text-primary"><ShieldCheck className="h-6 w-6" aria-hidden /><h1 className="font-heading text-xl font-bold">Tech Oasis platform console</h1></div>
        {done ? (
          <>
            <p className="mb-4 text-sm">Your login is ready. Sign in with {info?.email} and the password you just chose.</p>
            <Button asChild className="w-full"><Link to="/super-admin/login">Go to the Super Admin login</Link></Button>
          </>
        ) : info ? (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <p className="text-sm text-muted-foreground">Hello {info.name}. You have been invited as <strong>{ROLE_LABEL[info.role]}</strong>. Choose your password to finish.</p>
            <div className="space-y-1.5"><Label htmlFor="iv-email">Sign-in email</Label><Input id="iv-email" value={info.email} disabled /></div>
            <div className="space-y-1.5"><Label htmlFor="iv-a">New password (12 or more characters)</Label><Input id="iv-a" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="iv-b">Confirm password</Label><Input id="iv-b" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !pw.a}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Create my login</Button>
          </form>
        ) : error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : <p className="text-sm text-muted-foreground">Checking your invitation…</p>}
      </div>
    </main>
  );
};

export default PlatformInvitePage;
