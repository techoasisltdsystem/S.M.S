import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { useToast } from "@/hooks/use-toast";
import { useConsoleActions, useSupportRequest } from "@/hooks/usePlatformConsole";
import { cn } from "@/lib/utils";

export const SUPPORT_STATUS: Record<string, string> = {
  open: "Open", in_progress: "In progress", waiting: "Waiting for the school", resolved: "Resolved", closed: "Closed",
};

export const StatusPill = ({ status }: { status: string }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium",
    status === "closed" || status === "resolved" ? "bg-muted text-muted-foreground" : status === "waiting" ? "bg-info/10 text-info" : "bg-warning/15 text-warning")}>
    {SUPPORT_STATUS[status] ?? status}
  </span>
);

/** One support conversation. `side` decides who is writing and which statuses can be set. */
const SupportThread = ({ id, side, onClose }: { id: string | null; side: "school" | "platform"; onClose: () => void }) => {
  const { toast } = useToast();
  const req = useSupportRequest(id);
  const { reply, setStatus } = useConsoleActions();
  const [body, setBody] = useState("");
  const r = req.data;

  const send = async () => {
    try {
      await reply.mutateAsync({ id: id!, body: body.trim() });
      setBody("");
    } catch (e) {
      toast({ title: "Not sent", description: errMsg(e), variant: "destructive" });
    }
  };
  const change = async (status: string) => {
    try {
      await setStatus.mutateAsync({ id: id!, status });
      toast({ title: `Marked ${SUPPORT_STATUS[status]?.toLowerCase() ?? status}` });
    } catch (e) {
      toast({ title: "Not changed", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {req.isLoading && <LoadingRows rows={3} />}
        {req.isError && <ErrorBox message={errMsg(req.error)} onRetry={() => req.refetch()} />}
        {r && (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading">{r.subject}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                {side === "platform" && <span>{r.school_name} ·</span>}
                <span className="capitalize">{r.priority} priority</span> · <StatusPill status={r.status} />
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3">
              {r.messages.map((m, i) => (
                <li key={i} className={cn("rounded-xl p-3 text-sm", m.author_kind === side ? "ml-8 bg-primary/10" : "mr-8 bg-muted")}>
                  <p className="mb-1 text-xs font-semibold">{m.author} · <span className="font-normal text-muted-foreground">{new Date(m.at).toLocaleString("en-GB")}</span></p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </li>
              ))}
            </ol>
            {r.status !== "closed" ? (
              <div className="space-y-2 border-t border-border pt-3">
                <Textarea aria-label="Reply" rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000}
                  placeholder={side === "school" ? "Do not include pupils' personal details or passwords." : "Write a reply to the school"} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {side === "platform" ? (
                    <Select value={r.status} onValueChange={change}>
                      <SelectTrigger className="h-9 w-56" aria-label="Status"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(SUPPORT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <Button variant="outline" size="sm" disabled={setStatus.isPending} onClick={() => change("closed")}>Close request</Button>
                  )}
                  <Button disabled={!body.trim() || reply.isPending} onClick={send}>
                    {reply.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />} Send
                  </Button>
                </div>
              </div>
            ) : (
              side === "school" && <Button variant="outline" size="sm" onClick={() => change("open")}>Reopen</Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SupportThread;
