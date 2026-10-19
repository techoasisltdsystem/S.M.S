import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { EmptyState } from "@/components/kit/Panel";
import { useAuth } from "@/contexts/AuthContext";
import { StudentsAdminView } from "@/components/students/StudentsAdminView";
import { TeacherRoster } from "@/components/students/TeacherRoster";

const StudentsPage = () => {
  const { user, can } = useAuth();
  if (user && (user.role === "student" || user.role === "parent")) return <Navigate to="/dashboard" replace />;
  return (
    <DashboardLayout>
      {user?.role === "teacher" ? (
        <TeacherRoster />
      ) : user && can("students.view") ? (
        <StudentsAdminView />
      ) : (
        <EmptyState icon={ShieldAlert} title="You do not have access to students" text="Ask a school administrator if you need it." />
      )}
    </DashboardLayout>
  );
};

export default StudentsPage;
