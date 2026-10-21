import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SchoolProvider } from "@/contexts/SchoolContext";
import MfaGate from "@/components/auth/MfaGate";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import ForgotPassword from "./pages/ForgotPassword";
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
import MessagesPage from "./pages/MessagesPage";
import NotificationsPage from "./pages/NotificationsPage";
import AssignmentsPage from "./pages/AssignmentsPage";
import FeesPage from "./pages/FeesPage";
import ResourcesPage from "./pages/ResourcesPage";
import CbtPage from "./pages/CbtPage";
import CbtTakePage from "./pages/CbtTakePage";
import VirtualClassPage from "./pages/VirtualClassPage";
import VirtualRoomPage from "./pages/VirtualRoomPage";
import PayrollPage from "./pages/PayrollPage";
import ConcernsPage from "./pages/ConcernsPage";
import FeeReturnPage from "./pages/FeeReturnPage";
import AuditMonitoringPage from "./pages/AuditMonitoringPage";
import PlatformSubscriptionsPage from "./pages/PlatformSubscriptionsPage";
import PlatformSupportPage from "./pages/PlatformSupportPage";
import PlatformEventsPage from "./pages/PlatformEventsPage";
import PlatformAnnouncementsPage from "./pages/PlatformAnnouncementsPage";
import PlatformReportsPage from "./pages/PlatformReportsPage";
import PlatformInvoicesPage from "./pages/PlatformInvoicesPage";
import PlatformSchoolsInsightPage from "./pages/PlatformSchoolsInsightPage";
import PlatformRolesPage from "./pages/PlatformRolesPage";
import PlatformInvitePage from "./pages/PlatformInvitePage";
import PlatformTeamPage from "./pages/PlatformTeamPage";
import PlatformHealthPage from "./pages/PlatformHealthPage";
import PlatformActivityPage from "./pages/PlatformActivityPage";
import SchoolSupportPage from "./pages/SchoolSupportPage";
import RolePermissionsPage from "./pages/RolePermissionsPage";
import PricingPage from "./pages/PricingPage";
import AboutPage from "./pages/AboutPage";
import FeaturesPage from "./pages/FeaturesPage";
import FaqPage from "./pages/FaqPage";
import ContactPage from "./pages/ContactPage";
import ProfilePage from "./pages/ProfilePage";
import CheckoutPage from "./pages/CheckoutPage";
import CheckoutReturnPage from "./pages/CheckoutReturnPage";
import DemoCheckoutPage from "./pages/DemoCheckoutPage";
import SuperAdminLogin from "./pages/SuperAdminLogin";
import PlatformClientsPage from "./pages/PlatformClientsPage";
import PlatformClientPage from "./pages/PlatformClientPage";
import PlatformBillingPage from "./pages/PlatformBillingPage";
import PlatformPackagesPage from "./pages/PlatformPackagesPage";
import PlatformRenewalsPage from "./pages/PlatformRenewalsPage";
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
const ProtectedRoute = ({ children, permission, platform, schoolAdmin }: { children: React.ReactNode; permission?: string; platform?: boolean; schoolAdmin?: boolean }) => {
  const { isAuthenticated, loading, mfa, can, isPlatform, user, mustChangePassword } = useAuth();
  const where = useLocation();
  if (loading) return <Checking />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (mfa && mfa.kind !== "not_needed") return <MfaGate />;
  // A temporary password must be replaced before anything else.
  if (mustChangePassword && !where.pathname.endsWith("/profile")) return <Navigate to={isPlatform ? "/platform/profile" : "/profile"} replace />;
  if (platform ? !isPlatform : isPlatform) return platform ? <Forbidden /> : <Navigate to="/platform" replace />;
  if (permission && !can(permission)) return <Forbidden />;
  // Billing stays open to the School Admin of a lapsed (read-only) school so they can renew.
  if (schoolAdmin && user?.role !== "admin") return <Forbidden />;
  return <>{children}</>;
};

