import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/kit/Panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useGuardianLinks } from "@/hooks/useSchoolData";
import PublishedResults from "./PublishedResults";
import { ListSkeleton, LoadError, type Lookups } from "./shared";

const ParentResults = ({ schoolId, me, lookups }: { schoolId: string; me: string; lookups: Lookups }) => {
  const links = useGuardianLinks(schoolId);
  const [picked, setPicked] = useState("");
  const children = useMemo(
    () => (links.data ?? []).filter((l) => l.guardian_id === me && l.status === "verified"),
    [links.data, me],
  );

  if (links.isLoading || lookups.loading) return <ListSkeleton rows={2} />;
  if (links.isError) return <LoadError message={(links.error as Error).message} onRetry={() => links.refetch()} />;
  if (children.length === 0) {
    return <EmptyState icon={Users} title="No verified children yet" text="The school must verify your link to your child before you can see their results. Contact the school office." />;
  }
  const childId = children.some((c) => c.student_id === picked) ? picked : children[0].student_id;

  return (
    <div className="space-y-4">
      {children.length > 1 && (
        <div className="max-w-xs space-y-2">
          <Label htmlFor="child-pick">Child</Label>
          <Select value={childId} onValueChange={setPicked}>
            <SelectTrigger id="child-pick"><SelectValue /></SelectTrigger>
            <SelectContent>
              {children.map((c) => <SelectItem key={c.student_id} value={c.student_id}>{lookups.personName.get(c.student_id) ?? "Child"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {children.length === 1 && <p className="text-sm text-muted-foreground">Results for <span className="font-medium text-card-foreground">{lookups.personName.get(childId) ?? "your child"}</span></p>}
      <PublishedResults key={childId} schoolId={schoolId} studentId={childId} lookups={lookups} />
    </div>
  );
};

export default ParentResults;
