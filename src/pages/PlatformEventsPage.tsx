import { useState } from "react";
import { ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stamp } from "@/hooks/useBilling";
import { useDebounced } from "@/hooks/useDebounced";
import { EVENT_CATEGORIES, useEvents, type PlatformEvent } from "@/hooks/usePlatformOps";

const label = (a: string) => a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const SIZE = 20;

/** Security events and sign-in history for everyone on the platform team. Rows are append-only. */
const PlatformEventsPage = () => {
  const [f, setF] = useState({ search: "", category: "", from: "", to: "" });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<PlatformEvent | null>(null);
  const dq = useDebounced(f.search, 300);
  const q = useEvents({ ...f, search: dq, mine: false, page }, SIZE);
  const rows = q.data ?? [];
  const total = rows[0]?.total_rows ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / SIZE));
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(0); };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Security events and sign-in history</h1>
          <p className="text-sm text-muted-foreground">Every sign-in, administrator change, announcement, export and similar action on this console, with who did it. Records cannot be edited or deleted. Passwords and tokens are never recorded.</p>
        </div>
        <Panel title="Events" icon={History}>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input aria-label="Search events" placeholder="Search action, subject or person" className="pl-9" value={f.search} onChange={(e) => set({ search: e.target.value })} />
            </div>
            <select aria-label="Category" value={f.category} onChange={(e) => set({ category: e.target.value })} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">All categories</option>
              {Object.entries(EVENT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Input aria-label="From date" type="date" className="w-40" value={f.from} onChange={(e) => set({ from: e.target.value })} />
            <Input aria-label="To date" type="date" className="w-40" value={f.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
          {q.isLoading && <LoadingRows rows={5} />}
          {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
          {q.data && rows.length === 0 && <EmptyState icon={History} title="No events match" text="Try a different search or date range." />}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-3">When</th><th className="pr-3">Person</th><th className="pr-3">Action</th><th className="pr-3">Subject</th><th>Category</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {rows.map((e) => (
                    <tr key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(e)}>
                      <td className="whitespace-nowrap py-2 pr-3">{stamp(e.at)}</td>
                      <td className="pr-3">{e.actor_email ?? "System"}</td>
                      <td className="pr-3 font-medium">{label(e.action)}</td>
                      <td className="pr-3 text-muted-foreground">{e.subject ?? "—"}</td>
                      <td className="text-muted-foreground">{EVENT_CATEGORIES[e.category] ?? e.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {open && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{label(open.action)} · {stamp(open.at)}</p>
              <p className="text-muted-foreground">By {open.actor_email ?? "System"} · {open.outcome}</p>
              <pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(open.detail, null, 2)}</pre>
              <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{Number(total)} event{Number(total) === 1 ? "" : "s"}</span>
            <span className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              Page {page + 1} of {pages}
              <Button size="icon" variant="outline" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </span>
          </div>
        </Panel>
      </div>
    </DashboardLayout>
  );
};

export default PlatformEventsPage;
