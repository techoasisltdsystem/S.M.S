import { useState } from "react";
import { Check, Copy, KeyRound, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { dbProvider } from "@/lib/db";
import { rpc } from "@/lib/rpc";

/** Setting a password or login email directly is available on the laptop sign-in; hosted providers use the emailed reset link. */
export const directLoginManagement = dbProvider === "local";

export interface LoginTarget { schoolId: string; profileId: string; name: string; email: string }

/**
 * Change another person's login. The manager never types a password: the system makes a strong temporary one,
 * shows it once, signs the person out everywhere, and the person chooses their own at their next sign-in.
 */
const LoginAccessDialog = ({ target, mode, onClose }: { target: LoginTarget | null; mode: "password" | "email"; onClose: () => void }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => { setTemp(null); setCopied(false); setEmail(""); setError(null); onClose(); };

  const setPassword = async () => {
    if (!target) return;
    setBusy(true); setError(null);
    try { setTemp(await rpc<string>("local_admin_set_password", { _school: target.schoolId, _profile: target.profileId })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not change the password."); }
    finally { setBusy(false); }
  };

  const setLoginEmail = async () => {
    if (!target) return;
    setBusy(true); setError(null);
    try {
      await rpc("local_admin_set_email", { _school: target.schoolId, _profile: target.profileId, _email: email.trim() });
      toast({ title: "Login email changed", description: `${target.name} now signs in with ${email.trim()}. They have been signed out everywhere.` });
      close();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change the email."); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!temp) return;
    try { await navigator.clipboard.writeText(temp); setCopied(true); } catch { toast({ title: "Copy failed", description: "Select the password and copy it by hand.", variant: "destructive" }); }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o && !busy) close(); }}>
      <DialogContent>
        {target && mode === "password" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-heading"><KeyRound className="h-5 w-5 text-primary" aria-hidden /> Temporary password</DialogTitle>
              <DialogDescription>{temp ? "Pass this on to the person now." : `Create a new temporary password for ${target.name} (${target.email}).`}</DialogDescription>
            </DialogHeader>
            {!temp ? (
              <>
                <p className="text-sm text-muted-foreground">Their current password stops working at once and they are signed out of every device. At their next sign-in they must choose their own password. The new password is shown once, here.</p>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
                <DialogFooter><Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
                  <Button onClick={setPassword} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Create temporary password</Button></DialogFooter>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4">
                  <code className="select-all font-mono text-lg font-semibold tracking-wide" aria-label="Temporary password">{temp}</code>
                  <Button size="sm" variant="outline" onClick={copy}>{copied ? <Check className="mr-1 h-4 w-4" aria-hidden /> : <Copy className="mr-1 h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy"}</Button>
                </div>
                <p className="text-sm text-muted-foreground">This is the only time it is shown. It is not stored anywhere you can read it, and the audit log records only that a temporary password was set. Give it to {target.name} privately.</p>
                <DialogFooter><Button onClick={close}>Done</Button></DialogFooter>
              </>
            )}
          </>
        )}
        {target && mode === "email" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-heading"><Mail className="h-5 w-5 text-primary" aria-hidden /> Change login email</DialogTitle>
              <DialogDescription>{target.name} currently signs in with {target.email}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5"><Label htmlFor="la-email">New login email</Label><Input id="la-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">They keep their password but are signed out everywhere and must sign in with the new address.</p>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter><Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
              <Button onClick={setLoginEmail} disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Change email</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LoginAccessDialog;
