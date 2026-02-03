/**
 * Location Tracking API
 *
 * API module for supervisor location verification (geofencing).
 */

import client, { getCurrentInstitutionId } from './client';

export const locationApi = {
  /**
   * Verify supervisor's location for a posting
   * @param {Object} data - Location data
   * @param {number} data.posting_id - The posting ID
   * @param {number} data.latitude - GPS latitude
   * @param {number} data.longitude - GPS longitude
   * @param {number} [data.accuracy_meters] - GPS accuracy
   * @param {number} [data.altitude_meters] - GPS altitude
   * @param {string} [data.timestamp_client] - Client timestamp
   * @param {Object} [data.device_info] - Device fingerprint info
   */
  verifyLocation: (data) => {
    const institutionId = getCurrentInstitutionId();
    return client.post(`/${institutionId}/location/verify`, data);
  },

  /**
   * Get all postings with their location verification status
   * @param {Object} [params] - Query params
   * @param {number} [params.session_id] - Filter by session
   */
  getMyPostingsLocationStatus: (params = {}) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/my-postings`, { params });
  },

  /**
   * Check location verification status for a specific posting
   * @param {number} postingId - The posting ID
   */
  checkLocationVerification: (postingId) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/check/${postingId}`);
  },

  // =====================================================
  // Admin endpoints
  // =====================================================

  /**
   * Get all location verification logs
   * @param {Object} [params] - Query params
   * @param {number} [params.session_id] - Filter by session
   * @param {number} [params.supervisor_id] - Filter by supervisor
   * @param {number} [params.school_id] - Filter by school
   * @param {boolean} [params.device_shared] - Show only shared device entries
   * @param {number} [params.page] - Page number
   * @param {number} [params.limit] - Items per page
   */
  getLocationLogs: (params = {}) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/admin/logs`, { params });
  },

  /**
   * Get location verification statistics
   * @param {Object} [params] - Query params
   * @param {number} [params.session_id] - Filter by session
   */
  getLocationStats: (params = {}) => {
    const institutionId = getCurrentInstitutionId();
    return client.get(`/${institutionId}/location/admin/stats`, { params });
  },
};

export default locationApi;
