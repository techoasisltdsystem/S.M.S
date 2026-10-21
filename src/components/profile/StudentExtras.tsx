import { useQuery } from "@tanstack/react-query";
import { BookOpen, Briefcase, Users } from "lucide-react";
import { Panel } from "@/components/kit/Panel";
import { ErrorBox, LoadingRows, errMsg } from "@/components/students/QueryState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { rpc } from "@/lib/rpc";

interface Extras {
  class: string | null; class_teacher: string | null; admitted_on: string | null; subjects: string[];
  guardians: { name: string; relationship: string | null; email: string | null; phone: string | null }[];
}
const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Not recorded");
const Field = ({ k, v }: { k: string; v: React.ReactNode }) => <div><p className="text-xs text-muted-foreground">{k}:</p><p className="text-sm font-medium">{v}</p></div>;

/** A student's school information and parents/guardians, from the school's records. */
const StudentExtras = ({ schoolId, studentId }: { schoolId: string; studentId: string }) => {
  const q = useQuery({ queryKey: ["student-extras", studentId], queryFn: () => rpc<Extras>("student_profile_extras", { _school: schoolId, _student: studentId }) });
  const x = q.data;
  const years = x?.admitted_on ? Math.max(0, Math.floor((Date.now() - new Date(x.admitted_on).getTime()) / (365.25 * 86400000))) : null;
  return (
    <Panel title="School and family" icon={Briefcase} className="lg:col-span-2">
      {q.isLoading && <LoadingRows rows={3} />}
      {q.isError && <ErrorBox message={errMsg(q.error)} onRetry={() => q.refetch()} />}
      {x && (
        <Tabs defaultValue="school">
          <TabsList><TabsTrigger value="school">School Information</TabsTrigger><TabsTrigger value="family">Parent/Guardian</TabsTrigger></TabsList>
          <TabsContent value="school" className="mt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field k="Class" v={x.class ?? "Not placed in a class"} />
              <Field k="Class Teacher" v={x.class_teacher ?? "Not assigned"} />
              <Field k="Admission Date" v={day(x.admitted_on)} />
              <Field k="Years in School" v={years ?? "-"} />
            </div>
            <div className="mt-4"><p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><BookOpen className="h-3.5 w-3.5" aria-hidden /> Subjects:</p>
              <p className="text-sm font-medium">{x.subjects.length ? x.subjects.join(", ") : "No subjects assigned to the class yet"}</p></div>
          </TabsContent>
          <TabsContent value="family" className="mt-4">
            {x.guardians.length === 0 ? <p className="text-sm text-muted-foreground">No verified parent or guardian is linked yet. The school office links and verifies guardians.</p> : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {x.guardians.map((g, i) => (
                  <li key={i} className="rounded-xl border border-border p-4">
                    <p className="flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-primary" aria-hidden />{g.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">{g.relationship ?? "Guardian"}</p>
                    <p className="mt-2 text-sm">{g.email ?? "No email"}{g.phone ? ` · ${g.phone}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}
    </Panel>
  );
};

export default StudentExtras;
