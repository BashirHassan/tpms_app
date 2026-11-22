/**
 * Full-screen-on-phones panel for capturing one allocated school's
 * location and principal details.
 */

import { Dialog } from '../ui/Dialog';
import { StatusBadge } from './captureShared';
import CaptureLocationSection from './CaptureLocationSection';
import CapturePrincipalSection from './CapturePrincipalSection';
import { IconMapPin, IconUser } from '@tabler/icons-react';

function Section({ icon: Icon, title, status, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Icon className="h-4 w-4 text-primary-600" />
          {title}
        </h3>
        <StatusBadge status={status} />
      </div>
      {children}
    </section>
  );
}

export default function SchoolCapturePanel({ school, session, minDistance, onClose, onSubmitted }) {
  if (!school) return null;
  const place = [school.ward, school.lga, school.state].filter(Boolean).join(', ');
  const showLocation = school.needs_location || school.can_submit_location || school.location_request;
  const showPrincipal = school.needs_principal || school.can_submit_principal || school.principal_request;

  return (
    <Dialog
      isOpen
      onClose={onClose}
      title={school.school_name}
      description={[school.school_code, place].filter(Boolean).join(' · ')}
      width="xl"
      maxHeight="100dvh"
      closeOnOutsideClick={false}
      overlayClassName="p-0 sm:p-4"
      className="h-full rounded-none sm:h-auto sm:rounded-xl"
    >
      <div className="space-y-6 pb-4">
        {showLocation && (
          <Section icon={IconMapPin} title="School location" status={school.location_status}>
            <CaptureLocationSection
              key={`loc-${school.id}`}
              school={school}
              maxAccuracy={session?.max_gps_accuracy_meters ?? null}
              minDistance={minDistance}
              onSubmitted={onSubmitted}
            />
          </Section>
        )}
        {showLocation && showPrincipal && <hr className="border-gray-100" />}
        {showPrincipal && (
          <Section icon={IconUser} title="Principal details" status={school.principal_status}>
            <CapturePrincipalSection key={`pri-${school.id}`} school={school} onSubmitted={onSubmitted} />
          </Section>
        )}
      </div>
    </Dialog>
  );
}
