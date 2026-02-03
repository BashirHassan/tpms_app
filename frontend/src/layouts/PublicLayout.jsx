/**
 * Public Layout
 * Clean layout for public (unauthenticated) pages
 */

import { Outlet, Link } from 'react-router-dom';
import { IconSchool } from '@tabler/icons-react';

export default function PublicLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Main Content */}
      <main className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
