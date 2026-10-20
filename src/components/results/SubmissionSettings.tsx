import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const FILE_TYPES = ["pdf", "docx", "xlsx", "pptx", "txt", "csv", "png", "jpg"] as const;
export const FORMATS = [
  { value: "none", label: "Marks only (no student submission)" },
  { value: "file", label: "Students upload a file" },
  { value: "text", label: "Students type an answer" },
  { value: "file_or_text", label: "File or typed answer" },
  { value: "online", label: "Timed online exam (typed answers)" },
] as const;

export interface SubmissionConfig {
  format: string;
  description: string;
  instructions: string;
  startsAt: string;
  deadlineAt: string;
  duration: string;
  fileTypes: string[];
  maxMb: string;
  maxFiles: string;
  latePolicy: string;
  penalty: string;
  attempts: string;
  rubric: { criterion: string; points: string }[];
}

export const defaultSubmission = (): SubmissionConfig => ({
  format: "none", description: "", instructions: "", startsAt: "", deadlineAt: "", duration: "", fileTypes: ["pdf", "docx", "png", "jpg", "txt"],
  maxMb: "5", maxFiles: "3", latePolicy: "not_allowed", penalty: "", attempts: "1", rubric: [],
});

const iso = (local: string) => (local ? new Date(local).toISOString() : null);

/** Validates the form and turns it into assessment columns, or returns the first problem. */
export const submissionColumns = (c: SubmissionConfig): { error: string } | { columns: Record<string, unknown> } => {
  const base: Record<string, unknown> = {
    description: c.description.trim() || null,
    instructions: c.instructions.trim() || null,
    submission_format: c.format,
  };
  if (c.format === "none") return { columns: base };
  if (!c.deadlineAt) return { error: "Set a submission deadline." };
  if (c.startsAt && new Date(c.deadlineAt) <= new Date(c.startsAt)) return { error: "The deadline must be after the start." };
  if (c.format === "online" && !(Number(c.duration) >= 1 && Number(c.duration) <= 600)) return { error: "An online exam needs a duration from 1 to 600 minutes." };
  if (c.format !== "text" && c.format !== "online" && c.fileTypes.length === 0) return { error: "Choose at least one allowed file type." };
  const rubric = c.rubric.filter((r) => r.criterion.trim());
  if (rubric.some((r) => !(Number(r.points) >= 0))) return { error: "Rubric points must be numbers." };
  const penalty = c.latePolicy === "penalty" ? Number(c.penalty) : null;
  if (c.latePolicy === "penalty" && !(penalty !== null && penalty >= 0 && penalty <= 100)) return { error: "Enter a late penalty from 0 to 100%." };
  return {
    columns: {
      ...base,
      starts_at: iso(c.startsAt),
      deadline_at: iso(c.deadlineAt),
      duration_minutes: c.duration ? Number(c.duration) : null,
      allowed_file_types: c.fileTypes,
      max_file_mb: Number(c.maxMb) || 5,
      max_files: Number(c.maxFiles) || 3,
      late_policy: c.latePolicy,
      late_penalty_percent: penalty,
      attempts_allowed: Number(c.attempts) || 1,
      rubric: rubric.map((r) => ({ criterion: r.criterion.trim(), points: Number(r.points) || 0 })),
    },
  };
};

const SubmissionFields = ({ value, onChange }: { value: SubmissionConfig; onChange: (v: SubmissionConfig) => void }) => {
  const set = (patch: Partial<SubmissionConfig>) => onChange({ ...value, ...patch });
  const takesFiles = value.format === "file" || value.format === "file_or_text";
  const on = value.format !== "none";

  return (
    <fieldset className="space-y-4 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold">Student work</legend>
      <div className="space-y-2">
        <Label htmlFor="sf-format">How do students respond?</Label>
        <Select value={value.format} onValueChange={(v) => set({ format: v })}>
          <SelectTrigger id="sf-format"><SelectValue /></SelectTrigger>
          <SelectContent>{FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sf-instr">Instructions for students</Label>
        <Textarea id="sf-instr" rows={3} maxLength={8000} value={value.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      </div>

      {on && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sf-start">Opens (optional)</Label>
              <Input id="sf-start" type="datetime-local" value={value.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf-deadline">Deadline</Label>
              <Input id="sf-deadline" type="datetime-local" value={value.deadlineAt} onChange={(e) => set({ deadlineAt: e.target.value })} />
            </div>
            {(value.format === "online" || value.duration) && (
              <div className="space-y-2">
                <Label htmlFor="sf-dur">Time allowed (minutes){value.format === "online" ? "" : " (optional)"}</Label>
                <Input id="sf-dur" inputMode="numeric" value={value.duration} onChange={(e) => set({ duration: e.target.value })} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="sf-att">Attempts allowed</Label>
              <Select value={value.attempts} onValueChange={(v) => set({ attempts: v })}>
                <SelectTrigger id="sf-att"><SelectValue /></SelectTrigger>
                <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {takesFiles && (
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-sm font-medium">Allowed file types</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {FILE_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={value.fileTypes.includes(t)}
                        onCheckedChange={(c) => set({ fileTypes: c ? [...value.fileTypes, t] : value.fileTypes.filter((x) => x !== t) })}
                      />
                      .{t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sf-mb">Largest file (MB, up to 10)</Label>
                  <Input id="sf-mb" inputMode="numeric" value={value.maxMb} onChange={(e) => set({ maxMb: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sf-files">Most files (up to 10)</Label>
                  <Input id="sf-files" inputMode="numeric" value={value.maxFiles} onChange={(e) => set({ maxFiles: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sf-late">Late work</Label>
              <Select value={value.latePolicy} onValueChange={(v) => set({ latePolicy: v })}>
                <SelectTrigger id="sf-late"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_allowed">Not accepted after the deadline</SelectItem>
                  <SelectItem value="allow">Accepted and marked late</SelectItem>
                  <SelectItem value="penalty">Accepted, marked late, with a suggested penalty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {value.latePolicy === "penalty" && (
              <div className="space-y-2">
                <Label htmlFor="sf-pen">Suggested penalty (%)</Label>
                <Input id="sf-pen" inputMode="decimal" value={value.penalty} onChange={(e) => set({ penalty: e.target.value })} />
                <p className="text-xs text-muted-foreground">Shown to you when marking. Scores are never changed automatically.</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Marking rubric (optional)</p>
            {value.rubric.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                <Input aria-label="Criterion" placeholder="Criterion" value={r.criterion} onChange={(e) => set({ rubric: value.rubric.map((x, j) => (j === i ? { ...x, criterion: e.target.value } : x)) })} />
                <Input aria-label="Points" inputMode="decimal" placeholder="Points" value={r.points} onChange={(e) => set({ rubric: value.rubric.map((x, j) => (j === i ? { ...x, points: e.target.value } : x)) })} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove criterion" onClick={() => set({ rubric: value.rubric.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => set({ rubric: [...value.rubric, { criterion: "", points: "" }] })}><Plus className="mr-1 h-4 w-4" /> Add criterion</Button>
          </div>
        </>
      )}
    </fieldset>
  );
};

export default SubmissionFields;
