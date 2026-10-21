import { useState } from "react";
import { Eye, KeyRound, LifeBuoy, Loader2, LogOut } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import SupportThread, { StatusPill } from "@/components/support/SupportThread";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useAccessGrants, useConsoleActions, useSubscriptions, useSupportRequests, type AccessGrant } from "@/hooks/usePlatformConsole";
import { rpc } from "@/lib/rpc";
import { cn } from "@/lib/utils";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

export const ACCESS_LABEL: Record<string, string> = {
  requested: "Waiting for the school", approved: "Active", expired: "Expired", denied: "Declined", revoked: "Withdrawn by the school", ended: "Ended by support",
};
export const AccessPill = ({ status }: { status: string }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium",
    status === "approved" ? "bg-success/10 text-success" : status === "requested" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
    {ACCESS_LABEL[status] ?? status}
  </span>
);

interface SupportView {
  expires_at: string;
  school: Record<string, string>;
  settings: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  people_counts: Record<string, number>;
  staff_accounts: { name: string; email: string | null; role: string; status: string }[];
  recent_activity: { created_at: string; actor_role: string | null; action: string; target_type: string; details: Record<string, unknown> }[];
}

/** Who on the platform team has picked up each request. */
const useAssignments = () => ({
  list: useQuery({ queryKey: ["support-assignments"], queryFn: () => rpc<{ request_id: string; assignee_id: string; assignee_email: string }[]>("support_assignments") }),
  team: useQuery({ queryKey: ["support-team"], staleTime: 60_000, queryFn: () => rpc<{ user_id: string; email: string }[]>("platform_admin_list") }),
});

