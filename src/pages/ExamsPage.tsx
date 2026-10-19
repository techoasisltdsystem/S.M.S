import { ShieldAlert } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState } from "@/components/kit/Panel";
import { useAuth } from "@/contexts/AuthContext";
import { useLookups } from "@/components/results/shared";
import TeacherResults from "@/components/results/TeacherResults";
import ReviewQueue from "@/components/results/ReviewQueue";
import PublishedResults from "@/components/results/PublishedResults";
import ParentResults from "@/components/results/ParentResults";

const SUBTITLE = {
  teacher: "Set assessments, enter marks and submit them for approval.",
  admin: "Review submitted results, then approve and publish them.",
  student: "Your published results.",
  parent: "Your child's published results.",
} as const;

const ExamsPage = () => {
  const { user, can } = useAuth();
  const role = user?.role;
  const schoolId = user?.schoolId ?? "";
  const lookups = useLookups(schoolId);

  let body;
  if (!user || role === "platform") {
    body = <EmptyState icon={ShieldAlert} title="Not available" text="Results belong to a school. Sign in with a school account to view them." />;
  } else if (role === "teacher") {
    body = can("grades.enter")
      ? <TeacherResults schoolId={schoolId} me={user.id} lookups={lookups} />
      : <EmptyState icon={ShieldAlert} title="You do not have permission to enter results" text="Ask your school administrator to give you the grading permission." />;
  } else if (role === "admin") {
    body = can("grades.view")
      ? <ReviewQueue schoolId={schoolId} lookups={lookups} />
      : <EmptyState icon={ShieldAlert} title="You do not have permission to view results" text="Results are limited to administrators and auditors with grading access." />;
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
