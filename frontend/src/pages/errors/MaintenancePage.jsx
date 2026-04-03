/**
 * Maintenance Page
 * 
 * Displayed when an institution has maintenance_mode enabled.
 * Shows institution branding (logo, name) and maintenance message.
 */

import { IconTool, IconRefresh } from '@tabler/icons-react';
import { Button } from '../../components/ui/Button';

export default function MaintenancePage({ institution, message }) {
  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full text-center">
        {/* Institution Logo */}
        {institution?.logo_url && (
          <div className="mb-6 flex justify-center">
            <img
              src={institution.logo_url}
              alt={institution.name || 'Institution'}
              className="h-20 max-w-[200px] object-contain"
            />
          </div>
        )}

        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
          <IconTool className="w-10 h-10 text-amber-500" stroke={1.5} />
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
          Under Maintenance
        </h1>

        {/* Institution Name */}
        {institution?.name && (
          <p className="text-sm font-medium text-gray-500 mb-4">
            {institution.name}
          </p>
        )}

        {/* Message */}
        <p className="text-gray-600 mb-8">
          {message || 'We are currently performing scheduled maintenance. Please check back shortly.'}
        </p>

        {/* Refresh Button */}
        <Button onClick={handleRefresh} variant="outline" className="gap-2">
          <IconRefresh className="w-4 h-4" />
          Try Again
        </Button>
      </div>
    </div>
  );
}
