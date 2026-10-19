import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";

export interface AdminOverview {
  accounts: number;
  activeAccounts: number;
  roleCounts: Record<"admin" | "teacher" | "student" | "parent", number>;
  recent: { id: string; action: string; actor: string | null; target: string | null; at: string }[];
}

/** Reads real counts and the latest audit entries. Only the admin dashboard calls this. */
export const useAdminOverview = (enabled: boolean) =>
  useQuery({
    queryKey: ["admin-overview"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminOverview> => {
      const [profiles, active, roles, audit] = await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
        db.from("user_roles").select("role"),
        db
          .from("audit_logs")
          .select("id, action, actor_name, target_name, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      const firstError = profiles.error || active.error || roles.error || audit.error;
      if (firstError) throw new Error(firstError.message);

      const roleCounts = { admin: 0, teacher: 0, student: 0, parent: 0 };
      (roles.data ?? []).forEach((r) => {
        roleCounts[r.role] += 1;
      });
      return {
        accounts: profiles.count ?? 0,
        activeAccounts: active.count ?? 0,
        roleCounts,
        recent: (audit.data ?? []).map((a) => ({
          id: a.id,
          action: a.action,
          actor: a.actor_name,
          target: a.target_name,
          at: a.created_at,
        })),
      };
    },
  });
