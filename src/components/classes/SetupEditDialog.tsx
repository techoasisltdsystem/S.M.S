import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Person, SchoolClass, Subject } from "@/hooks/useSchoolData";
import type { Tables } from "@/integrations/supabase/types";
import { useWrite } from "./common";

type Year = Tables<"academic_years">;
type Term = Tables<"terms">;

export type SetupEdit =
  | { kind: "year"; row: Year }
  | { kind: "term"; row: Term }
  | { kind: "subject"; row: Subject }
  | { kind: "class"; row: SchoolClass };

interface Props {
  edit: SetupEdit | null;
  onClose: () => void;
  schoolId: string;
  years: Year[];
  teachers: Person[];
}

const NONE = "none";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

/** One dialog for changing a year, term, subject or class. Saves go through the audited tables. */
const SetupEditDialog = ({ edit, onClose, schoolId, years, teachers }: Props) => {
  const { toast } = useToast();
  const { run, busy } = useWrite();
  const [v, setV] = useState({ name: "", code: "", level: "", room: "", start: "", end: "", year: "", teacher: NONE });

  useEffect(() => {
    if (!edit) return;
    const r = edit.row as Record<string, unknown>;
    setV({
      name: String(r.name ?? ""),
      code: String(r.code ?? ""),
      level: String(r.level ?? ""),
      room: String(r.room ?? ""),
      start: String(r.starts_on ?? ""),
      end: String(r.ends_on ?? ""),
      year: String(r.academic_year_id ?? ""),
      teacher: String(r.form_teacher_id ?? NONE),
    });
  }, [edit]);

  if (!edit) return null;
  const dated = edit.kind === "year" || edit.kind === "term";
  const noun = { year: "academic year", term: "term", subject: "subject", class: "class" }[edit.kind];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v.name.trim()) return toast({ title: "A name is required", variant: "destructive" });
    if (dated && (!v.start || !v.end || v.end <= v.start)) return toast({ title: "Choose a start date, and an end date after it", variant: "destructive" });
    const id = edit.row.id;
    const ok = await (edit.kind === "year"
      ? run(() => db.from("academic_years").update({ name: v.name.trim(), starts_on: v.start, ends_on: v.end }).eq("id", id).eq("school_id", schoolId), "Academic year updated", "Could not update the academic year")
      : edit.kind === "term"
        ? run(() => db.from("terms").update({ name: v.name.trim(), starts_on: v.start, ends_on: v.end }).eq("id", id).eq("school_id", schoolId), "Term updated", "Could not update the term")
        : edit.kind === "subject"
          ? run(() => db.from("subjects").update({ name: v.name.trim(), code: v.code.trim() || null }).eq("id", id).eq("school_id", schoolId), "Subject updated", "Could not update the subject")
          : run(
              () =>
                db.from("classes").update({
                  name: v.name.trim(),
                  level: v.level.trim() || null,
                  room: v.room.trim() || null,
                  academic_year_id: v.year,
                  form_teacher_id: v.teacher === NONE ? null : v.teacher,
                }).eq("id", id).eq("school_id", schoolId),
              "Class updated",
              "Could not update the class",
            ));
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Edit {noun}</DialogTitle>
          <DialogDescription>Changes are saved to the database and recorded in the audit log.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={100} /></Field>
          {edit.kind === "subject" && <Field label="Code (optional)"><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} maxLength={20} /></Field>}
          {dated && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts"><Input type="date" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} /></Field>
              <Field label="Ends"><Input type="date" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></Field>
            </div>
          )}
          {edit.kind === "class" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Level"><Input value={v.level} onChange={(e) => setV({ ...v, level: e.target.value })} /></Field>
                <Field label="Room"><Input value={v.room} onChange={(e) => setV({ ...v, room: e.target.value })} /></Field>
              </div>
              <Field label="Academic year">
                <Select value={v.year} onValueChange={(x) => setV({ ...v, year: x })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Form teacher">
                <Select value={v.teacher} onValueChange={(x) => setV({ ...v, teacher: x })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not assigned</SelectItem>
                    {teachers.map((t) => <SelectItem key={t.profile_id} value={t.profile_id}>{t.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SetupEditDialog;
