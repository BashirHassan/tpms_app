import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstitutionSelectionProvider } from './context/InstitutionSelectionContext';
import { ToastProvider } from './context/ToastContext';
import { InstitutionProvider } from './context/InstitutionContext';
import { AlertProvider } from './components/ui/AlertDialog';
import { useLandingPage } from './hooks/useSubdomain';
import ProtectedRoute, { 
  StaffRoute, 
  AdminRoute, 
  HeadOfTPRoute, 
  SupervisorRoute,
  SuperAdminRoute,
  GlobalRoute,
  StudentRoute,
  AdminOrDeanRoute 
} from './components/auth/ProtectedRoute';
import { ROLE_GROUPS } from './utils/roles';

// Error Pages
import NotFoundPage from './pages/errors/NotFoundPage';

// Landing Page
import LandingPage from './pages/LandingPage';

// Layouts
import AdminLayout from './layouts/AdminLayout';
import StudentLayout from './layouts/StudentLayout';
import PublicLayout from './layouts/PublicLayout';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import StudentLoginPage from './pages/auth/StudentLoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

// Admin Pages
import DashboardPage from './pages/admin/DashboardPage';
import UsersPage from './pages/admin/UsersPage';
import ProfilePage from './pages/admin/ProfilePage';
import InstitutionsPage from './pages/admin/InstitutionsPage';
import CreateInstitutionPage from './pages/admin/CreateInstitutionPage';
import EditInstitutionPage from './pages/admin/EditInstitutionPage';
import FeaturesPage from './pages/admin/FeaturesPage';
import AcademicPage from './pages/admin/AcademicPage';
import StudentsPage from './pages/admin/StudentsPage';
import PrintPinPage from './pages/admin/PrintPinPage';
import RanksPage from './pages/admin/RanksPage';
import RoutesPage from './pages/admin/RoutesPage';
import SchoolsPage from './pages/admin/SchoolsPage';
import MasterSchoolsPage from './pages/admin/MasterSchoolsPage';
import SessionsPage from './pages/admin/SessionsPage';
import PaymentsPage from './pages/admin/PaymentsPage';
import AcceptancesPage from './pages/admin/AcceptancesPage';
import PostingsPage from './pages/admin/PostingsPage';
import MultipostingPage from './pages/admin/MultipostingPage';
import AllowancesPage from './pages/admin/AllowancesPage';
import MonitoringPage from './pages/admin/MonitoringPage';
import StudentsRegroupPage from './pages/admin/StudentsRegroupPage';
import MergeRoutesPage from './pages/admin/MergeRoutesPage';
import AdminResultsPage from './pages/admin/AdminResultsPage';
import AllPostingsPage from './pages/admin/AllPostingsPage';
import SchoolUpdateRequestsPage from './pages/admin/SchoolUpdateRequestsPage';
import DocumentTemplatesPage from './pages/admin/DocumentTemplatesPage';
import DeanPostingAllocationPage from './pages/admin/DeanPostingAllocationPage';
import DeansPostingsPage from './pages/admin/DeansPostingsPage';
import AdminLocationLogsPage from './pages/admin/AdminLocationLogsPage';

// Supervisor Pages
import SupervisorResultUploadPage from './pages/supervisor/SupervisorResultUploadPage';
import SupervisorMyPostingsPage from './pages/supervisor/SupervisorMyPostingsPage';
import SupervisorInvitationPage from './pages/supervisor/SupervisorInvitationPage';
import LocationTrackerPage from './pages/supervisor/LocationTrackerPage';

// Global Admin Pages (admin subdomain only)
import GlobalUsersPage from './pages/admin/GlobalUsersPage';
import GlobalFeaturesPage from './pages/admin/GlobalFeaturesPage';
import GlobalPaymentsPage from './pages/admin/GlobalPaymentsPage';

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import PaymentPage from './pages/student/PaymentPage';
import AcceptanceFormPage from './pages/student/AcceptanceFormPage';
import PostingLetterPage from './pages/student/PostingLetterPage';
import IntroductionLetterPage from './pages/student/IntroductionLetterPage';
import AcceptanceDocumentPage from './pages/student/AcceptanceDocumentPage';

