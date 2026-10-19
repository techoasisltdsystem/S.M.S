import { useState } from "react";
import { Loader2 } from "lucide-react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRefreshSchoolData, type Person } from "@/hooks/useSchoolData";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { errMsg } from "./QueryState";
import { inviteLink, type IssuedLink } from "./InviteLinkDialog";

type Link = Tables<"guardian_links">;

export const LINK_STYLE: Record<Enums<"guardian_link_status">, string> = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  verified: "border-success/30 bg-success/10 text-success",
  revoked: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const LinkBadge = ({ status }: { status: Enums<"guardian_link_status"> }) => (
  <Badge variant="outline" className={cn("capitalize", LINK_STYLE[status])}>
    {status}
  </Badge>
);

/** Verify / revoke buttons for one link. */
export const LinkActions = ({ link, size = "sm" }: { link: Link; size?: "sm" | "default" }) => {
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const [busy, setBusy] = useState(false);
  const set = async (status: "verified" | "revoked") => {
    setBusy(true);
    const { error } = await db.rpc("set_guardian_link_status", { _link: link.id, _status: status });
    setBusy(false);
    if (error) {
      toast({ title: status === "verified" ? "Could not verify" : "Could not revoke", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: status === "verified" ? "Link verified" : "Link revoked" });
    refresh();
  };
  return (
    <div className="flex gap-2">
      {link.status !== "verified" && (
        <Button size={size} disabled={busy} onClick={() => set("verified")}>
          {link.status === "revoked" ? "Verify again" : "Verify"}
        </Button>
      )}
      {link.status !== "revoked" && (
        <Button size={size} variant="outline" disabled={busy} onClick={() => set("revoked")}>
          Revoke
        </Button>
      )}
    </div>
  );
};

interface Props {
  student: { id: string; name: string } | null;
  schoolId: string;
  parents: Person[];
  links: Link[];
  nameOf: (id: string) => string;
  onClose: () => void;
  onIssued: (l: IssuedLink) => void;
}

export const GuardianDialog = ({ student, schoolId, parents, links, nameOf, onClose, onIssued }: Props) => {
  const { toast } = useToast();
  const refresh = useRefreshSchoolData();
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [fresh, setFresh] = useState({ name: "", email: "" });

  const mine = links.filter((l) => student && l.student_id === student.id);
  const linkedIds = new Set(mine.filter((l) => l.status !== "revoked").map((l) => l.guardian_id));
  const available = parents.filter((p) => !linkedIds.has(p.profile_id));

  const link = async (guardianId: string) => {
    const { error } = await db.rpc("link_guardian", { _student: student!.id, _guardian: guardianId, _relationship: relationship.trim() || "Parent" });
    if (error) throw error;
  };

  const linkExisting = async () => {
    if (!student || !existing) return;
    setBusy(true);
    try {
      await link(existing);
      toast({ title: "Link requested", description: "It stays pending until you verify it." });
      setExisting("");
      refresh();
    } catch (err) {
      toast({ title: "Could not link this parent", description: errMsg(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const inviteNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student) return;
    if (!fresh.name.trim() || !fresh.email.trim()) {
      toast({ title: "Name and email are required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await db.rpc("invite_member", { _school: schoolId, _full_name: fresh.name.trim(), _email: fresh.email.trim(), _role: "parent" });
      if (error) throw error;
      const res = data as unknown as { profile_id: string; token: string };
      try {
        await link(res.profile_id);
      } catch (err) {
        toast({ title: "Parent invited, but not linked", description: errMsg(err), variant: "destructive" });
      }
      onIssued({ link: inviteLink(res.token), name: fresh.name.trim() });
      setFresh({ name: "", email: "" });
      refresh();
    } catch (err) {
      toast({ title: "Could not invite this parent", description: errMsg(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!student} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Guardians of {student?.name}</DialogTitle>
          <DialogDescription>A parent sees nothing about this student until their link is verified.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {mine.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No guardians linked yet. Add one below.</p>
          ) : (
            mine.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{nameOf(l.guardian_id)}</p>
                  <p className="text-xs text-muted-foreground">{l.relationship}</p>
                </div>
                <div className="flex items-center gap-2">
                  <LinkBadge status={l.status} />
                  <LinkActions link={l} />
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="g_rel">Relationship</Label>
          <Input id="g_rel" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Mother, father, guardian" />
        </div>

        <Tabs defaultValue="existing">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Existing parent</TabsTrigger>
            <TabsTrigger value="new">Invite new parent</TabsTrigger>
          </TabsList>
          <TabsContent value="existing" className="space-y-3 pt-3">
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other parent accounts in this school yet. Invite one with the other tab.</p>
            ) : (
              <>
                <Select value={existing} onValueChange={setExisting}>
                  <SelectTrigger aria-label="Parent">
                    <SelectValue placeholder="Choose a parent" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((p) => (
                      <SelectItem key={p.profile_id} value={p.profile_id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={linkExisting} disabled={!existing || busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Link parent
                </Button>
              </>
            )}
          </TabsContent>
          <TabsContent value="new" className="pt-3">
            <form onSubmit={inviteNew} className="space-y-3">
              <Input aria-label="Parent full name" placeholder="Full name" value={fresh.name} onChange={(e) => setFresh({ ...fresh, name: e.target.value })} />
              <Input aria-label="Parent email" type="email" placeholder="Email" value={fresh.email} onChange={(e) => setFresh({ ...fresh, email: e.target.value })} />
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Invite and link
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
