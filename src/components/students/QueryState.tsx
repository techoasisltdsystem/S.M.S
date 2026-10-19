import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const LoadingRows = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-2" aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} className="h-11 w-full" />
    ))}
  </div>
);

export const ErrorBox = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between">
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
    <Button size="sm" variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

export const errMsg = (err: unknown, fallback = "Try again.") =>
  err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : fallback;

export const firstError = (...qs: { error: unknown }[]) => {
  const q = qs.find((x) => x.error);
  return q ? errMsg(q.error, "We could not load this information.") : null;
};
