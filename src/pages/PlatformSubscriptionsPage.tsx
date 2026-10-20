import { useEffect, useMemo, useState } from "react";
import { CreditCard, History, Loader2, Plus, Search, ShieldOff, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  FEATURES, useCommercial, useConsoleActions, usePlans, useSchoolAdmins, useSubscriptionHistory, useSubscriptions,
  type Plan, type SubscriptionRow,
} from "@/hooks/usePlatformConsole";
import { cn } from "@/lib/utils";

const STATE_STYLE = { ok: "bg-success/10 text-success", grace: "bg-warning/15 text-warning", blocked: "bg-destructive/10 text-destructive" } as const;
const STATE_LABEL = { ok: "In good standing", grace: "Renewal due (grace)", blocked: "Lapsed: read-only" } as const;
const day = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const money = (n: number, c: string) => `${c === "GHS" ? "GH₵" : c + " "}${Number(n).toLocaleString()}`;
const usage = (n: number, limit: number | null) => (limit === null ? `${n}` : `${n} / ${limit}`);

const ChangePlanDialog = ({ row, plans, onClose }: { row: SubscriptionRow | null; plans: Plan[]; onClose: () => void }) => {
  const { toast } = useToast();
  const { setSubscription } = useConsoleActions();
  const [f, setF] = useState({ plan: "", status: "active", periodEnd: "", trialEnd: "", grace: "7", note: "" });
  useEffect(() => {
    if (row) setF({ plan: row.plan_code ?? "school", status: row.status ?? "active", periodEnd: row.current_period_end ?? "", trialEnd: row.trial_ends_on ?? "", grace: "7", note: "" });
  }, [row]);
  const save = async () => {
    try {
      const r = (await setSubscription.mutateAsync({
        school: row!.school_id, plan: f.plan, status: f.status, periodEnd: f.periodEnd || null, trialEnd: f.trialEnd || null, grace: Number(f.grace) || 7, note: f.note.trim(),
      })) as { suspended: number; restored: number };
      toast({ title: "Subscription updated", description: r.suspended ? "The school is now read-only." : r.restored ? "The school has been restored." : undefined });
      onClose();
    } catch (e) {
      toast({ title: "Not saved", description: errMsg(e), variant: "destructive" });
    }
  };
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Change subscription</DialogTitle>
          <DialogDescription>{row?.school_name}. Changes apply at once and are recorded in the school's audit log and subscription history.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="cp-plan">Plan</Label>
            <Select value={f.plan} onValueChange={(v) => setF({ ...f, plan: v })}>
              <SelectTrigger id="cp-plan"><SelectValue /></SelectTrigger>
              <SelectContent>{plans.map((p) => <SelectItem key={p.code} value={p.code}>{p.name}{p.is_active ? "" : " (retired)"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-status">Status</Label>
            <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
              <SelectTrigger id="cp-status"><SelectValue /></SelectTrigger>
              <SelectContent>{["trial", "active", "past_due", "expired", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-grace">Grace days</Label>
            <Input id="cp-grace" inputMode="numeric" value={f.grace} onChange={(e) => setF({ ...f, grace: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-end">Paid until</Label>
            <Input id="cp-end" type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-trial">Trial ends</Label>
            <Input id="cp-trial" type="date" value={f.trialEnd} onChange={(e) => setF({ ...f, trialEnd: e.target.value })} />
          </div>
          <div className="col-span-2 space-y-2">
            <Label htmlFor="cp-note">Note (required)</Label>
            <Textarea id="cp-note" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.note.trim() || !f.plan || setSubscription.isPending} onClick={save}>
            {setSubscription.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SchoolDetailDialog = ({ row, onClose }: { row: SubscriptionRow | null; onClose: () => void }) => {
  const { toast } = useToast();
  const history = useSubscriptionHistory(row?.school_id ?? null);
  const admins = useSchoolAdmins(row?.school_id ?? null);
  const { setAdminStatus } = useConsoleActions();
  const [target, setTarget] = useState<{ id: string; name: string; suspend: boolean } | null>(null);
  const [reason, setReason] = useState("");
  return (
    <>
      <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">{row?.school_name}</DialogTitle>
            <DialogDescription>Created {day(row?.created_at)} · {row?.plan_name ?? "No plan"} · {row ? STATE_LABEL[row.state] : ""}</DialogDescription>
          </DialogHeader>
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">School administrators</p>
            {admins.isLoading && <LoadingRows rows={2} />}
            {admins.isError && <ErrorBox message={errMsg(admins.error)} onRetry={() => admins.refetch()} />}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {(admins.data ?? []).map((a) => (
                <li key={a.profile_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{a.full_name}</span> <span className="text-muted-foreground">{a.email}</span>
                    <span className="block text-xs text-muted-foreground">{a.status} · last sign-in {a.last_sign_in ? new Date(a.last_sign_in).toLocaleString("en-GB") : "never"}</span>
                  </span>
                  {a.status !== "invited" && (
                    <Button size="sm" variant="outline" onClick={() => { setReason(""); setTarget({ id: a.profile_id, name: a.full_name, suspend: a.status === "active" }); }}>
                      <ShieldOff className="mr-1 h-4 w-4" /> {a.status === "active" ? "Disable account" : "Restore account"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subscription history</p>
            {history.isLoading && <LoadingRows rows={2} />}
            <ol className="space-y-2">
              {(history.data ?? []).map((h, i) => (
                <li key={i} className="rounded-lg border border-border p-2.5 text-sm">
                  <div className="flex flex-wrap justify-between gap-2"><span className="font-medium capitalize">{h.kind.replace(/_/g, " ")}</span><span className="text-xs text-muted-foreground">{new Date(h.at).toLocaleString("en-GB")} · {h.actor_label}</span></div>
                  {h.note && <p className="text-xs text-muted-foreground">{h.note}</p>}
                  {h.details && "before" in h.details && (
                    <p className="text-xs text-muted-foreground">
                      {String((h.details.before as Record<string, unknown>)?.plan ?? "—")} ({String((h.details.before as Record<string, unknown>)?.status ?? "—")}) → {String((h.details.after as Record<string, unknown>)?.plan)} ({String((h.details.after as Record<string, unknown>)?.status)})
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{target?.suspend ? "Disable" : "Restore"} {target?.name}</DialogTitle>
            <DialogDescription>
              {target?.suspend ? "Use this for a compromised or misused account. They lose access to the school at once." : "They regain administrator access to the school."} The reason is kept in the school's audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="adm-reason">Reason (at least 10 characters)</Label>
            <Textarea id="adm-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button
              variant={target?.suspend ? "destructive" : "default"}
              disabled={reason.trim().length < 10 || setAdminStatus.isPending}
              onClick={async () => {
                try {
                  await setAdminStatus.mutateAsync({ school: row!.school_id, profile: target!.id, suspend: target!.suspend, reason: reason.trim() });
                  toast({ title: target!.suspend ? "Account disabled" : "Account restored" });
                  setTarget(null);
                } catch (e) { toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }); }
              }}
            >
              {target?.suspend ? "Disable account" : "Restore account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const PlanDialog = ({ plan, onClose }: { plan: Plan | "new" | null; onClose: () => void }) => {
  const { toast } = useToast();
  const { upsertPlan } = useConsoleActions();
  const [f, setF] = useState({ code: "", name: "", description: "", students: "", staff: "", price: "0", active: true, ent: {} as Record<string, boolean> });
  useEffect(() => {
    if (plan === "new") setF({ code: "", name: "", description: "", students: "", staff: "", price: "0", active: true, ent: {} });
    else if (plan) setF({ code: plan.code, name: plan.name, description: plan.description ?? "", students: plan.student_limit?.toString() ?? "", staff: plan.staff_limit?.toString() ?? "", price: String(plan.monthly_price), active: plan.is_active, ent: { ...plan.entitlements } });
  }, [plan]);
  const valid = /^[a-z0-9_]{2,30}$/.test(f.code) && f.name.trim() && Number(f.price) >= 0 && (!f.students || Number(f.students) > 0) && (!f.staff || Number(f.staff) > 0);
  return (
    <Dialog open={!!plan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{plan === "new" ? "New plan" : `Edit ${f.name}`}</DialogTitle>
          <DialogDescription>Limits and features are enforced by the database for every school on this plan.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="pl-code">Code</Label><Input id="pl-code" value={f.code} disabled={plan !== "new"} onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase() })} /></div>
          <div className="space-y-2"><Label htmlFor="pl-name">Name</Label><Input id="pl-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label htmlFor="pl-desc">Description</Label><Input id="pl-desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="pl-st">Student limit (blank = none)</Label><Input id="pl-st" inputMode="numeric" value={f.students} onChange={(e) => setF({ ...f, students: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="pl-sf">Staff limit (blank = none)</Label><Input id="pl-sf" inputMode="numeric" value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="pl-pr">Monthly price (GH₵)</Label><Input id="pl-pr" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> Available for new subscriptions</label>
        </div>
        <fieldset className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Features</legend>
          {FEATURES.map((x) => (
            <label key={x.key} className="flex items-center gap-2 text-sm">
              <Switch checked={!!f.ent[x.key]} onCheckedChange={(v) => setF({ ...f, ent: { ...f.ent, [x.key]: v } })} aria-label={x.label} /> {x.label}
            </label>
          ))}
        </fieldset>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid || upsertPlan.isPending}
            onClick={async () => {
              try {
                await upsertPlan.mutateAsync({ code: f.code, name: f.name.trim(), description: f.description, studentLimit: f.students ? Number(f.students) : null, staffLimit: f.staff ? Number(f.staff) : null, price: Number(f.price), entitlements: f.ent, active: f.active });
                toast({ title: "Plan saved" });
                onClose();
              } catch (e) { toast({ title: "Plan not saved", description: errMsg(e), variant: "destructive" }); }
            }}
          >Save plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PlatformSubscriptionsPage = () => {
  const subs = useSubscriptions();
  const plans = usePlans();
  const kpi = useCommercial();
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [changing, setChanging] = useState<SubscriptionRow | null>(null);
  const [detail, setDetail] = useState<SubscriptionRow | null>(null);
  const [editPlan, setEditPlan] = useState<Plan | "new" | null>(null);

  const rows = useMemo(() => (subs.data ?? []).filter((r) =>
    (!q.trim() || r.school_name.toLowerCase().includes(q.trim().toLowerCase())) && (stateFilter === "all" || r.state === stateFilter || r.status === stateFilter)), [subs.data, q, stateFilter]);
  const k = kpi.data;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Subscriptions and plans</h1>
          <p className="text-sm text-muted-foreground">Which plan each school is on, its limits and standing. School records are not shown here.</p>
        </div>
        {k && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Active", k.by_status.active ?? 0], ["On trial", k.on_trial], ["Renewal due (grace)", k.in_grace], ["Lapsed (read-only)", k.blocked],
              ["Ending in 14 days", k.expiring_14d], ["New schools (30 days)", k.new_30d], ["Open support requests", k.open_support], ["Access requests waiting", k.access_pending],
            ].map(([label, n]) => (
              <div key={label as string} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs text-muted-foreground">{label}</p><p className="font-heading text-2xl font-bold">{n}</p>
              </div>
            ))}
          </div>
        )}
        <Tabs defaultValue="schools">
          <TabsList><TabsTrigger value="schools">Schools</TabsTrigger><TabsTrigger value="plans">Plans</TabsTrigger></TabsList>
          <TabsContent value="schools" className="mt-4">
            <Panel title="School subscriptions" icon={CreditCard}>
              <div className="mb-3 flex flex-wrap gap-2">
                <div className="relative min-w-56 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input className="pl-9" placeholder="Search schools" aria-label="Search schools" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger className="w-48" aria-label="Filter by standing"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All schools</SelectItem><SelectItem value="trial">On trial</SelectItem><SelectItem value="ok">In good standing</SelectItem>
                    <SelectItem value="grace">Renewal due</SelectItem><SelectItem value="blocked">Lapsed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {subs.isLoading && <LoadingRows />}
              {subs.isError && <ErrorBox message={errMsg(subs.error)} onRetry={() => subs.refetch()} />}
              {!subs.isLoading && rows.length === 0 && <EmptyState icon={CreditCard} title="No schools match" />}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">School</th><th className="px-3 py-2 font-medium">Plan</th><th className="px-3 py-2 font-medium">Standing</th>
                    <th className="px-3 py-2 font-medium">Paid until / trial ends</th><th className="px-3 py-2 font-medium">Students</th><th className="px-3 py-2 font-medium">Staff</th><th className="py-2" />
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.school_id} className="border-b border-border last:border-0">
                        <td className="py-2.5 pr-3"><span className="font-medium">{r.school_name}</span>{r.school_status === "suspended" && <span className="ml-2 text-xs text-destructive">suspended</span>}</td>
                        <td className="px-3 py-2.5">{r.plan_name ?? "—"} <span className="text-xs capitalize text-muted-foreground">({(r.status ?? "").replace("_", " ")})</span></td>
                        <td className="px-3 py-2.5"><span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium", STATE_STYLE[r.state])}>{STATE_LABEL[r.state]}</span></td>
                        <td className="px-3 py-2.5 text-muted-foreground">{r.status === "trial" ? day(r.trial_ends_on) : day(r.current_period_end)}</td>
                        <td className={cn("px-3 py-2.5", r.student_limit !== null && r.students >= r.student_limit && "font-semibold text-warning")}>{usage(r.students, r.student_limit)}</td>
                        <td className="px-3 py-2.5">{usage(r.staff, r.staff_limit)}</td>
                        <td className="py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => setChanging(r)}>Change</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDetail(r)} aria-label={`Administrators and history for ${r.school_name}`}><Users className="mr-1 h-4 w-4" /><History className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>
          <TabsContent value="plans" className="mt-4">
            <Panel title="Plans" icon={CreditCard}>
              <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setEditPlan("new")}><Plus className="mr-1 h-4 w-4" /> New plan</Button></div>
              {plans.isLoading && <LoadingRows />}
              {plans.isError && <ErrorBox message={errMsg(plans.error)} onRetry={() => plans.refetch()} />}
              <div className="grid gap-3 sm:grid-cols-2">
                {(plans.data ?? []).map((p) => (
                  <div key={p.id} className={cn("rounded-xl border border-border p-4", !p.is_active && "opacity-70")}>
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-heading font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.description}</p></div>
                      <Button size="sm" variant="outline" onClick={() => setEditPlan(p)}>Edit</Button>
                    </div>
                    <p className="mt-2 text-sm">{money(p.monthly_price, p.currency)} / month · {p.student_limit ?? "Unlimited"} students · {p.staff_limit ?? "Unlimited"} staff</p>
                    <p className="mt-1 text-xs text-muted-foreground">{FEATURES.filter((f) => p.entitlements[f.key]).map((f) => f.label).join(", ") || "Core records only"}</p>
                    {!p.is_active && <p className="mt-1 text-xs text-warning">Not offered for new subscriptions</p>}
                  </div>
                ))}
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
      <ChangePlanDialog row={changing} plans={plans.data ?? []} onClose={() => setChanging(null)} />
      <SchoolDetailDialog row={detail} onClose={() => setDetail(null)} />
      <PlanDialog plan={editPlan} onClose={() => setEditPlan(null)} />
    </DashboardLayout>
  );
};

export default PlatformSubscriptionsPage;
