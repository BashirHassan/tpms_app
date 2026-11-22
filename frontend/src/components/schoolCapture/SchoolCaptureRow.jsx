/**
 * One allocated school in the supervisor's capture list.
 */

import { cn } from '../../utils/helpers';
import { formatCoords } from '../../utils/schoolLocation';
import { StatusBadge } from './captureShared';
import { IconChevronRight, IconMapPin, IconUser } from '@tabler/icons-react';

export default function SchoolCaptureRow({ school, onOpen }) {
  const { current = {} } = school;
  const actionable = school.can_submit_location || school.can_submit_principal;
  const place = [school.ward, school.lga].filter(Boolean).join(', ');

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => onOpen(school.id)}
        className="flex w-full items-start gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-gray-900">{school.school_name}</p>
          <p className="mt-0.5 break-words text-xs text-gray-500">
            {school.school_code}
            {place && ` · ${place}`}
          </p>
          {school.linked === false && (
            <p className="mt-1 text-xs text-gray-500">Not on your institution&apos;s school list</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {school.needs_location && <StatusBadge prefix="Location" status={school.location_status} />}
            {school.needs_principal && <StatusBadge prefix="Principal" status={school.principal_status} />}
            {!school.needs_location && !school.needs_principal && (
              <StatusBadge prefix="Location" status={school.location_status} />
            )}
          </div>
          {(current.latitude != null || current.principal_name) && (
            <div className="mt-2 space-y-0.5 text-xs text-gray-600">
              {current.latitude != null && (
                <p className="flex items-center gap-1.5">
                  <IconMapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="break-all">{formatCoords(current.latitude, current.longitude, 5)}</span>
                </p>
              )}
              {current.principal_name && (
                <p className="flex items-center gap-1.5">
                  <IconUser className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="break-words">
                    {current.principal_name}
                    {current.principal_phone && ` · ${current.principal_phone}`}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>
        <span
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1 self-center rounded-lg px-3 text-sm font-medium',
            actionable ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700'
          )}
        >
          {actionable ? 'Record' : 'View'}
          <IconChevronRight className="h-4 w-4" />
        </span>
      </button>
    </li>
  );
}
