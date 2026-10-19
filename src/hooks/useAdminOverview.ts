import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import type { MemberRole } from "@/contexts/AuthContext";

export interface AdminOverview {
  accounts: number;
  activeAccounts: number;
  roleCounts: Record<"admin" | "teacher" | "student" | "parent", number>;
  recent: { id: string; action: string; actor: string | null; target: string | null; at: string }[];
}

/** Reads real counts for one school and its latest audit entries. Only the admin dashboard calls this. */
export const useAdminOverview = (schoolId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["admin-overview", schoolId],
    enabled: enabled && !!schoolId,
    staleTime: 60_000,
    queryFn: async (): Promise<AdminOverview> => {
      const [profiles, active, roles, audit] = await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        db.from("profiles").select("id", { count: "exact", head: true }).eq("school_id", schoolId!).eq("status", "active"),
        db.from("school_memberships").select("role").eq("school_id", schoolId!).neq("status", "suspended"),
        db
          .from("audit_logs")
          .select("id, action, actor_name, target_name, created_at")
          .eq("school_id", schoolId!)
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      const firstError = profiles.error || active.error || roles.error || audit.error;
      if (firstError) throw new Error(firstError.message);

      const roleCounts = { admin: 0, teacher: 0, student: 0, parent: 0 };
      const layout: Record<MemberRole, keyof typeof roleCounts> = {
        school_admin: "admin", finance_officer: "admin", auditor: "admin",
        teacher: "teacher", student: "student", parent: "parent",
      };
      (roles.data ?? []).forEach((r) => {
        roleCounts[layout[r.role]] += 1;
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
