/**
 * Student School Location Page
 *
 * Mobile-first. One primary action: stand at the school and tap
 * "Record School Location". Typing coordinates is a deliberate,
 * secondary path for the rare student who already knows them.
 *
 * The page also answers, at a glance: where does my school's location
 * stand, what has been submitted, and what happened to it.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../api/portal';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton, SkeletonPageHeader } from '../../components/ui/Skeleton';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { Textarea } from '../../components/ui/Textarea';
import { useGeolocation } from '../../hooks/useGeolocation';
import { getWards } from '../../data/nigeria';
import { formatDateTime } from '../../utils/helpers';
import {
  LOCATION_STATUS,
  accuracyBand,
  formatCoords,
  locationStatusMeta,
  mapsLink,
} from '../../utils/schoolLocation';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconBuilding,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconCurrentLocation,
  IconExternalLink,
  IconHistory,
  IconInfoCircle,
  IconMapPin,
  IconMapPinOff,
  IconPencil,
  IconRosetteDiscountCheckFilled,
  IconUser,
} from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function GateCard({ icon: Icon, color, title, children }) {
  const colorMap = {
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200',
  };
  const iconMap = {
    amber: 'text-amber-600',
    blue: 'text-blue-600',
  };
  return (
    <Card className={colorMap[color]}>
      <CardContent className="p-6 sm:p-10 text-center">
        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Icon className={`w-6 h-6 sm:w-8 sm:h-8 ${iconMap[color]}`} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

function MapsButton({ latitude, longitude, label = 'Open in Google Maps', className = '' }) {
  const href = mapsLink(latitude, longitude);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors ${className}`}
    >
      <IconExternalLink className="w-4 h-4" />
      {label}
    </a>
  );
}

const REQUEST_STATUS_META = {
  pending: { icon: IconClock, className: 'text-blue-600', label: 'Awaiting review' },
  approved: { icon: IconCircleCheck, className: 'text-green-600', label: 'Approved' },
  rejected: { icon: IconCircleX, className: 'text-red-500', label: 'Rejected' },
};

function HistoryRow({ request }) {
  const meta = REQUEST_STATUS_META[request.status] || REQUEST_STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <li className="flex gap-3 py-3">
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${meta.className}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-sm font-medium text-gray-900">{meta.label}</p>
          <p className="text-xs text-gray-400">{formatDateTime(request.submitted_at, '-')}</p>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {request.is_mine ? 'Submitted by you' : `Submitted by ${request.submitted_by || 'a coursemate'}`}
          {request.accuracy_meters != null && ` · ±${Math.round(request.accuracy_meters)} m`}
        </p>
        {request.note && (
          <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{request.note}&rdquo;</p>
        )}
        {request.status === 'rejected' && request.rejection_reason && (
          <p className="text-xs text-red-600 mt-1">Reason: {request.rejection_reason}</p>
        )}
        {request.maps_url && (
          <a
            href={request.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline mt-1"
          >
            {formatCoords(request.latitude, request.longitude, 5)}
            <IconExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const EMPTY_DETAILS = { ward: '', address: '', note: '' };

export default function StudentLocationUpdatePage() {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  // Recorder state
  const [recorder, setRecorder] = useState(null); // { latitude, longitude, accuracy, source }
  const {
    status: gpsStatus,
    bestSample,
    errorMessage: gpsError,
    start: startSampling,
    reset: resetSampling,
  } = useGeolocation({ sampleWindowMs: 5000, maxSamples: 5 });
  const gettingLocation = gpsStatus === 'sampling';
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ latitude: '', longitude: '' });
  const [manualErrors, setManualErrors] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [noteError, setNoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  // "Request an update" mode, used once a location is already verified
  const [correcting, setCorrecting] = useState(false);

  const [wards, setWards] = useState([]);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await portalApi.getMySchoolLocation();
      setData(res.data.data);
    } catch {
      toast.error('Failed to load your school location');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const school = data?.school || null;

  // Ward options follow the school's own LGA - no picking needed
  const schoolState = school?.state;
  const schoolLga = school?.lga;
  useEffect(() => {
    if (!schoolState || !schoolLga) return;
    setWardsLoading(true);
    setWards([]);
    getWards(schoolState, schoolLga)
      .then(setWards)
      .finally(() => setWardsLoading(false));
  }, [schoolState, schoolLga]);

  const wardOptions = useMemo(() => wards.map((w) => ({ label: w.name, value: w.name })), [wards]);

  // Clears the captured reading only. The ward/address/reason the student has
  // already typed survives "Record again" - re-recording a position is not a
  // reason to make them write their explanation out a second time.
  const resetRecorder = () => {
    setRecorder(null);
    resetSampling();
    setManual({ latitude: '', longitude: '' });
    setManualErrors({});
    setManualOpen(false);
  };

  const clearDetails = () => {
    setDetailsOpen(false);
    setDetails(EMPTY_DETAILS);
    setNoteError(null);
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Your browser cannot read GPS. Enter the coordinates manually instead.');
      setManualOpen(true);
      return;
    }
    resetSampling();
    startSampling();
  };

  // The hook samples for a few seconds and keeps the most accurate fix - a single
  // reading is often stale or poor, which matters when the point is what a
  // supervisor navigates to.
  useEffect(() => {
    if (gpsStatus === 'ready' && bestSample) {
      setRecorder({
        latitude: bestSample.latitude,
        longitude: bestSample.longitude,
        accuracy: Math.round(bestSample.accuracy_meters || 0),
        source: 'gps',
      });
    } else if (gpsStatus === 'error' || gpsStatus === 'unsupported') {
      toast.error(
        gpsError || 'Could not read your location. Move outdoors and try again, or enter coordinates manually.'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsStatus, bestSample]);

  const applyManual = () => {
    const errs = {};
    const lat = parseFloat(manual.latitude);
    const lng = parseFloat(manual.longitude);
    if (manual.latitude === '' || Number.isNaN(lat) || lat < -90 || lat > 90) {
      errs.latitude = 'Latitude must be a number between -90 and 90';
    }
    if (manual.longitude === '' || Number.isNaN(lng) || lng < -180 || lng > 180) {
      errs.longitude = 'Longitude must be a number between -180 and 180';
    }
    if (Object.keys(errs).length) {
      setManualErrors(errs);
      return;
    }
    setManualErrors({});
    setRecorder({ latitude: lat, longitude: lng, accuracy: null, source: 'manual' });
  };

  const band = accuracyBand(recorder?.accuracy, data?.max_gps_accuracy_meters);
  const accuracyBlocks = band?.level === 'poor';
  const noteRequired = !!data?.requires_note || correcting;

  const handleSubmit = async () => {
    if (!recorder) return;
    if (noteRequired && details.note.trim().length < 10) {
      setNoteError('Please tell the TP unit why the approved location needs to change (at least 10 characters).');
      setDetailsOpen(true); // the error renders inside this panel
      return;
    }
    setNoteError(null);
    setSubmitting(true);
    try {
      await portalApi.submitLocationUpdate({
        proposed_latitude: recorder.latitude,
        proposed_longitude: recorder.longitude,
        proposed_ward: details.ward || null,
        proposed_address: details.address.trim() || null,
        accuracy_meters: recorder.accuracy ?? null,
        student_note: details.note.trim() || null,
      });
      setJustSubmitted(true);
      setCorrecting(false);
      resetRecorder();
      clearDetails();
      await fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to submit your location');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Loading & gates
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-1 space-y-6">
        <SkeletonPageHeader withAction={false} />
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-3 w-40 mx-auto" />
        </div>
      </div>
    );
  }

  if (!data?.active_session) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <GateCard icon={IconClock} color="blue" title="No Active Session">
          <p className="text-gray-600 text-sm">There is no active teaching practice session at this time.</p>
        </GateCard>
      </div>
    );
  }

  if (!data?.acceptance_approved) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <GateCard icon={IconAlertCircle} color="amber" title="Acceptance Required">
          <p className="text-gray-600 text-sm mb-4">
            Your acceptance form must be approved before you can record your school location.
          </p>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => navigate('/student/acceptance')}>
              Go to Acceptance
            </Button>
          </div>
        </GateCard>
      </div>
    );
  }

  if (!data?.feature_enabled) {
    return (
      <div className="max-w-2xl mx-auto px-1">
        <GateCard icon={IconAlertCircle} color="amber" title="Feature Disabled">
          <p className="text-gray-600 text-sm">
            Location update submissions are not enabled for this institution.
          </p>
        </GateCard>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Derived view state
  // -------------------------------------------------------------------------

  const status = data.status;
  const externalVerification = data.external_verification || null;
  const meta = locationStatusMeta(status, { externalVerification });
  const pending = data.pending_request;
  const last = data.last_request;
  const location = data.location || {};
  const history = data.history || [];
  const lastRejected = last?.status === 'rejected';

  // "Settled" covers both our own approval and a confirmation by another
  // institution posted to the same school - the GPS point is shared, so
  // either way there is nothing left for this student to record.
  const settled =
    status === LOCATION_STATUS.VERIFIED ||
    (status === LOCATION_STATUS.RECORDED && !!externalVerification);

  // The recorder is shown when nothing is pending and either the location is
  // missing/unconfirmed, or the student explicitly asked to correct a settled one.
  const showRecorder = data.can_submit && !justSubmitted && (!settled || correcting);

  const StatusIcon =
    status === LOCATION_STATUS.VERIFIED
      ? IconRosetteDiscountCheckFilled
      : status === LOCATION_STATUS.PENDING
      ? IconClock
      : status === LOCATION_STATUS.MISSING
      ? IconMapPinOff
      : IconMapPin;

  return (
    <div className="max-w-2xl mx-auto px-1 pb-10 space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">School Location</h1>
        <p className="text-sm text-gray-500 mt-1">
          The GPS point your supervisor uses to find you during supervision visits.
        </p>
      </div>

      {/* School identity - read only, this is always your own posting */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
              <IconBuilding className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-gray-400">Your school</p>
              <p className="font-semibold text-gray-900 text-sm sm:text-base">
                {school?.name}
                {school?.code && (
                  <span className="font-normal text-gray-500"> ({school.code})</span>
                )}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                <IconMapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {[school?.ward, school?.lga, school?.state]
                    .filter(Boolean)
                    .join(', ') || 'Location details not set'}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status hero */}
      <div className={`rounded-xl border-2 ${meta.cardClass} p-4 sm:p-5`}>
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
            <StatusIcon className={`w-6 h-6 ${meta.accentClass}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.badgeClass}`}>
                {meta.label}
              </span>
              {status === LOCATION_STATUS.MISSING && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-600 text-white">
                  Required
                </span>
              )}
            </div>
            <h2 className="font-semibold text-gray-900 mt-2 text-sm sm:text-base">{meta.headline}</h2>
            <p className="text-sm text-gray-700 mt-1">{meta.description}</p>

            {/* Coordinates on record */}
            {location.latitude != null && status !== LOCATION_STATUS.PENDING && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="text-xs bg-white/70 border border-white rounded px-2 py-1 text-gray-700">
                  {formatCoords(location.latitude, location.longitude, 5)}
                </code>
                <MapsButton
                  latitude={location.latitude}
                  longitude={location.longitude}
                  label="Check it on the map"
                  className="h-9"
                />
              </div>
            )}

            {/* Pending submission detail */}
            {status === LOCATION_STATUS.PENDING && pending && (
              <div className="mt-3 rounded-lg bg-white/70 border border-white p-3">
                <p className="text-sm text-gray-800 flex items-center gap-2">
                  <IconUser className="w-4 h-4 text-blue-600 shrink-0" />
                  {pending.is_mine ? 'Submitted by you' : `Submitted by ${pending.submitted_by || 'a coursemate'}`}
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500 text-xs">{formatDateTime(pending.submitted_at, '-')}</span>
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatCoords(pending.latitude, pending.longitude, 5)}
                  {pending.accuracy_meters != null && ` · GPS accuracy ±${Math.round(pending.accuracy_meters)} m`}
                </p>
                {pending.note && (
                  <p className="text-xs text-gray-600 mt-1 italic">&ldquo;{pending.note}&rdquo;</p>
                )}
                <p className="text-xs text-gray-600 mt-2">
                  Open it on the map. If the pin is wrong, tell the TP unit before it is approved.
                </p>
                <MapsButton
                  latitude={pending.latitude}
                  longitude={pending.longitude}
                  label="Verify this location"
                  className="mt-2 h-9"
                />
              </div>
            )}

            {/* Settled - by our TP unit, or by another institution sharing this point */}
            {settled && !correcting && (
              <div className="mt-3">
                {status === LOCATION_STATUS.VERIFIED && location.verified_at && (
                  <p className="text-xs text-green-800">
                    Approved {formatDateTime(location.verified_at, '')}
                  </p>
                )}
                {externalVerification && status === LOCATION_STATUS.RECORDED && (
                  <p className="text-xs text-gray-500">
                    Confirmed on {formatDateTime(externalVerification.verified_at, '')}.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCorrecting(true);
                    setDetailsOpen(true);
                  }}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium hover:underline mt-2 ${
                    status === LOCATION_STATUS.VERIFIED ? 'text-green-800' : 'text-primary-600'
                  }`}
                >
                  <IconPencil className="w-4 h-4" />
                  This is wrong — request an update
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Just-submitted confirmation */}
      {justSubmitted && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <IconCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">Location submitted</p>
            <p className="text-sm text-green-800 mt-0.5">
              The TP unit will review it. You will see a verified badge here once it is approved.
            </p>
          </div>
        </div>
      )}

      {/* Last request was rejected */}
      {lastRejected && !pending && !justSubmitted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <IconAlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-900">Your last submission was rejected</p>
            {last.rejection_reason && (
              <p className="text-sm text-red-800 mt-0.5">{last.rejection_reason}</p>
            )}
            <p className="text-xs text-red-700 mt-1">
              Stand at the school gate, outdoors, and record it again.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* The recorder - the primary action                                   */}
      {/* ------------------------------------------------------------------ */}
      {showRecorder && (
        <Card>
          <CardContent className="p-4 sm:p-5">
            {correcting && (
              <button
                type="button"
                onClick={() => {
                  setCorrecting(false);
                  resetRecorder();
                  clearDetails();
                }}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
              >
                <IconArrowLeft className="w-4 h-4" />
                Cancel update request
              </button>
            )}

            {!recorder ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary-50 flex items-center justify-center mx-auto mb-3">
                  <IconCurrentLocation className="w-7 h-7 text-primary-600" />
                </div>
                <h3 className="font-semibold text-gray-900">
                  {correcting ? 'Record the correct location' : 'Record your school location'}
                </h3>
                <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                  Stand at the entrance of your school, outdoors if you can, then tap the
                  button. Your phone does the rest.
                </p>

                <Button
                  type="button"
                  onClick={captureLocation}
                  loading={gettingLocation}
                  className="w-full h-14 mt-4 text-base"
                >
                  {!gettingLocation && <IconCurrentLocation className="w-5 h-5 mr-2" />}
                  {gettingLocation ? 'Reading GPS…' : 'Record School Location'}
                </Button>

                <button
                  type="button"
                  onClick={() => setManualOpen((open) => !open)}
                  className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline mt-3"
                >
                  <IconChevronDown
                    className={`w-4 h-4 transition-transform ${manualOpen ? 'rotate-180' : ''}`}
                  />
                  I already know the exact coordinates
                </button>

                {manualOpen && (
                  <div className="mt-3 text-left border-t pt-4 space-y-3">
                    <p className="text-xs text-gray-500">
                      Only use this if someone gave you the school&apos;s exact latitude and
                      longitude. Otherwise recording on the spot is far more accurate.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          placeholder="e.g. 11.966"
                          className={manualErrors.latitude ? 'border-red-400' : ''}
                          value={manual.latitude}
                          onChange={(e) => setManual((m) => ({ ...m, latitude: e.target.value }))}
                        />
                        {manualErrors.latitude && (
                          <p className="text-xs text-red-600 mt-1">{manualErrors.latitude}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          placeholder="e.g. 8.891"
                          className={manualErrors.longitude ? 'border-red-400' : ''}
                          value={manual.longitude}
                          onChange={(e) => setManual((m) => ({ ...m, longitude: e.target.value }))}
                        />
                        {manualErrors.longitude && (
                          <p className="text-xs text-red-600 mt-1">{manualErrors.longitude}</p>
                        )}
                      </div>
                    </div>
                    <Button type="button" variant="outline" onClick={applyManual} className="w-full">
                      Use these coordinates
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* ---------------- Confirm step ---------------- */
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Confirm this is the right place</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Open it on the map before you submit. A wrong pin sends your supervisor to the
                    wrong address.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    {recorder.source === 'gps' ? 'Captured from your phone' : 'Entered manually'}
                  </p>
                  <p className="font-mono text-sm text-gray-900 mt-1">
                    {formatCoords(recorder.latitude, recorder.longitude)}
                  </p>
                  <MapsButton
                    latitude={recorder.latitude}
                    longitude={recorder.longitude}
                    label="Open in Google Maps"
                    className="mt-3 w-full sm:w-auto"
                  />
                </div>

                {band && (
                  <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 rounded-lg border text-sm ${band.className}`}>
                    <span className="font-medium">GPS accuracy ±{recorder.accuracy} m</span>
                    <span className="font-semibold">— {band.label}</span>
                    {band.level === 'poor' && (
                      <span className="text-xs w-full">
                        Maximum allowed is ±{data.max_gps_accuracy_meters} m. Step outside, away from
                        walls, wait a few seconds and record again.
                      </span>
                    )}
                  </div>
                )}

                {/* Optional extra corrections */}
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setDetailsOpen((open) => !open)}
                    className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline"
                  >
                    <IconChevronDown
                      className={`w-4 h-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
                    />
                    {noteRequired ? 'Reason and address details' : 'Add ward or address (optional)'}
                  </button>

                  {detailsOpen && (
                    <div className="mt-3 space-y-4">
                      {noteRequired && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Why does the approved location need to change?{' '}
                            <span className="text-red-500">*</span>
                          </label>
                          <Textarea
                            rows={3}
                            className="resize-none"
                            placeholder="e.g. The approved pin is at the head office. We report to the branch behind the market."
                            value={details.note}
                            onChange={(e) => {
                              setDetails((d) => ({ ...d, note: e.target.value }));
                              setNoteError(null);
                            }}
                          />
                          {noteError && <p className="text-xs text-red-600 mt-1">{noteError}</p>}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Ward{' '}
                          <span className="text-xs text-gray-400 font-normal">
                            {school?.lga ? `(optional · ${school.lga} LGA)` : '(optional)'}
                          </span>
                        </label>
                        <SearchableSelect
                          options={wardOptions}
                          value={details.ward}
                          onChange={(val) => setDetails((d) => ({ ...d, ward: val || '' }))}
                          placeholder={
                            wardsLoading
                              ? 'Loading wards…'
                              : wardOptions.length === 0
                              ? 'No wards available for this LGA'
                              : 'Select ward (optional)'
                          }
                          disabled={wardsLoading || wardOptions.length === 0 || submitting}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Street Address{' '}
                          <span className="text-xs text-gray-400 font-normal">(optional)</span>
                        </label>
                        {school?.address && (
                          <p className="text-xs text-gray-400 mb-1">Current: {school.address}</p>
                        )}
                        <Textarea
                          rows={2}
                          className="resize-none"
                          placeholder="Enter the corrected street address"
                          value={details.address}
                          onChange={(e) => setDetails((d) => ({ ...d, address: e.target.value }))}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row-reverse gap-2">
                  <Button
                    type="button"
                    onClick={handleSubmit}
                    loading={submitting}
                    disabled={accuracyBlocks}
                    className="h-12 flex-1 text-base"
                  >
                    {!submitting && <IconCheck className="w-5 h-5 mr-2" />}
                    Submit this location
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetRecorder}
                    disabled={submitting}
                    className="h-12 sm:w-auto"
                  >
                    Record again
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Why this matters - only while something is still owed */}
      {(status === LOCATION_STATUS.MISSING ||
        (status === LOCATION_STATUS.RECORDED && !externalVerification)) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <IconInfoCircle className="w-4 h-4 text-primary-600" />
            Why this is required
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-gray-600">
            <li className="flex gap-2">
              <span className="text-primary-500">•</span>
              Your supervisor navigates to this exact point on their supervision visit.
            </li>
            <li className="flex gap-2">
              <span className="text-primary-500">•</span>
              Check-in at your school is verified against it — a wrong point can fail the visit.
            </li>
            <li className="flex gap-2">
              <span className="text-primary-500">•</span>
              Only one student per school needs to record it. Yours covers everyone posted there.
            </li>
          </ul>
        </div>
      )}

      {/* Submission history */}
      {history.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <IconHistory className="w-4 h-4 text-gray-400" />
              Submission history
              <span className="text-xs font-normal text-gray-400">({history.length})</span>
            </span>
            <IconChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {historyOpen && (
            <ul className="px-4 pb-2 divide-y divide-gray-100 border-t">
              {history.map((request) => (
                <HistoryRow key={request.id} request={request} />
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 text-center px-4">
        Coordinates are reviewed by the TP unit before they replace the ones on record.
        If your school is listed incorrectly, contact the TP unit.
      </p>
    </div>
  );
}