const SupportViewDialog = ({ grant, onClose }: { grant: AccessGrant | null; onClose: () => void }) => {
  const view = useQuery({ queryKey: ["support-view", grant?.id], enabled: !!grant, retry: false, staleTime: Infinity, refetchOnWindowFocus: false, queryFn: () => rpc<SupportView>("support_view_school", { _grant: grant!.id }) });
  const v = view.data;
  return (
    <Dialog open={!!grant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Support view: {grant?.school_name}</DialogTitle>
          <DialogDescription>Read-only. Every view is written to the school's audit log. Access ends {when(grant?.expires_at ?? null)}.</DialogDescription>
        </DialogHeader>
        {view.isLoading && <LoadingRows rows={4} />}
        {view.isError && <ErrorBox message={errMsg(view.error)} onRetry={() => view.refetch()} />}
        {v && (
          <div className="space-y-4 text-sm">
            <section className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.entries({ ...v.school, ...(v.subscription ?? {}) }).map(([k, val]) => (
                <div key={k}><p className="text-xs capitalize text-muted-foreground">{k.replace(/_/g, " ")}</p><p className="font-medium">{String(val ?? "—")}</p></div>
              ))}
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Settings</p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">{Object.entries(v.settings ?? {}).map(([k, val]) => <li key={k}><span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span> {String(val)}</li>)}</ul>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Accounts by role and status</p>
              <p>{Object.entries(v.people_counts).map(([k, n]) => `${k.replace(":", " ").replace(/_/g, " ")}: ${n}`).join(" · ") || "None"}</p>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff accounts</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {v.staff_accounts.map((s, i) => <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span>{s.name} <span className="text-muted-foreground">{s.email}</span></span><span className="text-xs text-muted-foreground">{s.role.replace(/_/g, " ")} · {s.status}</span></li>)}
              </ul>
            </section>
            <section>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity (no names or content)</p>
              <ul className="space-y-1 text-xs">
                {v.recent_activity.map((a, i) => <li key={i}>{when(a.created_at)} · {a.actor_role ?? "system"} · {a.action.replace(/_/g, " ")} · {a.target_type}</li>)}
              </ul>
            </section>
            <p className="text-xs text-muted-foreground">Pupils, parents, marks, attendance and messages are never shown through support access.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const RequestAccessDialog = ({ open, onClose, schoolId }: { open: boolean; onClose: () => void; schoolId?: string }) => {
  const { toast } = useToast();
  const schools = useSubscriptions();
  const { requestAccess } = useConsoleActions();
  const [school, setSchool] = useState(schoolId ?? "");
  const [reason, setReason] = useState("");
  const [hours, setHours] = useState("2");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Ask a school for support access</DialogTitle>
          <DialogDescription>The school's administrator must approve it. You will see settings and staff accounts only, read-only, for the hours you ask for. The school sees your reason and every use.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ra-school">School</Label>
            <Select value={school} onValueChange={setSchool}>
              <SelectTrigger id="ra-school"><SelectValue placeholder="Choose a school" /></SelectTrigger>
              <SelectContent>{(schools.data ?? []).map((s) => <SelectItem key={s.school_id} value={s.school_id}>{s.school_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ra-reason">Reason (at least 20 characters)</Label>
            <Textarea id="ra-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ra-hours">For how long</Label>
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger id="ra-hours"><SelectValue /></SelectTrigger>
              <SelectContent>{[1, 2, 4, 8, 24].map((h) => <SelectItem key={h} value={String(h)}>{h} hour{h === 1 ? "" : "s"}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!school || reason.trim().length < 20 || requestAccess.isPending}
            onClick={async () => {
              try {
                await requestAccess.mutateAsync({ school, reason: reason.trim(), hours: Number(hours), request: null });
                toast({ title: "Request sent to the school" });
                setReason("");
                onClose();
              } catch (e) { toast({ title: "Not sent", description: errMsg(e), variant: "destructive" }); }
            }}
          >
            {requestAccess.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const PlatformSupportPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { list: assigned, team } = useAssignments();
  const assignee = (id: string) => (assigned.data ?? []).find((a) => a.request_id === id)?.assignee_id ?? "";
  const assign = async (request: string, user: string) => {
    try { await rpc("support_assign", { _request: request, _user: user || null }); toast({ title: user ? "Request assigned" : "Assignment removed" }); void qc.invalidateQueries({ queryKey: ["support-assignments"] }); }
    catch (e) { toast({ title: "Not assigned", description: errMsg(e), variant: "destructive" }); }
  };
  const [status, setStatus] = useState("active");
  const requests = useSupportRequests(null, status === "all" ? null : status);
  const grants = useAccessGrants(null);
  const { endAccess } = useConsoleActions();
  const [openId, setOpenId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [viewing, setViewing] = useState<AccessGrant | null>(null);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground">Requests from school administrators, and time-limited access that a school has approved.</p>
        </div>
        <Tabs defaultValue="requests">
          <TabsList><TabsTrigger value="requests">Requests</TabsTrigger><TabsTrigger value="access">Support access</TabsTrigger></TabsList>
          <TabsContent value="requests" className="mt-4">
            <Panel title="Support requests" icon={LifeBuoy}>
              <div className="mb-3 flex justify-end">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-48" aria-label="Show"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Needing attention</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
                </Select>
              </div>
              {requests.isLoading && <LoadingRows />}
              {requests.isError && <ErrorBox message={errMsg(requests.error)} onRetry={() => requests.refetch()} />}
              {!requests.isLoading && (requests.data ?? []).length === 0 && <EmptyState icon={LifeBuoy} title="No requests here" />}
              <ul className="divide-y divide-border">
                {(requests.data ?? []).map((r) => (
                  <li key={r.id}>
                    <button className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-muted/40 focus:bg-muted/40 focus:outline-none" onClick={() => setOpenId(r.id)}>
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.subject}</span><span className="text-xs text-muted-foreground">{r.school_name} · {r.messages} message{r.messages === 1 ? "" : "s"} · updated {when(r.updated_at)}</span></span>
                      <span className={cn("text-xs capitalize", r.priority === "urgent" || r.priority === "high" ? "font-semibold text-destructive" : "text-muted-foreground")}>{r.priority}</span>
                      <StatusPill status={r.status} />
                    </button>
                    <div className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
                      <label htmlFor={"as-" + r.id}>Assigned to</label>
                      <select id={"as-" + r.id} disabled={!can("support.manage")} value={assignee(r.id)} onChange={(e) => void assign(r.id, e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="">Nobody yet</option>
                        {(team.data ?? []).map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>
          <TabsContent value="access" className="mt-4">
            <Panel title="Support access" icon={KeyRound}>
              <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setAsking(true)}><KeyRound className="mr-1 h-4 w-4" /> Ask for access</Button></div>
              {grants.isLoading && <LoadingRows />}
              {grants.isError && <ErrorBox message={errMsg(grants.error)} onRetry={() => grants.refetch()} />}
              {!grants.isLoading && (grants.data ?? []).length === 0 && <EmptyState icon={KeyRound} title="No access requests yet" />}
              <ul className="divide-y divide-border">
                {(grants.data ?? []).map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{g.school_name}</span>
                      <span className="block text-xs text-muted-foreground">{g.reason}</span>
                      <span className="block text-xs text-muted-foreground">By {g.requested_label} · {g.hours} h · asked {when(g.created_at)}{g.expires_at ? ` · until ${when(g.expires_at)}` : ""} · used {g.uses}×</span>
                    </span>
                    <AccessPill status={g.effective_status} />
                    {g.mine && g.effective_status === "approved" && (
                      <>
                        <Button size="sm" onClick={() => setViewing(g)}><Eye className="mr-1 h-4 w-4" /> Open</Button>
                        <Button size="sm" variant="outline" disabled={endAccess.isPending}
                          onClick={async () => { try { await endAccess.mutateAsync(g.id); toast({ title: "Access ended" }); } catch (e) { toast({ title: "Not ended", description: errMsg(e), variant: "destructive" }); } }}>
                          <LogOut className="mr-1 h-4 w-4" /> End
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
      <SupportThread id={openId} side="platform" onClose={() => setOpenId(null)} />
      <RequestAccessDialog open={asking} onClose={() => setAsking(false)} />
      <SupportViewDialog grant={viewing} onClose={() => setViewing(null)} />
    </DashboardLayout>
  );
};

export default PlatformSupportPage;
