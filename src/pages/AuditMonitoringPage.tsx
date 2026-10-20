import { useEffect, useState } from "react";
import { AlertOctagon, BellRing, CheckCircle2, HeartPulse, Loader2, Settings2, ShieldAlert, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useAuditActions, useIncident, useIncidents, useMonitoringStatus, usePlatformAdmins, usePlatformAlerts,
  type Incident, type Severity,
} from "@/hooks/useAuditMonitoring";
import { cn } from "@/lib/utils";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning/20 text-warning",
  medium: "bg-info/15 text-info",
  low: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<Incident["status"], string> = {
  open: "Open", acknowledged: "Acknowledged", investigating: "Investigating", resolved: "Resolved, not verified", closed: "Closed",
};
const CATEGORY_LABEL: Record<string, string> = {
  write_failure: "Write failure", validation_failure: "Validation failure", missing_event: "Missing audit event",
  retrieval_failure: "Retrieval failure", integrity_violation: "Integrity violation", service_unavailable: "Monitor unavailable",
  repeated_failures: "Repeated failures", queue_backlog: "Retry backlog",
};
const EVENT_LABEL: Record<string, string> = {
  detected: "Detected", occurrence: "Happened again", acknowledged: "Acknowledged", assigned: "Assigned", note: "Note",
  resolved: "Marked resolved", verification_passed: "Verification passed", verification_failed: "Verification failed",
  closed: "Closed", check_passed: "Monitor reported again",
};

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never";

const SeverityChip = ({ s }: { s: Severity }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", SEVERITY_STYLE[s])}>{s}</span>
);

