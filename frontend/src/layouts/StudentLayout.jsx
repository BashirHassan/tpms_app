/**
 * Student Layout
 * Main layout for student portal with grouped sidebar navigation.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import ContentLoader from '../components/ui/ContentLoader';
import { useAuth } from '../context/AuthContext';
import { useInstitution } from '../context/InstitutionContext';
import { Button } from '../components/ui/Button';
import { cn, getInitials, getRoleName } from '../utils/helpers';
import { portalApi } from '../api';
import {
  IconChevronDown,
  IconClipboardList,
  IconCreditCard,
  IconEdit,
  IconFileCheck,
  IconFileCertificate,
  IconFileText,
  IconLayoutDashboard,
  IconLogout,
  IconMapPin,
  IconMenu2,
  IconSchool,
  IconSignature,
  IconX,
} from '@tabler/icons-react';

const navigationGroups = [
  {
    name: 'Main',
    items: [
      { name: 'Dashboard', href: '/student/dashboard', icon: IconLayoutDashboard },
    ],
  },
  {
    name: 'Registration',
    items: [
      { name: 'Payment', href: '/student/payment', icon: IconCreditCard, requiresPayment: true },
      { name: 'Acceptance', href: '/student/acceptance', icon: IconFileCheck },
    ],
  },
  {
    name: 'Documents',
    items: [
      { name: 'Introduction Letter', href: '/student/introduction-letter', icon: IconFileText },
      { name: 'Acceptance Document', href: '/student/acceptance-document', icon: IconFileCertificate },
      { name: 'Posting Letter', href: '/student/posting-letter', icon: IconSignature },
      { name: 'Evaluation Form', href: '/student/evaluation-form', icon: IconClipboardList },
    ],
  },
  {
    name: 'Updates',
    items: [
      { name: 'Principal Update', href: '/student/principal-update', icon: IconEdit },
      { name: 'Location Update', href: '/student/location-update', icon: IconMapPin },
    ],
  },
];

const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 6 },
};
const pageTransition = { duration: 0.2, ease: 'easeOut' };

function StudentLayout() {
  const { user, logout, hasFeature } = useAuth();
  const { branding } = useInstitution();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState(true);

  useEffect(() => {
    const checkPaymentRequired = async () => {
      try {
        const response = await portalApi.getStatus();
        const portal = response.data.data || response.data;
        if (portal?.payment) {
          setPaymentRequired(portal.payment.required === true);
        }
      } catch {
        // Keep payment visible if status cannot be loaded.
      }
    };

    checkPaymentRequired();
  }, []);

  const filteredNavigationGroups = useMemo(
    () =>
      navigationGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              (!item.feature || hasFeature(item.feature)) &&
              (!item.requiresPayment || paymentRequired)
          ),
        }))
        .filter((group) => group.items.length > 0),
    [hasFeature, paymentRequired]
  );

  const handleLogout = () => {
    logout();
    navigate('/student/login');
  };

  const isActive = (href) => {
    if (href === '/student/dashboard') {
      return location.pathname === '/student' || location.pathname === '/student/dashboard';
    }
    return location.pathname === href || location.pathname.startsWith(href + '/');
  };

  const closeMenus = () => {
    setSidebarOpen(false);
    setUserMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-6 border-b shrink-0">
          <Link to="/student" className="flex items-center gap-2" onClick={closeMenus}>
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
            <div className="min-w-0">
              <p className="text-xl font-bold text-gray-800 truncate">{branding.code || 'DigitalTP'}</p>
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
            aria-label="Close sidebar"
          >
            <IconX className="w-5 h-5" />
          </Button>
        </div>

        {/* Sidebar nav */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {filteredNavigationGroups.map((group, groupIndex) => (
            <div key={group.name}>
              {(groupIndex > 0 || group.name !== 'Main') && (
                <div className={groupIndex > 0 ? 'pt-4 mt-4 border-t' : ''}>
                  <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {group.name}
                  </p>
                </div>
              )}

              {group.items.map((item) => {
                const active = item.href ? isActive(item.href) : false;
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
                    onClick={closeMenus}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.name}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t shrink-0">
          <div className="px-4 py-3 border-b">
            <div className="flex items-center gap-2 text-gray-600">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-medium text-primary-700">{getInitials(user?.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.registration_number}</p>
              </div>
            </div>
          </div>

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

          <div className="px-4 py-3 border-t bg-gray-50">
            <p className="text-xs text-center text-gray-400">
              Powered by{' '}
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

      {/* Main content area — offset by sidebar on desktop */}
      <div className="lg:pl-64">
        {/* App bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 bg-white border-b lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
            aria-label="Open sidebar"
          >
            <IconMenu2 className="w-5 h-5" />
          </Button>

          <div className="hidden lg:block min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {branding.name}
            </p>
            <p className="text-xs text-gray-500">Teaching Practice Portal</p>
          </div>

          <div className="flex-1 lg:hidden" />

          {/* User dropdown */}
          <div className="relative">
            <Button
              variant="ghost"
              onClick={() => setUserMenuOpen((open) => !open)}
              className="flex items-center gap-2 p-2"
            >
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                <span className="text-sm font-medium text-white">{getInitials(user?.name)}</span>
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[180px] truncate">
                {user?.name}
              </span>
              <IconChevronDown className="w-4 h-4 text-gray-400" />
            </Button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-2 w-56 bg-white rounded-lg shadow-lg border py-1">
                  <div className="px-4 py-2 border-b">
                    <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                    <p className="text-xs text-gray-500 truncate">{user?.registration_number}</p>
                    <p className="text-xs text-primary-600 capitalize mt-1">
                      {getRoleName(user?.role)}
                    </p>
                  </div>
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

        <main className="p-4 lg:p-8">
          <Suspense fallback={<ContentLoader />}>
            <AnimatePresence mode="sync">
              <motion.div
                key={location.pathname}
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default StudentLayout;
