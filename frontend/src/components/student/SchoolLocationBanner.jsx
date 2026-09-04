/**
 * School Location Banner
 *
 * Dashboard-level status for the student's school GPS location.
 * Loud when action is required, quiet once the location is verified.
 */

import { Link } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconChevronRight,
  IconClock,
  IconExternalLink,
  IconMapPinCheck,
  IconMapPinOff,
  IconRosetteDiscountCheckFilled,
} from '@tabler/icons-react';
import { LOCATION_STATUS, formatCoords } from '../../utils/schoolLocation';

const PAGE = '/student/location-update';

function VerifyOnMapsLink({ href, className = '' }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-medium hover:underline ${className}`}
    >
      Verify on Google Maps
      <IconExternalLink className="w-3.5 h-3.5" />
    </a>
  );
}

export default function SchoolLocationBanner({ status }) {
  if (!status || !status.feature_enabled || !status.acceptance_approved) return null;

  const {
    status: state,
    location,
    pending_request: pending,
    external_verification: externalVerification,
  } = status;

  // Needs recording - the loud case
  if (state === LOCATION_STATUS.MISSING) {
    return (
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <IconMapPinOff className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-amber-900 text-sm sm:text-base">
                  Record your school location
                </h3>
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-600 text-white">
                  Required
                </span>
              </div>
              <p className="text-sm text-amber-800 mt-1">
                {status.school?.name
                  ? `${status.school.name} has no GPS location on record.`
                  : 'Your school has no GPS location on record.'}{' '}
                Your supervisor uses it to find you during supervision visits — without it your
                visit can be missed and your assessment delayed.
              </p>
              <p className="text-xs text-amber-700 mt-2">
                It takes about 30 seconds. Stand at the school gate and tap the button below.
              </p>
            </div>
          </div>

          <Link
            to={PAGE}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-amber-600 text-white font-medium text-sm hover:bg-amber-700 active:bg-amber-800 transition-colors"
          >
            Record School Location
            <IconChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  // Someone submitted - awaiting review
  if (state === LOCATION_STATUS.PENDING) {
    const who = pending?.is_mine ? 'You' : pending?.submitted_by || 'A coursemate';
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <IconClock className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-blue-900 text-sm sm:text-base">
              School location awaiting approval
            </h3>
            <p className="text-sm text-blue-800 mt-1">
              {who} submitted coordinates for {status.school?.name || 'your school'}.
              The TP unit will review them shortly.
            </p>
            {pending?.maps_url && (
              <p className="text-sm text-blue-700 mt-2">
                Not sure it is the right spot?{' '}
                <VerifyOnMapsLink href={pending.maps_url} className="text-blue-700" />
              </p>
            )}
            <Link
              to={PAGE}
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline mt-2"
            >
              View submission
              <IconChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Confirmed on the ground by a student from another institution posted to the
  // same school. The GPS point is shared, so there is nothing owed here -
  // stay quiet, but leave a way to flag a wrong pin.
  if (state === LOCATION_STATUS.RECORDED && externalVerification) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <IconMapPinCheck className="w-5 h-5 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              School location confirmed
            </p>
            <p className="text-xs text-gray-500 truncate">
              Recorded on the ground by a student from another institution posted here.
            </p>
          </div>
          <Link to={PAGE} className="text-xs font-medium text-primary-600 hover:underline shrink-0">
            Details
          </Link>
        </div>
      </div>
    );
  }

  // On record but never confirmed on the ground
  if (state === LOCATION_STATUS.RECORDED) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
            <IconAlertTriangle className="w-5 h-5 text-gray-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
              Is this where you actually work?
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              We have coordinates for {status.school?.name || 'your school'} from the
              institution&apos;s records, but nobody has confirmed them on the ground this session.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
              <VerifyOnMapsLink href={location?.maps_url} className="text-sm text-primary-600" />
              <Link
                to={PAGE}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline"
              >
                Send a correction
                <IconChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Verified - quiet confirmation
  if (state === LOCATION_STATUS.VERIFIED) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center gap-3">
          <IconRosetteDiscountCheckFilled className="w-5 h-5 text-green-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-900">
              School location verified
            </p>
            <p className="text-xs text-green-700 truncate">
              {formatCoords(location?.latitude, location?.longitude, 5) ||
                'Your supervisor can find your school.'}
            </p>
          </div>
          <Link
            to={PAGE}
            className="text-xs font-medium text-green-700 hover:underline shrink-0"
          >
            Details
          </Link>
        </div>
      </div>
    );
  }

  return null;
}
