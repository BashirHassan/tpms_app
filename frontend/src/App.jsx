import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InstitutionSelectionProvider } from './context/InstitutionSelectionContext';
import { ToastProvider } from './context/ToastContext';
import { InstitutionProvider, useInstitution } from './context/InstitutionContext';
import { AlertProvider } from './components/ui/AlertDialog';
import { useLandingPage } from './hooks/useSubdomain';
import RouteProgressBar from './components/ui/RouteProgressBar';
import ContentLoader from './components/ui/ContentLoader';
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

// Layouts (kept eager - they wrap all routes)
import AdminLayout from './layouts/AdminLayout';
import StudentLayout from './layouts/StudentLayout';
import PublicLayout from './layouts/PublicLayout';

// Inline fallback for non-layout routes (auth pages, landing)
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
    </div>
  );
}

// Suspense wrapper for individual lazy route elements
function SuspensePage({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// Error Pages
const NotFoundPage = lazy(() => import('./pages/errors/NotFoundPage'));

// Landing Page
const LandingPage = lazy(() => import('./pages/LandingPage'));

// Auth Pages
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const StudentLoginPage = lazy(() => import('./pages/auth/StudentLoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));

// Admin Pages
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const ProfilePage = lazy(() => import('./pages/admin/ProfilePage'));
const InstitutionsPage = lazy(() => import('./pages/admin/InstitutionsPage'));
const CreateInstitutionPage = lazy(() => import('./pages/admin/CreateInstitutionPage'));
const EditInstitutionPage = lazy(() => import('./pages/admin/EditInstitutionPage'));
const FeaturesPage = lazy(() => import('./pages/admin/FeaturesPage'));
const AcademicPage = lazy(() => import('./pages/admin/AcademicPage'));
const StudentsPage = lazy(() => import('./pages/admin/StudentsPage'));
const PrintPinPage = lazy(() => import('./pages/admin/PrintPinPage'));
const RanksPage = lazy(() => import('./pages/admin/RanksPage'));
const RoutesPage = lazy(() => import('./pages/admin/RoutesPage'));
const SchoolsPage = lazy(() => import('./pages/admin/SchoolsPage'));
const MasterSchoolsPage = lazy(() => import('./pages/admin/MasterSchoolsPage'));
const SessionsPage = lazy(() => import('./pages/admin/SessionsPage'));
const PaymentsPage = lazy(() => import('./pages/admin/PaymentsPage'));
const AcceptancesPage = lazy(() => import('./pages/admin/AcceptancesPage'));
const PostingsPage = lazy(() => import('./pages/admin/PostingsPage'));
const MultipostingPage = lazy(() => import('./pages/admin/MultipostingPage'));
const AllowancesPage = lazy(() => import('./pages/admin/AllowancesPage'));
const MonitoringPage = lazy(() => import('./pages/admin/MonitoringPage'));
const StudentsRegroupPage = lazy(() => import('./pages/admin/StudentsRegroupPage'));
const MergeRoutesPage = lazy(() => import('./pages/admin/MergeRoutesPage'));
const AdminResultsPage = lazy(() => import('./pages/admin/AdminResultsPage'));
const AllPostingsPage = lazy(() => import('./pages/admin/AllPostingsPage'));
const SchoolUpdateRequestsPage = lazy(() => import('./pages/admin/SchoolUpdateRequestsPage'));
const DocumentTemplatesPage = lazy(() => import('./pages/admin/DocumentTemplatesPage'));
const DeanPostingAllocationPage = lazy(() => import('./pages/admin/DeanPostingAllocationPage'));
const DeansPostingsPage = lazy(() => import('./pages/admin/DeansPostingsPage'));
const AdminLocationLogsPage = lazy(() => import('./pages/admin/AdminLocationLogsPage'));

// Supervisor Pages
const SupervisorResultUploadPage = lazy(() => import('./pages/supervisor/SupervisorResultUploadPage'));
const SupervisorMyPostingsPage = lazy(() => import('./pages/supervisor/SupervisorMyPostingsPage'));
const SupervisorInvitationPage = lazy(() => import('./pages/supervisor/SupervisorInvitationPage'));
const LocationTrackerPage = lazy(() => import('./pages/supervisor/LocationTrackerPage'));

// Global Admin Pages (admin subdomain only)
const GlobalUsersPage = lazy(() => import('./pages/admin/GlobalUsersPage'));
const GlobalFeaturesPage = lazy(() => import('./pages/admin/GlobalFeaturesPage'));
const GlobalPaymentsPage = lazy(() => import('./pages/admin/GlobalPaymentsPage'));

// Student Pages
const StudentDashboard = lazy(() => import('./pages/student/StudentDashboard'));
const PaymentPage = lazy(() => import('./pages/student/PaymentPage'));
const AcceptanceFormPage = lazy(() => import('./pages/student/AcceptanceFormPage'));
const PostingLetterPage = lazy(() => import('./pages/student/PostingLetterPage'));
const IntroductionLetterPage = lazy(() => import('./pages/student/IntroductionLetterPage'));
const AcceptanceDocumentPage = lazy(() => import('./pages/student/AcceptanceDocumentPage'));

// Public Pages
const PrincipalUpdatePage = lazy(() => import('./pages/public/PrincipalUpdatePage'));
const LocationUpdatePage = lazy(() => import('./pages/public/LocationUpdatePage'));
const DocsPage = lazy(() => import('./pages/public/DocsPage'));
const MaintenancePage = lazy(() => import('./pages/errors/MaintenancePage'));

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
  const { maintenance, loading: institutionLoading, isSuperAdminPortal: isSuperAdmin } = useInstitution();

  // Show maintenance page for institution subdomains (not super admin portal)
  if (!isLanding && !isSuperAdmin && !institutionLoading && maintenance) {
    return (
      <Suspense fallback={<PageLoader />}>
        <MaintenancePage
          institution={maintenance.institution}
          message={maintenance.message}
        />
      </Suspense>
    );
  }

  // Primary domain (no subdomain) shows landing page
  if (isLanding) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/docs" element={<DocsPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    );
  }

  // Institution subdomain shows main app
  // Suspense boundaries are inside each layout (AdminLayout, StudentLayout, PublicLayout)
  // so sidebar/navbar persist during page transitions — true SPA feel
  return (
    <>
    <RouteProgressBar />
    <Routes>
                {/* Auth Routes - wrapped individually since they have no persistent layout */}
                <Route path="/login" element={<SuspensePage><LoginPage /></SuspensePage>} />
                <Route path="/student/login" element={<SuspensePage><StudentLoginPage /></SuspensePage>} />
                <Route path="/forgot-password" element={<SuspensePage><ForgotPasswordPage /></SuspensePage>} />
                <Route path="/reset-password" element={<SuspensePage><ResetPasswordPage /></SuspensePage>} />

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
            <Route path="*" element={<SuspensePage><NotFoundPage /></SuspensePage>} />
          </Routes>
    </>
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
