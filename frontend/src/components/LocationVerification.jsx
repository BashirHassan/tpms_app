/**
 * Location Verification Component
 *
 * Captures supervisor GPS location and verifies against school geofence.
 * Includes device fingerprinting for anti-cheating.
 *
 * Usage:
 * <LocationVerification
 *   posting={currentPosting}
 *   onVerified={(result) => { ... }}
 *   onError={(error) => { ... }}
 * />
 */

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { locationApi } from '../api';
import { formatDistance } from '../utils/helpers';
import {
  IconMapPin,
  IconCheck,
  IconLoader2,
  IconAlertTriangle,
  IconCurrentLocation,
  IconRefresh,
  IconMapPinOff,
} from '@tabler/icons-react';
import { Button } from './ui/Button';

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
  const [status, setStatus] = useState('idle'); // idle, locating, submitting, success, error
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);

  /**
   * Get current GPS location
   */
  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      const msg = 'Geolocation is not supported by your browser';
      setError(msg);
      setStatus('error');
      onError?.(msg);
      return;
    }

    setStatus('locating');
    setError(null);
    setVerificationResult(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy,
          altitude_meters: position.coords.altitude,
          timestamp: new Date().toISOString(),
        });
        setStatus('ready');
      },
      (geoError) => {
        let message = 'Failed to get location';
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            message = 'Location permission denied. Please allow location access in your browser settings.';
            break;
          case geoError.POSITION_UNAVAILABLE:
            message = 'Location unavailable. Please check your GPS/location settings.';
            break;
          case geoError.TIMEOUT:
            message = 'Location request timed out. Please try again.';
            break;
        }
        setError(message);
        setStatus('error');
        onError?.(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0, // Don't use cached position
      }
    );
  }, [onError]);

  /**
   * Submit location for verification
   */
  const submitLocation = async () => {
    if (!location) {
      toast.error('No location captured. Please get location first.');
      return;
    }

    setStatus('submitting');
    setError(null);

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

      if (response.data.success) {
        setStatus('success');
        toast.success('Location verified successfully!');
        onVerified?.(result);
      } else {
        // Outside geofence - show in UI, don't toast (avoid duplicates)
        setStatus('error');
        setError(response.data.message);
      }
    } catch (err) {
      setStatus('error');
      const result = err.response?.data?.data;
      if (result) {
        setVerificationResult(result);
      }
      const message = err.response?.data?.message || 'Failed to verify location';
      setError(message);
      // Only call onError for real API failures, not geofence failures
      if (!result) {
        onError?.(message);
      }
    }
  };

  // Auto-get location on mount if not already verified
  // Only run once on mount to prevent clearing user's error state
  useEffect(() => {
    if (posting && !posting.location_verified && posting.has_coordinates && status === 'idle') {
      getLocation();
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

        {/* Current location display */}
        {location && (
          <div className="rounded-lg bg-blue-50 p-3">
            <p className="mb-1 text-sm font-medium text-blue-800">Your Current Location</p>
            <p className="font-mono text-xs text-blue-700">
              {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
            </p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-blue-600">
              <span>Accuracy: ±{Math.round(location.accuracy_meters || 0)}m</span>
            </div>
          </div>
        )}

        {/* Outside geofence result - Enhanced error display */}
        {verificationResult && !verificationResult.is_within_geofence && (
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

            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-800">
                <strong>💡 Tip:</strong> Please move closer to the school and tap "Refresh Location" to try again.
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {posting?.has_coordinates && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={getLocation}
              loading={status === 'locating'}
              disabled={status === 'submitting'}
              className="flex-1 gap-2"
            >
              <IconRefresh className="h-4 w-4" />
              {status === 'locating' ? 'Getting Location...' : 'Refresh Location'}
            </Button>

            <Button
              variant="primary"
              onClick={submitLocation}
              loading={status === 'submitting'}
              disabled={!location || status === 'locating'}
              className="flex-1 gap-2"
            >
              <IconCurrentLocation className="h-4 w-4" />
              {status === 'submitting' ? 'Verifying...' : 'Verify Location'}
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
