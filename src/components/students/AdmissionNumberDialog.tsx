import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { rpc } from "@/lib/rpc";
import { useQueryClient } from "@tanstack/react-query";
import { errMsg } from "./QueryState";

export const useAdmissionNumbers = () => {
  // Kept in the query cache by the student list; this key lets other screens refresh it.
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admission-numbers"] });
};

export const AdmissionNumberDialog = ({
  student, current, onClose,
}: { student: { id: string; name: string } | null; current: string; onClose: () => void }) => {
  const { toast } = useToast();
  const refresh = useAdmissionNumbers();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (student) setValue(current); }, [student, current]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await rpc("set_admission_number", { _student: student!.id, _number: value.trim() });
      toast({ title: "Admission number saved" });
      refresh();
      onClose();
    } catch (err) {
      toast({ title: "Not saved", description: errMsg(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Admission number</DialogTitle>
          <DialogDescription>{student?.name}. It appears on report cards and class results. Each number can belong to one student.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="adm-no">Admission number</Label>
            <Input id="adm-no" value={value} maxLength={30} onChange={(e) => setValue(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
