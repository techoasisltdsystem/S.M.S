import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SchoolProvider } from "@/contexts/SchoolContext";
import MfaGate from "@/components/auth/MfaGate";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import AdminModulesPage from "./pages/AdminModulesPage";
import ClassesPage from "./pages/ClassesPage";
import StudentsPage from "./pages/StudentsPage";
import AttendancePage from "./pages/AttendancePage";
import TimetablePage from "./pages/TimetablePage";
import ExamsPage from "./pages/ExamsPage";
import CalendarPage from "./pages/CalendarPage";
import PlatformPage from "./pages/PlatformPage";
import LandingPage from "./pages/LandingPage";
import SetupWizard from "./pages/SetupWizard";
import UserManagementPage from "./pages/UserManagementPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import NotFound from "./pages/NotFound";
import Forbidden from "./pages/Forbidden";

const queryClient = new QueryClient();

const Checking = () => (
  <div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status">
    <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> Checking your sign-in…
  </div>
);

// Signed-in pages. `permission` hides a page from roles that cannot use it;
// the database refuses those requests anyway.
const ProtectedRoute = ({ children, permission, platform }: { children: React.ReactNode; permission?: string; platform?: boolean }) => {
  const { isAuthenticated, loading, mfa, can, isPlatform } = useAuth();
  if (loading) return <Checking />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mfa && mfa.kind !== "not_needed") return <MfaGate />;
  if (platform ? !isPlatform : isPlatform) return platform ? <Forbidden /> : <Navigate to="/platform" replace />;
  if (permission && !can(permission)) return <Forbidden />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <Checking />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/admin" element={<PublicRoute><AdminLogin /></PublicRoute>} />
    <Route path="/accept-invite" element={<AcceptInvite />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

    {/* Tech Oasis platform console */}
    <Route path="/platform" element={<ProtectedRoute platform><PlatformPage /></ProtectedRoute>} />
    <Route path="/platform/schools" element={<ProtectedRoute platform><PlatformPage /></ProtectedRoute>} />

    {/* Admin pages */}
    <Route path="/setup" element={<ProtectedRoute permission="school.settings.manage"><SetupWizard /></ProtectedRoute>} />
    <Route path="/user-management" element={<ProtectedRoute permission="users.manage"><UserManagementPage /></ProtectedRoute>} />
    <Route path="/staff" element={<ProtectedRoute permission="users.manage"><UserManagementPage /></ProtectedRoute>} />
    <Route path="/admin-settings" element={<ProtectedRoute permission="school.settings.manage"><AdminSettingsPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute permission="school.settings.manage"><AdminSettingsPage /></ProtectedRoute>} />
    <Route path="/audit-logs" element={<ProtectedRoute permission="audit.view"><AuditLogsPage /></ProtectedRoute>} />

    {/* Modules not built yet: each page says which phase brings it */}
    <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
    <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
    <Route path="/fees" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/classes" element={<ProtectedRoute><ClassesPage /></ProtectedRoute>} />
    <Route path="/timetable" element={<ProtectedRoute><TimetablePage /></ProtectedRoute>} />
    <Route path="/exams" element={<ProtectedRoute><ExamsPage /></ProtectedRoute>} />
    <Route path="/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/library" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/analytics" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />

    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SchoolProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </SchoolProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
