import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Download, ExternalLink, FileText, FolderOpen, Loader2, Plus, Search, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import KitStat from "@/components/kit/KitStat";
import { PageHeader, StatusPill, TableCard, td, th } from "@/components/kit/Dash";
import { EmptyState } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useDebounced } from "@/hooks/useDebounced";
import { useAssignments, useClasses, useSubjects } from "@/hooks/useSchoolData";
import { fileToBase64 } from "@/lib/files";
import { rpc } from "@/lib/rpc";

interface Resource { id: string; title: string; description: string | null; folder: string | null; subject: string | null; class: string | null; kind: string; url: string | null; file_name: string | null; size_bytes: number | null; downloads: number; created_at: string; uploaded_by: string | null; can_archive: boolean; total_rows: number }
const KIND: Record<string, string> = { pdf: "PDF", doc: "Doc", slides: "Slides", sheet: "Sheet", image: "Image", video: "Video", link: "Link", text: "Text" };
const SIZE = 10;
const sel = "h-9 rounded-lg border border-input bg-background px-3 text-sm";

/** Notes, past questions, videos and links for the school or a class. Students and parents see only their class's items. */
const ResourcesPage = () => {
  const { user, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const sid = user!.schoolId;
  const subjects = useSubjects(sid);
  const classes = useClasses(sid);
  const assignments = useAssignments(sid);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(search, 300);
  const list = useQuery({ queryKey: ["resources", sid, dq, subject, kind, page], placeholderData: (p) => p,
    queryFn: () => rpc<Resource[]>("resources_list", { _school: sid, _search: dq || null, _subject: subject || null, _kind: kind || null, _limit: SIZE, _offset: page * SIZE }) });
  const stats = useQuery({ queryKey: ["resources-stats", sid], queryFn: () => rpc<{ total: number; documents: number; media: number; downloads: number }>("resources_stats", { _school: sid }) });
  const rows = list.data ?? [];
  const total = Number(rows[0]?.total_rows ?? 0);
  const pages = Math.max(1, Math.ceil(total / SIZE));

  // Teachers may add for classes they teach; resource managers anywhere.
  const mine = (assignments.data ?? []).filter((a) => a.teacher_id === user!.id);
  const manager = can("resources.manage");
  const canAdd = manager || mine.length > 0;
  const classOptions = (classes.data ?? []).filter((c) => manager || mine.some((a) => a.class_id === c.id));

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["resources"] }); void qc.invalidateQueries({ queryKey: ["resources-stats"] }); };
  const open = async (r: Resource) => {
    try {
      const j = await rpc<{ url?: string; name?: string; mime?: string; content?: string }>("resource_open", { _id: r.id });
      if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
      else if (j.content) {
        const bytes = Uint8Array.from(atob(j.content), (c) => c.charCodeAt(0));
        const href = URL.createObjectURL(new Blob([bytes], { type: j.mime }));
        const a = document.createElement("a"); a.href = href; a.download = j.name ?? "resource"; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
      }
      void qc.invalidateQueries({ queryKey: ["resources-stats"] });
    } catch (e) { toast({ title: "Could not open it", description: errMsg(e), variant: "destructive" }); }
  };
  const archive = useMutation({
    mutationFn: (r: Resource) => rpc("resource_archive", { _id: r.id }),
    onSuccess: () => { toast({ title: "Resource removed" }); refresh(); },
    onError: (e) => toast({ title: "Not removed", description: errMsg(e), variant: "destructive" }),
  });

  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: "", description: "", folder: "", subject: "", cls: "", url: "", file: null as File | null, mode: "file" as "file" | "link" });
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: async () => rpc("resource_add", {
      _school: sid, _title: f.title, _description: f.description || null, _folder: f.folder || null, _subject: f.subject || null, _class: f.cls || null,
      _url: f.mode === "link" ? f.url : null, _file_name: f.mode === "file" ? f.file?.name ?? null : null, _b64: f.mode === "file" && f.file ? await fileToBase64(f.file) : null,
    }),
    onSuccess: () => { toast({ title: "Resource added", description: "Students in that class were notified." }); setAdding(false); setF({ title: "", description: "", folder: "", subject: "", cls: "", url: "", file: null, mode: "file" }); refresh(); },
    onError: (e) => setError(errMsg(e)),
  });

  return (
    <DashboardLayout>
      <PageHeader title="Learning Resources">
        {canAdd && <Button onClick={() => { setError(null); setAdding(true); }}><Plus className="mr-1 h-4 w-4" aria-hidden /> Add resource</Button>}
      </PageHeader>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KitStat delay={0} icon={FolderOpen} label="Total Resources" value={stats.data ? Number(stats.data.total) : null} sub="Across all subjects" />
        <KitStat delay={0.06} icon={FileText} tone="info" label="Documents" value={stats.data ? Number(stats.data.documents) : null} sub="PDFs, notes, slides and sheets" />
        <KitStat delay={0.12} icon={Download} tone="success" label="Downloads" value={stats.data ? Number(stats.data.downloads) : null} sub="Times resources were opened" />
      </div>

      <TableCard title="Resource Library" count={total} action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden /><Input aria-label="Search resources" placeholder="Search resources…" className="h-9 w-56 pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div>
          <select aria-label="Subject" className={sel} value={subject} onChange={(e) => { setSubject(e.target.value); setPage(0); }}><option value="">Subject</option>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select aria-label="Type" className={sel} value={kind} onChange={(e) => { setKind(e.target.value); setPage(0); }}><option value="">Type</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      }>
        {list.isLoading && <div className="p-5"><LoadingRows rows={5} /></div>}
        {list.isError && <div className="p-5"><ErrorBox message={errMsg(list.error)} onRetry={() => list.refetch()} /></div>}
        {list.data && rows.length === 0 && <div className="p-5"><EmptyState icon={FolderOpen} title="No resources yet" text={canAdd ? "Add notes, past questions, slides or links for your classes." : "Resources your school shares will appear here."} /></div>}
        {rows.length > 0 && (
          <table className="w-full">
            <thead><tr><th className={th}>Resource Name</th><th className={th}>Folder</th><th className={th}>Subject</th><th className={th}>Class</th><th className={th}>Type</th><th className={th}>Opened</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-muted/40">
                  <td className={td}><button type="button" onClick={() => void open(r)} className="text-left font-medium hover:text-primary">{r.title}</button>{r.description && <span className="block text-xs text-muted-foreground">{r.description}</span>}</td>
                  <td className={`${td} text-muted-foreground`}>{r.folder ?? "-"}</td>
                  <td className={td}>{r.subject ?? "General"}</td>
                  <td className={td}>{r.class ?? "Whole school"}</td>
                  <td className={td}><StatusPill tone={r.kind === "video" ? "red" : r.kind === "link" ? "blue" : "purple"}>{KIND[r.kind] ?? r.kind}</StatusPill></td>
                  <td className={`${td} tabular-nums text-muted-foreground`}>{r.downloads}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <Button size="sm" variant="ghost" onClick={() => void open(r)} aria-label={`Open ${r.title}`}>{r.url ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}</Button>
                    {r.can_archive && <Button size="sm" variant="ghost" className="text-destructive" disabled={archive.isPending} onClick={() => { if (window.confirm(`Remove "${r.title}"?`)) archive.mutate(r); }} aria-label={`Remove ${r.title}`}><Trash2 className="h-4 w-4" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Previous</Button>
          <div className="flex gap-1">{Array.from({ length: Math.min(pages, 7) }, (_, i) => <button key={i} type="button" onClick={() => setPage(i)} className={`h-8 w-8 rounded-lg text-sm ${i === page ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted"}`}>{i + 1}</button>)}</div>
          <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next <ArrowRight className="ml-1 h-4 w-4" aria-hidden /></Button>
        </div>
      </TableCard>

      <Dialog open={adding} onOpenChange={(o) => { if (!o && !add.isPending) setAdding(false); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={(e) => { e.preventDefault(); setError(null); add.mutate(); }}>
            <DialogHeader><DialogTitle>Add a learning resource</DialogTitle><DialogDescription>A file (PDF, Word, PowerPoint, Excel, text, CSV or image, up to 10 MB) or a link such as a video.</DialogDescription></DialogHeader>
            <div className="my-4 space-y-3">
              <div className="flex gap-2">{(["file", "link"] as const).map((m) => <Button key={m} type="button" size="sm" variant={f.mode === m ? "default" : "outline"} onClick={() => setF({ ...f, mode: m })}>{m === "file" ? "Upload a file" : "Add a link"}</Button>)}</div>
              <div className="space-y-1.5"><Label htmlFor="rs-title">Title</Label><Input id="rs-title" maxLength={150} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
              {f.mode === "file"
                ? <div className="space-y-1.5"><Label htmlFor="rs-file">File</Label><Input id="rs-file" type="file" accept=".pdf,.docx,.pptx,.xlsx,.txt,.csv,.png,.jpg,.jpeg" onChange={(e) => setF({ ...f, file: e.target.files?.[0] ?? null, title: f.title || (e.target.files?.[0]?.name.replace(/\.[^.]+$/, "") ?? "") })} /></div>
                : <div className="space-y-1.5"><Label htmlFor="rs-url">Link</Label><Input id="rs-url" type="url" placeholder="https://…" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="rs-class">Class</Label><select id="rs-class" className={`${sel} w-full`} value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value })}>{manager && <option value="">Whole school</option>}{!manager && <option value="">Choose a class</option>}{classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="rs-subj">Subject</Label><select id="rs-subj" className={`${sel} w-full`} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="">General</option>{(subjects.data ?? []).filter((s) => manager || !f.cls || mine.some((a) => a.class_id === f.cls && a.subject_id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                <div className="space-y-1.5"><Label htmlFor="rs-folder">Folder (optional)</Label><Input id="rs-folder" placeholder="Mathematics Notes" maxLength={80} value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="rs-desc">Description (optional)</Label><Input id="rs-desc" maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
              </div>
              {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={add.isPending}>Cancel</Button>
              <Button type="submit" disabled={add.isPending || f.title.trim().length < 2 || (f.mode === "file" ? !f.file : !f.url) || (!manager && !f.cls)}>{add.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Add resource</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default ResourcesPage;
