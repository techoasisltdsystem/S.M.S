import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRefreshSchoolData, type SchoolClass } from "@/hooks/useSchoolData";
import { errMsg } from "./QueryState";

interface Props {
  student: { id: string; name: string; classId: string | null } | null;
  classes: SchoolClass[];
  onClose: () => void;
}

export const ChangeClassDialog = ({ student, classes, onClose }: Props) => {
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const [classId, setClassId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setClassId(""), [student?.id]);

  const save = async () => {
    if (!student || !classId) return;
    setBusy(true);
    const { error } = await db.rpc("enroll_student", { _class: classId, _student: student.id });
    setBusy(false);
    if (error) {
      toast({ title: "Could not change class", description: errMsg(error), variant: "destructive" });
      return;
    }
    toast({ title: "Class updated", description: `${student.name} is now in ${classes.find((c) => c.id === classId)?.name ?? "the new class"}.` });
    refresh();
    onClose();
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{student?.classId ? "Change class" : "Enrol in a class"}</DialogTitle>
          <DialogDescription>
            {student?.name}
            {student?.classId ? " will be moved. Moving a student between classes needs the transfer permission." : " is not in a class yet."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="chg_class">Class</Label>
          <Select value={classId} onValueChange={setClassId}>
            <SelectTrigger id="chg_class">
              <SelectValue placeholder="Choose a class" />
            </SelectTrigger>
            <SelectContent>
              {classes
                .filter((c) => c.id !== student?.classId)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!classId || busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
