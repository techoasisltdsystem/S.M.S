import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2, Users } from "lucide-react";
import ConfirmDelete from "@/components/classes/ConfirmDelete";
import { db } from "@/lib/db";
import { rpc } from "@/lib/rpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Announcement, SchoolClass } from "@/hooks/useSchoolData";
import type { Database } from "@/integrations/supabase/types";
import { AUDIENCES, errorText } from "./shared";

type Audience = Database["public"]["Enums"]["audience"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolId: string;
  notice: Announcement | null;
  /** Teachers post to their own classes only; the office may post school-wide. */
  classOnly: boolean;
  classes: SchoolClass[];
  onSaved: () => void;
}

interface Preview { total: number; students: number; parents: number; staff: number }

const NoticeDialog = ({ open, onOpenChange, schoolId, notice, classOnly, classes, onSaved }: Props) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [picked, setPicked] = useState<string[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [at, setAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(notice?.title ?? "");
    setBody(notice?.body ?? "");
    setAudience(notice?.audience ?? (classOnly ? "students" : "everyone"));
    setPicked(notice?.class_id ? [notice.class_id] : []);
    setSchedule(false);
    setAt("");
  }, [open, notice, classOnly]);

  const audiences = classOnly ? AUDIENCES.filter((a) => !["staff", "teachers"].includes(a.value)) : AUDIENCES;
  const key = useMemo(() => [...picked].sort().join(","), [picked]);
  const preview = useQuery({
    queryKey: ["audience-preview", schoolId, audience, key],
    enabled: open && !notice && (!classOnly || picked.length > 0),
    queryFn: () => rpc<Preview>("audience_preview", { _school: schoolId, _audience: audience, _classes: picked }),
  });

  const send = async () => {
    setConfirming(false);
    setSaving(true);
    try {
      if (notice) {
        await rpc("edit_announcement", { _announcement: notice.id, _title: title.trim(), _body: body.trim() });
        toast({ title: "Notice updated" });
      } else {
        await rpc<string>("post_announcement", {
          _school: schoolId, _title: title.trim(), _body: body.trim(), _audience: audience, _classes: picked,
          _publish_at: schedule && at ? new Date(at).toISOString() : null,
        });
        toast({ title: schedule ? "Notice scheduled" : "Notice posted", description: schedule ? `It will appear ${new Date(at).toLocaleString("en-GB")}.` : `Sent to ${preview.data?.total ?? "its"} recipients.` });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Could not post the notice", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast({ title: "Give the notice a title", variant: "destructive" });
    if (classOnly && picked.length === 0) return toast({ title: "Choose the classes this notice is for", variant: "destructive" });
    if (schedule && (!at || new Date(at) <= new Date())) return toast({ title: "Choose a time in the future", variant: "destructive" });
    if (notice) return void send();
    setConfirming(true);
  };

  const remove = async () => {
    if (!notice) return;
    setSaving(true);
    try {
      const { error } = await db.from("announcements").delete().eq("id", notice.id);
      if (error) throw error;
      toast({ title: "Notice deleted" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Could not delete the notice", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const audienceLabel = AUDIENCES.find((a) => a.value === audience)?.label ?? audience;
  const where = picked.length === 0 ? "the whole school" : classes.filter((c) => picked.includes(c.id)).map((c) => c.name).join(", ");
  const p = preview.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{notice ? "Edit notice" : classOnly ? "Post to my classes" : "Post a notice"}</DialogTitle>
          <DialogDescription>
            {notice ? "You can correct the title and text. To change who receives it, withdraw it and post a new one." : "Choose exactly who should receive this. Notices are public to their audience; use Messages for anything private."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nt-title">Title</Label>
            <Input id="nt-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nt-body">Message</Label>
            <Textarea id="nt-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
          </div>
          {!notice && (
            <>
              <div className="space-y-2">
                <Label htmlFor="nt-aud">Who should receive it</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                  <SelectTrigger id="nt-aud"><SelectValue /></SelectTrigger>
                  <SelectContent>{audiences.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{classOnly ? "Classes" : "Limit to classes (leave empty for the whole school)"}</legend>
                <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-3">
                  {classes.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">No classes.</p>}
                  {classes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => setPicked((x) => (v ? [...x, c.id] : x.filter((i) => i !== c.id)))} />
                      {c.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><Switch checked={schedule} onCheckedChange={setSchedule} /> Schedule for later</label>
                {schedule && <Input type="datetime-local" aria-label="Publish at" className="w-auto" value={at} onChange={(e) => setAt(e.target.value)} />}
              </div>
              <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm" aria-live="polite">
                <Users className="h-4 w-4 shrink-0" aria-hidden />
                {preview.isLoading ? "Counting recipients…" : p ? `Reaches ${p.total} ${p.total === 1 ? "person" : "people"}: ${p.students} students, ${p.parents} parents, ${p.staff} staff.` : classOnly ? "Choose classes to see who this reaches." : "—"}
              </p>
            </>
          )}
          <DialogFooter className="gap-2">
            {notice && (
              <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" disabled={saving} onClick={() => setDeleting(true)}>
                <Trash2 className="mr-1 h-4 w-4" />Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || (!notice && p?.total === 0)}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {notice ? "Save changes" : schedule ? "Schedule notice" : "Post notice"}
            </Button>
          </DialogFooter>
        </form>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{schedule ? "Schedule" : "Send"} this notice?</AlertDialogTitle>
              <AlertDialogDescription>
                "{title.trim()}" goes to {audienceLabel.toLowerCase()} in {where}: {p ? `${p.total} ${p.total === 1 ? "person" : "people"}` : "its audience"}
                {schedule && at ? `, on ${new Date(at).toLocaleString("en-GB")}` : ", now"}. Each of them gets a notification.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go back</AlertDialogCancel>
              <AlertDialogAction onClick={send}>{schedule ? "Schedule" : "Send"}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <ConfirmDelete open={deleting} onOpenChange={setDeleting} title="Delete this notice?" text="It disappears for everyone. The deletion is recorded in the audit log." onConfirm={remove} />
      </DialogContent>
    </Dialog>
  );
};

export default NoticeDialog;
