import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useRefreshSchoolData } from "@/hooks/useSchoolData";

export const errorText = (err: unknown, fallback = "Something went wrong. Try again.") =>
  err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;

export const LoadingBlock = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} className="h-14 w-full rounded-lg" />
    ))}
  </div>
);

export const ErrorBlock = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center">
    <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
    <p className="text-sm font-medium text-card-foreground">Could not load this information</p>
    <p className="max-w-md text-xs text-muted-foreground">{message}</p>
    <Button size="sm" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/** Runs a database write: shows the database's message on failure, refreshes shared data on success. */
export const useWrite = () => {
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const [busy, setBusy] = useState(false);
  const run = async (op: () => PromiseLike<{ error: { message: string } | null }>, success: string, failTitle: string) => {
    setBusy(true);
    try {
      const { error } = await op();
      if (error) throw error;
      toast({ title: success });
      await refresh();
      return true;
    } catch (err) {
      toast({ title: failTitle, description: errorText(err), variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
};

/** Combines the read queries a page needs into one loading/error state. */
export const combine = (qs: { isLoading: boolean; error: unknown; refetch: () => unknown }[]) => ({
  loading: qs.some((q) => q.isLoading),
  error: qs.find((q) => q.error)?.error ? errorText(qs.find((q) => q.error)?.error) : null,
  retry: () => qs.forEach((q) => void q.refetch()),
});
