/**
 * Biometric (WebAuthn) API
 *
 * API module for supervisor platform-authenticator (fingerprint/face)
 * enrollment and check-in assertion.
 */

import client, { getCurrentInstitutionId } from './client';

export const biometricApi = {
  /**
   * Get WebAuthn registration options for enrolling a new device
   */
  getRegistrationOptions: () => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/biometric/register/options`);
  },

  /**
   * Submit the browser's registration response to complete enrollment
   * @param {Object} data
   * @param {Object} data.response - The WebAuthn RegistrationResponseJSON
   * @param {string} [data.device_label] - User-facing label for the device
   */
  verifyRegistration: (data) => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/biometric/register/verify`, data);
  },

  /**
   * Get WebAuthn authentication options for a check-in assertion
   */
  getAuthenticationOptions: () => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/biometric/auth/options`);
  },

  /**
   * Submit the browser's authentication response, returns a short-lived
   * biometric_token to include in locationApi.verifyLocation
   * @param {Object} data
   * @param {Object} data.response - The WebAuthn AuthenticationResponseJSON
   */
  verifyAuthentication: (data) => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/biometric/auth/verify`, data);
  },

  /**
   * Self-only: whether the caller has an enrolled device (used to gate the
   * check-in UI). Full device management is admin-only, see below.
   */
  listCredentials: () => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/biometric/credentials`);
  },

  // =====================================================
  // Admin endpoints (Head of TP+) - device management
  // =====================================================

  /**
   * List enrolled biometric devices across all supervisors in the institution
   * @param {Object} [params]
   * @param {number} [params.supervisor_id] - Filter by supervisor
   * @param {boolean} [params.include_revoked] - Include revoked devices
   */
  adminListCredentials: (params = {}) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/biometric/admin/credentials`, { params });
  },

  /**
   * Revoke any supervisor's enrolled device (lost/compromised phone, offboarding)
   * @param {number} credentialId
   */
  adminRevokeCredential: (credentialId) => {
    const institutionId = getCurrentInstitutionId();
    return client.delete(`/${institutionId}/biometric/admin/credentials/${credentialId}`);
  },

  /**
   * List supervisors with their biometric exemption status - for supervisors
   * with no WebAuthn-capable device
   */
  adminListExemptions: () => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/biometric/admin/exemptions`);
  },

  /**
   * Grant or revoke a supervisor's exemption from the biometric check-in gate
   * @param {number} supervisorId
   * @param {Object} data
   * @param {boolean} data.exempt
   * @param {string} [data.reason] - Required when exempt is true (min 10 chars)
   */
  adminSetExemption: (supervisorId, data) => {
    const institutionId = getCurrentInstitutionId();
    return client.patch(`/${institutionId}/biometric/admin/exemptions/${supervisorId}`, data);
  },
};

export default biometricApi;
