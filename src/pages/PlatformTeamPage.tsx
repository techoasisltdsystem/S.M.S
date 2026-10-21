import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2, Mail, MailPlus, ShieldCheck, ShieldOff, Trash2, UserCog, UserPlus, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { stamp } from "@/hooks/useBilling";
import { authHeader, requestPasswordReset } from "@/lib/db";
import { PERMISSIONS, ROLE_LABEL, ROLE_PRESET, ROLE_TEXT, type PlatformRole } from "@/lib/platformRoles";
import { rpc } from "@/lib/rpc";

interface Admin { user_id: string; email: string; full_name: string | null; created_at: string; created_by_email: string | null; disabled_at: string | null; is_you: boolean; role: PlatformRole; permissions: string[] }
interface Invite { id: string; email: string; full_name: string; role: PlatformRole; permissions: string[]; created_at: string; last_sent_at: string | null; expires_at: string; state: "pending" | "accepted" | "revoked" | "expired"; invited_by_email: string | null }
interface InviteResult { emailed: boolean; email?: string; link?: string }

const ROLES = Object.keys(ROLE_LABEL) as PlatformRole[];

/** Role picker plus the permissions it grants. A Super Admin has everything, so the list is only shown for the other roles. */
const AccessEditor = ({ role, perms, onChange }: { role: PlatformRole; perms: string[]; onChange: (role: PlatformRole, perms: string[]) => void }) => (
  <div className="space-y-3">
    <div className="space-y-1.5">
      <Label htmlFor="ae-role">Role</Label>
      <select id="ae-role" value={role} onChange={(e) => onChange(e.target.value as PlatformRole, ROLE_PRESET[e.target.value as PlatformRole])}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">{ROLE_TEXT[role]}</p>
    </div>
    {role !== "super_admin" && (
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-medium">Permissions</legend>
        {PERMISSIONS.filter((p) => p.key !== "admins.manage").map((p) => (
          <label key={p.key} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={perms.includes(p.key)}
              onChange={(e) => onChange(role, e.target.checked ? [...perms, p.key] : perms.filter((k) => k !== p.key))} />
            <span><span className="font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.text}</span></span>
          </label>
        ))}
      </fieldset>
    )}
  </div>
);

