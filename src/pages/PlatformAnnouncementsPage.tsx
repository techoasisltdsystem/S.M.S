import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, Megaphone, Pencil, Plus, Send } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { stamp } from "@/hooks/useBilling";
import { useAnnouncements, type Announcement } from "@/hooks/usePlatformOps";
import { rpc } from "@/lib/rpc";

const AUDIENCE: Record<string, string> = { all: "Everyone", school_admins: "School administrators", teachers: "Teachers", students: "Students", parents: "Parents" };
const KIND: Record<string, string> = { notice: "Notice", maintenance: "Maintenance", update: "Product update" };
const local = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const blank = { id: null as string | null, title: "", body: "", kind: "notice", audience: "all", starts: "", ends: "" };

/** Platform-wide messages to schools. Published ones show as a banner for the chosen audience, inside the optional window. */
const PlatformAnnouncementsPage = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useAnnouncements();
  const [form, setForm] = useState<typeof blank | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["platform-announcements"] });

  const save = useMutation({
    mutationFn: () => rpc("platform_announcement_save", {
      _id: form!.id, _title: form!.title, _body: form!.body, _kind: form!.kind, _audience: form!.audience,
      _starts: form!.starts ? new Date(form!.starts).toISOString() : null, _ends: form!.ends ? new Date(form!.ends).toISOString() : null,
    }),
    onSuccess: () => { toast({ title: "Saved as a draft until you publish it" }); setForm(null); setError(null); refresh(); },
    onError: (e) => setError(errMsg(e)),
  });
  const setStatus = useMutation({
    mutationFn: (v: { a: Announcement; status: string }) => rpc("platform_announcement_set_status", { _id: v.a.id, _status: v.status }),
    onSuccess: (_d, v) => { toast({ title: v.status === "published" ? "Published" : v.status === "archived" ? "Archived" : "Moved to drafts", description: v.a.title }); refresh(); },
    onError: (e) => toast({ title: "Not changed", description: errMsg(e), variant: "destructive" }),
  });
  const edit = (a: Announcement) => { setError(null); setForm({ id: a.id, title: a.title, body: a.body, kind: a.kind, audience: a.audience, starts: local(a.starts_at), ends: local(a.ends_at) }); };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold">Announcements and notices</h1>
            <p className="text-sm text-muted-foreground">Tell schools about maintenance, changes or news. Nothing is shown until you publish it. Changes are recorded in the event log.</p>
          </div>
          <Button onClick={() => { setError(null); setForm({ ...blank }); }}><Plus className="mr-1 h-4 w-4" aria-hidden /> New announcement</Button>
        </div>
        <Panel title="All announcements" icon={Megaphone}>
          {q.isLoading && <LoadingRows rows={3} />}
          {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
          {q.data && q.data.length === 0 && <EmptyState icon={Megaphone} title="No announcements yet" text="Create one to reach schools." />}
          <ul className="divide-y divide-border">
            {(q.data ?? []).map((a) => (
              <li key={a.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{a.title}
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{KIND[a.kind]}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${a.status === "published" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{a.status === "published" ? "Published" : a.status === "archived" ? "Archived" : "Draft"}</span>
                  </span>
                  <span className="flex gap-2">
                    {a.status !== "archived" && <Button size="sm" variant="outline" onClick={() => edit(a)}><Pencil className="mr-1 h-4 w-4" aria-hidden /> Edit</Button>}
                    {a.status !== "published" && a.status !== "archived" && <Button size="sm" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ a, status: "published" })}><Send className="mr-1 h-4 w-4" aria-hidden /> Publish</Button>}
                    {a.status === "published" && <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ a, status: "draft" })}>Unpublish</Button>}
                    {a.status !== "archived" && <Button size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate({ a, status: "archived" })}><Archive className="mr-1 h-4 w-4" aria-hidden /> Archive</Button>}
                  </span>
                </div>
                <p className="text-muted-foreground">{a.body}</p>
                <p className="text-xs text-muted-foreground">
                  For {AUDIENCE[a.audience]} · reaches {Number(a.reach)} active {Number(a.reach) === 1 ? "person" : "people"}
                  {a.starts_at ? ` · from ${stamp(a.starts_at)}` : ""}{a.ends_at ? ` · until ${stamp(a.ends_at)}` : ""}
                  {a.published_at ? ` · published ${stamp(a.published_at)}` : ""}{a.created_by_email ? ` · by ${a.created_by_email}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o && !save.isPending) setForm(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {form && (
            <form onSubmit={(e) => { e.preventDefault(); setError(null); save.mutate(); }}>
              <DialogHeader><DialogTitle>{form.id ? "Edit announcement" : "New announcement"}</DialogTitle><DialogDescription>Saved as a draft. Publish it from the list when it is ready.</DialogDescription></DialogHeader>
              <div className="my-4 space-y-3">
                <div className="space-y-1.5"><Label htmlFor="an-title">Title</Label><Input id="an-title" maxLength={150} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="an-body">Message</Label><Textarea id="an-body" rows={4} maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="an-kind">Type</Label>
                    <select id="an-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="an-aud">Audience</Label>
                    <select id="an-aud" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="an-from">Show from (optional)</Label><Input id="an-from" type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="an-to">Show until (optional)</Label><Input id="an-to" type="datetime-local" value={form.ends} onChange={(e) => setForm({ ...form, ends: e.target.value })} /></div>
                </div>
                {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={save.isPending}>Cancel</Button>
                <Button type="submit" disabled={save.isPending || !form.title.trim() || !form.body.trim()}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Save</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PlatformAnnouncementsPage;
