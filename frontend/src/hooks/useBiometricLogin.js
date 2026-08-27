/**
 * useBiometricLogin
 *
 * Fingerprint/face login for staff - an ADDITIONAL way to log in on a device
 * where it's been enrolled, never a replacement for email+password (both
 * stay fully available side by side). Two independent flows:
 *
 * - enroll()/disable() - authenticated, used from the profile/security page.
 * - loginWithFingerprint(email) - public/pre-auth, used from the login page.
 *   The email comes from a locally remembered hint (see
 *   utils/biometricLoginHint.js), never typed by the user.
 */

import { useCallback, useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { authApi } from '../api';
import { getSubdomain } from './useSubdomain';
import {
  getBiometricLoginHint,
  setBiometricLoginHint,
  clearBiometricLoginHint,
} from '../utils/biometricLoginHint';

function mapWebAuthnError(err) {
  if (err?.name === 'NotAllowedError') {
    return 'Fingerprint confirmation was cancelled or timed out. Please try again, or use your password.';
  }
  if (err?.name === 'InvalidStateError') {
    return 'This device is already enrolled.';
  }
  if (err?.name === 'SecurityError') {
    return 'Fingerprint login requires a secure connection (HTTPS).';
  }
  return err?.response?.data?.message || err?.message || 'Fingerprint login failed. Please use your password.';
}

export function useBiometricLogin() {
  const [status, setStatus] = useState('idle'); // idle | enrolling | authenticating | error
  const [errorMessage, setErrorMessage] = useState(null);

  const hasLocalHint = useCallback(() => {
    return !!getBiometricLoginHint(getSubdomain());
  }, []);

  const enroll = useCallback(async (email, deviceLabel) => {
    setStatus('enrolling');
    setErrorMessage(null);
    try {
      const optionsResponse = await authApi.getBiometricEnrollmentOptions();
      const optionsJSON = optionsResponse.data.data;

      const registrationResponse = await startRegistration({ optionsJSON });

      await authApi.verifyBiometricEnrollment({
        response: registrationResponse,
        device_label: deviceLabel,
      });

      setBiometricLoginHint(getSubdomain(), email);
      setStatus('idle');
      return true;
    } catch (err) {
      setStatus('error');
      setErrorMessage(mapWebAuthnError(err));
      return false;
    }
  }, []);

  const disable = useCallback(async () => {
    setStatus('idle');
    setErrorMessage(null);
    try {
      await authApi.disableBiometricLogin();
      clearBiometricLoginHint(getSubdomain());
      return true;
    } catch (err) {
      setErrorMessage(mapWebAuthnError(err));
      return false;
    }
  }, []);

  const loginWithFingerprint = useCallback(async () => {
    const hint = getBiometricLoginHint(getSubdomain());
    if (!hint?.email) {
      return null;
    }

    setStatus('authenticating');
    setErrorMessage(null);
    try {
      const optionsResponse = await authApi.getBiometricLoginOptions(hint.email);
      const optionsJSON = optionsResponse.data.data;
      const authenticationResponse = await startAuthentication({ optionsJSON });

      const verifyResponse = await authApi.verifyBiometricLogin(hint.email, authenticationResponse);

      setStatus('idle');
      return verifyResponse.data.data;
    } catch (err) {
      setStatus('error');
      // A generic BIOMETRIC_LOGIN_UNAVAILABLE (account no longer has this
      // credential, e.g. disabled elsewhere or admin-cleared) - stop
      // remembering this device rather than showing the button forever.
      if (err?.response?.data?.errorCode === 'BIOMETRIC_LOGIN_UNAVAILABLE') {
        clearBiometricLoginHint(getSubdomain());
      }
      setErrorMessage(mapWebAuthnError(err));
      return null;
    }
  }, []);

  return {
    status,
    errorMessage,
    hasLocalHint,
    enroll,
    disable,
    loginWithFingerprint,
  };
}

export default useBiometricLogin;
