import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Clock, Eye, Megaphone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/kit/Panel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { relative, type Announcement } from "@/hooks/useSchoolData";
import { rpc } from "@/lib/rpc";
import { AUDIENCES, errorText } from "./shared";

interface Props {
  schoolId: string;
  notices: Announcement[];
  className: Map<string, string>;
  canEdit: (n: Announcement) => boolean;
  /** The author and the office may withdraw a notice. */
  canWithdraw: (n: Announcement) => boolean;
  onEdit: (n: Announcement) => void;
}

interface Stat { announcement_id: string; recipients: number; reads: number; scheduled: boolean; cancelled: boolean }

const NoticeBoard = ({ schoolId, notices, className, canEdit, canWithdraw, onEdit }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const classesFor = useQuery({
    queryKey: ["announcement-classes", schoolId, notices.length],
    enabled: !!schoolId && notices.length > 0,
    queryFn: () => rpc<{ announcement_id: string; classes: string[] }[]>("announcement_classes_for", { _school: schoolId }),
  });
  const stats = useQuery({
    queryKey: ["announcement-stats", schoolId, notices.length],
    enabled: !!schoolId && notices.length > 0,
    queryFn: () => rpc<Stat[]>("announcement_stats", { _school: schoolId }),
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => rpc("cancel_announcement", { _announcement: id }),
    onSuccess: () => {
      ["announcements", "announcement-stats"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast({ title: "Notice withdrawn" });
    },
    onError: (e) => toast({ title: "Could not withdraw", description: errorText(e), variant: "destructive" }),
  });
  const [confirm, setConfirm] = useState<Announcement | null>(null);

  // Notices on screen count as read (only those the reader may see are recorded).
  const sent = useRef(new Set<string>());
  useEffect(() => {
    const now = Date.now();
    const ids = notices.filter((n) => !n.cancelled_at && new Date(n.published_at).getTime() <= now && !sent.current.has(n.id)).map((n) => n.id);
    if (ids.length === 0) return;
    ids.forEach((i) => sent.current.add(i));
    rpc("mark_announcements_read", { _ids: ids }).catch(() => ids.forEach((i) => sent.current.delete(i)));
  }, [notices]);

  const classMap = useMemo(() => new Map((classesFor.data ?? []).map((r) => [r.announcement_id, r.classes])), [classesFor.data]);
  const statMap = useMemo(() => new Map((stats.data ?? []).map((s) => [s.announcement_id, s])), [stats.data]);

  if (notices.length === 0) {
    return <EmptyState icon={Megaphone} title="No notices yet" text="Notices from the school and your teachers will appear here." />;
  }
  return (
    <>
      <ul className="divide-y divide-border">
        {notices.map((n) => {
          const cls = classMap.get(n.id) ?? (n.class_id ? [n.class_id] : []);
          const st = statMap.get(n.id);
          const scheduled = new Date(n.published_at).getTime() > Date.now();
          return (
            <li key={n.id} className={n.cancelled_at ? "py-3 opacity-60" : "py-3"}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground">{n.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{n.author_name ?? "School office"}</span>
                    <span>· {scheduled ? `scheduled for ${new Date(n.published_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : relative(n.published_at)}</span>
                    {cls.map((c) => <span key={c} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{className.get(c) ?? "Class"}</span>)}
                    {n.audience !== "everyone" && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{AUDIENCES.find((a) => a.value === n.audience)?.label ?? n.audience}</span>}
                    {scheduled && !n.cancelled_at && <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info"><Clock className="h-3 w-3" aria-hidden /> Scheduled</span>}
                    {n.cancelled_at && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Withdrawn</span>}
                    {st && !scheduled && !n.cancelled_at && (
                      <span className="inline-flex items-center gap-1" title="Read by the people it was sent to"><Eye className="h-3 w-3" aria-hidden /> Read by {st.reads} of {st.recipients}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {canEdit(n) && !n.cancelled_at && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(n)} aria-label={`Edit ${n.title}`}><Pencil className="h-4 w-4" /></Button>
                  )}
                  {canWithdraw(n) && !n.cancelled_at && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setConfirm(n)} aria-label={`Withdraw ${n.title}`}><Ban className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
              {n.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>}
            </li>
          );
        })}
      </ul>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw this notice?</AlertDialogTitle>
            <AlertDialogDescription>"{confirm?.title}" disappears for its audience. You and the school office still see it, marked as withdrawn. The withdrawal is audited.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) withdraw.mutate(confirm.id); setConfirm(null); }}>Withdraw</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default NoticeBoard;
