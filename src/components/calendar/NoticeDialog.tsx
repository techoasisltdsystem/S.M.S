import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Announcement, SchoolClass } from "@/hooks/useSchoolData";
import type { Database } from "@/integrations/supabase/types";
import { AUDIENCES, errorText } from "./shared";

type Audience = Database["public"]["Enums"]["audience"];
const WHOLE_SCHOOL = "school";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolId: string;
  notice: Announcement | null;
  /** Teachers post to one of their classes only; the office may post school-wide. */
  classOnly: boolean;
  classes: SchoolClass[];
  onSaved: () => void;
}

const NoticeDialog = ({ open, onOpenChange, schoolId, notice, classOnly, classes, onSaved }: Props) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [classId, setClassId] = useState(WHOLE_SCHOOL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(notice?.title ?? "");
    setBody(notice?.body ?? "");
    setAudience(notice?.audience ?? (classOnly ? "students" : "everyone"));
    setClassId(notice?.class_id ?? (classOnly ? "" : WHOLE_SCHOOL));
  }, [open, notice, classOnly]);

  const audiences = classOnly ? AUDIENCES.filter((a) => a.value !== "staff") : AUDIENCES;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast({ title: "Give the notice a title", variant: "destructive" });
    if (classOnly && !classId) return toast({ title: "Choose the class this notice is for", variant: "destructive" });
    const values = {
      title: title.trim(),
      body: body.trim(),
      audience,
      class_id: classId === WHOLE_SCHOOL || !classId ? null : classId,
    };
    setSaving(true);
    try {
      const { error } = notice
        ? await db.from("announcements").update(values).eq("id", notice.id)
        : await db.from("announcements").insert({ ...values, school_id: schoolId });
      if (error) throw error;
      toast({ title: notice ? "Notice updated" : "Notice posted" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Could not post the notice", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">{classOnly ? "Post to my class" : notice ? "Edit notice" : "Post a notice"}</DialogTitle>
          <DialogDescription>
            {classOnly ? "Only the class you choose will see this notice." : "Notices appear on the notice board for the audience you choose."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nt-title">Title</Label>
            <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nt-body">Message</Label>
            <Textarea id="nt-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nt-aud">Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger id="nt-aud"><SelectValue /></SelectTrigger>
                <SelectContent>{audiences.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nt-class">{classOnly ? "Class" : "Class (optional)"}</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger id="nt-class"><SelectValue placeholder="Choose a class" /></SelectTrigger>
                <SelectContent>
                  {!classOnly && <SelectItem value={WHOLE_SCHOOL}>Whole school</SelectItem>}
                  {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {notice ? "Save changes" : "Post notice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NoticeDialog;
