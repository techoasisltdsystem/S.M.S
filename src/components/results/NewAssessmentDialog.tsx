import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useYearAndTerm } from "@/hooks/useSchoolData";
import type { Database } from "@/integrations/supabase/types";
import { errorText, KINDS, type Lookups } from "./shared";

type Kind = Database["public"]["Enums"]["assessment_kind"];
const NO_TERM = "none";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  /** The teacher's own class + subject pairs. */
  pairs: { class_id: string; subject_id: string }[];
  lookups: Lookups;
  onSaved: () => void;
}

const NewAssessmentDialog = ({ open, onOpenChange, schoolId, pairs, lookups, onSaved }: Props) => {
  const { toast } = useToast();
  const yt = useYearAndTerm(schoolId);
  const [pair, setPair] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("test");
  const [max, setMax] = useState("100");
  const [due, setDue] = useState("");
  const [term, setTerm] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const options = useMemo(
    () =>
      pairs.map((p) => ({
        value: `${p.class_id}|${p.subject_id}`,
        label: `${lookups.className.get(p.class_id) ?? "Class"} · ${lookups.subjectName.get(p.subject_id) ?? "Subject"}`,
      })),
    [pairs, lookups.className, lookups.subjectName],
  );
  const terms = yt.data?.terms ?? [];
  const termValue = term || yt.data?.term?.id || NO_TERM;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const maxScore = Number(max);
    if (!pair) return toast({ title: "Choose a class and subject", variant: "destructive" });
    if (!title.trim()) return toast({ title: "Give the assessment a title", variant: "destructive" });
    if (!Number.isFinite(maxScore) || maxScore <= 0) return toast({ title: "Maximum score must be above 0", variant: "destructive" });
    const [class_id, subject_id] = pair.split("|");
    setSaving(true);
    try {
      const { error } = await db.from("assessments").insert({
        school_id: schoolId,
        class_id,
        subject_id,
        title: title.trim(),
        kind,
        max_score: maxScore,
        due_on: due || null,
        term_id: termValue === NO_TERM ? null : termValue,
      });
      if (error) throw error;
      toast({ title: "Assessment created", description: "It starts as a draft. Enter marks, then submit for approval." });
      onSaved();
      onOpenChange(false);
      setTitle("");
      setDue("");
    } catch (err) {
      toast({ title: "Could not create the assessment", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">New assessment</DialogTitle>
          <DialogDescription>For a class and subject you teach. It starts as a draft only you can see.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="na-pair">Class and subject</Label>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger id="na-pair"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="na-title">Title</Label>
            <Input id="na-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="na-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger id="na-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="na-max">Maximum score</Label>
              <Input id="na-max" type="number" min={1} step="0.5" value={max} onChange={(e) => setMax(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="na-due">Due date (optional)</Label>
              <Input id="na-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="na-term">Term (optional)</Label>
              <Select value={termValue} onValueChange={setTerm}>
                <SelectTrigger id="na-term"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TERM}>No term</SelectItem>
                  {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create assessment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewAssessmentDialog;
