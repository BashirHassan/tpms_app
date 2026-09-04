/**
 * School GPS location status
 *
 * One shared vocabulary for the school location state so the dedicated
 * page, the dashboard banner and the sidebar badge always say the same thing.
 * Mirrors the `school_location` block returned by the portal API.
 */

export const LOCATION_STATUS = {
  NOT_APPLICABLE: 'not_applicable',
  MISSING: 'missing',
  PENDING: 'pending',
  RECORDED: 'recorded',
  VERIFIED: 'verified',
};

const META = {
  [LOCATION_STATUS.MISSING]: {
    label: 'Not recorded',
    short: 'Not recorded',
    tone: 'amber',
    headline: 'Your school has no GPS location yet',
    description:
      'Your supervisor uses these coordinates to find your place of attachment. Without them your visit can be missed.',
    badgeClass: 'bg-amber-100 text-amber-800',
    cardClass: 'border-amber-200 bg-amber-50',
    accentClass: 'text-amber-600',
    dotClass: 'bg-amber-500',
  },
  [LOCATION_STATUS.PENDING]: {
    label: 'Awaiting approval',
    short: 'Pending',
    tone: 'blue',
    headline: 'A location is waiting for approval',
    description:
      'The TP unit is reviewing the coordinates submitted for your school.',
    badgeClass: 'bg-blue-100 text-blue-800',
    cardClass: 'border-blue-200 bg-blue-50',
    accentClass: 'text-blue-600',
    dotClass: 'bg-blue-500',
  },
  [LOCATION_STATUS.RECORDED]: {
    label: 'On record',
    short: 'On record',
    tone: 'gray',
    headline: 'A location is on record, but nobody has confirmed it',
    description:
      'These coordinates came from the institution’s records. Confirm them from the school gate, or send a correction.',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'border-gray-200 bg-gray-50',
    accentClass: 'text-gray-500',
    dotClass: 'bg-gray-400',
  },
  // Same underlying state as RECORDED, but a student at another institution
  // posted to this same school already had the shared point approved.
  recorded_external: {
    label: 'Confirmed elsewhere',
    short: 'Confirmed',
    tone: 'gray',
    headline: 'This location was confirmed by another institution',
    description:
      'A student from another institution posted here recorded these coordinates on the ground, and their TP unit approved them. You do not need to record it again — but do check the pin, and send a correction if it is wrong.',
    badgeClass: 'bg-gray-100 text-gray-700',
    cardClass: 'border-gray-200 bg-gray-50',
    accentClass: 'text-gray-500',
    dotClass: 'bg-gray-400',
  },
  [LOCATION_STATUS.VERIFIED]: {
    label: 'Verified',
    short: 'Verified',
    tone: 'green',
    headline: 'Your school location is verified',
    description:
      'Your supervisor can now find your school on the map. Nothing else is needed.',
    badgeClass: 'bg-green-100 text-green-800',
    cardClass: 'border-green-200 bg-green-50',
    accentClass: 'text-green-600',
    dotClass: 'bg-green-500',
  },
  [LOCATION_STATUS.NOT_APPLICABLE]: {
    label: 'Not available',
    short: 'Not available',
    tone: 'gray',
    headline: 'Location updates are not available yet',
    description: 'Your acceptance must be approved before you can record a school location.',
    badgeClass: 'bg-gray-100 text-gray-600',
    cardClass: 'border-gray-200 bg-gray-50',
    accentClass: 'text-gray-400',
    dotClass: 'bg-gray-300',
  },
};

/**
 * Presentation for a status. Pass the `external_verification` block from the API
 * to get the softer "already confirmed by another institution" copy instead of
 * asking the student to redo work someone else has already done.
 */
export function locationStatusMeta(status, { externalVerification = null } = {}) {
  if (status === LOCATION_STATUS.RECORDED && externalVerification) {
    return META.recorded_external;
  }
  return META[status] || META[LOCATION_STATUS.NOT_APPLICABLE];
}

export function mapsLink(latitude, longitude) {
  if (latitude === null || latitude === undefined) return null;
  if (longitude === null || longitude === undefined) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function formatCoords(latitude, longitude, precision = 6) {
  if (latitude === null || latitude === undefined) return null;
  if (longitude === null || longitude === undefined) return null;
  return `${Number(latitude).toFixed(precision)}, ${Number(longitude).toFixed(precision)}`;
}

/**
 * Accuracy band for a GPS reading, given the session's advisory limit.
 * Returns { level: 'excellent' | 'acceptable' | 'poor', label, className }.
 */
export function accuracyBand(accuracyMeters, maxAllowed) {
  if (accuracyMeters === null || accuracyMeters === undefined) return null;
  if (accuracyMeters <= 20) {
    return {
      level: 'excellent',
      label: 'Excellent signal',
      className: 'bg-green-50 border-green-200 text-green-800',
    };
  }
  if (!maxAllowed || accuracyMeters <= maxAllowed) {
    return {
      level: 'acceptable',
      label: 'Good enough',
      className: 'bg-amber-50 border-amber-200 text-amber-800',
    };
  }
  return {
    level: 'poor',
    label: 'Too imprecise',
    className: 'bg-red-50 border-red-200 text-red-800',
  };
}
