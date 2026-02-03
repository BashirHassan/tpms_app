/**
 * Unauthorized Page (403)
 * 
 * Displayed when a user tries to access a page they don't have permission for.
 */

import { Link, useNavigate } from 'react-router-dom';
import { IconLock, IconArrowLeft, IconHome } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { Button, buttonVariants } from '../../components/ui/Button';
import { cn } from '../../utils/helpers';

function UnauthorizedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Determine appropriate dashboard based on role
  const getDashboardPath = () => {
    if (!user) return '/login';
    if (user.role === 'student') return '/student/dashboard';
    return '/admin/dashboard';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <IconLock className="w-10 h-10 text-red-600" stroke={1.5} />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Access Denied
        </h1>

        {/* Description */}
        <p className="text-gray-600 mb-2">
          You don't have permission to access this page.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          If you believe this is an error, please contact your administrator.
        </p>

        {/* User Info (if logged in) */}
        {user && (
          <div className="bg-gray-100 rounded-lg p-4 mb-6 text-sm text-gray-600">
            <p>Logged in as: <span className="font-medium text-gray-900">{user.name || user.email}</span></p>
            <p>Role: <span className="font-medium text-gray-900 capitalize">{user.role?.replace(/_/g, ' ')}</span></p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
          >
            <IconArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          
          <Link
            to={getDashboardPath()}
            className={cn(buttonVariants({ variant: 'primary' }))}
          >
            <IconHome className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Link>
        </div>

        {/* Error Code */}
        <p className="mt-8 text-xs text-gray-400">
          Error 403 - Forbidden
        </p>
      </div>
    </div>
  );
}

export default UnauthorizedPage;
