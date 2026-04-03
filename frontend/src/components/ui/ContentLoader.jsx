/**
 * ContentLoader
 * Subtle loading indicator for the content area inside layouts.
 * Used as Suspense fallback so the sidebar/navbar stay persistent.
 */

export default function ContentLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full border-[3px] border-gray-200" />
          <div className="absolute inset-0 w-10 h-10 rounded-full border-[3px] border-primary-500 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  );
}
