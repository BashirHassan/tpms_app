/**
 * Protected Route Component
 * 
 * Restricts access based on authentication, roles, and institution context.
 * 
 * 🔒 SECURITY:
 * - Validates user is authenticated
 * - Checks user role against allowedRoles
 * - Ensures institution context for tenant-scoped pages
 * - Shows 403 Unauthorized page instead of silent redirect
 * - GlobalRoute enforces admin subdomain for platform-wide routes
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLES, ROLE_GROUPS, hasRole } from '../../utils/roles';
import { isAdminSubdomain, getAdminDomain } from '../../hooks/useSubdomain';
import UnauthorizedPage from '../../pages/errors/UnauthorizedPage';

function ProtectedRoute({ children, allowedRoles = [], requireInstitution = true }) {
  const { 
    isAuthenticated, 
    user, 
    loading, 
    isSuperAdmin, 
    isGlobalContext,
    effectiveInstitution,
  } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full spinner" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    const isStudentRoute = location.pathname.startsWith('/student');
    const loginPath = isStudentRoute ? '/student/login' : '/login';
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  // 🔒 SECURITY: Check role authorization - show 403 page if unauthorized
  if (allowedRoles.length > 0 && !hasRole(user.role, allowedRoles)) {
    // Log unauthorized access attempt for debugging
    console.warn(`[SECURITY] Unauthorized access attempt: ${user.role} tried to access ${location.pathname}`);
    return <UnauthorizedPage />;
  }

  // Check institution context for routes that require it
  // Platform pages (institutions, dashboard for super admin, global admin pages, etc.) don't require institution
  const platformOnlyPaths = [
    '/admin/institutions', 
    '/admin/profile',
    '/admin/global-users',
    '/admin/global-features',
    '/admin/global-payments',
    '/admin/master-schools',
  ];
  const isOnPlatformPath = platformOnlyPaths.some(path => location.pathname.startsWith(path));
  
  // Super admin on admin subdomain (global context) can access dashboard
  const isDashboardPath = location.pathname === '/admin' || location.pathname === '/admin/dashboard';
  const canAccessWithoutInstitution = isOnPlatformPath || (isSuperAdmin && isDashboardPath && isGlobalContext);
  
  // If institution is required and user doesn't have one (and can't access without)
  if (requireInstitution && !effectiveInstitution && !canAccessWithoutInstitution) {
    // 🔒 SECURITY: Redirect to appropriate subdomain
    console.warn(`[SECURITY] User ${user?.id} attempted to access ${location.pathname} without institution context`);
    
    // Super admin on admin subdomain trying to access institution-scoped page
    // Show a message directing them to select an institution via subdomain
    if (isSuperAdmin && isGlobalContext) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 max-w-md">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Institution-Scoped Page
            </h2>
            <p className="text-gray-600 mb-4">
              This page requires institution context. Access an institution by opening its subdomain in a new tab from the Institutions page.
            </p>
            <a 
              href="/admin/institutions" 
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Go to Institutions
            </a>
          </div>
        </div>
      );
    }
    
    // Regular user without institution - something is wrong
    return <UnauthorizedPage />;
  }

  return children;
}

// ============================================================================
// PRE-CONFIGURED ROUTE GUARDS
// ============================================================================

/**
 * Staff-only route (all staff roles, no students)
 */
export function StaffRoute({ children, requireInstitution = true }) {
  return (
    <ProtectedRoute allowedRoles={ROLE_GROUPS.STAFF} requireInstitution={requireInstitution}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Admin route (head_of_teaching_practice and super_admin only)
 */
export function AdminRoute({ children, requireInstitution = true }) {
  return (
    <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN} requireInstitution={requireInstitution}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Head of Teaching Practice route
 */
export function HeadOfTPRoute({ children }) {
  return (
    <ProtectedRoute allowedRoles={ROLE_GROUPS.ADMIN}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Supervisor and above route
 */
export function SupervisorRoute({ children }) {
  return (
    <ProtectedRoute allowedRoles={ROLE_GROUPS.SUPERVISOR_PLUS}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Admin or Dean route - allows admin roles OR supervisors with is_dean flag
 * Used for pages like multiposting where deans need access
 */
export function AdminOrDeanRoute({ children }) {
  const { 
    isAuthenticated, 
    user, 
    loading,
    effectiveInstitution,
  } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full spinner" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if user is admin level or is a dean
  const isAdminLevel = hasRole(user.role, ROLE_GROUPS.ADMIN);
  const isDean = user?.is_dean === 1 || user?.is_dean === true;
  
  if (!isAdminLevel && !isDean) {
    console.warn(`[SECURITY] Non-admin/non-dean user attempted to access ${location.pathname}`);
    return <UnauthorizedPage />;
  }

  // Check institution context
  if (!effectiveInstitution) {
    return <UnauthorizedPage />;
  }

  return children;
}

/**
 * Super admin only route (no institution required)
 */
export function SuperAdminRoute({ children }) {
  return (
    <ProtectedRoute allowedRoles={ROLE_GROUPS.SUPER_ADMIN_ONLY} requireInstitution={false}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * Global route - requires super_admin AND admin subdomain
 * 🔒 SECURITY: Platform-wide routes only accessible from admin.digitaltipi.com
 * If accessed from institution subdomain, redirects to admin subdomain
 */
export function GlobalRoute({ children }) {
  const { isAuthenticated, loading, isSuperAdmin } = useAuth();
  const location = useLocation();

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full spinner" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Must be super_admin
  if (!isSuperAdmin) {
    console.warn(`[SECURITY] Non-super_admin attempted to access global route ${location.pathname}`);
    return <UnauthorizedPage />;
  }

  // Must be on admin subdomain
  if (!isAdminSubdomain()) {
    // Redirect to admin subdomain
    const adminUrl = getAdminDomain() + location.pathname;
    console.log(`[ROUTE] Redirecting to admin subdomain: ${adminUrl}`);
    window.location.href = adminUrl;
    return null;
  }

  return children;
}

/**
 * Student only route
 */
export function StudentRoute({ children }) {
  return (
    <ProtectedRoute allowedRoles={ROLE_GROUPS.STUDENTS_ONLY}>
      {children}
    </ProtectedRoute>
  );
}

export default ProtectedRoute;
