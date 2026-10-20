import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, EyeOff, Flag, Inbox, Loader2, MessageSquarePlus, Search, Send, ShieldAlert } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ComposeDialog from "@/components/messages/ComposeDialog";
import { EmptyState } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useConversations, useMessagingActions, useModerationQueue, useThread, type Conversation, type ThreadMessage,
} from "@/hooks/useMessaging";
import { cn } from "@/lib/utils";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

const titleOf = (c: Conversation) => c.participants.map((p) => p.name).join(", ") || "Conversation";

/** Asks for a short reason, then runs the action. Used for reporting and hiding. */
const ReasonDialog = ({
  open, onOpenChange, title, text, action, busy, onSubmit,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; text: string; action: string; busy: boolean; onSubmit: (reason: string) => void;
}) => {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reason">Reason</Label>
          <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!reason.trim() || busy} onClick={() => onSubmit(reason.trim())}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Thread = ({ schoolId, conversation, onBack }: { schoolId: string; conversation: Conversation; onBack: () => void }) => {
  const { toast } = useToast();
  const thread = useThread(conversation.conversation_id);
  const { send, markRead, report } = useMessagingActions(schoolId);
  const [draft, setDraft] = useState("");
  const [reporting, setReporting] = useState<ThreadMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = thread.data ?? [];

  // Opening a conversation (or receiving a reply while it is open) marks it read.
  useEffect(() => {
    if (conversation.unread_count > 0 && !markRead.isPending) markRead.mutate(conversation.conversation_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.conversation_id, conversation.unread_count]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, conversation.conversation_id]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await send.mutateAsync({ conversationId: conversation.conversation_id, body: text });
      setDraft("");
    } catch (e) {
      toast({ title: "Message not sent", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate font-heading text-base font-semibold text-foreground">{conversation.subject || titleOf(conversation)}</h2>
          {conversation.subject && <p className="truncate text-xs text-muted-foreground">With {titleOf(conversation)}</p>}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {thread.isLoading && <LoadingRows rows={3} />}
        {thread.isError && <ErrorBox message={errMsg(thread.error, "Could not load this conversation.")} onRetry={() => thread.refetch()} />}
        {messages.map((m) => (
          <div key={m.message_id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div className={cn("group max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%]", m.mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
              {!m.mine && <p className="mb-0.5 text-xs font-semibold opacity-80">{m.sender_name}</p>}
              {m.hidden ? (
                <p className="flex items-center gap-1.5 italic opacity-80"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Hidden by the school</p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              )}
              <p className="mt-1 flex items-center justify-end gap-2 text-[11px] opacity-70">
                {when(m.created_at)}
                {!m.hidden && !m.mine && !m.reported && (
                  <button type="button" onClick={() => setReporting(m)} className="inline-flex items-center gap-1 rounded px-1 hover:underline focus:underline focus:outline-none" aria-label="Report this message">
                    <Flag className="h-3 w-3" aria-hidden /> Report
                  </button>
                )}
                {m.reported && !m.hidden && <span>Reported</span>}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Write a reply"
          aria-label="Write a reply"
          rows={2}
          maxLength={5000}
          className="min-h-[44px] resize-none"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!draft.trim() || send.isPending} aria-label="Send reply">
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      <ReasonDialog
        open={!!reporting}
        onOpenChange={(o) => !o && setReporting(null)}
        title="Report this message"
        text="A school administrator will be able to read this one message and decide whether to hide it. The rest of the conversation stays private."
        action="Report"
        busy={report.isPending}
        onSubmit={async (reason) => {
          try {
            await report.mutateAsync({ messageId: reporting!.message_id, conversationId: conversation.conversation_id, reason });
            toast({ title: "Message reported" });
            setReporting(null);
          } catch (e) {
            toast({ title: "Could not report", description: errMsg(e), variant: "destructive" });
          }
        }}
      />
    </div>
  );
};

const ModerationTab = ({ schoolId }: { schoolId: string }) => {
  const { toast } = useToast();
  const queue = useModerationQueue(schoolId, true);
  const { hide } = useMessagingActions(schoolId);
  const [target, setTarget] = useState<string | null>(null);
  const items = queue.data ?? [];

  if (queue.isLoading) return <LoadingRows />;
  if (queue.isError) return <ErrorBox message={errMsg(queue.error, "Could not load reported messages.")} onRetry={() => queue.refetch()} />;
  if (items.length === 0) {
    return <EmptyState icon={ShieldAlert} title="Nothing reported" text="Only messages that a participant reports appear here. Private conversations are not browsable." />;
  }
  return (
    <>
      <ul className="space-y-3">
        {items.map((m) => (
          <li key={m.message_id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>From <strong className="text-foreground">{m.sender_name}</strong> · {when(m.created_at)}</span>
              <span>Reported by {m.reported_by_name ?? "a participant"}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{m.body}</p>
            {m.report_reason && <p className="mt-2 text-xs text-muted-foreground">Reason given: {m.report_reason}</p>}
            <div className="mt-3">
              {m.hidden_at ? (
                <span className="text-xs font-medium text-success">Hidden from the conversation</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setTarget(m.message_id)}>
                  <EyeOff className="mr-2 h-4 w-4" aria-hidden /> Hide message
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <ReasonDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Hide this message"
        text="The text is removed from the conversation for everyone. Who hid it, when and why is recorded in the audit log."
        action="Hide message"
        busy={hide.isPending}
        onSubmit={async (reason) => {
          try {
            await hide.mutateAsync({ messageId: target!, reason });
            toast({ title: "Message hidden" });
            setTarget(null);
          } catch (e) {
            toast({ title: "Could not hide", description: errMsg(e), variant: "destructive" });
          }
        }}
      />
    </>
  );
};

const MessagesPage = () => {
  const { user, can } = useAuth();
  const schoolId = user?.schoolId ?? "";
  const conversations = useConversations(schoolId);
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<"inbox" | "reported">("inbox");
  const [search, setSearch] = useState("");
  const moderate = can("messages.moderate");

  const list = useMemo(() => conversations.data ?? [], [conversations.data]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? list.filter((c) => (c.subject + " " + titleOf(c) + " " + (c.last_message_preview ?? "")).toLowerCase().includes(q))
      : list;
  }, [list, search]);
  const current = list.find((c) => c.conversation_id === selected) ?? null;
  const staffLike = user?.role === "admin" || user?.role === "teacher";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground">Messages</h1>
            <p className="text-sm text-muted-foreground">Private conversations with the people your role lets you contact.</p>
          </div>
          <div className="flex items-center gap-2">
            {moderate && (
              <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Messages view">
                {(["inbox", "reported"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {t === "inbox" ? "Inbox" : "Reported"}
                  </button>
                ))}
              </div>
            )}
            <Button onClick={() => setComposing(true)}>
              <MessageSquarePlus className="mr-2 h-4 w-4" aria-hidden /> New message
            </Button>
          </div>
        </div>

        {tab === "reported" && moderate ? (
          <ModerationTab schoolId={schoolId} />
        ) : (
          <div className="grid h-[calc(100vh-13rem)] min-h-[420px] overflow-hidden rounded-xl border border-border bg-card shadow-card lg:grid-cols-[22rem_1fr]">
            <section className={cn("flex min-h-0 flex-col border-border lg:border-r", current && "hidden lg:flex")} aria-label="Conversations">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages" aria-label="Search messages" className="pl-9" />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.isLoading && <div className="p-3"><LoadingRows /></div>}
                {conversations.isError && <div className="p-3"><ErrorBox message={errMsg(conversations.error, "Could not load messages.")} onRetry={() => conversations.refetch()} /></div>}
                {!conversations.isLoading && !conversations.isError && shown.length === 0 && (
                  <div className="p-4">
                    <EmptyState
                      icon={Inbox}
                      title={list.length === 0 ? "No messages yet" : "No matches"}
                      text={list.length === 0 ? "Start a conversation with New message." : "Try a different search."}
                    />
                  </div>
                )}
                <ul>
                  {shown.map((c) => (
                    <li key={c.conversation_id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c.conversation_id)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
                          c.conversation_id === selected && "bg-muted",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-sm", c.unread_count > 0 ? "font-bold text-foreground" : "font-medium text-foreground")}>
                            {c.subject || titleOf(c)}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">{when(c.last_message_at)}</span>
                        </span>
                        {c.subject && <span className="truncate text-xs text-muted-foreground">{titleOf(c)}</span>}
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-muted-foreground">{c.last_sender_name ? `${c.last_sender_name}: ` : ""}{c.last_message_preview}</span>
                          {c.unread_count > 0 && (
                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-label={`${c.unread_count} unread`}>
                              {c.unread_count}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className={cn("min-h-0", !current && "hidden lg:block")} aria-label="Conversation">
              {current ? (
                <Thread key={current.conversation_id} schoolId={schoolId} conversation={current} onBack={() => setSelected(null)} />
              ) : (
                <div className="flex h-full items-center justify-center p-8">
                  <EmptyState icon={Inbox} title="Select a conversation" text="Choose one from the list, or start a new message." />
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <ComposeDialog
        open={composing}
        onOpenChange={setComposing}
        schoolId={schoolId}
        allowGroup={staffLike}
        onStarted={(id) => { setTab("inbox"); setSelected(id); }}
      />
    </DashboardLayout>
  );
};

export default MessagesPage;
