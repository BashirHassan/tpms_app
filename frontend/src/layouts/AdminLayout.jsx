/**
 * Admin Layout
 * Main layout for staff portal with sidebar navigation
 * Styled similar to JEI Admin with grouped navigation
 * 
 * 🔒 SECURITY: Navigation visibility is role-based
 * Uses centralized role constants from utils/roles.js
 */

import { useState } from 'react';
import { Outlet, Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstitution } from '../context/InstitutionContext';
import { useInstitutionSelection } from '../context/InstitutionSelectionContext';
import { cn, getInitials, getRoleName } from '../utils/helpers';
import { ROLES, ROLE_GROUPS, hasRole as checkRole } from '../utils/roles';
import { Button } from '../components/ui/Button';
import {
  IconLayoutDashboard,
  IconUsers,
  IconUser,
  IconSettings,
  IconLogout,
  IconMenu2,
  IconX,
  IconBuilding,
  IconToggleLeft,
  IconSchool,
  IconBuildingBank,
  IconClipboardList,
  IconRoute,
  IconMapPin,
  IconCalendar,
  IconCreditCard,
  IconFileCheck,
  IconUserCheck,
  IconCalculator,
  IconSignature,
  IconClipboardCheck,
  IconGitMerge,
  IconStack2,
  IconChevronDown,
  IconExternalLink,
  IconBuildingSkyscraper,
  IconPrinter,
  IconEdit,
  IconTemplate,
} from '@tabler/icons-react';

/**
 * Navigation groups with role-based access
 * 🔒 SECURITY: Uses role constants from ROLE_GROUPS
 */
const navigationGroups = [
  {
    name: 'Main',
    items: [
      { name: 'Dashboard', href: '/admin/dashboard', icon: IconLayoutDashboard },
    ],
  },
  {
    name: 'Academic Setup',
    items: [
      { name: 'Academic Structure', href: '/admin/academic', icon: IconBuildingBank, roles: ROLE_GROUPS.ADMIN },
      { name: 'Sessions', href: '/admin/sessions', icon: IconCalendar, roles: ROLE_GROUPS.ADMIN },
      { name: 'Staff Ranks', href: '/admin/ranks', icon: IconClipboardList, roles: ROLE_GROUPS.ADMIN },
    ],
  },
  {
    name: 'Schools & Routes',
    items: [
      { name: 'Routes', href: '/admin/routes', icon: IconRoute, roles: ROLE_GROUPS.ADMIN },
      { name: 'Schools', href: '/admin/schools', icon: IconMapPin, roles: ROLE_GROUPS.ADMIN },
      { name: 'Update Requests', href: '/admin/school-update-requests', icon: IconEdit, roles: ROLE_GROUPS.ADMIN },
    ],
  },
  {
    name: 'Students & Payments',
    items: [
      { name: 'Students', href: '/admin/students', icon: IconSchool, roles: ROLE_GROUPS.ADMIN },
      { name: 'Payments', href: '/admin/payments', icon: IconCreditCard, roles: ROLE_GROUPS.SUPER_ADMIN_ONLY },
      { name: 'Acceptances', href: '/admin/acceptances', icon: IconFileCheck, roles: ROLE_GROUPS.ADMIN },
    ],
  },
  {
    name: 'Postings & Groups',
    items: [
      { name: 'Students Regrouping', href: '/admin/regroup', icon: IconUsers, roles: ROLE_GROUPS.ADMIN },
      { name: 'Merge Routes', href: '/admin/merge-routes', icon: IconGitMerge, roles: ROLE_GROUPS.ADMIN },
      { name: 'Supervisor Postings', href: '/admin/postings', icon: IconUserCheck, roles: ROLE_GROUPS.ADMIN },
      { name: 'Multiposting', href: '/admin/multiposting', icon: IconStack2, roles: ROLE_GROUPS.ADMIN, allowDean: true },
      { name: 'Dean Allocations', href: '/admin/dean-allocations', icon: IconBuildingBank, roles: ROLE_GROUPS.ADMIN },
      { name: 'All Postings', href: '/admin/all-postings', icon: IconPrinter, roles: ROLE_GROUPS.ADMIN },
    ],
  },
  {
    name: 'Finance',
    items: [
      { name: 'Allowances', href: '/admin/allowances', icon: IconCalculator, roles: ROLE_GROUPS.ADMIN },
    ],
  },
  {
    name: 'Evaluation',
    items: [
      { name: 'My Postings', href: '/admin/my-postings', icon: IconFileCheck, roles: ROLE_GROUPS.SUPERVISOR_PLUS },
      { name: 'Location Tracker', href: '/admin/location-tracker', icon: IconMapPin, roles: ROLE_GROUPS.SUPERVISOR_PLUS, feature: 'supervisor_location_tracking' },
      { name: 'Result Upload', href: '/admin/result-upload', icon: IconSignature, roles: ROLE_GROUPS.SUPERVISOR_PLUS },
      { name: 'Manage Results', href: '/admin/results', icon: IconClipboardList, roles: ROLE_GROUPS.ADMIN },
      { name: 'Location Logs', href: '/admin/location-logs', icon: IconMapPin, roles: ROLE_GROUPS.ADMIN, feature: 'supervisor_location_tracking' },
      { name: 'Monitoring', href: '/admin/monitoring', icon: IconClipboardCheck, roles: ROLE_GROUPS.FIELD_MONITOR_PLUS },
    ],
  },
];

