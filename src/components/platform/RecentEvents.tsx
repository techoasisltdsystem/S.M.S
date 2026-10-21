import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import { stamp } from "@/hooks/useBilling";
import { useEvents } from "@/hooks/usePlatformOps";

const label = (a: string) => a.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The latest platform events: everyone's on the overview, or only the signed-in person's sign-in history on the account page. */
const RecentEvents = ({ mine, title }: { mine: boolean; title: string }) => {
  const q = useEvents({ search: "", category: "", from: "", to: "", mine, page: 0 }, 6);
  return (
    <Panel title={title} icon={History}>
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.isError && <p className="text-sm text-muted-foreground">Not available to you.</p>}
      {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
      <ul className="divide-y divide-border text-sm">
        {(q.data ?? []).map((e) => (
          <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span><span className="font-medium">{label(e.action)}</span>{e.subject ? <span className="text-muted-foreground"> · {e.subject}</span> : null}{!mine && <span className="block text-xs text-muted-foreground">{e.actor_email ?? "System"}</span>}</span>
            <span className="text-xs text-muted-foreground">{stamp(e.at)}</span>
          </li>
        ))}
      </ul>
      {!mine && <Link to="/platform/events" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">Open the full event log</Link>}
    </Panel>
  );
};

export default RecentEvents;
