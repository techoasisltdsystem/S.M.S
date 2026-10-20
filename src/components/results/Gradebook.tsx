import { useMemo, useState } from "react";
import { ArrowLeft, Info, Loader2, Save, Send } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { useToast } from "@/hooks/use-toast";
import { average, pct, type Assessment, type Enrollment, type Mark } from "@/hooks/useSchoolData";
import { useResultsPolicy } from "@/hooks/useResults";
import { CorrectionDialog, HistoryDialog } from "./CorrectionTools";
import AssignmentPanel from "./AssignmentPanel";
import { errorText, fmtDate, fmtNum, StatusChip, type Lookups } from "./shared";

interface Props {
  assessment: Assessment;
  enrollments: Enrollment[];
  marks: Mark[];
  lookups: Lookups;
  schoolId: string;
  onBack: () => void;
  onChanged: () => void;
}

interface Row { score: string; comment: string }

/** Draft: editable marks. Anything else: read-only. Mount with key={assessment.id}. */
const Gradebook = ({ assessment: a, enrollments, marks, lookups, schoolId, onBack, onChanged }: Props) => {
  const { toast } = useToast();
  const policy = useResultsPolicy(schoolId);
  const direct = policy.data?.results_approval_required === false;
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const editable = a.status === "draft";
  const students = useMemo(
    () =>
      enrollments
        .filter((e) => e.class_id === a.class_id && e.status === "active")
        .map((e) => ({ id: e.student_id, name: lookups.personName.get(e.student_id) ?? "Unnamed student" }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    [enrollments, a.class_id, lookups.personName],
  );
  const saved = useMemo(() => new Map(marks.filter((m) => m.assessment_id === a.id).map((m) => [m.student_id, m])), [marks, a.id]);
  const initial = useMemo(() => {
    const r: Record<string, Row> = {};
    saved.forEach((m, id) => { r[id] = { score: m.score === null ? "" : String(m.score), comment: m.comment ?? "" }; });
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rows, setRows] = useState<Record<string, Row>>(initial);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [dirty, setDirty] = useState(false);

  const set = (id: string, patch: Partial<Row>) => {
    setDirty(true);
    setRows((r) => ({ ...r, [id]: { score: "", comment: "", ...r[id], ...patch } }));
  };

  const scoreOf = (id: string): number | null => {
    const raw = editable ? rows[id]?.score : saved.get(id)?.score;
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const percents = students.map((s) => scoreOf(s.id)).filter((n): n is number => n !== null).map((n) => pct(n, a.max_score));
  const avg = average(percents);

  const save = async (): Promise<boolean> => {
    const payload = [];
    for (const s of students) {
      const r = rows[s.id];
      if (!r) continue;
      const hasScore = r.score.trim() !== "";
      const n = Number(r.score);
      if (hasScore && (!Number.isFinite(n) || n < 0 || n > a.max_score)) {
        toast({ title: `Check ${s.name}'s score`, description: `Scores must be between 0 and ${fmtNum(a.max_score)}.`, variant: "destructive" });
        return false;
      }
      if (!hasScore && !r.comment.trim() && !saved.has(s.id)) continue;
      payload.push({
        school_id: schoolId,
        assessment_id: a.id,
        student_id: s.id,
        score: hasScore ? n : null,
        comment: r.comment.trim() || null,
      });
    }
    if (payload.length === 0) {
      toast({ title: "Nothing to save yet", description: "Enter at least one score." });
      return false;
    }
    const { error } = await db.from("marks").upsert(payload, { onConflict: "assessment_id,student_id" });
    if (error) {
      toast({ title: "Could not save marks", description: errorText(error), variant: "destructive" });
      return false;
    }
    setDirty(false);
    onChanged();
    return true;
  };

  const onSave = async () => {
    setBusy("save");
    try {
      if (await save()) toast({ title: "Marks saved" });
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async () => {
    setBusy("submit");
    try {
      if (dirty && !(await save())) return;
      const { error } = await db.rpc("move_assessment", { _assessment: a.id, _to: "submitted" });
      if (error) {
        toast({ title: "Could not submit", description: errorText(error), variant: "destructive" });
        return;
      }
      if (direct) {
        const pub = await db.rpc("move_assessment", { _assessment: a.id, _to: "published" });
        if (pub.error) {
          toast({ title: "Submitted, but not published", description: errorText(pub.error), variant: "destructive" });
          onChanged();
          onBack();
          return;
        }
        toast({ title: "Results published", description: "Students and parents have been notified." });
      } else {
        toast({ title: "Submitted for approval", description: "Marks are now locked unless an approver reopens them." });
      }
      onChanged();
      onBack();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft className="mr-1 h-4 w-4" /> All assessments</Button>
      <Panel title={a.title}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <StatusChip status={a.status} />
          <span>{lookups.className.get(a.class_id)} · {lookups.subjectName.get(a.subject_id)}</span>
          <span className="capitalize">{a.kind}</span>
          <span>Out of {fmtNum(a.max_score)}</span>
          <span>Due {fmtDate(a.due_on)}</span>
          <span className="font-medium text-card-foreground">
            Class average: {avg === null ? "no marks yet" : `${avg.toFixed(1)}%`}
          </span>
        </div>
        {!editable && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {a.status === "published"
              ? "These results are published and read-only. To change a score, use Correct: the old value is kept in the history."
              : `These results are ${a.status} and read-only. Only an approver can reopen them for changes.`}
          </p>
        )}
      </Panel>

      <AssignmentPanel assessment={a} />

      {students.length === 0 ? (
        <EmptyState icon={Info} title="No students in this class" text="Students appear here once the school enrols them in the class." action={{ to: "/classes", label: "Go to classes" }} />
      ) : (
        <Panel title={`Marks (${students.length} students)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Score / {fmtNum(a.max_score)}</th>
                  <th className="px-3 py-2 font-medium">%</th>
                  <th className="px-3 py-2 font-medium">Comment</th>
                  {a.status === "published" && <th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const n = scoreOf(s.id);
                  const m = saved.get(s.id);
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0">
                      <td className="py-2 pr-3 font-medium text-card-foreground">{s.name}</td>
                      <td className="px-3 py-2">
                        {editable ? (
                          <Input
                            type="number" inputMode="decimal" min={0} max={a.max_score} step="0.5"
                            aria-label={`Score for ${s.name}`}
                            className="h-9 w-24"
                            value={rows[s.id]?.score ?? ""}
                            onChange={(e) => set(s.id, { score: e.target.value })}
                          />
                        ) : (
                          <span>{n === null ? "—" : fmtNum(n)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{n === null ? "—" : `${pct(n, a.max_score).toFixed(0)}%`}</td>
                      <td className="px-3 py-2">
                        {editable ? (
                          <Input
                            aria-label={`Comment for ${s.name}`} className="h-9 min-w-48" maxLength={300}
                            value={rows[s.id]?.comment ?? ""}
                            onChange={(e) => set(s.id, { comment: e.target.value })}
                          />
                        ) : (
                          <span className="text-muted-foreground">{m?.comment || "—"}</span>
                        )}
                      </td>
                      {a.status === "published" && (
                        <td className="px-3 py-2">
                          {m && n !== null && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => setCorrecting(s.id)}>Correct</Button>
                              <Button size="sm" variant="ghost" onClick={() => setHistory(s.id)}>History</Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editable && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={onSave} disabled={busy !== null}>
                {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save marks
              </Button>
              <Button onClick={onSubmit} disabled={busy !== null || (saved.size === 0 && !dirty)}>
                {busy === "submit" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {direct ? "Submit and publish" : "Submit for approval"}
              </Button>
            </div>
          )}
        </Panel>
      )}
      {correcting && saved.get(correcting) && (
        <CorrectionDialog
          open
          onOpenChange={(o) => !o && setCorrecting(null)}
          schoolId={schoolId}
          assessment={a}
          mark={saved.get(correcting)!}
          studentName={lookups.personName.get(correcting) ?? "Student"}
        />
      )}
      {history && (
        <HistoryDialog
          open
          onOpenChange={(o) => !o && setHistory(null)}
          schoolId={schoolId}
          assessment={a}
          studentId={history}
          studentName={lookups.personName.get(history) ?? "Student"}
          lookups={lookups}
        />
      )}
    </div>
  );
};

export default Gradebook;
