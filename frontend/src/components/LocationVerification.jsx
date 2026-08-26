/**
 * Location Verification Component
 *
 * Captures supervisor GPS location (multi-sampled for a few seconds to improve
 * fix quality) and verifies against school geofence. Includes device
 * fingerprinting for anti-cheating.
 *
 * Usage:
 * <LocationVerification
 *   posting={currentPosting}
 *   onVerified={(result) => { ... }}
 *   onError={(error) => { ... }}
 * />
 */

import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { locationApi } from '../api';
import { formatDistance, MAX_SUPERVISOR_LOCATION_ACCURACY_M } from '../utils/helpers';
import { useGeolocation } from '../hooks/useGeolocation';
import {
  IconMapPin,
  IconCheck,
  IconAlertTriangle,
  IconCurrentLocation,
  IconRefresh,
  IconMapPinOff,
  IconClockHour4,
} from '@tabler/icons-react';
import { Button } from './ui/Button';

const MAX_SAMPLES = 8;

/**
 * Generate unique device ID (stored in localStorage)
 */
const getOrCreateDeviceId = () => {
  const KEY = 'digitaltp_device_id';
  let deviceId = localStorage.getItem(KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(KEY, deviceId);
  }
  return deviceId;
};

/**
 * Generate device fingerprint for anti-cheating
 */
const generateDeviceInfo = () => {
  return {
    device_id: getOrCreateDeviceId(),
    model: navigator.userAgentData?.platform || navigator.platform || 'Unknown',
    os: navigator.userAgentData?.platform || navigator.platform || 'Unknown',
    browser: navigator.userAgent.split(' ').pop() || 'Unknown',
    screen: `${screen.width}x${screen.height}`,
    language: navigator.language,
  };
};

