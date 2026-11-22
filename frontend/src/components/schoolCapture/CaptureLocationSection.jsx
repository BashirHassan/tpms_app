/**
 * Location half of the capture panel. Mirrors the student GPS flow:
 * multi-sample GPS recording, accuracy band vs the session limit, a manual
 * lat/long fallback, optional ward/address, and a required note when the
 * location being corrected is already verified.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { useToast } from '../../context/ToastContext';
import { useGeolocation } from '../../hooks/useGeolocation';
import { schoolCaptureApi } from '../../api/schoolCapture';
import { getWards } from '../../data/nigeria';
import { formatDateTime } from '../../utils/helpers';
import { accuracyBand, formatCoords } from '../../utils/schoolLocation';
import { MapsButton, StatusBadge } from './captureShared';
import { errorMessage } from './captureConstants';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconClock,
  IconCurrentLocation,
  IconLoader2,
  IconMapPin,
  IconPencil,
  IconX,
} from '@tabler/icons-react';

function RejectionNotice({ request }) {
  if (request?.status !== 'rejected') return null;
  return (
    <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3" role="alert">
      <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-red-800">Your last submission was rejected</p>
        <p className="mt-0.5 break-words text-red-700">
          {request.rejection_reason || 'No reason was given.'}
        </p>
        <p className="mt-1 text-xs text-red-600">Please record it again below and resubmit.</p>
      </div>
    </div>
  );
}

function ReadOnlyRequest({ request }) {
  const isPending = request.status === 'pending';
  const Icon = isPending ? IconClock : IconCircleCheck;
  return (
    <div
      className={`rounded-lg border p-3 ${isPending ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}
    >
      <p className={`flex items-center gap-2 text-sm font-semibold ${isPending ? 'text-blue-800' : 'text-green-800'}`}>
        <Icon className="h-4 w-4 shrink-0" />
        {isPending ? 'Awaiting review by the TP unit' : 'Approved'}
      </p>
      <p className="mt-1.5 break-all text-xs text-gray-700">
        {formatCoords(request.latitude, request.longitude, 5)}
        {request.accuracy_meters != null && ` · GPS accuracy ±${Math.round(request.accuracy_meters)} m`}
        {request.capture_method === 'manual' && ' · entered manually'}
      </p>
      {(request.ward || request.address) && (
        <p className="mt-0.5 break-words text-xs text-gray-600">
          {[request.ward, request.address].filter(Boolean).join(' · ')}
        </p>
      )}
      {request.note && <p className="mt-1 break-words text-xs italic text-gray-600">&ldquo;{request.note}&rdquo;</p>}
      <p className="mt-1 text-xs text-gray-500">
        {request.by_me ? 'Submitted by you' : 'Submitted by another supervisor'} ·{' '}
        {formatDateTime(request.submitted_at, '-')}
      </p>
      <MapsButton latitude={request.latitude} longitude={request.longitude} className="mt-2" />
    </div>
  );
}

export default function CaptureLocationSection({ school, maxAccuracy, minDistance, onSubmitted }) {
  const { toast } = useToast();
  const request = school.location_request;
  const current = school.current || {};
  const hasCurrent = current.latitude != null && current.longitude != null;

  const [recorder, setRecorder] = useState(null); // { latitude, longitude, accuracy, source }
  const {
    status: gpsStatus,
    bestSample,
    samples: gpsSamples,
    errorMessage: gpsError,
    start: startSampling,
    reset: resetSampling,
  } = useGeolocation({ sampleWindowMs: 5000, maxSamples: 5 });
  const sampling = gpsStatus === 'sampling';

  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({ latitude: '', longitude: '' });
  const [manualErrors, setManualErrors] = useState({});
  const [ward, setWard] = useState(school.ward || '');
  const [address, setAddress] = useState(current.address || '');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [wardNames, setWardNames] = useState([]);

  useEffect(() => {
    if (!school.state || !school.lga) return undefined;
    let cancelled = false;
    getWards(school.state, school.lga)
      .then((w) => { if (!cancelled) setWardNames((w || []).map((x) => x.name)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [school.state, school.lga]);

  useEffect(() => {
    if (gpsStatus === 'ready' && bestSample) {
      setRecorder({
        latitude: bestSample.latitude,
        longitude: bestSample.longitude,
        accuracy: Math.round(bestSample.accuracy_meters || 0),
        source: 'gps',
      });
    } else if (gpsStatus === 'error' || gpsStatus === 'unsupported') {
      toast.error(gpsError || 'Could not read your location. Move outdoors and try again, or enter coordinates manually.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsStatus, bestSample]);

  const band = useMemo(() => accuracyBand(recorder?.accuracy, maxAccuracy), [recorder, maxAccuracy]);
  const accuracyBlocks = recorder?.source === 'gps' && band?.level === 'poor';

  if (!school.can_submit_location && request && request.status !== 'rejected') {
    return <ReadOnlyRequest request={request} />;
  }
  if (!school.can_submit_location) {
    return <p className="text-sm text-gray-500">Location cannot be submitted for this school right now.</p>;
  }

  const resetRecorder = () => {
    setRecorder(null);
    resetSampling();
    setManual({ latitude: '', longitude: '' });
    setManualErrors({});
    setManualOpen(false);
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
    setManualErrors(errs);
    if (Object.keys(errs).length) return;
    setRecorder({ latitude: lat, longitude: lng, accuracy: null, source: 'manual' });
  };

  const handleSubmit = async () => {
    if (!recorder || accuracyBlocks) return;
    if (school.requires_note && note.trim().length < 10) {
      setNoteError('Explain why the approved location needs to change (at least 10 characters).');
      return;
    }
    setNoteError(null);
    setSubmitting(true);
    try {
      const body = {
        proposed_latitude: recorder.latitude,
        proposed_longitude: recorder.longitude,
        capture_method: recorder.source,
      };
      if (recorder.source === 'gps') {
        body.accuracy_meters = recorder.accuracy;
        body.gps_samples = (gpsSamples || []).slice(-30).map((x) => ({
          latitude: x.latitude,
          longitude: x.longitude,
          accuracy_meters: x.accuracy_meters,
          altitude_meters: x.altitude_meters,
          timestamp: x.timestamp,
        }));
        body.client_timestamp = new Date().toISOString();
      }
      if (ward.trim()) body.proposed_ward = ward.trim();
      if (address.trim()) body.proposed_address = address.trim();
      if (note.trim()) body.note = note.trim();
      await schoolCaptureApi.submitLocation(school.id, body);
      toast.success('Location submitted for approval');
      resetRecorder();
      setNote('');
      await onSubmitted();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to submit the location'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <RejectionNotice request={request} />

      {hasCurrent && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className="font-medium text-gray-700">Current location on record</span>
            <StatusBadge status={current.location_verified ? 'approved' : 'not_started'} />
            {!current.location_verified && <span className="text-gray-500">(unverified)</span>}
          </p>
          <p className="mt-1 break-all text-xs text-gray-700">{formatCoords(current.latitude, current.longitude, 5)}</p>
          <MapsButton latitude={current.latitude} longitude={current.longitude} className="mt-2" />
        </div>
      )}

      {school.requires_note && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This school already has a verified location. A correction is only accepted if it is at least{' '}
            <strong>{minDistance ?? 25} m</strong> from the approved point, and you must explain why below.
          </p>
        </div>
      )}

      {!recorder && (
        <div className="space-y-2">
          <Button
            type="button"
            size="lg"
            className="h-14 w-full gap-2"
            onClick={captureLocation}
            disabled={sampling}
          >
            {sampling ? <IconLoader2 className="h-5 w-5 animate-spin" /> : <IconCurrentLocation className="h-5 w-5" />}
            {sampling ? 'Reading GPS... stay still' : 'Record school location'}
          </Button>
          <p className="text-center text-xs text-gray-500">
            Stand at the school gate or inside the compound, outdoors, then tap the button.
            {maxAccuracy ? ` Accuracy must be ${maxAccuracy} m or better.` : ''}
          </p>
          <button
            type="button"
            onClick={() => setManualOpen((o) => !o)}
            className="mx-auto flex min-h-[44px] items-center gap-1.5 text-sm text-primary-700 underline-offset-2 hover:underline"
          >
            <IconPencil className="h-4 w-4" />
            Enter coordinates manually
          </button>
          {manualOpen && (
            <div className="space-y-3 rounded-lg border border-gray-200 p-3">
              <Input
                label="Latitude"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 6.52441"
                value={manual.latitude}
                error={manualErrors.latitude}
                onChange={(e) => setManual((m) => ({ ...m, latitude: e.target.value }))}
              />
              <Input
                label="Longitude"
                type="text"
                inputMode="decimal"
                placeholder="e.g. 3.37921"
                value={manual.longitude}
                error={manualErrors.longitude}
                onChange={(e) => setManual((m) => ({ ...m, longitude: e.target.value }))}
              />
              <Button type="button" variant="outline" className="h-11 w-full" onClick={applyManual}>
                Use these coordinates
              </Button>
            </div>
          )}
        </div>
      )}

      {recorder && (
        <div className="space-y-3">
          <div className={`rounded-lg border p-3 ${recorder.source === 'gps' && band ? band.className : 'border-gray-200 bg-gray-50 text-gray-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <IconMapPin className="h-4 w-4 shrink-0" />
                  {recorder.source === 'gps' ? band?.label || 'Location recorded' : 'Entered manually'}
                </p>
                <p className="mt-1 break-all text-xs">{formatCoords(recorder.latitude, recorder.longitude, 6)}</p>
                {recorder.source === 'gps' && (
                  <p className="mt-0.5 text-xs">
                    GPS accuracy ±{recorder.accuracy} m{maxAccuracy ? ` (limit ${maxAccuracy} m)` : ''}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Discard and record again" onClick={resetRecorder}>
                <IconX className="h-5 w-5" />
              </Button>
            </div>
            {accuracyBlocks && (
              <p className="mt-2 text-xs font-medium">
                The signal is too weak to submit. Move outdoors, away from buildings and trees, then record again.
              </p>
            )}
          </div>
          <MapsButton latitude={recorder.latitude} longitude={recorder.longitude} label="Check it on the map" className="w-full" />
          <Button type="button" variant="outline" className="h-11 w-full" onClick={resetRecorder}>
            Record again
          </Button>

          <div>
            <Input
              label="Ward (optional)"
              list={`wards-${school.id}`}
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              placeholder="Ward"
            />
            <datalist id={`wards-${school.id}`}>
              {wardNames.map((w) => <option key={w} value={w} />)}
            </datalist>
          </div>
          <Input
            label="Address / landmark (optional)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, landmark or village"
            maxLength={255}
          />
          <Textarea
            label={school.requires_note ? 'Why does the approved location need to change?' : 'Note (optional)'}
            required={school.requires_note}
            rows={3}
            value={note}
            error={noteError}
            helperText={noteError || (school.requires_note ? 'At least 10 characters.' : undefined)}
            onChange={(e) => setNote(e.target.value)}
          />

          <Button
            type="button"
            size="lg"
            className="h-12 w-full"
            loading={submitting}
            disabled={submitting || accuracyBlocks}
            onClick={handleSubmit}
          >
            Submit location for approval
          </Button>
        </div>
      )}
    </div>
  );
}
