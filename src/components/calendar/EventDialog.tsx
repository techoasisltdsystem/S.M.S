import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { SchoolEvent } from "@/hooks/useSchoolData";
import type { Database } from "@/integrations/supabase/types";
import { AUDIENCES, errorText, toLocalInput } from "./shared";

type Category = Database["public"]["Enums"]["event_category"];
type Audience = Database["public"]["Enums"]["audience"];
const CATEGORIES: Category[] = ["academic", "exam", "sports", "holiday", "meeting", "other"];

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

  useEffect(() => {
    if (!open) return;
    setTitle(event?.title ?? "");
    setCategory(event?.category ?? "academic");
    setStarts(event ? toLocalInput(event.starts_at) : `${defaultDate}T08:00`);
    setEnds(event?.ends_at ? toLocalInput(event.ends_at) : "");
    setLocation(event?.location ?? "");
    setAudience(event?.audience ?? "everyone");
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
    };
    setSaving(true);
    try {
      const { error } = event
        ? await db.from("events").update(values).eq("id", event.id)
        : await db.from("events").insert({ ...values, school_id: schoolId });
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
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
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
          <div className="space-y-2">
            <Label htmlFor="ev-loc">Location (optional)</Label>
            <Input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={150} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {event ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EventDialog;
