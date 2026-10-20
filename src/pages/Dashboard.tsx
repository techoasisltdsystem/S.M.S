import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useSchool } from "@/contexts/SchoolContext";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import AdminDashboard from "@/pages/dashboards/AdminDashboard";
import TeacherDashboard from "@/pages/dashboards/TeacherDashboard";
import { StudentDashboard, ParentDashboard } from "@/pages/dashboards/StudentView";
import StaffHome from "@/pages/dashboards/StaffHome";

// Each role gets the dashboard laid out for its work; all of them read the same
// school records, and the database decides what each person may see.
const Dashboard = () => {
  const { user, can } = useAuth();
  const { isSetupComplete, loading: schoolLoading } = useSchool();
  const navigate = useNavigate();

  if (!user) return null;
  if (user.role === "platform") return <Navigate to="/platform" replace />;

  return (
    <DashboardLayout>
      {can("school.settings.manage") && !isSetupComplete && !schoolLoading && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col items-start justify-between gap-4 rounded-xl border border-warning/20 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/20"><Settings className="h-4 w-4 text-warning" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground">Complete your school setup</p>
              <p className="text-xs text-muted-foreground">Add your school information, branding and academic settings.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate("/setup")} className="shrink-0">Set Up Now</Button>
        </motion.div>
      )}
      {user.role === "admin" && (user.memberRole === "librarian" || user.memberRole === "receptionist" ? <StaffHome /> : <AdminDashboard />)}
      {user.role === "teacher" && <TeacherDashboard />}
      {user.role === "student" && <StudentDashboard />}
      {user.role === "parent" && <ParentDashboard />}
    </DashboardLayout>
  );
};

export default Dashboard;
