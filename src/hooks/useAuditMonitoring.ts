import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";

export type Severity = "critical" | "high" | "medium" | "low";

export interface Incident {
  id: string;
  ref: string;
  detected_at: string;
  last_seen_at: string;
  school_name: string | null;
  module: string;
  category: string;
  severity: Severity;
  status: "open" | "acknowledged" | "investigating" | "resolved" | "closed";
  operation: string | null;
  occurrences: number;
  business_outcome: string;
  assigned_to_label: string | null;
}

export interface IncidentDetail {
  incident: Incident & {
    summary: string;
    recommended_steps: string;
    diagnostics: Record<string, unknown>;
    event_ref: string | null;
    resolution_note: string | null;
    verified_ok: boolean | null;
    verified_at: string | null;
    resolved_at: string | null;
  };
  events: { at: string; kind: string; note: string | null; actor: string; details: Record<string, unknown> }[];
}

export interface MonitoringStatus {
  last_tick_at: string | null;
  last_ok_at: string | null;
  last_status: string | null;
  stale: boolean;
  settings: { failure_threshold: number; window_minutes: number; stale_minutes: number; webhook_enabled: boolean };
  open: Partial<Record<Severity, number>>;
  unresolved: number;
  queue_pending: number;
  unread_alerts: number;
  recent_checks: { id: string; ran_at: string; kind: string; status: "passed" | "failed"; checks: Record<string, { ok: boolean }> }[];
}

export interface PlatformAlert {
  id: string;
  created_at: string;
  incident_id: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string;
  read: boolean;
}

const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

const POLL = 30_000;

export const useMonitoringStatus = (enabled = true) =>
  useQuery({
    queryKey: ["audit-status"],
    enabled,
    refetchInterval: POLL,
    queryFn: async (): Promise<MonitoringStatus> => must(await db.rpc("audit_monitoring_status")) as unknown as MonitoringStatus,
  });

export const useIncidents = (scope: "active" | "closed") =>
  useQuery({
    queryKey: ["audit-incidents", scope],
    refetchInterval: POLL,
    queryFn: async (): Promise<Incident[]> => (must(await db.rpc("list_audit_incidents", { _scope: scope })) ?? []) as Incident[],
  });

export const useIncident = (id: string | null) =>
  useQuery({
    queryKey: ["audit-incident", id],
    enabled: !!id,
    queryFn: async (): Promise<IncidentDetail> => must(await db.rpc("get_audit_incident", { _id: id! })) as unknown as IncidentDetail,
  });

export const usePlatformAlerts = () =>
  useQuery({
    queryKey: ["platform-alerts"],
    refetchInterval: POLL,
    queryFn: async (): Promise<PlatformAlert[]> => (must(await db.rpc("list_platform_alerts", { _limit: 50 })) ?? []) as PlatformAlert[],
  });

export const usePlatformAdmins = () =>
  useQuery({
    queryKey: ["platform-admins"],
    staleTime: 5 * 60_000,
    queryFn: async () => must(await db.rpc("platform_admin_list")) ?? [],
  });

export const useAuditActions = () => {
  const qc = useQueryClient();
  const refresh = () => {
    ["audit-status", "audit-incidents", "audit-incident", "platform-alerts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  return {
    runCheck: useMutation({
      mutationFn: async () => must(await db.rpc("run_audit_health_check")) as unknown as { status: "passed" | "failed" },
      onSuccess: refresh,
    }),
    act: useMutation({
      mutationFn: async (v: { id: string; action: "acknowledge" | "assign" | "note" | "resolve" | "verify" | "close"; note?: string; assignee?: string }) =>
        must(await db.rpc("audit_incident_action", { _id: v.id, _action: v.action, _note: v.note, _assignee: v.assignee })) as unknown as { status: string; verified: boolean | null },
      onSuccess: refresh,
    }),
    settings: useMutation({
      mutationFn: async (v: { threshold: number; window: number; stale: number; webhook: boolean }) => {
        must(await db.rpc("set_audit_settings", { _threshold: v.threshold, _window: v.window, _stale: v.stale, _webhook: v.webhook }));
      },
      onSuccess: refresh,
    }),
    markRead: useMutation({
      mutationFn: async (id?: string) => {
        must(await db.rpc("mark_platform_alerts_read", { _id: id }));
      },
      onSuccess: refresh,
    }),
  };
};
