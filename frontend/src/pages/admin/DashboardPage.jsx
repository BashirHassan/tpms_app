/**
 * Admin Dashboard Page
 * 
 * Subdomain-based dashboard routing:
 * - admin.* subdomain + super_admin: GlobalAdminDashboard
 * - institution subdomain + admin roles: InstitutionDashboard
 * - supervisor, field_monitor: SupervisorDashboard
 * 
 * 🔒 SECURITY: Dashboard is determined by subdomain, not institution selection
 */

import { useAuth } from '../../context/AuthContext';
import { isAdminSubdomain } from '../../hooks/useSubdomain';
import GlobalAdminDashboard from './dashboards/GlobalAdminDashboard';
import InstitutionDashboard from './dashboards/InstitutionDashboard';
import SupervisorDashboard from './dashboards/SupervisorDashboard';

function DashboardPage() {
  const { user, isSuperAdmin, isGlobalContext } = useAuth();

  // Subdomain-based dashboard selection
  const getDashboardComponent = () => {
    // admin.* subdomain = global view (super_admin only)
    // Uses isGlobalContext from auth (set by backend based on subdomain)
    if (isAdminSubdomain() && isSuperAdmin && isGlobalContext) {
      return <GlobalAdminDashboard />;
    }

    // Super admin on institution subdomain or head of teaching practice
    // Shows institution dashboard scoped to that subdomain
    if (isSuperAdmin || user?.role === 'head_of_teaching_practice') {
      return <InstitutionDashboard />;
    }

    // Supervisors and monitors get supervisor dashboard
    if (['supervisor', 'field_monitor'].includes(user?.role)) {
      return <SupervisorDashboard />;
    }

    // Default to institution dashboard for other staff roles
    return <InstitutionDashboard />;
  };

  return getDashboardComponent();
}

export default DashboardPage;