/** The platform team: who can sign in to this console, what each may do, and invitations that have not been used yet. */
const PlatformTeamPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const admins = useQuery({ queryKey: ["platform-admins"], queryFn: () => rpc<Admin[]>("platform_admins_list") });
  const invites = useQuery({ queryKey: ["platform-invites"], queryFn: () => rpc<Invite[]>("platform_invites_list") });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["platform-admins"] }); void qc.invalidateQueries({ queryKey: ["platform-invites"] }); };

  const [inviting, setInviting] = useState(false);
  const [f, setF] = useState<{ name: string; email: string; role: PlatformRole; perms: string[] }>({ name: "", email: "", role: "support_admin", perms: ROLE_PRESET.support_admin });
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<Admin | null>(null);
  const [edit, setEdit] = useState<{ role: PlatformRole; perms: string[] }>({ role: "support_admin", perms: [] });

  const call = async (body: Record<string, unknown>): Promise<InviteResult> => {
    const auth = await authHeader();
    const res = await fetch("/api/billing/platform-invite", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "That did not work.");
    return j as InviteResult;
  };
  const invite = useMutation({
    mutationFn: () => call({ action: "create", email: f.email, name: f.name, role: f.role, permissions: f.role === "super_admin" ? [] : f.perms }),
    onSuccess: (r) => { setResult(r); setError(null); refresh(); },
    onError: (e) => setError(errMsg(e)),
  });
  const resend = useMutation({
    mutationFn: (i: Invite) => call({ action: "resend", id: i.id }),
    onSuccess: (r) => { if (r.emailed) toast({ title: "Invitation sent again", description: r.email }); else { setResult(r); setInviting(true); } refresh(); },
    onError: (e) => toast({ title: "Not sent", description: errMsg(e), variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: (i: Invite) => call({ action: "revoke", id: i.id }),
    onSuccess: () => { toast({ title: "Invitation revoked" }); refresh(); },
    onError: (e) => toast({ title: "Not revoked", description: errMsg(e), variant: "destructive" }),
  });
  const toggle = useMutation({
    mutationFn: (a: Admin) => rpc("platform_admin_set_disabled", { _user: a.user_id, _disabled: !a.disabled_at }),
    onSuccess: (_d, a) => { toast({ title: a.disabled_at ? "Access restored" : "Access switched off", description: a.email }); refresh(); },
    onError: (e) => toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }),
  });
  const save = useMutation({
    mutationFn: () => rpc("platform_admin_set_access", { _user: editing!.user_id, _role: edit.role, _perms: edit.role === "super_admin" ? [] : edit.perms }),
    onSuccess: () => { toast({ title: "Access updated", description: editing?.email }); setEditing(null); refresh(); },
    onError: (e) => toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }),
  });
  const reset = useMutation({
    mutationFn: (a: Admin) => requestPasswordReset(a.email),
    onSuccess: (_d, a) => toast({ title: "Password reset email requested", description: `If email is set up, ${a.email} receives a one-time link. You never see their password.` }),
    onError: (e) => toast({ title: "Reset not sent", description: errMsg(e), variant: "destructive" }),
  });

  const closeInvite = () => { setInviting(false); setResult(null); setCopied(false); setError(null); setF({ name: "", email: "", role: "support_admin", perms: ROLE_PRESET.support_admin }); };
  const copy = async () => {
    if (!result?.link) return;
    try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { toast({ title: "Copy failed", description: "Select the link and copy it by hand.", variant: "destructive" }); }
  };
  const open = (a: Admin) => { setEditing(a); setEdit({ role: a.role, perms: a.permissions }); };
  const pending = (invites.data ?? []).filter((i) => i.state === "pending" || i.state === "expired");

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Platform administrators</h1>
            <p className="text-sm text-muted-foreground">Everyone who can sign in to this console and what each person may do. Each has their own login, so the audit trail names the right person.</p>
          </div>
          <Button onClick={() => setInviting(true)}><UserPlus className="mr-1 h-4 w-4" aria-hidden /> Invite an administrator</Button>
        </div>

        <Panel title="Administrators" icon={Users}>
          {admins.isLoading && <LoadingRows rows={3} />}
          {admins.isError && <ErrorBox message={errMsg(admins.error)} onRetry={() => admins.refetch()} />}
          {admins.data && admins.data.length === 0 && <EmptyState icon={Users} title="No administrators" />}
          <ul className="divide-y divide-border">
            {(admins.data ?? []).map((a) => (
              <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{a.full_name ?? a.email}</span>
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{ROLE_LABEL[a.role]}</span>
                  {a.is_you && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">You</span>}
                  {a.disabled_at && <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Switched off</span>}
                  <span className="block text-xs text-muted-foreground">{a.email} · added {stamp(a.created_at)}{a.created_by_email ? ` by ${a.created_by_email}` : ""}</span>
                </span>
                {!a.is_you && (
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => open(a)}><UserCog className="mr-1 h-4 w-4" aria-hidden /> Access</Button>
                    <Button size="sm" variant="outline" disabled={reset.isPending} onClick={() => reset.mutate(a)}><KeyRound className="mr-1 h-4 w-4" aria-hidden /> Send password reset</Button>
                    <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(a)}>
                      {a.disabled_at ? <><ShieldCheck className="mr-1 h-4 w-4" aria-hidden /> Restore</> : <><ShieldOff className="mr-1 h-4 w-4" aria-hidden /> Switch off</>}
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">You cannot change or switch off your own access, and at least one Super Admin always stays active. Passwords are never shown: people choose their own, and a reset sends them a one-time link.</p>
        </Panel>

        <Panel title={`Invitations${pending.length ? ` · ${pending.length} waiting` : ""}`} icon={Mail}>
          {invites.isLoading && <LoadingRows rows={2} />}
          {invites.isError && <ErrorBox message={errMsg(invites.error)} onRetry={() => invites.refetch()} />}
          {invites.data && pending.length === 0 && <p className="text-sm text-muted-foreground">No invitations are waiting.</p>}
          <ul className="divide-y divide-border">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{i.full_name}</span>
                  <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{ROLE_LABEL[i.role]}</span>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${i.state === "expired" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{i.state === "expired" ? "Expired" : "Waiting"}</span>
                  <span className="block text-xs text-muted-foreground">{i.email} · sent {stamp(i.last_sent_at ?? i.created_at)} · expires {stamp(i.expires_at)}</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate(i)}><MailPlus className="mr-1 h-4 w-4" aria-hidden /> Resend</Button>
                  <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => revoke.mutate(i)}><Trash2 className="mr-1 h-4 w-4" aria-hidden /> Revoke</Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Dialog open={inviting} onOpenChange={(o) => { if (!o && !invite.isPending) closeInvite(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {!result ? (
            <form onSubmit={(e) => { e.preventDefault(); setError(null); invite.mutate(); }}>
              <DialogHeader>
                <DialogTitle>Invite an administrator</DialogTitle>
                <DialogDescription>They get an email with a one-time link and choose their own password. You choose what they can do.</DialogDescription>
              </DialogHeader>
              <div className="my-4 space-y-4">
                <div className="space-y-1.5"><Label htmlFor="pa-name">Full name</Label><Input id="pa-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></div>
                <div className="space-y-1.5"><Label htmlFor="pa-email">Sign-in email</Label><Input id="pa-email" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
                <AccessEditor role={f.role} perms={f.perms} onChange={(role, perms) => setF({ ...f, role, perms })} />
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeInvite} disabled={invite.isPending}>Cancel</Button>
                <Button type="submit" disabled={invite.isPending || f.name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())}>{invite.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send invitation</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{result.emailed ? "Invitation sent" : "Invitation created"}</DialogTitle>
                <DialogDescription>{result.emailed ? `An email with a one-time link went to ${result.email}.` : "Email could not be sent from this server, so send this one-time link to them yourself. It works once and expires in 7 days."}</DialogDescription>
              </DialogHeader>
              {!result.emailed && result.link && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
                  <code className="min-w-0 flex-1 select-all break-all font-mono">{result.link}</code>
                  <Button size="sm" variant="outline" onClick={copy}>{copied ? <Check className="mr-1 h-4 w-4" aria-hidden /> : <Copy className="mr-1 h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy"}</Button>
                </div>
              )}
              <DialogFooter><Button onClick={closeInvite}>Done</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o && !save.isPending) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Access for {editing?.full_name ?? editing?.email}</DialogTitle><DialogDescription>{editing?.email}</DialogDescription></DialogHeader>
          <AccessEditor role={edit.role} perms={edit.perms} onChange={(role, perms) => setEdit({ role, perms })} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={save.isPending}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PlatformTeamPage;
