import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarPlus, KeyRound, Loader2, Mail, PauseCircle, PlayCircle, SlidersHorizontal } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel } from "@/components/kit/Panel";
import { StatePill } from "@/components/billing/BillingPanel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import LoginAccessDialog, { directLoginManagement, type LoginTarget } from "@/components/users/LoginAccessDialog";
import { day, money, stamp, useBillingActions, useClient, usePlatformPlans, useResetRequests } from "@/hooks/useBilling";

const ORDER_LABEL: Record<string, string> = { created: "Not paid", pending: "Awaiting payment", paid: "Paid", failed: "Failed", abandoned: "Cancelled", mismatch: "Under review", refunded: "Refunded" };
const RESET_LABEL: Record<string, string> = { requested: "Waiting to send", sent: "Email sent", failed: "Failed", used: "Used by the admin", expired: "Expired" };
const STATUSES = ["trial", "active", "past_due", "expired", "cancelled"];

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
);

type Dlg = null | "extend" | "status" | "school" | { reset: { profile: string; name: string; email: string } };

const PlatformClientPage = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const q = useClient(id);
  const plans = usePlatformPlans();
  const resets = useResetRequests(id);
  const act = useBillingActions();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("14");
  const [complimentary, setComplimentary] = useState(true);
  const [st, setSt] = useState({ plan: "", status: "active", periodEnd: "" });
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<{ target: LoginTarget; mode: "password" | "email" } | null>(null);
  const c = q.data;
  const sub = c?.subscription;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); setDlg(null); setReason(""); }
    catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const sendReset = async (profile: string) => {
    setBusy(true);
    try {
      const r = await act.requestReset.mutateAsync({ school: id!, profile });
      if (r.state === "sent") toast({ title: "Reset email sent", description: `A single-use link was emailed to ${r.email}. It expires in one hour.` });
      else toast({ title: "The reset email was not sent", description: r.error ?? "The email service reported a failure.", variant: "destructive" });
      setDlg(null);
    } catch (e) { toast({ title: "Could not start the reset", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const openStatus = () => { setSt({ plan: sub?.plan_code ?? "starter", status: sub?.status ?? "active", periodEnd: sub?.period_end ?? "" }); setReason(""); setDlg("status"); };
  const reasonOk = reason.trim().length >= 10;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <Link to="/platform/clients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> All clients</Link>
        {q.isLoading && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {c && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-heading text-2xl font-bold">{c.school.name}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {sub && <StatePill label={sub.label} />} <span>Registered {day(c.school.registered_at)}</span> <span>· {c.school.slug}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { setReason(""); setDlg("extend"); }} disabled={!sub}><CalendarPlus className="mr-1 h-4 w-4" aria-hidden /> Extend</Button>
                <Button variant="outline" size="sm" onClick={openStatus}><SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden /> Change status</Button>
                <Button variant="outline" size="sm" onClick={() => { setReason(""); setDlg("school"); }}>
                  {c.school.status === "active" ? <><PauseCircle className="mr-1 h-4 w-4" aria-hidden /> Suspend access</> : <><PlayCircle className="mr-1 h-4 w-4" aria-hidden /> Reactivate access</>}
                </Button>
              </div>
            </div>

            <Tabs defaultValue="subscription">
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="subscription">Subscription</TabsTrigger><TabsTrigger value="profile">Profile and admin</TabsTrigger>
                <TabsTrigger value="payments">Payments</TabsTrigger><TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger><TabsTrigger value="support">Notifications and support</TabsTrigger>
              </TabsList>

              <TabsContent value="subscription" className="mt-4 grid gap-4 lg:grid-cols-2">
                <Panel title="Current subscription">
                  {!sub ? <p className="text-sm text-muted-foreground">No subscription on record.</p> : (
                    <dl>
                      <Row k="Package" v={sub.plan_name} /><Row k="Status" v={<StatePill label={sub.label} />} />
                      <Row k="Price" v={`${money(sub.monthly_price * 100, sub.currency)} / month${sub.annual_price ? ` · ${money(sub.annual_price * 100, sub.currency)} / year` : ""}`} />
                      <Row k="Started" v={day(sub.started_on)} />
                      {sub.status === "trial" && <Row k="Trial ends" v={day(sub.trial_ends_on)} />}
                      <Row k="Current period ends" v={sub.period_end ? `${day(sub.period_end)}${sub.days_left != null ? ` (${sub.days_left >= 0 ? `${sub.days_left} days left` : `${-sub.days_left} days ago`})` : ""}` : "—"} />
                      <Row k="Grace period" v={`${sub.grace_days} days${sub.grace_ends_on ? `, to ${day(sub.grace_ends_on)}` : ""}`} />
                      <Row k="Access" v={sub.state === "ok" ? "Full" : sub.state === "grace" ? "Full (grace period)" : "Read-only"} />
                      <Row k="Students" v={`${c.usage.students}${sub.student_limit ? ` of ${sub.student_limit}` : ""}`} />
                      <Row k="Staff accounts" v={`${c.usage.staff}${sub.staff_limit ? ` of ${sub.staff_limit}` : ""}`} />
                    </dl>
                  )}
                </Panel>
                <Panel title="Billing periods">
                  {c.periods.length === 0 ? <p className="text-sm text-muted-foreground">No paid periods yet.</p> : (
                    <ol className="space-y-2 text-sm">
                      {c.periods.map((p, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2 last:border-0">
                          <span><span className="font-medium capitalize">{p.kind.replace("_", " ")}</span> · {p.plan_code}{p.is_demo && <span className="ml-1 rounded bg-destructive/10 px-1 text-[10px] font-bold text-destructive">DEMO</span>}<br /><span className="text-xs text-muted-foreground">{day(p.starts_on)} to {day(p.ends_on)}</span></span>
                          <span className="font-medium">{money(p.amount_minor, p.currency)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="profile" className="mt-4 grid gap-4 lg:grid-cols-2">
                <Panel title="School">
                  <dl><Row k="Name" v={c.school.name} /><Row k="Identifier" v={c.school.slug} /><Row k="Account" v={c.school.status === "active" ? "Active" : "Suspended"} /><Row k="Country" v={c.school.country ?? "—"} /><Row k="Currency" v={c.school.currency ?? "—"} /><Row k="Registered" v={stamp(c.school.registered_at)} /></dl>
                </Panel>
                <Panel title="School Admin accounts" icon={KeyRound}>
                  {c.admins.length === 0 && <p className="text-sm text-muted-foreground">No administrator on record.</p>}
                  <ul className="divide-y divide-border">
                    {c.admins.map((a) => (
                      <li key={a.profile_id} className="space-y-2 py-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <span><span className="block font-medium">{a.name}</span><span className="block text-xs text-muted-foreground">{a.email}</span></span>
                          <span className="text-xs capitalize text-muted-foreground">{a.status}{a.signed_in ? "" : " · not signed up yet"}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={!a.signed_in} onClick={() => setDlg({ reset: { profile: a.profile_id, name: a.name, email: a.email } })}>
                            <Mail className="mr-1 h-3.5 w-3.5" aria-hidden /> Send password reset
                          </Button>
                          {directLoginManagement && a.signed_in && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setLogin({ mode: "password", target: { schoolId: id!, profileId: a.profile_id, name: a.name, email: a.email } })}><KeyRound className="mr-1 h-3.5 w-3.5" aria-hidden /> Set temporary password</Button>
                              <Button size="sm" variant="outline" onClick={() => setLogin({ mode: "email", target: { schoolId: id!, profileId: a.profile_id, name: a.name, email: a.email } })}>Change login email</Button>
                            </>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => run(() => act.setAdminStatus.mutateAsync({ school: id!, profile: a.profile_id, suspend: a.status === "active", reason: "Changed from the client page" }), a.status === "active" ? "Account suspended" : "Account reactivated")}>
                            {a.status === "active" ? "Suspend account" : "Reactivate account"}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-muted-foreground">A reset sends a single-use link to the administrator&apos;s own email; you never see the link. {directLoginManagement ? "A temporary password is generated by the system, shown to you once, and the administrator must replace it at their next sign-in." : "On this site the administrator chooses their new password from the emailed link."}</p>
                  <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reset requests</h3>
                  {(resets.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
                    <ul className="space-y-1.5 text-sm">
                      {(resets.data ?? []).map((r) => (
                        <li key={r.id} className="flex flex-wrap justify-between gap-2">
                          <span>{stamp(r.at)} · {r.email} <span className="text-xs text-muted-foreground">by {r.by}</span></span>
                          <span className={r.state === "failed" ? "text-destructive" : ""}>{RESET_LABEL[r.state] ?? r.state}{r.error ? `: ${r.error}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <Panel title="Payment transactions">
                  {c.orders.length === 0 ? <p className="text-sm text-muted-foreground">No payment attempts.</p> : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Package</th><th className="py-2 pr-3">Amount</th><th className="py-2 pr-3">Channel</th><th className="py-2 pr-3">Status</th><th className="py-2">Date</th></tr></thead>
                        <tbody>
                          {c.orders.map((o) => (
                            <tr key={o.reference} className="border-b border-border last:border-0">
                              <td className="py-2 pr-3 font-mono text-xs">{o.reference}{o.demo && <span className="ml-1 rounded bg-destructive/10 px-1 text-[10px] font-bold text-destructive">DEMO</span>}</td>
                              <td className="py-2 pr-3">{o.plan} <span className="text-xs text-muted-foreground">{o.interval} · {o.purpose.replace("_", " ")}</span></td>
                              <td className="py-2 pr-3">{money(o.total_minor, o.currency)}</td><td className="py-2 pr-3 capitalize">{o.channel?.replace("_", " ") ?? "—"}</td>
                              <td className="py-2 pr-3">{ORDER_LABEL[o.status] ?? o.status}{o.status !== "paid" && o.gateway_response ? <span className="block text-xs text-muted-foreground">{o.gateway_response}</span> : null}</td>
                              <td className="py-2 text-xs text-muted-foreground">{stamp(o.paid_at ?? o.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">Status comes from payment verification only. It cannot be edited here.</p>
                </Panel>
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <Panel title="Subscription, renewal and adjustment history">
                  <ol className="space-y-2 text-sm">
                    {c.events.map((e, i) => (
                      <li key={i} className="border-b border-border pb-2 last:border-0">
                        <div className="flex flex-wrap justify-between gap-2"><span className="font-medium capitalize">{e.kind.replace(/_/g, " ")}</span><span className="text-xs text-muted-foreground">{stamp(e.at)} · {e.actor}</span></div>
                        {e.note && <p className="text-muted-foreground">{e.note}</p>}
                        {(e.details as { before?: unknown; after?: unknown }).before ? <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">{JSON.stringify((e.details as { before: unknown }).before)} → {JSON.stringify((e.details as { after: unknown }).after)}</p> : null}
                      </li>
                    ))}
                  </ol>
                </Panel>
              </TabsContent>

              <TabsContent value="audit" className="mt-4">
                <Panel title="Audit logs and administrative activity">
                  <p className="text-sm text-muted-foreground">School administrators&apos; activity (people, roles, results, settings, billing, support access) is in the activity log, filtered to this school. Audit failures and security incidents are in Audit and security. Private conversations and pupil records are never shown here.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild size="sm"><Link to={`/platform/activity?school=${c.school.id}`}>Open this school&apos;s activity</Link></Button>
                    <Button asChild size="sm" variant="outline"><Link to="/platform/audit">Audit and security incidents</Link></Button>
                  </div>
                </Panel>
              </TabsContent>

              <TabsContent value="support" className="mt-4 grid gap-4 lg:grid-cols-2">
                <Panel title="Support requests">
                  {c.support.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                    <ul className="divide-y divide-border text-sm">{c.support.map((s) => <li key={s.id} className="flex justify-between gap-2 py-2"><Link className="text-primary hover:underline" to="/platform/support">{s.subject}</Link><span className="text-xs capitalize text-muted-foreground">{s.status.replace("_", " ")} · {s.priority}</span></li>)}</ul>
                  )}
                </Panel>
                <Panel title="Renewal reminders">
                  {c.reminders.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
                    <ul className="space-y-1.5 text-sm">
                      {c.reminders.map((r, i) => (
                        <li key={i} className="flex flex-wrap justify-between gap-2">
                          <span>{r.interval_days > 0 ? `${r.interval_days} day${r.interval_days === 1 ? "" : "s"} before` : r.interval_days === 0 ? "On expiry day" : `${-r.interval_days} day${r.interval_days === -1 ? "" : "s"} after`} · {r.audience} · {r.channel.replace("_", "-")}</span>
                          <span className="text-xs capitalize text-muted-foreground">{r.state}{r.error ? `: ${r.error}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">In-app reminders are delivered. Email reminders stay &quot;queued&quot; until an email service is connected.</p>
                </Panel>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <LoginAccessDialog target={login?.target ?? null} mode={login?.mode ?? "password"} onClose={() => setLogin(null)} />

      <Dialog open={dlg === "extend"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Extend the subscription</DialogTitle><DialogDescription>This moves the end date. It is an administrative adjustment: it creates no payment and counts as no revenue.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="ex-days">Days to add (1 to 366)</Label><Input id="ex-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /></div>
            <div className="flex items-center gap-2"><Switch id="ex-comp" checked={complimentary} onCheckedChange={setComplimentary} /><Label htmlFor="ex-comp">Complimentary (free of charge)</Label></div>
            <div className="space-y-1.5"><Label htmlFor="ex-why">Reason (at least 10 characters)</Label><Textarea id="ex-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button disabled={busy || !reasonOk || !(Number(days) >= 1)} onClick={() => run(() => act.extend.mutateAsync({ school: id!, days: Number(days), complimentary, reason: reason.trim() }), "Subscription extended")}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Extend</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "status"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Change package or status</DialogTitle><DialogDescription>Only allowed transitions are accepted. This never records a payment.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="st-plan">Package</Label>
              <Select value={st.plan} onValueChange={(v) => setSt({ ...st, plan: v })}><SelectTrigger id="st-plan"><SelectValue /></SelectTrigger><SelectContent>{(plans.data ?? []).map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="st-status">Status</Label>
              <Select value={st.status} onValueChange={(v) => setSt({ ...st, status: v })}><SelectTrigger id="st-status"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="st-end">Period ends on</Label><Input id="st-end" type="date" value={st.periodEnd} onChange={(e) => setSt({ ...st, periodEnd: e.target.value })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="st-why">Reason (required)</Label><Textarea id="st-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button disabled={busy || !reason.trim()} onClick={() => run(() => act.setSubscription.mutateAsync({ school: id!, plan: st.plan, status: st.status, periodEnd: st.periodEnd || null, trialEnd: st.status === "trial" ? st.periodEnd || null : null, grace: sub?.grace_days ?? 7, note: reason.trim() }), "Subscription updated")}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlg === "school"} onOpenChange={(o) => !o && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">{c?.school.status === "active" ? "Suspend this school's access?" : "Reactivate this school's access?"}</DialogTitle>
            <DialogDescription>{c?.school.status === "active" ? "People can still view records but cannot change anything. Nothing is deleted." : "People can use the school normally again."}</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="sc-why">Reason (required)</Label><Textarea id="sc-why" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button>
            <Button variant={c?.school.status === "active" ? "destructive" : "default"} disabled={busy || reason.trim().length < 5}
              onClick={() => run(() => act.setSchoolStatus.mutateAsync({ school: id!, status: c!.school.status === "active" ? "suspended" : "active", reason: reason.trim() }), "School access updated")}>Confirm</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dlg && typeof dlg === "object"} onOpenChange={(o) => !o && !busy && setDlg(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Send password reset</DialogTitle><DialogDescription>Confirm the account before sending.</DialogDescription></DialogHeader>
          {dlg && typeof dlg === "object" && (
            <>
              <dl className="rounded-lg border border-border p-3 text-sm"><Row k="School" v={c?.school.name} /><Row k="Administrator" v={dlg.reset.name} /><Row k="Email" v={dlg.reset.email} /></dl>
              <p className="text-xs text-muted-foreground">A single-use link that expires in one hour is emailed to this address. At most 3 requests per hour per account. The request and its result are audited.</p>
              <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDlg(null)}>Cancel</Button>
                <Button disabled={busy} onClick={() => sendReset(dlg.reset.profile)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send reset email</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PlatformClientPage;
