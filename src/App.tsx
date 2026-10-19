import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SchoolProvider } from "@/contexts/SchoolContext";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import StudentsPage from "./pages/StudentsPage";
import FeesPage from "./pages/FeesPage";
import AdminModulesPage from "./pages/AdminModulesPage";
import LandingPage from "./pages/LandingPage";
import SetupWizard from "./pages/SetupWizard";
import UserManagementPage from "./pages/UserManagementPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
    <Route path="/admin" element={<PublicRoute><AdminLogin /></PublicRoute>} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/setup" element={<ProtectedRoute><SetupWizard /></ProtectedRoute>} />
    <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
    <Route path="/fees" element={<ProtectedRoute><FeesPage /></ProtectedRoute>} />

    {/* Admin pages */}
    <Route path="/user-management" element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
    <Route path="/admin-settings" element={<ProtectedRoute><AdminSettingsPage /></ProtectedRoute>} />
    <Route path="/audit-logs" element={<ProtectedRoute><AuditLogsPage /></ProtectedRoute>} />

    {/* Module pages */}
    <Route path="/staff" element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
    <Route path="/classes" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/timetable" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/exams" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/attendance" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/library" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/analytics" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute><AdminSettingsPage /></ProtectedRoute>} />

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

