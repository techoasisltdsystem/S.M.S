import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export const inviteLink = (token: string) => `${window.location.origin}/accept-invite?token=${encodeURIComponent(token)}`;

export interface IssuedLink {
  link: string;
  name: string;
}

export const InviteLinkDialog = ({ issued, onClose }: { issued: IssuedLink | null; onClose: () => void }) => {
  const { toast } = useToast();
  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Copy the link by hand", description: "Your browser blocked copying.", variant: "destructive" });
    }
  };
  return (
    <Dialog open={!!issued} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">Invitation link for {issued?.name}</DialogTitle>
          <DialogDescription>Send this link to them privately. It works once and expires in 7 days. It is shown only now.</DialogDescription>
        </DialogHeader>
        <Input readOnly value={issued?.link ?? ""} onFocus={(e) => e.target.select()} aria-label="Invitation link" />
        <DialogFooter>
          <Button onClick={copy}>
            <Copy className="mr-2 h-4 w-4" /> Copy link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
