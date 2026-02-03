/**
 * Landing Page
 * Placeholder for the main marketing/landing page (no subdomain)
 */

import { IconSchool, IconArrowRight, IconBuilding, IconUsers, IconClipboardCheck } from '@tabler/icons-react';
import { Link } from 'react-router-dom';

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50">
      {/* Header */}
      <header className="py-6 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
              <IconSchool className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">DigitalTP</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="px-4 py-16 sm:py-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Coming Soon Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-100 text-sky-700 text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
            Landing Page Coming Soon
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 tracking-tight">
            Teaching Practice{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-500 to-indigo-600">
              Management System
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-600 mb-12 max-w-2xl mx-auto leading-relaxed">
            A comprehensive multi-tenant platform for managing teaching practice programs 
            at educational institutions across Nigeria.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
            <div className="p-6 rounded-2xl bg-white shadow-sm border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center mx-auto mb-4">
                <IconBuilding className="w-6 h-6 text-sky-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Multi-Institution</h3>
              <p className="text-sm text-gray-500">
                Isolated data and branding for each institution via subdomains
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white shadow-sm border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center mx-auto mb-4">
                <IconUsers className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Student Portal</h3>
              <p className="text-sm text-gray-500">
                Students can track payments, postings, and download letters
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white shadow-sm border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <IconClipboardCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Full Workflow</h3>
              <p className="text-sm text-gray-500">
                From registration to results, all in one platform
              </p>
            </div>
          </div>

          {/* Institution Access Info */}
          <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200 max-w-xl mx-auto">
            <h3 className="font-semibold text-gray-900 mb-2">Institution Access</h3>
            <p className="text-sm text-gray-600 mb-4">
              Each institution has its own subdomain. For example:
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center text-sm">
              <code className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700">
                fuk.digitaltipi.com
              </code>
              <code className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700">
                gsu.digitaltipi.com
              </code>
            </div>
            <p className="text-xs text-gray-500 mt-4">
              Contact your institution administrator for access details.
            </p>
          </div>

          {/* Dev Mode Hint */}
          {import.meta.env.DEV && (
            <div className="mt-8 p-4 rounded-xl bg-amber-50 border border-amber-200 max-w-xl mx-auto">
              <p className="text-sm text-amber-800">
                <strong>Development Mode:</strong> Add <code className="px-1.5 py-0.5 rounded bg-amber-100">?subdomain=fuk</code> to 
                the URL to test institution login, or use the console command{' '}
                <code className="px-1.5 py-0.5 rounded bg-amber-100">digitaltp.setSubdomain(&apos;fuk&apos;)</code>
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-100">
        <div className="max-w-6xl mx-auto text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} DigitalTP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
