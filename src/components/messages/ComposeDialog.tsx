import { useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MEMBER_ROLE_LABEL, type MemberRole } from "@/contexts/AuthContext";
import { useMessagingActions, useRecipients } from "@/hooks/useMessaging";
import { useToast } from "@/hooks/use-toast";
import { errMsg } from "@/components/students/QueryState";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string;
  /** Staff can write to several people at once; parents and students to one. */
  allowGroup: boolean;
  onStarted: (conversationId: string) => void;
}

const roleText = (roles: string[]) => roles.map((r) => MEMBER_ROLE_LABEL[r as MemberRole] ?? r).join(", ");

const ComposeDialog = ({ open, onOpenChange, schoolId, allowGroup, onStarted }: Props) => {
  const { toast } = useToast();
  const recipients = useRecipients(schoolId, open);
  const { start } = useMessagingActions(schoolId);
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const all = useMemo(() => recipients.data ?? [], [recipients.data]);
  const byId = useMemo(() => new Map(all.map((r) => [r.profile_id, r])), [all]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => !chosen.includes(r.profile_id))
      .filter((r) => !q || r.full_name.toLowerCase().includes(q) || roleText(r.roles).toLowerCase().includes(q))
      .slice(0, 30);
  }, [all, chosen, search]);

  const reset = () => {
    setSearch("");
    setChosen([]);
    setSubject("");
    setBody("");
  };

  const pick = (id: string) => {
    setChosen((c) => (allowGroup ? [...c, id] : [id]));
    setSearch("");
  };

  const canSend = chosen.length > 0 && body.trim().length > 0 && !start.isPending;

  const submit = async () => {
    try {
      const id = await start.mutateAsync({ recipients: chosen, subject: subject.trim(), body: body.trim() });
      toast({ title: "Message sent" });
      reset();
      onOpenChange(false);
      onStarted(id);
    } catch (e) {
      toast({ title: "Message not sent", description: errMsg(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New message</DialogTitle>
          <DialogDescription>
            You can only write to people your role allows. Messages are private to the people in the conversation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="to-search">To</Label>
            {chosen.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Recipients">
                {chosen.map((id) => (
                  <li key={id} className="flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm text-primary">
                    {byId.get(id)?.full_name}
                    <button
                      type="button"
                      onClick={() => setChosen((c) => c.filter((x) => x !== id))}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-primary/20"
                      aria-label={`Remove ${byId.get(id)?.full_name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {(allowGroup || chosen.length === 0) && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="to-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={recipients.isLoading ? "Loading people…" : "Search by name or role"}
                  className="pl-9"
                  autoComplete="off"
                />
              </div>
            )}
            {recipients.isError && <p role="alert" className="text-sm text-destructive">{errMsg(recipients.error, "Could not load recipients.")}</p>}
            {(search.trim() || chosen.length === 0) && !recipients.isLoading && !recipients.isError && (
              <ul className="max-h-44 divide-y divide-border overflow-y-auto rounded-lg border border-border" role="listbox" aria-label="People you can message">
                {matches.length === 0 && (
                  <li className="px-3 py-3 text-sm text-muted-foreground">
                    {all.length === 0 ? "You have no one to message yet." : "No one matches that search."}
                  </li>
                )}
                {matches.map((r) => (
                  <li key={r.profile_id}>
                    <button
                      type="button"
                      onClick={() => pick(r.profile_id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                    >
                      <span className="font-medium text-foreground">{r.full_name}</span>
                      <span className="text-xs text-muted-foreground">{roleText(r.roles)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="msg-subject">Subject (optional)</Label>
            <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="msg-body">Message</Label>
            <Textarea id="msg-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSend}>
            {start.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ComposeDialog;
