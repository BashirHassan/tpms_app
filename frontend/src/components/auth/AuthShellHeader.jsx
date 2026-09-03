/**
 * AuthShellHeader
 * Institution branding (logo + name) shown at the top of auth pages
 * (login, forgot password, reset password).
 */

import { IconSchool } from '@tabler/icons-react';

function AuthShellHeader({ branding, subtitle }) {
  return (
    <div className="mb-4 text-center">
      {branding.logo_url ? (
        <img
          src={branding.logo_url}
          alt={branding.name}
          className="mx-auto mb-2 h-16 w-16 rounded-2xl object-contain ring-gray-100"
        />
      ) : (
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 shadow-md">
          <IconSchool className="h-10 w-10 text-white" />
        </div>
      )}
      <h1 className="text-xl font-bold text-gray-900">{branding.name}</h1>
      {subtitle ? <p className="text-sm text-gray-500">{subtitle}</p> : null}
    </div>
  );
}

export default AuthShellHeader;
