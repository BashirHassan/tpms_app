/**
 * Not Found Page (404)
 * 
 * Displayed when a user tries to access a page that doesn't exist.
 */

import { Link, useNavigate } from 'react-router-dom';
import { IconFileOff, IconArrowLeft, IconHome } from '@tabler/icons-react';
import { useAuth } from '../../context/AuthContext';
import { Button, buttonVariants } from '../../components/ui/Button';
import { cn } from '../../utils/helpers';

function NotFoundPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Determine appropriate home path based on auth state
  const getHomePath = () => {
    if (!isAuthenticated) return '/login';
    if (user?.role === 'student') return '/student/dashboard';
    return '/admin/dashboard';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
          <IconFileOff className="w-10 h-10 text-gray-400" stroke={1.5} />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Page Not Found
        </h1>

        {/* Description */}
        <p className="text-gray-600 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>

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
            to={getHomePath()}
            className={cn(buttonVariants({ variant: 'primary' }))}
          >
            <IconHome className="w-4 h-4 mr-2" />
            {isAuthenticated ? 'Go to Dashboard' : 'Go to Login'}
          </Link>
        </div>

        {/* Error Code */}
        <p className="mt-8 text-xs text-gray-400">
          Error 404 - Not Found
        </p>
      </div>
    </div>
  );
}

export default NotFoundPage;
