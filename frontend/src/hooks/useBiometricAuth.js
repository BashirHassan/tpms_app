/**
 * useBiometricAuth
 *
 * Wraps WebAuthn platform-authenticator (Android/Windows/Mac built-in
 * fingerprint or face) enrollment and check-in assertion around the
 * biometricApi endpoints, for gating supervisor location check-ins so a
 * colleague holding the supervisor's own already-logged-in phone can't
 * check in on their behalf.
 */

import { useCallback, useState } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import { biometricApi } from '../api';
import { getOrCreateDeviceId } from '../utils/deviceId';

function mapWebAuthnError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Fingerprint confirmation was cancelled or timed out. Please try again.';
  }
  if (err?.name === 'InvalidStateError') {
    return 'This device is already enrolled.';
  }
  if (err?.name === 'SecurityError') {
    return 'Biometric verification requires a secure connection (HTTPS).';
  }
  return err?.response?.data?.message || err?.message || 'Biometric verification failed.';
}

export function useBiometricAuth() {
  const [status, setStatus] = useState('idle'); // idle | checking | enrolling | authenticating | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [hasEnrolledDevice, setHasEnrolledDevice] = useState(null); // null = unknown yet

  const checkSupport = useCallback(async () => {
    if (!browserSupportsWebAuthn()) return false;
    try {
      return await platformAuthenticatorIsAvailable();
    } catch {
      return false;
    }
  }, []);

  const checkEnrollment = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    try {
      const response = await biometricApi.listCredentials();
      const credentials = response.data.data || [];
      setHasEnrolledDevice(credentials.length > 0);
      setStatus('idle');
      return credentials;
    } catch (err) {
      setStatus('error');
      setErrorMessage(mapWebAuthnError(err));
      return [];
    }
  }, []);

  const enroll = useCallback(async (deviceLabel) => {
    setStatus('enrolling');
    setErrorMessage(null);
    try {
      const optionsResponse = await biometricApi.getRegistrationOptions();
      const optionsJSON = optionsResponse.data.data;

      const registrationResponse = await startRegistration({ optionsJSON });
      const deviceId = await getOrCreateDeviceId();

      await biometricApi.verifyRegistration({
        response: registrationResponse,
        device_label: deviceLabel,
        device_id: deviceId,
      });

      setHasEnrolledDevice(true);
      setStatus('idle');
      return true;
    } catch (err) {
      setStatus('error');
      setErrorMessage(mapWebAuthnError(err));
      return false;
    }
  }, []);

  const authenticate = useCallback(async () => {
    setStatus('authenticating');
    setErrorMessage(null);
    try {
      const optionsResponse = await biometricApi.getAuthenticationOptions();
      const optionsJSON = optionsResponse.data.data;
      const authenticationResponse = await startAuthentication({ optionsJSON });

      const verifyResponse = await biometricApi.verifyAuthentication({
        response: authenticationResponse,
      });

      setStatus('idle');
      return verifyResponse.data.data.biometric_token;
    } catch (err) {
      if (err?.response?.data?.data?.reason_code === 'NOT_ENROLLED') {
        setHasEnrolledDevice(false);
        setStatus('error');
        setErrorMessage('No biometric device enrolled yet. Please enroll first.');
        return null;
      }
      setStatus('error');
      setErrorMessage(mapWebAuthnError(err));
      return null;
    }
  }, []);

  return {
    status,
    errorMessage,
    hasEnrolledDevice,
    checkSupport,
    checkEnrollment,
    enroll,
    authenticate,
  };
}

export default useBiometricAuth;
