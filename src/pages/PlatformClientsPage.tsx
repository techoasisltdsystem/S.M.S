import { useState } from "react";
import { Link } from "react-router-dom";
import { Building2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState } from "@/components/kit/Panel";
import { StatePill } from "@/components/billing/BillingPanel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { day, money, useClients, usePlatformPlans } from "@/hooks/useBilling";
import { useDebounced } from "@/hooks/useDebounced";

const STATUSES = [
  ["trial", "Trial"], ["active", "Active"], ["renewal_due", "Renewal due"], ["past_due", "Past due"],
  ["expired", "Expired"], ["cancelled", "Cancelled"], ["suspended", "Suspended"],
] as const;
const SIZE = 15;
const ALL = "all";

const daysText = (n: number | null) => (n == null ? "—" : n > 1 ? `${n} days left` : n === 1 ? "1 day left" : n === 0 ? "Ends today" : `${-n} day${n === -1 ? "" : "s"} ago`);

/** Every subscribing school, its School Admin, package, and renewal date. */
const PlatformClientsPage = () => {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(ALL);
  const [plan, setPlan] = useState(ALL);
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const q = search.trim();
  const debounced = useDebounced(q, 300);
  const plans = usePlatformPlans();
  const list = useClients({ search: debounced, status: status === ALL ? "" : status, plan: plan === ALL ? "" : plan, sort, page }, SIZE);
  const rows = list.data ?? [];
  const total = rows[0]?.total_rows ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / SIZE));
  const reset = (fn: () => void) => { fn(); setPage(0); };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clients and schools</h1>
          <p className="text-sm text-muted-foreground">Every school that subscribes, with its School Admin, package and renewal date. Open a client for payments, history and account recovery.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search clients" placeholder="School, admin name or email" className="pl-9" value={search} onChange={(e) => reset(() => setSearch(e.target.value))} />
          </div>
          <Select value={status} onValueChange={(v) => reset(() => setStatus(v))}>
            <SelectTrigger aria-label="Status"><SelectValue placeholder="Any status" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Any status</SelectItem>{STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={plan} onValueChange={(v) => reset(() => setPlan(v))}>
            <SelectTrigger aria-label="Package"><SelectValue placeholder="Any package" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>Any package</SelectItem>{(plans.data ?? []).map((p) => <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => reset(() => setSort(v))}>
            <SelectTrigger aria-label="Sort by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem><SelectItem value="expiry">Soonest expiry</SelectItem>
              <SelectItem value="newest">Newest first</SelectItem><SelectItem value="revenue">Most paid</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {list.isLoading && <LoadingRows rows={5} />}
        {list.isError && <ErrorBox message={errMsg(list.error)} onRetry={() => list.refetch()} />}
        {list.data && rows.length === 0 && <EmptyState icon={Building2} title="No clients match" text="Try another search or clear the filters." />}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[56rem] text-sm">
              <thead><tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-4 py-3">School</th><th scope="col" className="px-4 py-3">School Admin</th><th scope="col" className="px-4 py-3">Package</th>
                <th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3">Expires</th><th scope="col" className="px-4 py-3 text-right">Paid</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.school_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3"><Link to={`/platform/clients/${c.school_id}`} className="font-medium text-primary hover:underline">{c.school_name}</Link>
                      <span className="block text-xs text-muted-foreground">Registered {day(c.registered_at)}</span></td>
                    <td className="px-4 py-3">{c.admin_name ?? "—"}<span className="block text-xs text-muted-foreground">{c.admin_email}</span></td>
                    <td className="px-4 py-3">{c.plan_name ?? "—"}</td>
                    <td className="px-4 py-3"><StatePill label={c.label} /></td>
                    <td className="px-4 py-3">{day(c.period_end)}<span className="block text-xs text-muted-foreground">{daysText(c.days_left)}</span></td>
                    <td className="px-4 py-3 text-right">{Number(c.paid_minor) > 0 ? money(Number(c.paid_minor), c.currency ?? "GHS") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 0 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{Number(total)} client{Number(total) === 1 ? "" : "s"} · page {page + 1} of {pages}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default PlatformClientsPage;
