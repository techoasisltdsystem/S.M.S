import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, MessageSquare } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Switch } from "@/components/ui/switch";
import { useAuth, MEMBER_ROLE_LABEL, type MemberRole } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/db";

const PERMISSION_LABEL: Record<string, { label: string; hint: string }> = {
  "students.view": { label: "View student records", hint: "Profiles, classes and guardians for every student" },
  "attendance.view": { label: "View attendance", hint: "Registers and attendance summaries" },
  "attendance.record": { label: "Take attendance", hint: "Mark and submit registers" },
  "grades.view": { label: "View results", hint: "Assessments and marks (not drafts students cannot see)" },
  "grades.enter": { label: "Enter results", hint: "Record marks for classes they are assigned" },
  "communications.manage": { label: "Post school notices and events", hint: "Announcements to the school and the calendar" },
  "fees.invoice": { label: "Raise fee invoices", hint: "Fees and payments records" },
};

interface MatrixRow {
  role: MemberRole;
  permission: string;
  granted: boolean;
  is_default: boolean;
}

const RolePermissionsPage = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();

  const matrix = useQuery({
    queryKey: ["role-matrix", schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<MatrixRow[]> => {
      const { data, error } = await db.rpc("role_permission_matrix", { _school: schoolId });
      if (error) throw new Error(error.message);
      return (data ?? []) as MatrixRow[];
    },
  });

  const students = useQuery({
    queryKey: ["students-can-message", schoolId],
    enabled: !!schoolId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db.from("school_config").select("students_can_message").eq("school_id", schoolId).maybeSingle();
      if (error) throw new Error(error.message);
      return !!data?.students_can_message;
    },
  });

  const setPermission = useMutation({
    mutationFn: async (v: { role: MemberRole; permission: string; granted: boolean }) => {
      const { error } = await db.rpc("set_role_permission", { _school: schoolId, _role: v.role, _permission: v.permission, _granted: v.granted });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-matrix", schoolId] }),
    onError: (e) => toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }),
  });

  const setStudentMessaging = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await db.from("school_config").update({ students_can_message: on }).eq("school_id", schoolId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, on) => {
      qc.invalidateQueries({ queryKey: ["students-can-message", schoolId] });
      qc.invalidateQueries({ queryKey: ["message-recipients", schoolId] });
      toast({ title: on ? "Students can now message their teachers" : "Student messaging turned off" });
    },
    onError: (e) => toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }),
  });

  const byRole = useMemo(() => {
    const m = new Map<MemberRole, MatrixRow[]>();
    (matrix.data ?? []).forEach((r) => m.set(r.role, [...(m.get(r.role) ?? []), r]));
    return [...m.entries()];
  }, [matrix.data]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">Roles and permissions</h1>
          <p className="text-sm text-muted-foreground">Choose what each staff role can do in your school. Changes apply straight away and are recorded in the audit log.</p>
        </div>

        <Panel title="Messaging" icon={MessageSquare}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Let students message their teachers and office staff</p>
              <p className="text-xs text-muted-foreground">Off by default. Students can never message other students or parents.</p>
            </div>
            <Switch
              checked={!!students.data}
              disabled={students.isLoading || setStudentMessaging.isPending}
              onCheckedChange={(on) => setStudentMessaging.mutate(on)}
              aria-label="Allow student messaging"
            />
          </div>
        </Panel>

        {matrix.isLoading && <LoadingRows rows={6} />}
        {matrix.isError && <ErrorBox message={errMsg(matrix.error, "Could not load permissions.")} onRetry={() => matrix.refetch()} />}

        {byRole.map(([role, rows]) => (
          <Panel key={role} title={MEMBER_ROLE_LABEL[role]}>
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const info = PERMISSION_LABEL[r.permission] ?? { label: r.permission, hint: "" };
                return (
                  <li key={r.permission} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{info.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {info.hint}
                        {r.granted !== r.is_default && <span className="ml-1 font-medium text-primary">· changed for your school</span>}
                      </p>
                    </div>
                    <Switch
                      checked={r.granted}
                      disabled={setPermission.isPending}
                      onCheckedChange={(granted) => setPermission.mutate({ role, permission: r.permission, granted })}
                      aria-label={`${info.label} for ${MEMBER_ROLE_LABEL[role]}`}
                    />
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}

        <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          User management, school settings, the audit log and refunds are fixed to administrators and cannot be handed to other roles. Teachers only ever reach the classes they are assigned.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default RolePermissionsPage;
