import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications, useResultsActions, type AppNotification } from "@/hooks/useResults";
import { cn } from "@/lib/utils";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const NotificationsPage = () => {
  const { user } = useAuth();
  const schoolId = user?.schoolId ?? "";
  const navigate = useNavigate();
  const list = useNotifications(schoolId);
  const { markRead } = useResultsActions(schoolId);
  const items = list.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const open = async (n: AppNotification) => {
    if (!n.read_at) await markRead.mutateAsync(n.id).catch(() => undefined);
    if (n.link) navigate(n.link);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Notifications</h1>
            <p className="text-sm text-muted-foreground">{unread > 0 ? `${unread} unread` : "You are up to date."} Notifications never contain scores; open the link to see them.</p>
          </div>
          <Button variant="outline" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden /> Mark all as read
          </Button>
        </div>

        {list.isLoading && <LoadingRows />}
        {list.isError && <ErrorBox message={errMsg(list.error, "Could not load notifications.")} onRetry={() => list.refetch()} />}
        {!list.isLoading && !list.isError && items.length === 0 && (
          <EmptyState icon={Bell} title="No notifications yet" text="You will see results, corrections and other school updates here." />
        )}
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-card">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={cn("flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60 focus:bg-muted/60 focus:outline-none", !n.read_at && "bg-primary/5")}
              >
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.read_at ? "text-foreground" : "font-semibold text-foreground")}>{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{when(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </DashboardLayout>
  );
};

export default NotificationsPage;
