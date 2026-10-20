import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { Panel, EmptyState } from "@/components/kit/Panel";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DownloadMenu from "./DownloadMenu";
import type { Lookups } from "./shared";

/** Class results sheets. `classIds` limits the list (teachers see only their own classes). */
const ClassDownloads = ({ lookups, classIds }: { lookups: Lookups; classIds?: string[] }) => {
  const classes = useMemo(
    () => lookups.classes.filter((c) => !classIds || classIds.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [lookups.classes, classIds],
  );
  const [picked, setPicked] = useState("");
  const classId = classes.some((c) => c.id === picked) ? picked : classes[0]?.id;

  return (
    <Panel title="Download class results" icon={FileDown}>
      {classes.length === 0 ? (
        <EmptyState icon={FileDown} title="No classes to download" text="Classes you teach or manage appear here." />
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 space-y-2">
            <Label htmlFor="dl-class">Class</Label>
            <Select value={classId} onValueChange={setPicked}>
              <SelectTrigger id="dl-class"><SelectValue /></SelectTrigger>
              <SelectContent>{classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {classId && <DownloadMenu target={{ kind: "class", classId, label: lookups.className.get(classId) }} size="default" label="Download results" />}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Contains published results only. Teachers receive the subjects they teach; the school office receives every subject. Each download is recorded in the audit log.
      </p>
    </Panel>
  );
};

export default ClassDownloads;