/**
 * The sign-in screens always start fresh. Even if this browser is already signed in somewhere, visiting a login
 * page signs that session out first, so the person must choose a login and enter their own credentials.
 * After a successful sign-in the person goes to their dashboard.
 */
const FreshLogin = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, logout } = useAuth();
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    void (async () => {
      if (isAuthenticated) await logout();
      setReady(true);
    })();
  }, [loading, isAuthenticated, logout]);
  if (!ready) return <Checking />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
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
    <Route path="/login" element={<FreshLogin><Login /></FreshLogin>} />
    <Route path="/admin" element={<FreshLogin><AdminLogin /></FreshLogin>} />
    <Route path="/super-admin/login" element={<SuperAdminLogin />} />
    <Route path="/pricing" element={<PricingPage />} />
    <Route path="/about" element={<AboutPage />} />
    <Route path="/features" element={<FeaturesPage />} />
    <Route path="/faq" element={<FaqPage />} />
    <Route path="/contact" element={<ContactPage />} />
    <Route path="/checkout" element={<CheckoutPage />} />
    <Route path="/signup" element={<CheckoutPage />} />
    <Route path="/checkout/return" element={<CheckoutReturnPage />} />
    <Route path="/checkout/demo" element={<DemoCheckoutPage />} />
    <Route path="/accept-invite" element={<AcceptInvite />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

    {/* Tech Oasis platform console */}
    <Route path="/platform" element={<ProtectedRoute platform permission="clients.view"><PlatformPage /></ProtectedRoute>} />
    <Route path="/platform/schools" element={<ProtectedRoute platform permission="clients.manage"><PlatformPage /></ProtectedRoute>} />
    <Route path="/platform/clients" element={<ProtectedRoute platform permission="clients.view"><PlatformClientsPage /></ProtectedRoute>} />
    <Route path="/platform/clients/:id" element={<ProtectedRoute platform permission="clients.view"><PlatformClientPage /></ProtectedRoute>} />
    <Route path="/platform/billing" element={<ProtectedRoute platform permission="billing.view"><PlatformBillingPage /></ProtectedRoute>} />
    <Route path="/platform/packages" element={<ProtectedRoute platform permission="billing.view"><PlatformPackagesPage view="packages" /></ProtectedRoute>} />
    <Route path="/platform/settings" element={<ProtectedRoute platform permission="billing.view"><PlatformPackagesPage view="settings" /></ProtectedRoute>} />
    <Route path="/platform/renewals" element={<ProtectedRoute platform permission="clients.view"><PlatformRenewalsPage /></ProtectedRoute>} />
    <Route path="/platform/audit" element={<ProtectedRoute platform permission="audit.view"><AuditMonitoringPage /></ProtectedRoute>} />
    <Route path="/platform/subscriptions" element={<ProtectedRoute platform permission="clients.view"><PlatformSubscriptionsPage /></ProtectedRoute>} />
    <Route path="/platform/support" element={<ProtectedRoute platform permission="support.view"><PlatformSupportPage /></ProtectedRoute>} />
    <Route path="/platform/activity" element={<ProtectedRoute platform permission="audit.view"><PlatformActivityPage /></ProtectedRoute>} />
    <Route path="/subscription" element={<ProtectedRoute schoolAdmin><SchoolSupportPage view="subscription" /></ProtectedRoute>} />
    <Route path="/support" element={<ProtectedRoute permission="staff.manage"><SchoolSupportPage view="support" /></ProtectedRoute>} />

    {/* Admin pages */}
    <Route path="/setup" element={<ProtectedRoute permission="school.settings.manage"><SetupWizard /></ProtectedRoute>} />
    <Route path="/user-management" element={<ProtectedRoute permission="users.manage"><UserManagementPage /></ProtectedRoute>} />
    <Route path="/staff" element={<ProtectedRoute permission="users.manage"><UserManagementPage /></ProtectedRoute>} />
    <Route path="/admin-settings" element={<ProtectedRoute permission="school.settings.manage"><AdminSettingsPage /></ProtectedRoute>} />
    <Route path="/settings" element={<ProtectedRoute permission="school.settings.manage"><AdminSettingsPage /></ProtectedRoute>} />
    <Route path="/audit-logs" element={<ProtectedRoute permission="audit.view"><AuditLogsPage /></ProtectedRoute>} />
    <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
    <Route path="/platform-invite" element={<PlatformInvitePage />} />
    <Route path="/platform/events" element={<ProtectedRoute platform permission="audit.view"><PlatformEventsPage /></ProtectedRoute>} />
    <Route path="/platform/announcements" element={<ProtectedRoute platform permission="announcements.manage"><PlatformAnnouncementsPage /></ProtectedRoute>} />
    <Route path="/platform/reports" element={<ProtectedRoute platform permission="billing.view"><PlatformReportsPage /></ProtectedRoute>} />
    <Route path="/platform/invoices" element={<ProtectedRoute platform permission="billing.view"><PlatformInvoicesPage /></ProtectedRoute>} />
    <Route path="/platform/onboarding" element={<ProtectedRoute platform permission="clients.view"><PlatformSchoolsInsightPage view="onboarding" /></ProtectedRoute>} />
    <Route path="/platform/school-admins" element={<ProtectedRoute platform permission="clients.view"><PlatformSchoolsInsightPage view="admins" /></ProtectedRoute>} />
    <Route path="/platform/usage" element={<ProtectedRoute platform permission="clients.view"><PlatformSchoolsInsightPage view="usage" /></ProtectedRoute>} />
    <Route path="/platform/roles" element={<ProtectedRoute platform permission="admins.manage"><PlatformRolesPage /></ProtectedRoute>} />
    <Route path="/platform/admins" element={<ProtectedRoute platform permission="admins.manage"><PlatformTeamPage /></ProtectedRoute>} />
    <Route path="/platform/health" element={<ProtectedRoute platform permission="health.view"><PlatformHealthPage /></ProtectedRoute>} />
    <Route path="/platform/profile" element={<ProtectedRoute platform><ProfilePage /></ProtectedRoute>} />
    <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
    <Route path="/assignments" element={<ProtectedRoute><AssignmentsPage /></ProtectedRoute>} />
    <Route path="/role-permissions" element={<ProtectedRoute permission="staff.manage"><RolePermissionsPage /></ProtectedRoute>} />

    {/* Modules not built yet: each page says which phase brings it */}
    <Route path="/students" element={<ProtectedRoute><StudentsPage /></ProtectedRoute>} />
    <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
    <Route path="/fees" element={<ProtectedRoute><FeesPage /></ProtectedRoute>} />
    <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
    <Route path="/cbt" element={<ProtectedRoute><CbtPage /></ProtectedRoute>} />
    <Route path="/cbt/take/:testId" element={<ProtectedRoute><CbtTakePage /></ProtectedRoute>} />
    <Route path="/virtual-class" element={<ProtectedRoute><VirtualClassPage /></ProtectedRoute>} />
    <Route path="/virtual-class/:id" element={<ProtectedRoute><VirtualRoomPage /></ProtectedRoute>} />
    <Route path="/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
    <Route path="/concerns" element={<ProtectedRoute><ConcernsPage /></ProtectedRoute>} />
    <Route path="/fees/return" element={<ProtectedRoute><FeeReturnPage /></ProtectedRoute>} />
    <Route path="/classes" element={<ProtectedRoute><ClassesPage /></ProtectedRoute>} />
    <Route path="/timetable" element={<ProtectedRoute><TimetablePage /></ProtectedRoute>} />
    <Route path="/exams" element={<ProtectedRoute><ExamsPage /></ProtectedRoute>} />
    <Route path="/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/library" element={<ProtectedRoute><AdminModulesPage /></ProtectedRoute>} />
    <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
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
