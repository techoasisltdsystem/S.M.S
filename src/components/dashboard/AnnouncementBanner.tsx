import { useState } from "react";
import { Megaphone, Wrench, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMyAnnouncements } from "@/hooks/usePlatformOps";
import { cn } from "@/lib/utils";

/** Platform announcements and maintenance notices for the signed-in school person. Dismissing hides one until the next visit. */
const AnnouncementBanner = () => {
  const { user, isPlatform } = useAuth();
  const q = useMyAnnouncements(user && !isPlatform ? user.schoolId : undefined);
  const [hidden, setHidden] = useState<string[]>([]);
  const items = (q.data ?? []).filter((a) => !hidden.includes(a.id));
  if (items.length === 0) return null;
  return (
    <div className="space-y-px">
      {items.map((a) => (
        <div key={a.id} role="status" className={cn("flex items-start gap-3 border-b px-4 py-2 text-sm", a.kind === "maintenance" ? "border-warning/40 bg-warning/10" : "border-primary/20 bg-primary/5")}>
          {a.kind === "maintenance" ? <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden /> : <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}
          <p className="min-w-0 flex-1"><strong>{a.title}.</strong> {a.body}</p>
          <button type="button" aria-label={`Dismiss ${a.title}`} onClick={() => setHidden([...hidden, a.id])} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
};

export default AnnouncementBanner;
