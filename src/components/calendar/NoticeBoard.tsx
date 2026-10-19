import { Megaphone, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/kit/Panel";
import { relative, type Announcement } from "@/hooks/useSchoolData";

interface Props {
  notices: Announcement[];
  className: Map<string, string>;
  canEdit: (n: Announcement) => boolean;
  onEdit: (n: Announcement) => void;
}

const NoticeBoard = ({ notices, className, canEdit, onEdit }: Props) => {
  if (notices.length === 0) {
    return <EmptyState icon={Megaphone} title="No notices yet" text="Notices from the school and your teachers will appear here." />;
  }
  return (
    <ul className="divide-y divide-border">
      {notices.map((n) => (
        <li key={n.id} className="py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">{n.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{n.author_name ?? "School office"}</span>
                <span>· {relative(n.published_at)}</span>
                {n.class_id && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{className.get(n.class_id) ?? "Class"}</span>}
                {n.audience !== "everyone" && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize">{n.audience}</span>}
              </p>
            </div>
            {canEdit(n) && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onEdit(n)} aria-label={`Edit ${n.title}`}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
          {n.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>}
        </li>
      ))}
    </ul>
  );
};

export default NoticeBoard;
