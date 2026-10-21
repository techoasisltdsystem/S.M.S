import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useFeeSettings } from "@/hooks/useFeeAdmin";
import { rpc } from "@/lib/rpc";

/** How this school collects fees: who may pay online, whether offline payments need a second person, and overdue reminders. */
const FeeSettingsPanel = ({ schoolId }: { schoolId: string }) => {
  const { can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useFeeSettings(schoolId);
  const edit = can("school.settings.manage");
  const [f, setF] = useState({ approval: false, student: false, days: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setF({ approval: q.data.offline_approval, student: q.data.student_pay, days: (q.data.overdue_days ?? []).join(", ") }); }, [q.data]);

  const save = async () => {
    setBusy(true);
    try {
      await rpc("save_fee_settings", { _school: schoolId, _offline_approval: f.approval, _student_pay: f.student, _overdue_days: f.days.split(/[ ,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n)) });
      toast({ title: "Fee settings saved" }); void qc.invalidateQueries({ queryKey: ["fee-settings"] });
    } catch (e) { toast({ title: "Not saved", description: errMsg(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="Fee settings" icon={Settings}>
      {q.isLoading && <LoadingRows rows={2} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="max-w-xl space-y-4 text-sm">
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={!edit} checked={f.approval} onChange={(e) => setF({ ...f, approval: e.target.checked })} />
            <span><span className="font-medium">Offline payments need approval</span><span className="block text-xs text-muted-foreground">Cash and bank payments recorded by finance staff wait for a school administrator or headteacher. Waiting payments are not counted as paid and the family is not told until approval. A person cannot approve their own entry.</span></span></label>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={!edit} checked={f.student} onChange={(e) => setF({ ...f, student: e.target.checked })} />
            <span><span className="font-medium">Students may pay their own fees online</span><span className="block text-xs text-muted-foreground">Off by default: parents and guardians always can. When off, students see their fees and are told to ask a parent or guardian to pay.</span></span></label>
          <div className="space-y-1.5"><Label htmlFor="fs-days">Overdue reminders (days after the due date)</Label><Input id="fs-days" disabled={!edit} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} className="max-w-xs" /><p className="text-xs text-muted-foreground">For example 1, 7, 14. Reminders before the deadline are set on each period.</p></div>
          {edit ? <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save settings</Button> : <p className="text-xs text-muted-foreground">Only people who manage school settings can change these.</p>}
        </div>
      )}
    </Panel>
  );
};

export default FeeSettingsPanel;
