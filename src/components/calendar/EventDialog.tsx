import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import ConfirmDelete from "@/components/classes/ConfirmDelete";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useClasses } from "@/hooks/useSchoolData";
import { rpc } from "@/lib/rpc";
import type { SchoolEvent } from "@/hooks/useSchoolData";
import type { Database } from "@/integrations/supabase/types";
import { AUDIENCES, errorText, toLocalInput } from "./shared";

type Category = Database["public"]["Enums"]["event_category"];
type Audience = Database["public"]["Enums"]["audience"];
const CATEGORIES = ["academic", "exam", "assessment", "registration", "fees", "break", "holiday", "meeting", "sports", "report_cards", "ceremony", "other"] as unknown as Category[];
const CATEGORY_TEXT: Record<string, string> = { report_cards: "report cards", assessment: "continuous assessment", fees: "fee deadline", registration: "registration", ceremony: "ceremony" };
type EventExtras = { status?: string; description?: string | null; all_day?: boolean; class_id?: string | null; reminder_days?: number[]; cancel_reason?: string | null };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  schoolId: string;
  event: SchoolEvent | null;
  defaultDate: string;
  onSaved: () => void;
}

const EventDialog = ({ open, onOpenChange, schoolId, event, defaultDate, onSaved }: Props) => {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("academic");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [location, setLocation] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState("published");
  const [description, setDescription] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [classId, setClassId] = useState("");
  const [reminders, setReminders] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const classes = useClasses(schoolId);
  const ex = (event ?? {}) as EventExtras;
  const conflicts = useQuery({
    queryKey: ["event-conflicts", schoolId, starts, ends, event?.id], enabled: open && !!starts && (!ends || new Date(ends) >= new Date(starts)), retry: false,
    queryFn: () => rpc<{ id: string; title: string; starts_at: string }[]>("event_conflicts", { _school: schoolId, _start: new Date(starts).toISOString(), _end: ends ? new Date(ends).toISOString() : null, _exclude: event?.id ?? null }),
  });
  const history = useQuery({ queryKey: ["event-history", event?.id], enabled: open && !!event, retry: false, queryFn: () => rpc<{ at: string; kind: string; actor: string | null }[]>("event_history", { _event: event!.id }) });

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "");
    setCategory(event?.category ?? "academic");
    setStarts(event ? toLocalInput(event.starts_at) : `${defaultDate}T08:00`);
    setEnds(event?.ends_at ? toLocalInput(event.ends_at) : "");
    setLocation(event?.location ?? "");
    setAudience(event?.audience ?? "everyone");
    const x = (event ?? {}) as EventExtras;
    setStatus(x.status === "draft" ? "draft" : event ? "published" : "published");
    setDescription(x.description ?? "");
    setAllDay(!!x.all_day);
    setClassId(x.class_id ?? "");
    setReminders((x.reminder_days ?? []).join(", "));
    setCancelling(false); setCancelReason("");
  }, [open, event, defaultDate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast({ title: "Give the event a title", variant: "destructive" });
    if (!starts) return toast({ title: "Choose a start time", variant: "destructive" });
    if (ends && new Date(ends) < new Date(starts)) return toast({ title: "The end must not be before the start", variant: "destructive" });
    const values = {
      title: title.trim(),
      category,
      starts_at: new Date(starts).toISOString(),
      ends_at: ends ? new Date(ends).toISOString() : null,
      location: location.trim() || null,
      audience,
      status,
      description: description.trim() || null,
      all_day: allDay,
      class_id: classId || null,
      reminder_days: reminders.split(/[ ,]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 90),
    };
    setSaving(true);
    try {
      const { error } = event
        ? await db.from("events").update(values as never).eq("id", event.id)
        : await db.from("events").insert({ ...values, school_id: schoolId } as never);
      if (error) throw error;
      toast({ title: event ? "Event updated" : "Event added" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Could not save the event", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const cancelEvent = async () => {
    if (!event) return;
    setSaving(true);
    try {
      const { error } = await db.from("events").update({ status: "cancelled", cancel_reason: cancelReason.trim() } as never).eq("id", event.id);
      if (error) throw error;
      toast({ title: "Event cancelled", description: "The audience was told." });
      onSaved(); onOpenChange(false);
    } catch (err) { toast({ title: "Could not cancel the event", description: errorText(err), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!event) return;
    setSaving(true);
    try {
      const { error } = await db.from("events").delete().eq("id", event.id);
      if (error) throw error;
      toast({ title: "Event deleted" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Could not delete the event", description: errorText(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">{event ? "Edit event" : "Add event"}</DialogTitle>
          <DialogDescription>Events show on the school calendar for the audience you choose.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ev-title">Title</Label>
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ev-cat">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger id="ev-cat"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{CATEGORY_TEXT[c] ?? c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-aud">Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
                <SelectTrigger id="ev-aud"><SelectValue /></SelectTrigger>
                <SelectContent>{AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-start">Starts</Label>
              <Input id="ev-start" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-end">Ends (optional)</Label>
              <Input id="ev-end" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ev-class">For one class only (optional)</Label>
              <select id="ev-class" value={classId} onChange={(e) => setClassId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Whole audience</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-status">Publication</Label>
              <select id="ev-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="draft">Draft (only managers see it)</option><option value="published">Published (the audience is told)</option></select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-rem">Reminders (days before)</Label>
              <Input id="ev-rem" placeholder="7, 1" value={reminders} onChange={(e) => setReminders(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All-day event</label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ev-desc">Description (optional)</Label>
            <Input id="ev-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1500} />
          </div>
          {(conflicts.data ?? []).length > 0 && (
            <p role="status" className="flex items-start gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              Overlaps: {(conflicts.data ?? []).map((c) => c.title).join(", ")}. You can still save.</p>
          )}
          {event && (history.data ?? []).length > 0 && (
            <p className="text-xs text-muted-foreground">History: {(history.data ?? []).slice(0, 3).map((h) => `${h.kind} by ${h.actor ?? "someone"} on ${new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`).join("; ")}</p>
          )}
          {ex.status === "cancelled" && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">This event was cancelled{ex.cancel_reason ? `: ${ex.cancel_reason}` : ""}.</p>}
          {cancelling && (
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <Label htmlFor="ev-cancel">Why is it cancelled? The audience will be told.</Label>
              <Input id="ev-cancel" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <div className="flex gap-2"><Button type="button" size="sm" variant="destructive" disabled={saving || cancelReason.trim().length < 3} onClick={cancelEvent}>Cancel event</Button><Button type="button" size="sm" variant="outline" onClick={() => setCancelling(false)}>Back</Button></div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="ev-loc">Location (optional)</Label>
            <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={150} />
          </div>
          <DialogFooter className="gap-2">
            {event && ex.status === "published" && <Button type="button" variant="ghost" className="text-destructive" disabled={saving} onClick={() => setCancelling(true)}>Cancel event</Button>}
            {event && (
              <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" disabled={saving} onClick={() => setConfirming(true)}>
                <Trash2 className="mr-1 h-4 w-4" />Delete
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {event ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
        <ConfirmDelete open={confirming} onOpenChange={setConfirming} title="Delete this event?" text="It disappears for everyone. The deletion is recorded in the audit log." onConfirm={remove} />
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
