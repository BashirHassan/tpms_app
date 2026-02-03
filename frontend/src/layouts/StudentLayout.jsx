/**
 * Student Layout
 * Mobile-first layout for student portal with institution branding
 * Features bottom navigation on mobile, top navigation on desktop
 */

import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useInstitution } from '../context/InstitutionContext';
import { cn, getInitials } from '../utils/helpers';
import { Button } from '../components/ui/Button';
import {
  IconLayoutDashboard,
  IconLogout,
  IconSchool,
  IconCreditCard,
  IconFileCheck,
  IconSignature,
  IconMenu2,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';

const navigation = [
  { name: 'Dashboard', shortName: 'Home', href: '/student/dashboard', icon: IconLayoutDashboard },
  { name: 'Payment', shortName: 'Pay', href: '/student/payment', icon: IconCreditCard },
  { name: 'Acceptance', shortName: 'Accept', href: '/student/acceptance', icon: IconFileCheck },
  { name: 'Posting Letter', shortName: 'Letter', href: '/student/posting-letter', icon: IconSignature },
];

function StudentLayout() {
  const { user, logout } = useAuth();
  const { branding } = useInstitution();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/student/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 md:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2 md:gap-3">
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
              <div>
                <h1 className="font-bold text-gray-900 text-sm md:text-base">{branding.code || 'DigitalTP'}</h1>
                <p className="text-xs text-gray-500 truncate max-w-[120px] sm:max-w-none">{branding.name}</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )
                  }
                >
                  <item.icon className="w-4 h-4" />
                  {item.name}
                </NavLink>
              ))}
            </nav>

            {/* User info and actions */}
            <div className="flex items-center gap-2">
              {/* User avatar - visible on all screens */}
              <div className="flex items-center gap-2 md:gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[120px] md:max-w-none">{user?.name}</p>
                  <p className="text-xs text-gray-500">{user?.registration_number}</p>
                </div>
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs md:text-sm font-medium text-primary-700">{getInitials(user?.name)}</span>
                </div>
              </div>

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <IconX className="w-5 h-5" /> : <IconMenu2 className="w-5 h-5" />}
              </Button>

              {/* Logout button - desktop only, mobile uses dropdown */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="hidden md:flex"
                title="Logout"
              >
                <IconLogout className="w-5 h-5 text-red-500" />
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-500">{user?.registration_number}</p>
            </div>
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="w-full justify-start gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-none"
            >
              <IconLogout className="w-5 h-5" />
              <span className="text-sm font-medium">Logout</span>
            </Button>
          </div>
        )}
      </header>

      {/* Main content - with bottom padding on mobile for bottom nav */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 px-3 py-2 min-w-[60px] transition-colors',
                  isActive
                    ? 'text-primary-600'
                    : 'text-gray-500'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
                  <span className="text-[10px] font-medium">{item.shortName}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default StudentLayout;
