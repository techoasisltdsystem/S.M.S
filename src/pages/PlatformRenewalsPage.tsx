import { Link } from "react-router-dom";
import { BellRing, CalendarClock, CheckCheck } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState, Panel } from "@/components/kit/Panel";
import { StatePill } from "@/components/billing/BillingPanel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { day, stamp, useBillingActions, useClients, useReminders } from "@/hooks/useBilling";

const when = (d: number) => (d > 0 ? `${d} day${d === 1 ? "" : "s"} before expiry` : d === 0 ? "On the day it ended" : `${-d} day${d === -1 ? "" : "s"} after expiry`);

/** Subscriptions that end soon or have ended, and the reminders sent about them. */
const PlatformRenewalsPage = () => {
  const { toast } = useToast();
  const { ackReminders } = useBillingActions();
  const soon = useClients({ search: "", status: "renewal_due", plan: "", sort: "expiry", page: 0 }, 50);
  const pastDue = useClients({ search: "", status: "past_due", plan: "", sort: "expiry", page: 0 }, 50);
  const expired = useClients({ search: "", status: "expired", plan: "", sort: "expiry", page: 0 }, 50);
  const reminders = useReminders();
  const unseen = (reminders.data ?? []).filter((r) => !r.acknowledged).length;

  const List = ({ title, q, empty }: { title: string; q: typeof soon; empty: string }) => (
    <Panel title={title} icon={CalendarClock}>
      {q.isLoading && <LoadingRows rows={2} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      <ul className="divide-y divide-border">
        {(q.data ?? []).map((c) => (
          <li key={c.school_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
            <span className="min-w-0"><Link to={`/platform/clients/${c.school_id}`} className="font-medium text-primary hover:underline">{c.school_name}</Link>
              <span className="block text-xs text-muted-foreground">{c.plan_name} · {c.admin_email}</span></span>
            <span className="text-right"><StatePill label={c.label} /><span className="block text-xs text-muted-foreground">{day(c.period_end)}{c.days_left != null ? ` · ${c.days_left >= 0 ? `${c.days_left}d left` : `${-c.days_left}d ago`}` : ""}</span></span>
          </li>
        ))}
      </ul>
    </Panel>
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Renewals and expiry</h1>
          <p className="text-sm text-muted-foreground">Dates are checked on the server by a scheduled job, never in the browser. Reminder timing is set in Platform settings.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <List title="Renewal due (next 14 days)" q={soon} empty="Nothing is due soon." />
          <List title="Past due (in grace period)" q={pastDue} empty="No school is past due." />
          <List title="Expired" q={expired} empty="No expired subscriptions." />
        </div>
        <Panel title={`Reminders${unseen ? ` · ${unseen} new` : ""}`} icon={BellRing}
          link={undefined}>
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="outline" disabled={unseen === 0 || ackReminders.isPending}
              onClick={() => ackReminders.mutate(undefined, { onSuccess: () => toast({ title: "Reminders marked as seen" }) })}><CheckCheck className="mr-1 h-4 w-4" aria-hidden /> Mark all seen</Button>
          </div>
          {reminders.isLoading && <LoadingRows rows={3} />}
          {reminders.isError && <ErrorBox message={errMsg(reminders.error)} onRetry={() => reminders.refetch()} />}
          {reminders.data && reminders.data.length === 0 && <EmptyState icon={BellRing} title="No reminders yet" text="Reminders are created by the scheduled job when a subscription reaches a configured interval." />}
          <ul className="divide-y divide-border">
            {(reminders.data ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><Link to={`/platform/clients/${r.school_id}`} className={`font-medium hover:underline ${r.acknowledged ? "text-foreground" : "text-primary"}`}>{r.school_name}</Link>
                  <span className="block text-xs text-muted-foreground">{when(r.interval_days)} · {r.plan} · ends {day(r.period_end)}</span></span>
                <span className="text-right text-xs text-muted-foreground">{stamp(r.at)}<span className="block">{StateOf(r.label)}</span></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">In-app reminders are delivered to you here and to the school&apos;s administrators. Email reminders are queued; they are sent only once an email service is connected.</p>
        </Panel>
      </div>
    </DashboardLayout>
  );
};

const StateOf = (label: string) => <StatePill label={label} />;

export default PlatformRenewalsPage;
