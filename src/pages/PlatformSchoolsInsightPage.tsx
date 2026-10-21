import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ChevronLeft, ChevronRight, CircleDashed, Search, UserCog, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { stamp } from "@/hooks/useBilling";
import { useDebounced } from "@/hooks/useDebounced";
import { useOnboarding, useSchoolAdmins, useUsage } from "@/hooks/usePlatformOps";
import { cn } from "@/lib/utils";

const Step = ({ done, label }: { done: boolean; label: string }) => (
  <span className={cn("inline-flex items-center gap-1 text-xs", done ? "text-success" : "text-muted-foreground")}>
    {done ? <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> : <CircleDashed className="h-3.5 w-3.5" aria-hidden />}{label}
  </span>
);

const Onboarding = () => {
  const q = useOnboarding();
  return (
    <Panel title="Setup progress by school" icon={BadgeCheck}>
      <p className="mb-3 text-xs text-muted-foreground">Schools activate when payment is verified, so there is no manual approval step. This shows how far each has got with setting itself up, from real records.</p>
      {q.isLoading && <LoadingRows rows={4} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <EmptyState icon={BadgeCheck} title="No schools yet" />}
      <ul className="divide-y divide-border">
        {(q.data ?? []).map((s) => {
          const done = [s.admin_joined, s.classes > 0, s.teachers > 0, s.students > 0].filter(Boolean).length;
          return (
            <li key={s.school_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0"><Link to={`/platform/clients/${s.school_id}`} className="font-medium text-primary hover:underline">{s.school_name}</Link>
                <span className="block text-xs text-muted-foreground">Registered {stamp(s.registered_at)} · {s.status}</span></span>
              <span className="flex flex-wrap items-center gap-3">
                <Step done={s.admin_joined} label="Administrator joined" /><Step done={s.classes > 0} label={`${s.classes} classes`} />
                <Step done={s.teachers > 0} label={`${s.teachers} teachers`} /><Step done={s.students > 0} label={`${s.students} students`} />
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", done === 4 ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{done}/4 steps</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

const SchoolAdmins = () => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const dq = useDebounced(search, 300);
  const q = useSchoolAdmins(dq, page);
  const rows = q.data ?? [];
  const total = Number(rows[0]?.total_rows ?? 0);
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <Panel title="School administrators" icon={UserCog}>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input aria-label="Search school administrators" placeholder="Search name, email or school" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
      </div>
      {q.isLoading && <LoadingRows rows={4} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState icon={UserCog} title="No administrators match" />}
      <ul className="divide-y divide-border">
        {rows.map((a) => (
          <li key={a.profile_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <span className="min-w-0"><span className="font-medium">{a.name}</span><span className="block text-xs text-muted-foreground">{a.email ?? "no email"}</span></span>
            <span className="text-right text-xs text-muted-foreground">
              <Link to={`/platform/clients/${a.school_id}`} className="font-medium text-primary hover:underline">{a.school_name}</Link>
              <span className="block">{a.membership_status} · {a.last_sign_in ? `last sign-in ${stamp(a.last_sign_in)}` : "no sign-in recorded"}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">To reset a school administrator&apos;s login, open the school under Clients and schools.</p>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} administrator{total === 1 ? "" : "s"}</span>
        <span className="flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          Page {page + 1} of {pages}
          <Button size="icon" variant="outline" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </span>
      </div>
    </Panel>
  );
};

type SortKey = "school_name" | "active_people" | "events_30d" | "sign_ins_30d" | "last_activity";
const Usage = () => {
  const q = useUsage();
  const [sort, setSort] = useState<SortKey>("events_30d");
  const rows = [...(q.data ?? [])].sort((a, b) => sort === "school_name" ? a.school_name.localeCompare(b.school_name) : sort === "last_activity" ? (b.last_activity ?? "").localeCompare(a.last_activity ?? "") : Number(b[sort]) - Number(a[sort]));
  const th = (k: SortKey, text: string) => <th className="pr-3"><button type="button" className={cn("font-semibold uppercase", sort === k && "text-primary")} onClick={() => setSort(k)}>{text}</button></th>;
  return (
    <Panel title="Usage and activity by school" icon={Users}>
      <p className="mb-3 text-xs text-muted-foreground">Counts only. Pupil records, grades and messages are never shown here. Activity is audit events in the last 30 days.</p>
      {q.isLoading && <LoadingRows rows={4} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && rows.length === 0 && <EmptyState icon={Users} title="No schools yet" />}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground"><tr>{th("school_name", "School")}{th("active_people", "People")}<th className="pr-3">Students</th><th className="pr-3">Staff</th>{th("events_30d", "Events 30d")}{th("sign_ins_30d", "Sign-ins 30d")}{th("last_activity", "Last activity")}</tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <tr key={s.school_id}>
                  <td className="py-2 pr-3"><Link to={`/platform/clients/${s.school_id}`} className="font-medium text-primary hover:underline">{s.school_name}</Link>{s.status === "suspended" && <span className="ml-2 text-xs text-destructive">suspended</span>}</td>
                  <td className="pr-3">{Number(s.active_people)}</td><td className="pr-3">{Number(s.students)}</td><td className="pr-3">{Number(s.staff)}</td>
                  <td className="pr-3">{Number(s.events_30d)}</td><td className="pr-3">{Number(s.sign_ins_30d)}</td><td className="text-muted-foreground">{s.last_activity ? stamp(s.last_activity) : "None yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
};

const TITLES = {
  onboarding: ["School onboarding", "How each new school is getting on after registering."],
  admins: ["School users and administrators", "Everyone who administers a school on the platform."],
  usage: ["School usage and activity", "Who is using the platform, and how much."],
} as const;

/** Three read-only views of the schools on the platform. */
const PlatformSchoolsInsightPage = ({ view }: { view: keyof typeof TITLES }) => (
  <DashboardLayout>
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">{TITLES[view][0]}</h1>
        <p className="text-sm text-muted-foreground">{TITLES[view][1]}</p>
      </div>
      {view === "onboarding" ? <Onboarding /> : view === "admins" ? <SchoolAdmins /> : <Usage />}
    </div>
  </DashboardLayout>
);

export default PlatformSchoolsInsightPage;