// Public Pages
import PrincipalUpdatePage from './pages/public/PrincipalUpdatePage';
import LocationUpdatePage from './pages/public/LocationUpdatePage';
import DocsPage from './pages/public/DocsPage';

/**
 * InstitutionSelectionWrapper - Provides InstitutionSelectionContext with access to the authenticated user
 * InstitutionSelectionProvider needs the user to determine their institution and permissions
 */
function InstitutionSelectionWrapper({ children }) {
  const { user } = useAuth();
  return <InstitutionSelectionProvider user={user}>{children}</InstitutionSelectionProvider>;
}

/**
 * AppRoutes - Renders landing page on primary domain, main app on institution subdomains
 */
function AppRoutes() {
  const isLanding = useLandingPage();

  // Primary domain (no subdomain) shows landing page
  if (isLanding) {
    return (
      <Routes>
        <Route path="/docs" element={<DocsPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  // Institution subdomain shows main app
  return (
    <Routes>
                {/* Auth Routes */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/student/login" element={<StudentLoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={ROLE_GROUPS.STAFF}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard - All staff can view */}
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              
              {/* Academic Management - Admin only */}
              <Route 
                path="academic" 
                element={
                  <HeadOfTPRoute>
                    <AcademicPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="students" 
                element={
                  <HeadOfTPRoute>
                    <StudentsPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="students/print-pins" 
                element={
                  <HeadOfTPRoute>
                    <PrintPinPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="ranks" 
                element={
                  <HeadOfTPRoute>
                    <RanksPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="routes" 
                element={
                  <HeadOfTPRoute>
                    <RoutesPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="schools" 
                element={
                  <HeadOfTPRoute>
                    <SchoolsPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="sessions" 
                element={
                  <HeadOfTPRoute>
                    <SessionsPage />
                  </HeadOfTPRoute>
                } 
              />
              
              {/* Financial - Super Admin only for Payments */}
              <Route 
                path="payments" 
                element={
                  <SuperAdminRoute>
                    <PaymentsPage />
                  </SuperAdminRoute>
                } 
              />
              <Route 
                path="acceptances" 
                element={
                  <HeadOfTPRoute>
                    <AcceptancesPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="allowances" 
                element={
                  <HeadOfTPRoute>
                    <AllowancesPage />
                  </HeadOfTPRoute>
                } 
              />
              
              {/* Posting Management - Admin only for management views */}
              <Route 
                path="postings" 
                element={
                  <HeadOfTPRoute>
                    <PostingsPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="multiposting" 
                element={
                  <AdminOrDeanRoute>
                    <MultipostingPage />
                  </AdminOrDeanRoute>
                } 
              />
              <Route 
                path="dean-postings" 
                element={
                  <AdminOrDeanRoute>
                    <DeansPostingsPage />
                  </AdminOrDeanRoute>
                } 
              />
              <Route 
                path="all-postings" 
                element={
                  <HeadOfTPRoute>
                    <AllPostingsPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="regroup" 
                element={
                  <HeadOfTPRoute>
                    <StudentsRegroupPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="merge-routes" 
                element={
                  <HeadOfTPRoute>
                    <MergeRoutesPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="dean-allocations" 
                element={
                  <HeadOfTPRoute>
                    <DeanPostingAllocationPage />
                  </HeadOfTPRoute>
                } 
              />
              
              {/* Monitoring - Field monitors and above */}
              <Route path="monitoring" element={<MonitoringPage />} />
              
              {/* Supervisor-specific pages */}
              <Route path="result-upload" element={<SupervisorResultUploadPage />} />
              <Route path="my-postings" element={<SupervisorMyPostingsPage />} />
              <Route path="my-invitation" element={<SupervisorInvitationPage />} />
              <Route path="location-tracker" element={<LocationTrackerPage />} />
              
              {/* Admin-only Results view */}
              <Route 
                path="results" 
                element={
                  <HeadOfTPRoute>
                    <AdminResultsPage />
                  </HeadOfTPRoute>
                } 
              />
              
              {/* Admin Location Logs */}
              <Route 
                path="location-logs" 
                element={
                  <HeadOfTPRoute>
                    <AdminLocationLogsPage />
                  </HeadOfTPRoute>
                } 
              />
              
              {/* Admin-only pages - HeadOfTP and SuperAdmin */}
              <Route 
                path="users" 
                element={
                  <HeadOfTPRoute>
                    <UsersPage />
                  </HeadOfTPRoute>
                } 
              />
              <Route 
                path="features" 
                element={
                  <SuperAdminRoute>
                    <FeaturesPage />
                  </SuperAdminRoute>
                } 
              />
              <Route 
                path="document-templates" 
                element={
                  <SuperAdminRoute>
                    <DocumentTemplatesPage />
                  </SuperAdminRoute>
                } 
              />
              <Route 
                path="school-update-requests" 
                element={
                  <HeadOfTPRoute>
                    <SchoolUpdateRequestsPage />
                  </HeadOfTPRoute>
                } 
              />
              
              {/* Super Admin only - Institution Management (Global routes - admin subdomain) */}
              <Route 
                path="institutions" 
                element={
                  <GlobalRoute>
                    <InstitutionsPage />
                  </GlobalRoute>
                } 
              />
              <Route 
                path="institutions/create" 
                element={
                  <GlobalRoute>
                    <CreateInstitutionPage />
                  </GlobalRoute>
                } 
              />
              <Route 
                path="institutions/:id/settings" 
                element={
                  <GlobalRoute>
                    <EditInstitutionPage />
                  </GlobalRoute>
                } 
              />
              
              {/* Global Users - Super Admin on admin subdomain */}
              <Route 
                path="global-users" 
                element={
                  <GlobalRoute>
                    <GlobalUsersPage />
                  </GlobalRoute>
                } 
              />
              
              {/* Global Features - Super Admin on admin subdomain */}
              <Route 
                path="global-features" 
                element={
                  <GlobalRoute>
                    <GlobalFeaturesPage />
                  </GlobalRoute>
                } 
              />
              
              {/* Global Payments - Super Admin on admin subdomain */}
              <Route 
                path="global-payments" 
                element={
                  <GlobalRoute>
                    <GlobalPaymentsPage />
                  </GlobalRoute>
                } 
              />
              
              {/* Master Schools - Central Registry Management - Super Admin on admin subdomain */}
              <Route 
                path="master-schools" 
                element={
                  <GlobalRoute>
                    <MasterSchoolsPage />
                  </GlobalRoute>
                } 
              />
              
              {/* Profile - Available to all authenticated users */}
              <Route path="profile" element={<ProfilePage />} />
            </Route>

            <Route
              path="/student"
              element={
                <StudentRoute>
                  <StudentLayout />
                </StudentRoute>
              }
            >
              <Route index element={<StudentDashboard />} />
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="payment" element={<PaymentPage />} />
              <Route path="acceptance" element={<AcceptanceFormPage />} />
              <Route path="introduction-letter" element={<IntroductionLetterPage />} />
              <Route path="acceptance-document" element={<AcceptanceDocumentPage />} />
              <Route path="posting-letter" element={<PostingLetterPage />} />
            </Route>

            {/* Public Routes (No Auth Required) */}
            <Route element={<PublicLayout />}>
              <Route path="/principal-update" element={<PrincipalUpdatePage />} />
              <Route path="/location-update" element={<LocationUpdatePage />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            {/* 404 Not Found - Must be last */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
  );
}

function App() {
  return (
    <Router>
      <InstitutionProvider>
        <AuthProvider>
          <InstitutionSelectionWrapper>
            <ToastProvider>
              <AlertProvider>
                <AppRoutes />
              </AlertProvider>
            </ToastProvider>
          </InstitutionSelectionWrapper>
        </AuthProvider>
      </InstitutionProvider>
    </Router>
  );
}

export default App;
