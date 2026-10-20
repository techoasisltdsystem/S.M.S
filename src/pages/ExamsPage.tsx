import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState } from "@/components/kit/Panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useAssignments } from "@/hooks/useSchoolData";
import { useLookups } from "@/components/results/shared";
import TeacherResults from "@/components/results/TeacherResults";
import ReviewQueue from "@/components/results/ReviewQueue";
import PublishedResults from "@/components/results/PublishedResults";
import ParentResults from "@/components/results/ParentResults";
import CorrectionsPanel from "@/components/results/CorrectionsPanel";
import ClassDownloads from "@/components/results/ClassDownloads";
import ResultsPolicyPanel from "@/components/results/ResultsPolicyPanel";

const SUBTITLE = {
  teacher: "Set assessments, enter marks, publish results and request corrections.",
  admin: "Review submitted results, approve corrections, and download reports.",
  student: "Your published results.",
  parent: "Your child's published results.",
} as const;

const ExamsPage = () => {
  const { user, can } = useAuth();
  const role = user?.role;
  const schoolId = user?.schoolId ?? "";
  const lookups = useLookups(schoolId);
  const assignments = useAssignments(schoolId);

  const myClassIds = useMemo(() => {
    const me = user?.id;
    return [
      ...new Set([
        ...(assignments.data ?? []).filter((a) => a.teacher_id === me).map((a) => a.class_id),
        ...lookups.classes.filter((c) => c.form_teacher_id === me).map((c) => c.id),
      ]),
    ];
  }, [assignments.data, lookups.classes, user?.id]);

  let body;
  if (!user || role === "platform") {
    body = <EmptyState icon={ShieldAlert} title="Not available" text="Results belong to a school. Sign in with a school account to view them." />;
  } else if (role === "teacher") {
    body = can("grades.enter") ? (
      <Tabs defaultValue="assessments">
        <TabsList>
          <TabsTrigger value="assessments">Assessments</TabsTrigger>
          <TabsTrigger value="corrections">Corrections</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
        </TabsList>
        <TabsContent value="assessments" className="mt-4"><TeacherResults schoolId={schoolId} me={user.id} lookups={lookups} /></TabsContent>
        <TabsContent value="corrections" className="mt-4"><CorrectionsPanel schoolId={schoolId} lookups={lookups} /></TabsContent>
        <TabsContent value="downloads" className="mt-4"><ClassDownloads lookups={lookups} classIds={myClassIds} /></TabsContent>
      </Tabs>
    ) : (
      <EmptyState icon={ShieldAlert} title="You do not have permission to enter results" text="Ask your school administrator to give you the grading permission." />
    );
  } else if (role === "admin") {
    body = can("grades.view") ? (
      <Tabs defaultValue="review">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="review">Review</TabsTrigger>
          <TabsTrigger value="corrections">Corrections</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
          {can("school.settings.manage") && <TabsTrigger value="policy">Policy and grading</TabsTrigger>}
        </TabsList>
        <TabsContent value="review" className="mt-4"><ReviewQueue schoolId={schoolId} lookups={lookups} /></TabsContent>
        <TabsContent value="corrections" className="mt-4"><CorrectionsPanel schoolId={schoolId} lookups={lookups} /></TabsContent>
        <TabsContent value="downloads" className="mt-4"><ClassDownloads lookups={lookups} /></TabsContent>
        {can("school.settings.manage") && <TabsContent value="policy" className="mt-4"><ResultsPolicyPanel schoolId={schoolId} /></TabsContent>}
      </Tabs>
    ) : (
      <EmptyState icon={ShieldAlert} title="You do not have permission to view results" text="Results are limited to administrators and auditors with grading access." />
    );
  } else if (role === "student") {
    body = <PublishedResults schoolId={schoolId} studentId={user.id} lookups={lookups} />;
  } else {
    body = <ParentResults schoolId={schoolId} me={user.id} lookups={lookups} />;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Exams and results</h1>
          {role && role !== "platform" && <p className="text-sm text-muted-foreground">{SUBTITLE[role]}</p>}
        </div>
        {body}
      </div>
    </DashboardLayout>
  );
};

export default ExamsPage;