const IncidentDialog = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { toast } = useToast();
  const detail = useIncident(id);
  const admins = usePlatformAdmins();
  const { act } = useAuditActions();
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const inc = detail.data?.incident;

  useEffect(() => { setNote(""); setAssignee(""); }, [id]);

  const run = async (action: "acknowledge" | "assign" | "note" | "resolve" | "verify" | "close") => {
    try {
      const r = await act.mutateAsync({ id: id!, action, note: note.trim() || undefined, assignee: assignee || undefined });
      if (action === "verify") {
        toast({ title: r.verified ? "Verification passed" : "Verification failed", description: r.verified ? "You can now close this incident." : "The problem is still present.", variant: r.verified ? "default" : "destructive" });
      } else {
        toast({ title: "Saved" });
      }
      if (["note", "resolve", "close", "assign"].includes(action)) setNote("");
    } catch (e) {
      toast({ title: "Could not save", description: errMsg(e), variant: "destructive" });
    }
  };

  const closed = inc?.status === "closed";
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {detail.isLoading && <LoadingRows rows={4} />}
        {detail.isError && <ErrorBox message={errMsg(detail.error)} onRetry={() => detail.refetch()} />}
        {inc && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-heading">
                {inc.ref} <SeverityChip s={inc.severity} />
              </DialogTitle>
              <DialogDescription>{inc.summary}</DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[
                ["Status", STATUS_LABEL[inc.status]],
                ["Category", CATEGORY_LABEL[inc.category] ?? inc.category],
                ["School", inc.school_name ?? "Platform-wide"],
                ["Module", inc.module],
                ["Operation", inc.operation ?? "—"],
                ["Business operation", inc.business_outcome === "failed" ? "Did not complete" : inc.business_outcome === "succeeded" ? "Completed" : "Unknown"],
                ["Detected", when(inc.detected_at)],
                ["Last seen", `${when(inc.last_seen_at)} (${inc.occurrences} time${inc.occurrences === 1 ? "" : "s"})`],
                ["Assigned to", inc.assigned_to_label ?? "Nobody yet"],
                ["Verified", inc.verified_at ? `${inc.verified_ok ? "Passed" : "Failed"} · ${when(inc.verified_at)}` : "Not yet"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="rounded-lg bg-muted/60 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended steps</p>
              <p>{inc.recommended_steps}</p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Diagnostics (codes and references only)</p>
              <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-card p-3 text-xs">{JSON.stringify(inc.diagnostics, null, 2)}</pre>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">History</p>
              <ol className="space-y-2">
                {detail.data!.events.map((e, i) => (
                  <li key={i} className="rounded-lg border border-border p-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                      <span className="text-xs text-muted-foreground">{when(e.at)} · {e.actor}</span>
                    </div>
                    {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </div>

            {!closed && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="space-y-2">
                  <Label htmlFor="inc-note">Note (needed to resolve; optional otherwise)</Label>
                  <Textarea id="inc-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {inc.status === "open" && <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => run("acknowledge")}>Acknowledge</Button>}
                  <div className="flex items-end gap-2">
                    <Select value={assignee} onValueChange={setAssignee}>
                      <SelectTrigger className="h-9 w-52" aria-label="Assign to"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                      <SelectContent>{(admins.data ?? []).map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.email}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" disabled={!assignee || act.isPending} onClick={() => run("assign")}>Assign</Button>
                  </div>
                  <Button variant="outline" size="sm" disabled={!note.trim() || act.isPending} onClick={() => run("note")}>Add note</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!note.trim() || act.isPending || inc.status === "resolved"} onClick={() => run("resolve")}>Mark resolved</Button>
                  <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => run("verify")}>
                    {act.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Run verification
                  </Button>
                  <Button variant="outline" size="sm" disabled={inc.status !== "resolved" || !inc.verified_ok || act.isPending} onClick={() => run("close")}>Close incident</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  An incident can only be closed after it is marked resolved and a verification run, made after the fix, passes.
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

const IncidentList = ({ scope, onOpen }: { scope: "active" | "closed"; onOpen: (id: string) => void }) => {
  const q = useIncidents(scope);
  if (q.isLoading) return <LoadingRows />;
  if (q.isError) return <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={ShieldCheck} title={scope === "active" ? "No active incidents" : "No closed incidents yet"} text={scope === "active" ? "Audit logging is working and no problems have been detected." : undefined} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Reference</th><th className="px-3 py-2 font-medium">Severity</th><th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">School · module</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Detected</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50" onClick={() => onOpen(i.id)}>
              <td className="py-2.5 pr-3">
                <button className="font-medium text-primary hover:underline focus:underline focus:outline-none" onClick={(e) => { e.stopPropagation(); onOpen(i.id); }}>{i.ref}</button>
                {i.occurrences > 1 && <span className="ml-2 text-xs text-muted-foreground">×{i.occurrences}</span>}
              </td>
              <td className="px-3 py-2.5"><SeverityChip s={i.severity} /></td>
              <td className="px-3 py-2.5">{CATEGORY_LABEL[i.category] ?? i.category}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{i.school_name ?? "Platform-wide"} · {i.module}</td>
              <td className="px-3 py-2.5">{STATUS_LABEL[i.status]}{i.assigned_to_label ? ` · ${i.assigned_to_label}` : ""}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{when(i.detected_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AuditMonitoringPage = () => {
  const { toast } = useToast();
  const status = useMonitoringStatus();
  const alerts = usePlatformAlerts();
  const { runCheck, settings, markRead } = useAuditActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const [scope, setScope] = useState<"active" | "closed">("active");
  const [form, setForm] = useState({ threshold: "3", window: "60", stale: "15", webhook: false });
  const s = status.data;

  useEffect(() => {
    if (s) setForm({ threshold: String(s.settings.failure_threshold), window: String(s.settings.window_minutes), stale: String(s.settings.stale_minutes), webhook: s.settings.webhook_enabled });
  }, [s?.settings.failure_threshold, s?.settings.window_minutes, s?.settings.stale_minutes, s?.settings.webhook_enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const critical = s?.open.critical ?? 0;
  const high = s?.open.high ?? 0;
  const banner = !s ? null
    : s.stale ? { tone: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertOctagon, text: "The audit monitor has stopped reporting. Start it again (npm run audit:monitor) and verify the open incident." }
    : critical > 0 ? { tone: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertOctagon, text: `${critical} critical audit incident${critical === 1 ? "" : "s"} ${critical === 1 ? "needs" : "need"} attention now.` }
    : high > 0 || s.unresolved > 0 ? { tone: "bg-warning/10 text-warning border-warning/30", icon: ShieldAlert, text: `${s.unresolved} unresolved audit incident${s.unresolved === 1 ? "" : "s"}.` }
    : { tone: "bg-success/10 text-success border-success/30", icon: CheckCircle2, text: "Audit logging is healthy. The last health check passed." };

  const runNow = async () => {
    try {
      const r = await runCheck.mutateAsync();
      toast({ title: r.status === "passed" ? "Health check passed" : "Health check found problems", description: r.status === "passed" ? undefined : "See the incidents list.", variant: r.status === "passed" ? "default" : "destructive" });
    } catch (e) {
      toast({ title: "Health check could not run", description: errMsg(e), variant: "destructive" });
    }
  };

  const saveSettings = async () => {
    try {
      await settings.mutateAsync({ threshold: Number(form.threshold), window: Number(form.window), stale: Number(form.stale), webhook: form.webhook });
      toast({ title: "Settings saved" });
    } catch (e) {
      toast({ title: "Settings not saved", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Audit and security monitoring</h1>
            <p className="text-sm text-muted-foreground">Failures of the audit log, integrity checks, and the incidents they raise. Platform-wide: no student records are shown here.</p>
          </div>
          <Button onClick={runNow} disabled={runCheck.isPending}>
            {runCheck.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <HeartPulse className="mr-2 h-4 w-4" aria-hidden />}
            Run health check now
          </Button>
        </div>

        {status.isLoading && <LoadingRows rows={2} />}
        {status.isError && <ErrorBox message={errMsg(status.error)} onRetry={() => status.refetch()} />}
        {banner && s && (
          <div role={critical > 0 || s.stale ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm", banner.tone)}>
            <banner.icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">{banner.text}</p>
              <p className="text-xs opacity-80">
                Monitor last reported {when(s.last_tick_at)}. {s.queue_pending > 0 ? `${s.queue_pending} audit event(s) are waiting for retry. ` : ""}
                Urgent channel: {s.settings.webhook_enabled ? "on (sent by the monitor job when a webhook is configured)" : "off; alerts appear here only"}.
              </p>
            </div>
          </div>
        )}

        {s && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => (
              <div key={sev} className="rounded-xl border border-border bg-card p-4 shadow-card">
                <p className="text-xs capitalize text-muted-foreground">{sev}</p>
                <p className="font-heading text-2xl font-bold">{s.open[sev] ?? 0}</p>
                <p className="text-xs text-muted-foreground">open incidents</p>
              </div>
            ))}
          </div>
        )}

        <Tabs defaultValue="incidents">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="alerts">Alerts{s && s.unread_alerts > 0 ? ` (${s.unread_alerts})` : ""}</TabsTrigger>
            <TabsTrigger value="checks">Health checks</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="incidents" className="mt-4">
            <Panel title="Incidents" icon={ShieldAlert}>
              <div className="mb-3 inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Incident list">
                {(["active", "closed"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={scope === t} onClick={() => setScope(t)}
                    className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize", scope === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{t}</button>
                ))}
              </div>
              <IncidentList scope={scope} onOpen={setOpenId} />
            </Panel>
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <Panel title="Alerts sent to platform administrators" icon={BellRing}>
              <div className="mb-3 flex justify-end">
                <Button variant="outline" size="sm" disabled={!s || s.unread_alerts === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>Mark all as read</Button>
              </div>
              {alerts.isLoading && <LoadingRows />}
              {alerts.isError && <ErrorBox message={errMsg(alerts.error)} onRetry={() => alerts.refetch()} />}
              {(alerts.data ?? []).length === 0 && !alerts.isLoading && <EmptyState icon={BellRing} title="No alerts yet" />}
              <ul className="space-y-2">
                {(alerts.data ?? []).map((a) => (
                  <li key={a.id} className={cn("rounded-lg border p-3 text-sm", a.read ? "border-border" : "border-primary/40 bg-primary/5")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button className="font-semibold text-left hover:underline" onClick={() => { markRead.mutate(a.id); if (a.incident_id) setOpenId(a.incident_id); }}>{a.title}</button>
                      <span className="text-xs text-muted-foreground">{when(a.created_at)}</span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{a.body}</pre>
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>

          <TabsContent value="checks" className="mt-4">
            <Panel title="Recent health checks" icon={HeartPulse}>
              {(s?.recent_checks ?? []).length === 0 ? (
                <EmptyState icon={HeartPulse} title="No health checks yet" text="Run one now, or start the monitor job so they run on a schedule." />
              ) : (
                <ul className="divide-y divide-border">
                  {s!.recent_checks.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        {c.status === "passed" ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <AlertOctagon className="h-4 w-4 text-destructive" aria-hidden />}
                        <span className="font-medium capitalize">{c.status}</span>
                        <span className="text-xs text-muted-foreground">{c.kind}</span>
                      </span>
                      <span className="flex flex-wrap gap-1.5 text-[11px]">
                        {Object.entries(c.checks).map(([k, v]) => (
                          <span key={k} className={cn("rounded-full px-2 py-0.5", v.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{k.replace("_", " ")}</span>
                        ))}
                      </span>
                      <span className="text-xs text-muted-foreground">{when(c.ran_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Panel title="Thresholds and channels" icon={Settings2}>
              <div className="grid gap-4 sm:grid-cols-3">
                {([["threshold", "Failures before escalation", "1–100"], ["window", "Within (minutes)", "1–1440"], ["stale", "Monitor silent after (minutes)", "1–1440"]] as const).map(([k, label, hint]) => (
                  <div key={k} className="space-y-2">
                    <Label htmlFor={`as-${k}`}>{label}</Label>
                    <Input id={`as-${k}`} inputMode="numeric" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} aria-describedby={`as-${k}-h`} />
                    <p id={`as-${k}-h`} className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-4 rounded-lg bg-muted/60 p-3">
                <div>
                  <p className="text-sm font-medium">Send high and critical alerts to the urgent channel</p>
                  <p className="text-xs text-muted-foreground">Delivered by the monitor job to the webhook in AUDIT_ALERT_WEBHOOK_URL (Slack-compatible). Nothing is sent until that is set.</p>
                </div>
                <Switch checked={form.webhook} onCheckedChange={(v) => setForm((f) => ({ ...f, webhook: v }))} aria-label="Urgent channel" />
              </div>
              <Button className="mt-4" onClick={saveSettings} disabled={settings.isPending}>Save settings</Button>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
      <IncidentDialog id={openId} onClose={() => setOpenId(null)} />
    </DashboardLayout>
  );
};

export default AuditMonitoringPage;
