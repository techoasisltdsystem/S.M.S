import { useQuery } from "@tanstack/react-query";
import { Activity, Database, HeartPulse, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { stamp } from "@/hooks/useBilling";
import { useMonitoringStatus } from "@/hooks/useAuditMonitoring";
import { rpc } from "@/lib/rpc";

interface Health {
  schools: number; suspended_schools: number; people: number; platform_admins: number; disabled_platform_admins: number;
  pending_invitations: number; audit_events_24h: number; database_size_bytes: number; server_time: string;
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 border-b border-border py-2 text-sm last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
);
const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`);

/** Real counts straight from the database; nothing on this page is an estimate. */
const PlatformHealthPage = () => {
  const q = useQuery({ queryKey: ["platform-health"], queryFn: () => rpc<Health>("platform_health"), refetchInterval: 60_000 });
  const mon = useMonitoringStatus();
  const h = q.data;
  const m = mon.data;
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">System health</h1>
          <p className="text-sm text-muted-foreground">Whether the platform and its background checks are running. Refreshes every minute.</p>
        </div>
        {q.isLoading && <LoadingRows rows={4} />}
        {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
        {h && (
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="Platform" icon={HeartPulse}>
              <dl>
                <Row k="Schools" v={`${h.schools} (${h.suspended_schools} suspended)`} />
                <Row k="People with a school login" v={h.people} />
                <Row k="Invitations waiting" v={h.pending_invitations} />
                <Row k="Audit events, last 24 hours" v={h.audit_events_24h} />
              </dl>
            </Panel>
            <Panel title="Database" icon={Database}>
              <dl>
                <Row k="Size" v={mb(h.database_size_bytes)} />
                <Row k="Database clock" v={stamp(h.server_time)} />
              </dl>
            </Panel>
            <Panel title="Super Admin access" icon={ShieldCheck}>
              <dl>
                <Row k="Active Super Admins" v={h.platform_admins} />
                <Row k="Switched off" v={h.disabled_platform_admins} />
              </dl>
            </Panel>
            <Panel title="Scheduled checks" icon={Activity}>
              {!m ? <p className="text-sm text-muted-foreground">{mon.isLoading ? "Loading…" : "Check status is unavailable."}</p> : (
                <dl>
                  <Row k="Last run" v={m.last_tick_at ? stamp(m.last_tick_at) : "Never"} />
                  <Row k="State" v={m.stale ? <span className="text-destructive">Overdue: the scheduled job is not running</span> : <span className="text-success">Running</span>} />
                </dl>
              )}
            </Panel>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PlatformHealthPage;
