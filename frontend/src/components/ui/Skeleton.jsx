/**
 * Skeleton Components
 * Reusable skeleton loading primitives using Tailwind animate-pulse.
 * Provides base building blocks for skeleton screens across the app.
 */

import { cn } from '../../utils/helpers';

/**
 * Base skeleton element with pulse animation
 */
function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-gray-200', className)}
      {...props}
    />
  );
}

/**
 * Skeleton text line
 */
function SkeletonLine({ className, width = 'w-full', ...props }) {
  return <Skeleton className={cn('h-4', width, className)} {...props} />;
}

/**
 * Skeleton circle (for avatars, icons)
 */
function SkeletonCircle({ className, size = 'w-10 h-10', ...props }) {
  return <Skeleton className={cn('rounded-full', size, className)} {...props} />;
}

/**
 * Skeleton stat card matching the dashboard stat card layout
 */
function SkeletonStatCard({ className }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white shadow-sm p-3 sm:p-4', className)}>
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for a card with a header and content rows
 */
function SkeletonCard({ rows = 3, className }) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white shadow-sm', className)}>
      <div className="p-6 pb-4">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="px-6 pb-6 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton table rows for DataTable integration
 */
function SkeletonTableRows({ columns = 5, rows = 5, hasCheckbox = false }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-gray-100">
          {hasCheckbox && (
            <td className="px-4 py-3 w-10">
              <Skeleton className="w-4 h-4 rounded" />
            </td>
          )}
          {Array.from({ length: columns }).map((_, colIndex) => (
            <td key={colIndex} className="px-4 py-2">
              <Skeleton
                className={cn(
                  'h-4',
                  colIndex === 0 ? 'w-32' : colIndex === columns - 1 ? 'w-20' : 'w-24'
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Full dashboard skeleton - Institution/Supervisor style with header banner + stat cards
 */
function DashboardSkeleton({ statCards = 4, hasHeader = true }) {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header Banner */}
      {hasHeader && (
        <div className="bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl py-4 px-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 bg-gray-300/60" />
              <Skeleton className="h-4 w-32 bg-gray-300/60" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg bg-gray-300/60" />
          </div>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className={cn(
        'grid grid-cols-2 gap-3',
        statCards >= 5 ? 'lg:grid-cols-5' : statCards >= 4 ? 'lg:grid-cols-4' : `lg:grid-cols-${statCards}`
      )}>
        {Array.from({ length: statCards }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Two-column content area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SkeletonCard rows={3} />
        <SkeletonCard rows={3} />
      </div>
    </div>
  );
}

/**
 * Global admin dashboard skeleton with header text + 6 stat cards
 */
function GlobalDashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* 6 Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonStatCard key={i} />
        ))}
      </div>

      {/* Two-column content area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <SkeletonCard rows={5} />
        <SkeletonCard rows={5} />
      </div>
    </div>
  );
}

/**
 * Student dashboard skeleton
 */
function StudentDashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-gray-200 to-gray-300 rounded-xl p-4 sm:p-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 bg-gray-300/60" />
          <Skeleton className="h-4 w-36 bg-gray-300/60" />
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
            <div className="flex items-center gap-3 mb-3">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonLine,
  SkeletonCircle,
  SkeletonStatCard,
  SkeletonCard,
  SkeletonTableRows,
  DashboardSkeleton,
  GlobalDashboardSkeleton,
  StudentDashboardSkeleton,
};