/**
 * Administration settings navigation
 * 🔒 SECURITY: Super Admin sees all, HeadOfTP sees limited
 */
const settingsNavigation = [
  { name: 'Institutions', href: '/admin/institutions', icon: IconBuildingSkyscraper, roles: ROLE_GROUPS.SUPER_ADMIN_ONLY },
  { name: 'User Management', href: '/admin/users', icon: IconUsers, roles: ROLE_GROUPS.ADMIN },
  { name: 'Feature Management', href: '/admin/features', icon: IconToggleLeft, roles: ROLE_GROUPS.SUPER_ADMIN_ONLY },
  { name: 'Document Templates', href: '/admin/document-templates', icon: IconTemplate, roles: ROLE_GROUPS.SUPER_ADMIN_ONLY },
  { name: 'My Profile', href: '/admin/profile', icon: IconUser },
];

/**
 * Global platform navigation (admin subdomain only)
 * 🔒 SECURITY: Super Admin only, only on admin subdomain
 */
const globalNavigation = [
  { name: 'Institutions', href: '/admin/institutions', icon: IconBuildingSkyscraper },
  { name: 'Master Schools', href: '/admin/master-schools', icon: IconSchool },
  { name: 'Global Users', href: '/admin/global-users', icon: IconUsers },
  { name: 'Global Features', href: '/admin/global-features', icon: IconToggleLeft },
  { name: 'Global Payments', href: '/admin/global-payments', icon: IconCreditCard },
  { name: 'My Profile', href: '/admin/profile', icon: IconUser },
];

/**
 * Platform navigation (opens in new tab)
 * 🔒 SECURITY: Super Admin only, external links to admin subdomain
 */
import { getAdminDomain, isAdminSubdomain } from '../hooks/useSubdomain';

