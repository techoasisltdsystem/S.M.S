import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZE, useActivity, useSubscriptions, type ActivityFilters } from "@/hooks/usePlatformConsole";

const ACTIONS = [
  "member_invited", "invitation_accepted", "user_created", "user_updated", "user_suspended", "user_activated", "role_changed", "permission_changed",
  "student_enrolled", "enrollment_changed", "guardian_linked", "attendance_corrected", "results_submitted", "results_approved", "results_published",
  "results_reopened", "result_correction_requested", "results_corrected", "correction_rejected", "grading_scale_changed", "record_created", "record_updated",
  "record_deleted", "config_updated", "school_updated", "subscription_changed", "assessment_released", "submission_returned", "message_hidden",
  "report_exported", "payment_verified", "payment_failed", "subscription_renewed", "billing_adjusted", "password_reset_requested", "support_request_created", "support_access_requested", "support_access_approved", "support_access_used", "support_access_ended", "admin_access_changed",
];
const TARGETS = ["school", "school_config", "user", "membership", "assessment", "result", "classes", "subjects", "academic_years", "terms", "events", "announcements", "role_permission", "support_access", "grading_scale"];
const ANY = "__any";

const PlatformActivityPage = () => {
  const schools = useSubscriptions();
  const [params] = useSearchParams();
  const [f, setF] = useState<ActivityFilters>({ school: params.get("school") ?? "", actor: "", action: "", targetType: "", from: "", to: "", adminsOnly: true, page: 0 });
  const [actorDraft, setActorDraft] = useState("");
  const log = useActivity(f);
  const rows = log.data ?? [];
  const total = rows[0]?.total ?? 0;
  const set = (patch: Partial<ActivityFilters>) => setF((x) => ({ ...x, ...patch, page: 0 }));

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Platform activity</h1>
          <p className="text-sm text-muted-foreground">What school administrators and platform staff have done. Names of pupils, parents and staff, and free-text details, are hidden here.</p>
        </div>
        <Panel title="Filters" icon={Activity}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="af-school">School</Label>
              <Select value={f.school || ANY} onValueChange={(v) => set({ school: v === ANY ? "" : v })}>
                <SelectTrigger id="af-school"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>All schools</SelectItem>{(schools.data ?? []).map((s) => <SelectItem key={s.school_id} value={s.school_id}>{s.school_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="af-action">Action</Label>
              <Select value={f.action || ANY} onValueChange={(v) => set({ action: v === ANY ? "" : v })}>
                <SelectTrigger id="af-action"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>Any action</SelectItem>{ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="af-target">Affected record</Label>
              <Select value={f.targetType || ANY} onValueChange={(v) => set({ targetType: v === ANY ? "" : v })}>
                <SelectTrigger id="af-target"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value={ANY}>Any record</SelectItem>{TARGETS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <form className="space-y-1.5" onSubmit={(e) => { e.preventDefault(); set({ actor: actorDraft }); }}>
              <Label htmlFor="af-actor">Done by (name)</Label>
              <Input id="af-actor" value={actorDraft} onChange={(e) => setActorDraft(e.target.value)} onBlur={() => set({ actor: actorDraft })} placeholder="Press Enter to search" />
            </form>
            <div className="space-y-1.5"><Label htmlFor="af-from">From</Label><Input id="af-from" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="af-to">To</Label><Input id="af-to" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><Switch checked={f.adminsOnly} onCheckedChange={(v) => set({ adminsOnly: v })} /> Administrators only</label>
          </div>
        </Panel>

        <Panel title={`Activity${total ? ` (${total})` : ""}`} icon={Activity}>
          {log.isLoading && <LoadingRows />}
          {log.isError && <ErrorBox message={errMsg(log.error)} onRetry={() => log.refetch()} />}
          {!log.isLoading && !log.isError && rows.length === 0 && <EmptyState icon={Activity} title="No activity matches these filters" />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">When</th><th className="px-3 py-2 font-medium">School</th><th className="px-3 py-2 font-medium">Who</th>
                  <th className="px-3 py-2 font-medium">Action</th><th className="px-3 py-2 font-medium">Record</th><th className="px-3 py-2 font-medium">Details</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3 text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-3 py-2">{r.school_name ?? "Platform"}</td>
                      <td className="px-3 py-2">{r.actor_name ?? "System"}<span className="block text-xs text-muted-foreground">{(r.actor_role ?? "").replace(/_/g, " ")}</span></td>
                      <td className="px-3 py-2">{r.action.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2">{r.target_type.replace(/_/g, " ")}{r.target_name ? <span className="block text-xs text-muted-foreground">{r.target_name}</span> : null}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{Object.entries(r.details).map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground">Page {f.page + 1} of {Math.ceil(total / PAGE_SIZE)}</span>
              <Button size="icon" variant="outline" aria-label="Previous page" disabled={f.page === 0} onClick={() => setF((x) => ({ ...x, page: x.page - 1 }))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="icon" variant="outline" aria-label="Next page" disabled={(f.page + 1) * PAGE_SIZE >= total} onClick={() => setF((x) => ({ ...x, page: x.page + 1 }))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </Panel>
      </div>
    </DashboardLayout>
  );
};

export default PlatformActivityPage;