export function LocationVerification({
  posting,
  onVerified,
  onError,
  showSchoolInfo = true,
  className = '',
}) {
  const { toast } = useToast();
  const {
    status: gpsStatus,
    bestSample,
    samplesCollected,
    errorMessage: gpsError,
    start: startSampling,
  } = useGeolocation({ maxSamples: MAX_SAMPLES });
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle, submitting, success, error
  const [verificationResult, setVerificationResult] = useState(null);

  const location = bestSample;
  const accuracyTooLow = location && location.accuracy_meters > MAX_SUPERVISOR_LOCATION_ACCURACY_M;

  /**
   * Submit location for verification
   */
  const submitLocation = async () => {
    if (!location) {
      toast.error('No location captured. Please get location first.');
      return;
    }

    setSubmitStatus('submitting');
    setVerificationResult(null);

    try {
      const deviceInfo = generateDeviceInfo();

      const response = await locationApi.verifyLocation({
        posting_id: posting.posting_id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_meters: location.accuracy_meters,
        altitude_meters: location.altitude_meters,
        timestamp_client: location.timestamp,
        device_info: deviceInfo,
      });

      const result = response.data.data;
      setVerificationResult(result);

      if (result?.reason_code === 'PENDING_REVIEW') {
        setSubmitStatus('pending');
        toast.info('Location recorded, flagged for admin review.');
      } else {
        setSubmitStatus('success');
        toast.success('Location verified successfully!');
        onVerified?.(result);
      }
    } catch (err) {
      setSubmitStatus('error');
      const result = err.response?.data?.data;
      if (result) {
        setVerificationResult(result);
      }
      const message = err.response?.data?.message || 'Failed to verify location';
      // Only call onError for real API failures, not geofence/accuracy rejections
      // (those have a result payload the UI renders a dedicated card for).
      if (!result) {
        onError?.(message);
      }
    }
  };

  // Auto-start GPS sampling on mount if not already verified
  useEffect(() => {
    if (posting && !posting.location_verified && posting.has_coordinates && gpsStatus === 'idle') {
      startSampling();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = mount only

  // Already verified - show success state
  if (posting?.location_verified) {
    return (
      <div className={`rounded-lg border border-green-200 bg-green-50 p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
            <IconCheck className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="font-medium text-green-800">Location Verified</p>
            <p className="text-sm text-green-600">
              {posting.location_verified_at
                ? `Verified on ${new Date(posting.location_verified_at).toLocaleString()}`
                : 'Your location has been verified for this posting'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="flex items-center gap-2 text-lg font-medium text-gray-900">
          <IconMapPin className="h-5 w-5 text-primary-600" />
          Location Verification Required
        </h3>
      </div>

      <div className="space-y-4 p-4">
        {/* School info */}
        {showSchoolInfo && posting && (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="font-medium text-gray-900">{posting.school_name}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                Group {posting.group_number}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                Visit {posting.visit_number}
              </span>
              {posting.has_coordinates ? (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  GPS Available
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                  No GPS Set
                </span>
              )}
            </div>
          </div>
        )}

        {/* No GPS coordinates warning */}
        {!posting?.has_coordinates && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <IconAlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800">School GPS Not Set</p>
                <p className="text-sm text-amber-700">
                  This school does not have GPS coordinates configured. Please contact the TP office to
                  update the school location.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* GPS sampling progress */}
        {gpsStatus === 'sampling' && (
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-800">
              Sampling GPS… {samplesCollected}/{MAX_SAMPLES} fixes
              {location ? `, best so far ±${Math.round(location.accuracy_meters || 0)}m` : ''}
            </p>
          </div>
        )}

        {/* GPS acquisition error (permission denied, unavailable, etc.) */}
        {gpsStatus === 'error' && gpsError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-700">{gpsError}</p>
          </div>
        )}

        {/* Current location display */}
        {location && (
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="mb-1 text-sm font-medium text-blue-800">Your Current Location</p>
            <p className="font-mono text-xs text-blue-700">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs">
              <span className={accuracyTooLow ? 'font-medium text-red-600' : 'text-blue-600'}>
                Accuracy: ±{Math.round(location.accuracy_meters || 0)}m
                {accuracyTooLow ? ` (needs ≤${MAX_SUPERVISOR_LOCATION_ACCURACY_M}m)` : ''}
              </span>
            </div>
          </div>
        )}

        {/* Rejected: outside geofence */}
        {verificationResult?.reason_code === 'OUTSIDE_GEOFENCE' && (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <IconMapPinOff className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-red-800">Outside Geofence Area</h4>
                <p className="mt-1 text-sm text-red-700">
                  You are too far from <strong>{verificationResult.school_name}</strong> to verify your location.
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/60 p-3 text-center">
                <p className="text-xs font-medium uppercase text-red-600">Your Distance</p>
                <p className="mt-1 text-xl font-bold text-red-800">
                  {formatDistance(verificationResult.distance_from_school_m)}
                </p>
              </div>
              <div className="rounded-lg bg-white/60 p-3 text-center">
                <p className="text-xs font-medium uppercase text-green-600">Required</p>
                <p className="mt-1 text-xl font-bold text-green-700">
                  Within {formatDistance(verificationResult.geofence_radius_m)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-800">
                <strong>💡 Tip:</strong> Please move closer to the school and tap &quot;Refresh Location&quot; to try again.
              </p>
            </div>
          </div>
        )}

        {/* Rejected: GPS accuracy too imprecise */}
        {verificationResult?.reason_code === 'LOW_ACCURACY' && (
          <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                <IconMapPinOff className="h-6 w-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-red-800">GPS Accuracy Too Low</h4>
                <p className="mt-1 text-sm text-red-700">
                  Your GPS fix isn&apos;t precise enough to verify your location. Move to an open area,
                  away from tall buildings, and try again.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pending: flagged for admin review */}
        {verificationResult?.reason_code === 'PENDING_REVIEW' && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                <IconClockHour4 className="h-6 w-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-amber-800">Flagged for Review</h4>
                <p className="mt-1 text-sm text-amber-700">
                  Your location was recorded but flagged for review by an administrator before it can be
                  used to unlock result upload. You&apos;ll be notified once it&apos;s reviewed.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {posting?.has_coordinates && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={startSampling}
              loading={gpsStatus === 'sampling'}
              disabled={submitStatus === 'submitting'}
              className="flex-1 gap-2"
            >
              <IconRefresh className="h-4 w-4" />
              {gpsStatus === 'sampling' ? 'Getting Location...' : 'Refresh Location'}
            </Button>

            <Button
              variant="primary"
              onClick={submitLocation}
              loading={submitStatus === 'submitting'}
              disabled={!location || accuracyTooLow || gpsStatus === 'sampling'}
              className="flex-1 gap-2"
            >
              <IconCurrentLocation className="h-4 w-4" />
              {submitStatus === 'submitting' ? 'Verifying...' : 'Verify Location'}
            </Button>
          </div>
        )}

        {/* Info text */}
        <p className="text-center text-xs text-gray-500">
          You must be physically at the school to verify your location.
          <br />
          GPS accuracy and device information are recorded for audit purposes.
        </p>
      </div>
    </div>
  );
}

export default LocationVerification;
