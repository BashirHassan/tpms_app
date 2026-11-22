/**
 * Shared bits for the supervisor School Data Capture screens:
 * status vocabulary, badge, Google Maps link and request-status helpers.
 */

import { STATUS_META } from './captureConstants';
import { cn } from '../../utils/helpers';
import { mapsLink } from '../../utils/schoolLocation';
import { IconExternalLink } from '@tabler/icons-react';

/** Small "Location: Pending review" style badge. */
export function StatusBadge({ prefix, status }) {
  const meta = STATUS_META[status] || STATUS_META.not_started;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        meta.className
      )}
    >
      {prefix && <span className="opacity-70">{prefix}:</span>}
      {meta.label}
    </span>
  );
}

/** Tap-friendly "Open in Google Maps" link. */
export function MapsButton({ latitude, longitude, label = 'Open in Google Maps', className }) {
  const href = mapsLink(latitude, longitude);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-100',
        className
      )}
    >
      <IconExternalLink className="h-4 w-4" />
      {label}
    </a>
  );
}
