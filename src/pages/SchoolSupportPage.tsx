import { useState } from "react";
import { CheckCircle2, CreditCard, KeyRound, LifeBuoy, Loader2, Plus, XCircle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import SupportThread, { StatusPill } from "@/components/support/SupportThread";
import { AccessPill } from "@/pages/PlatformSupportPage";
import BillingPanel, { StatePill } from "@/components/billing/BillingPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { FEATURES, useAccessGrants, useConsoleActions, useMySubscription, useSubscriptionHistory, useSupportRequests } from "@/hooks/usePlatformConsole";
import { cn } from "@/lib/utils";

const day = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

const Meter = ({ label, used, limit }: { label: string; used: number; limit: number | null }) => {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="font-medium">{used}{limit ? ` of ${limit}` : " (no limit)"}</span></div>
      {limit && (
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} used`}>
          <div className={cn("h-full rounded-full", pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
};

/** School administrator: plan and limits, support requests, and support access approvals. */
const SchoolSupportPage = ({ view }: { view: "subscription" | "support" }) => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const schoolId = user?.schoolId ?? "";
  const allowed = view === "subscription" ? user?.role === "admin" : can("staff.manage");
  const sub = useMySubscription(schoolId, allowed && view === "subscription");
  const history = useSubscriptionHistory(allowed && view === "subscription" ? schoolId : null);
  const requests = useSupportRequests(schoolId, null, allowed && view === "support");
  const grants = useAccessGrants(schoolId, allowed && view === "support");
  const { createRequest, decideAccess, endAccess } = useConsoleActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", body: "", priority: "normal" });
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");

  if (!allowed) {
    return <DashboardLayout><EmptyState icon={LifeBuoy} title="School administrators only" text="Ask your school administrator for help." /></DashboardLayout>;
  }
  const s = sub.data;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-4">
        {view === "subscription" ? (
          <>
            <div>
              <h1 className="font-heading text-2xl font-bold">Plan and billing</h1>
              <p className="text-sm text-muted-foreground">Your school's plan, renewal date, what it includes and how much of it you use. Renew or change package below.</p>
            </div>
            {sub.isLoading && <LoadingRows rows={3} />}
            {sub.isError && <ErrorBox message={errMsg(sub.error)} onRetry={() => sub.refetch()} />}
            {s && !s.managed && <EmptyState icon={CreditCard} title="No plan on record" text="Your school is not on a managed plan." />}
            {s?.managed && s.plan && (
              <>
                {s.state !== "ok" && (
                  <p role="alert" className={cn("rounded-xl border px-4 py-3 text-sm", s.state === "blocked" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-warning/30 bg-warning/10 text-warning")}>
                    {s.state === "blocked"
                      ? "Your subscription has lapsed, so the school is read-only: people can view records but not change them. Renew below to restore full access; nothing has been deleted."
                      : `Your subscription is due for renewal. Everything keeps working for a ${s.grace_days}-day grace period; renew to avoid the school becoming read-only.`}
                  </p>
                )}
                <Panel title={s.plan.name} icon={CreditCard}>
                  <p className="text-sm text-muted-foreground">{s.plan.description}</p>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <p><span className="text-muted-foreground">Status:</span> <StatePill label={s.label ?? s.status ?? "none"} /></p>
                    <p><span className="text-muted-foreground">{s.status === "trial" ? "Trial ends" : "Paid until"}:</span> {day(s.status === "trial" ? s.trial_ends_on : s.current_period_end)}</p>
                    <p><span className="text-muted-foreground">Price:</span> GH₵{Number(s.plan.monthly_price).toLocaleString()} / month{s.plan.annual_price ? ` or GH₵${Number(s.plan.annual_price).toLocaleString()} / year` : ""}</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    <Meter label="Students" used={s.usage!.students} limit={s.plan.student_limit} />
                    <Meter label="Staff accounts" used={s.usage!.staff} limit={s.plan.staff_limit} />
                  </div>
                  <ul className="mt-4 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                    {FEATURES.map((f) => (
                      <li key={f.key} className="flex items-center gap-2">
                        {s.plan!.entitlements[f.key] ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="Included" /> : <XCircle className="h-4 w-4 text-muted-foreground" aria-label="Not included" />}
                        <span className={s.plan!.entitlements[f.key] ? "" : "text-muted-foreground"}>{f.label}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
                <BillingPanel schoolId={schoolId} currentPlan={s.plan.code} />
                <Panel title="History" icon={CreditCard}>
                  <ol className="space-y-2 text-sm">
                    {(history.data ?? []).map((h, i) => (
                      <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0">
                        <span><span className="font-medium capitalize">{h.kind.replace(/_/g, " ")}</span>{h.note ? ` · ${h.note}` : ""}</span>
                        <span className="text-xs text-muted-foreground">{when(h.at)}</span>
                      </li>
                    ))}
                  </ol>
                </Panel>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-bold">Platform support</h1>
                <p className="text-sm text-muted-foreground">Ask Tech Oasis for help, and decide whether support staff may look at your school's settings.</p>
              </div>
              <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden /> New request</Button>
            </div>

            <Panel title="Access requests from support" icon={KeyRound}>
              {grants.isLoading && <LoadingRows rows={2} />}
              {grants.isError && <ErrorBox message={errMsg(grants.error)} onRetry={() => grants.refetch()} />}
              {!grants.isLoading && (grants.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No requests. Support cannot see anything in your school unless you approve a request here.</p>}
              <ul className="divide-y divide-border">
                {(grants.data ?? []).map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{g.requested_label} · {g.hours} hour{g.hours === 1 ? "" : "s"}</span>
                      <span className="block">{g.reason}</span>
                      <span className="block text-xs text-muted-foreground">Asked {when(g.created_at)}{g.expires_at ? ` · access until ${when(g.expires_at)}` : ""} · used {g.uses} time{g.uses === 1 ? "" : "s"}</span>
                    </span>
                    <AccessPill status={g.effective_status} />
                    {g.effective_status === "requested" && (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={decideAccess.isPending}
                          onClick={async () => { try { await decideAccess.mutateAsync({ id: g.id, approve: true, note: "" }); toast({ title: "Access approved", description: `Read-only, for ${g.hours} hour${g.hours === 1 ? "" : "s"}. You can withdraw it at any time.` }); } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); } }}>
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setNote(""); setDeclining(g.id); }}>Decline</Button>
                      </div>
                    )}
                    {g.effective_status === "approved" && (
                      <Button size="sm" variant="outline" disabled={endAccess.isPending}
                        onClick={async () => { try { await endAccess.mutateAsync(g.id); toast({ title: "Access withdrawn" }); } catch (e) { toast({ title: "Not withdrawn", description: errMsg(e), variant: "destructive" }); } }}>
                        Withdraw access
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Approved access is read-only and covers school settings and staff accounts. It never includes pupils, parents, results, attendance or messages. Each use appears in your audit log.</p>
            </Panel>

            <Panel title="Your requests" icon={LifeBuoy}>
              {requests.isLoading && <LoadingRows rows={2} />}
              {requests.isError && <ErrorBox message={errMsg(requests.error)} onRetry={() => requests.refetch()} />}
              {!requests.isLoading && (requests.data ?? []).length === 0 && <EmptyState icon={LifeBuoy} title="No support requests" text="Use New request to contact Tech Oasis." />}
              <ul className="divide-y divide-border">
                {(requests.data ?? []).map((r) => (
                  <li key={r.id}>
                    <button className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-muted/40 focus:bg-muted/40 focus:outline-none" onClick={() => setOpenId(r.id)}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.subject}</span><span className="text-xs text-muted-foreground">Updated {when(r.updated_at)} · {r.messages} message{r.messages === 1 ? "" : "s"}</span></span>
                      <StatusPill status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </div>

      <SupportThread id={openId} side="school" onClose={() => setOpenId(null)} />

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">New support request</DialogTitle>
            <DialogDescription>Tech Oasis support will reply here. Do not include pupils' personal details or any passwords.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="sr-subject">Subject</Label><Input id="sr-subject" maxLength={150} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="sr-body">What happened?</Label><Textarea id="sr-body" rows={5} maxLength={4000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
            <div className="space-y-2">
              <Label htmlFor="sr-pri">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger id="sr-pri"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="urgent">Urgent: the school cannot work</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button disabled={!form.subject.trim() || !form.body.trim() || createRequest.isPending}
              onClick={async () => {
                try {
                  const id = (await createRequest.mutateAsync({ school: schoolId, subject: form.subject.trim(), body: form.body.trim(), priority: form.priority })) as string;
                  toast({ title: "Request sent" });
                  setForm({ subject: "", body: "", priority: "normal" });
                  setNewOpen(false);
                  setOpenId(id);
                } catch (e) { toast({ title: "Not sent", description: errMsg(e), variant: "destructive" }); }
              }}>
              {createRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!declining} onOpenChange={(o) => !o && setDeclining(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Decline access</DialogTitle><DialogDescription>Support will not be able to view anything. A note is optional.</DialogDescription></DialogHeader>
          <Textarea aria-label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeclining(null)}>Cancel</Button>
            <Button onClick={async () => { try { await decideAccess.mutateAsync({ id: declining!, approve: false, note: note.trim() }); toast({ title: "Access declined" }); setDeclining(null); } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); } }}>Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default SchoolSupportPage;
