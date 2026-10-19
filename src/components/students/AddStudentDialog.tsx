import { useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRefreshSchoolData, type SchoolClass } from "@/hooks/useSchoolData";
import { errMsg } from "./QueryState";
import { inviteLink, type IssuedLink } from "./InviteLinkDialog";

const NONE = "none";

interface Props {
  open: boolean;
  schoolId: string;
  classes: SchoolClass[];
  onClose: () => void;
  onIssued: (l: IssuedLink) => void;
}

export const AddStudentDialog = ({ open, schoolId, classes, onClose, onIssued }: Props) => {
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", classId: NONE });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await db.rpc("invite_member", {
        _school: schoolId,
        _full_name: form.name.trim(),
        _email: form.email.trim(),
        _role: "student",
      });
      if (error) throw error;
      const res = data as unknown as { profile_id: string; token: string };
      if (form.classId !== NONE) {
        const { error: enrolErr } = await db.rpc("enroll_student", { _class: form.classId, _student: res.profile_id });
        if (enrolErr) {
          toast({ title: "Student added, but not placed in a class", description: enrolErr.message, variant: "destructive" });
        }
      }
      onIssued({ link: inviteLink(res.token), name: form.name.trim() });
      setForm({ name: "", email: "", classId: NONE });
      refresh();
      onClose();
    } catch (err) {
      toast({ title: "Could not add this student", description: errMsg(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Add student</DialogTitle>
          <DialogDescription>You get a single-use invitation link to send to the student. Emailing it for you is not set up yet.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="stu_name">Full name</Label>
            <Input id="stu_name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stu_email">Email</Label>
            <Input id="stu_email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stu_class">Class (optional)</Label>
            <Select value={form.classId} onValueChange={(v) => setForm({ ...form, classId: v })}>
              <SelectTrigger id="stu_class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Enrol later</SelectItem>
                {classes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
