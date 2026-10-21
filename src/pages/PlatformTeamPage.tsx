import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, ShieldCheck, ShieldOff, UserPlus, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { stamp } from "@/hooks/useBilling";
import { authHeader } from "@/lib/db";
import { rpc } from "@/lib/rpc";

interface Admin { user_id: string; email: string; full_name: string | null; created_at: string; created_by_email: string | null; disabled_at: string | null; is_you: boolean }
interface Created { email: string; password: string; name: string }

/** The Super Admin team: who can sign in to this console, add another, switch one off. */
const PlatformTeamPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["platform-admins"], queryFn: () => rpc<Admin[]>("platform_admins_list") });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", email: "" });
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const auth = await authHeader();
      const res = await fetch("/api/billing/platform-admin", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(f) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not add the Super Admin.");
      return body as Created;
    },
    onSuccess: (c) => { setCreated(c); setError(null); void qc.invalidateQueries({ queryKey: ["platform-admins"] }); },
    onError: (e) => setError(errMsg(e)),
  });
  const toggle = useMutation({
    mutationFn: (a: Admin) => rpc("platform_admin_set_disabled", { _user: a.user_id, _disabled: !a.disabled_at }),
    onSuccess: (_d, a) => { toast({ title: a.disabled_at ? "Access restored" : "Access switched off", description: a.email }); void qc.invalidateQueries({ queryKey: ["platform-admins"] }); },
    onError: (e) => toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }),
  });

  const close = () => { setAdding(false); setCreated(null); setCopied(false); setError(null); setF({ name: "", email: "" }); };
  const copy = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(`Email: ${created.email}\nTemporary password: ${created.password}`); setCopied(true); }
    catch { toast({ title: "Copy failed", description: "Select the details and copy them by hand.", variant: "destructive" }); }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Super Admin team</h1>
            <p className="text-sm text-muted-foreground">Everyone who can sign in to this console. Each person has their own login, so actions in the audit trail name the right person.</p>
          </div>
          <Button onClick={() => setAdding(true)}><UserPlus className="mr-1 h-4 w-4" aria-hidden /> Add a Super Admin</Button>
        </div>
        <Panel title="Super Admins" icon={Users}>
          {list.isLoading && <LoadingRows rows={3} />}
          {list.isError && <ErrorBox message={errMsg(list.error)} onRetry={() => list.refetch()} />}
          {list.data && list.data.length === 0 && <EmptyState icon={Users} title="No Super Admins" />}
          <ul className="divide-y divide-border">
            {(list.data ?? []).map((a) => (
              <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{a.full_name ?? a.email}</span>{a.is_you && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">You</span>}
                  {a.disabled_at && <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Switched off</span>}
                  <span className="block text-xs text-muted-foreground">{a.email} · added {stamp(a.created_at)}{a.created_by_email ? ` by ${a.created_by_email}` : ""}</span>
                </span>
                {!a.is_you && (
                  <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(a)}>
                    {a.disabled_at ? <><ShieldCheck className="mr-1 h-4 w-4" aria-hidden /> Restore access</> : <><ShieldOff className="mr-1 h-4 w-4" aria-hidden /> Switch off</>}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">You cannot switch yourself off, and at least one Super Admin always stays active. Change your own password and sign-in email on your account page.</p>
        </Panel>
      </div>

      <Dialog open={adding} onOpenChange={(o) => { if (!o && !add.isPending) close(); }}>
        <DialogContent>
          {!created ? (
            <form onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}>
              <DialogHeader>
                <DialogTitle>Add a Super Admin</DialogTitle>
                <DialogDescription>They get their own login with full access to this console. A strong temporary password is made and shown once; they should choose their own after signing in.</DialogDescription>
              </DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="pa-name">Full name</Label><Input id="pa-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></div>
                <div className="space-y-1.5"><Label htmlFor="pa-email">Sign-in email</Label><Input id="pa-email" type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={add.isPending}>Cancel</Button>
                <Button type="submit" disabled={add.isPending || f.name.trim().length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())}>{add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Create login</Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Login created for {created.name}</DialogTitle>
                <DialogDescription>Give these details to them privately. The password is shown only now.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
                <p><span className="text-muted-foreground">Email:</span> <code className="select-all font-mono font-semibold">{created.email}</code></p>
                <p><span className="text-muted-foreground">Temporary password:</span> <code className="select-all font-mono font-semibold">{created.password}</code></p>
                <p className="text-xs text-muted-foreground">They sign in at the Super Admin login and should change the password on their account page straight away.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={copy}>{copied ? <Check className="mr-1 h-4 w-4" aria-hidden /> : <Copy className="mr-1 h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy details"}</Button>
                <Button onClick={close}>Done</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PlatformTeamPage;