function AdminLayout() {
  const { user, institution, effectiveInstitution, logout, hasRole, isSuperAdmin } = useAuth();
  const { branding } = useInstitution();
  const { isFeatureEnabled } = useInstitutionSelection();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /**
   * Check if user has permission for a navigation item
   * 🔒 SECURITY: Uses centralized role checking from utils/roles.js
   * Also checks feature toggles if the item has a feature property
   */
  const hasPermission = (item) => {
    // Check feature toggle first if specified
    if (item.feature && !isFeatureEnabled(item.feature)) {
      return false;
    }
    if (!item.roles || item.roles.length === 0) return true;
    // Use centralized checkRole function that handles arrays
    const hasRoleAccess = checkRole(user?.role, item.roles);
    // Allow deans to access items with allowDean flag
    if (!hasRoleAccess && item.allowDean) {
      return user?.is_dean === 1 || user?.is_dean === true;
    }
    return hasRoleAccess;
  };
  
  /**
   * Check if current path matches nav item
   */
  const isActive = (href) => {
    if (href === '/admin/dashboard') {
      return location.pathname === '/admin/dashboard' || location.pathname === '/admin';
    }
    return location.pathname.startsWith(href);
  };

  // Filter navigation groups based on permissions
  // On admin subdomain (global context), only show Main group
  // Institution-scoped groups require institution context
  const isOnAdminSubdomain = isAdminSubdomain();
  
  const filteredNavigationGroups = navigationGroups
    .filter(group => {
      // On admin subdomain, only show 'Main' group (Dashboard)
      if (isOnAdminSubdomain) {
        return group.name === 'Main';
      }
      return true;
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => hasPermission(item)),
    }))
    .filter(group => group.items.length > 0);

  // On admin subdomain, only show Institutions and Profile in settings
  // Use globalNavigation for admin subdomain, settingsNavigation for institution context
  const filteredSettings = isOnAdminSubdomain
    ? globalNavigation // Super admin on admin subdomain - show global pages
    : settingsNavigation.filter(item => hasPermission(item));

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header with branding */}
        <div className="flex items-center justify-between h-16 px-6 border-b shrink-0">
          <Link to="/admin" className="flex items-center gap-2">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.name}
                className="w-8 h-8 rounded-lg object-contain"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <IconSchool className="w-5 h-5 text-white" />
              </div>
            )}
            <span className="text-xl font-bold text-gray-800">{branding.code || 'DigitalTP'}</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
          >
            <IconX className="w-5 h-5" />
          </Button>
        </div>

        {/* Scrollable Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {filteredNavigationGroups.map((group, groupIndex) => (
            <div key={group.name}>
              {/* Group label (skip for first group if it's "Main") */}
              {(groupIndex > 0 || group.name !== 'Main') && (
                <div className={groupIndex > 0 ? 'pt-4 mt-4 border-t' : ''}>
                  <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {group.name}
                  </p>
                </div>
              )}
              
              {/* Group items */}
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Settings section */}
          {filteredSettings.length > 0 && (
            <>
              <div className="pt-4 mt-4 border-t">
                <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Administration
                </p>
              </div>
              {filteredSettings.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="w-5 h-5" />
                    {item.name}
                  </Link>
                );
              })}
            </>
          )}

          {/* Platform section - Super Admin only, external link to admin subdomain */}
          {isSuperAdmin && !isAdminSubdomain() && (
            <>
              <div className="pt-4 mt-4 border-t">
                <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Platform
                </p>
              </div>
              <a
                href={getAdminDomain() + '/admin/dashboard'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-blue-600 hover:bg-blue-50"
                onClick={() => setSidebarOpen(false)}
              >
                <IconBuildingSkyscraper className="w-5 h-5" />
                Global Overview
                <IconExternalLink className="w-4 h-4 ml-auto opacity-50" />
              </a>
            </>
          )}
        </nav>

        {/* Footer with logout and powered by */}
        <div className="border-t shrink-0">
          {/* Institution info - from subdomain context */}
          <div className="px-4 py-3 border-b">
            {effectiveInstitution ? (
              <div className="flex items-center gap-2 text-gray-600">
                <IconBuilding className="w-4 h-4" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{effectiveInstitution?.name}</p>
                  <p className="text-xs text-gray-500">{effectiveInstitution?.code}</p>
                </div>
              </div>
            ) : isSuperAdmin ? (
              <div className="flex items-center gap-2 text-blue-600">
                <IconBuilding className="w-4 h-4" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Global Admin</p>
                  <p className="text-xs text-blue-500">Platform-wide access</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-gray-400">
                <IconBuilding className="w-4 h-4" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-500">No Institution</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Action links */}
          <div className="px-3 py-1">
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start gap-2 text-red-600 hover:bg-red-50 hover:text-red-600"
            >
              <IconLogout className="w-4 h-4" />
              Logout
            </Button>
          </div>
          
          {/* Powered by */}
          <div className="px-4 py-3 border-t bg-gray-50">
            <p className="text-xs text-center text-gray-400">
              Powered by{" "}
              <a
                href="https://sitsng.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-600 hover:underline"
              >
                Si Solutions
              </a>
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top navbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white border-b lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
          >
            <IconMenu2 className="w-5 h-5" />
          </Button>

          <div className="flex-1" />

          {/* User menu */}
          <div className="relative">
            <Button
              variant="ghost"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-2 p-2"
            >
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {getInitials(user?.name)}
                </span>
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user?.name}
              </span>
              <IconChevronDown className="w-4 h-4 text-gray-400" />
            </Button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 w-48 bg-white rounded-lg shadow-lg border py-1">
                  <div className="px-4 py-2 border-b">
                    <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                    <p className="text-xs text-primary-600 capitalize mt-1">
                      {getRoleName(user?.role)}
                    </p>
                  </div>
                  <Link
                    to="/admin/profile"
                    className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    My Profile
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={handleLogout}
                    className="w-full justify-start gap-2 px-4 text-red-600 hover:bg-red-50 hover:text-red-600 rounded-none"
                  >
                    <IconLogout className="w-4 h-4" />
                    Logout
                  </Button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
