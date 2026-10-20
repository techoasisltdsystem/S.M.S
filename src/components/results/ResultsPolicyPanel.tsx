import { useEffect, useState } from "react";
import { Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useGradeBands, useResultsActions, useResultsPolicy } from "@/hooks/useResults";
import { errorText } from "./shared";

interface BandDraft { min: string; grade: string; remark: string }

/** School policy for approvals and the grading scale used on every report. */
const ResultsPolicyPanel = ({ schoolId }: { schoolId: string }) => {
  const { toast } = useToast();
  const policy = useResultsPolicy(schoolId);
  const bands = useGradeBands(schoolId);
  const { setPolicy, setBands } = useResultsActions(schoolId);
  const [draft, setDraft] = useState<BandDraft[]>([]);

  useEffect(() => {
    if (bands.data) setDraft(bands.data.map((b) => ({ min: String(b.min_percent), grade: b.grade, remark: b.remark ?? "" })));
  }, [bands.data]);

  const toggle = async (patch: Parameters<typeof setPolicy.mutateAsync>[0], message: string) => {
    try {
      await setPolicy.mutateAsync(patch);
      toast({ title: message });
    } catch (e) {
      toast({ title: "Not changed", description: errorText(e), variant: "destructive" });
    }
  };

  const valid = draft.every((b) => b.grade.trim() && b.min.trim() !== "" && Number(b.min) >= 0 && Number(b.min) <= 100)
    && new Set(draft.map((b) => Number(b.min))).size === draft.length
    && (draft.length === 0 || draft.some((b) => Number(b.min) === 0));

  const saveBands = async () => {
    try {
      await setBands.mutateAsync(draft.map((b) => ({ min_percent: Number(b.min), grade: b.grade.trim(), remark: b.remark.trim() })));
      toast({ title: draft.length ? "Grading scale saved" : "Grading scale cleared" });
    } catch (e) {
      toast({ title: "Grading scale not saved", description: errorText(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Approval policy" icon={Settings2}>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 pb-3">
            <div>
              <p className="text-sm font-medium">Require approval before results are published</p>
              <p className="text-xs text-muted-foreground">On: an administrator approves and publishes. Off: the subject teacher can publish their own submitted results.</p>
            </div>
            <Switch
              checked={policy.data?.results_approval_required ?? true}
              disabled={policy.isLoading || setPolicy.isPending}
              onCheckedChange={(v) => toggle({ results_approval_required: v }, v ? "Approval required" : "Teachers can publish directly")}
              aria-label="Require approval before results are published"
            />
          </div>
          <div className="flex items-center justify-between gap-4 pt-3">
            <div>
              <p className="text-sm font-medium">Require approval for corrections to published results</p>
              <p className="text-xs text-muted-foreground">On: the published result stays unchanged until an administrator approves a teacher's correction. Administrators' own corrections apply at once and are always recorded.</p>
            </div>
            <Switch
              checked={policy.data?.correction_approval_required ?? true}
              disabled={policy.isLoading || setPolicy.isPending}
              onCheckedChange={(v) => toggle({ correction_approval_required: v }, v ? "Corrections need approval" : "Teacher corrections apply at once")}
              aria-label="Require approval for corrections"
            />
          </div>
        </div>
      </Panel>

      <Panel title="Grading scale" icon={Settings2}>
        <p className="mb-3 text-xs text-muted-foreground">
          Grades appear on reports only if you set a scale here. Each grade starts at its minimum percentage; one must start at 0.
        </p>
        <ul className="space-y-2">
          {draft.map((b, i) => (
            <li key={i} className="grid grid-cols-[5rem_5rem_1fr_auto] items-center gap-2">
              <Input aria-label="Minimum percent" inputMode="decimal" value={b.min} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} placeholder="Min %" />
              <Input aria-label="Grade" value={b.grade} maxLength={10} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} placeholder="Grade" />
              <Input aria-label="Remark" value={b.remark} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, remark: e.target.value } : x)))} placeholder="Remark (optional)" />
              <Button variant="ghost" size="icon" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} aria-label="Remove this grade"><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setDraft((d) => [...d, { min: "", grade: "", remark: "" }])}><Plus className="mr-1 h-4 w-4" /> Add grade</Button>
          <Button size="sm" disabled={!valid || setBands.isPending} onClick={saveBands}>
            {setBands.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save grading scale
          </Button>
        </div>
        {!valid && draft.length > 0 && <p role="alert" className="mt-2 text-xs text-destructive">Each row needs a grade and a different percentage from 0 to 100, and one row must start at 0.</p>}
      </Panel>
    </div>
  );
};

export default ResultsPolicyPanel;
