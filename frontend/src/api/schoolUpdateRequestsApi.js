/**
 * School Update Requests API - MedeePay Pattern
 * Admin endpoints for managing school update requests
 * 
 * Uses institutionId in URL path per MedeePay pattern
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Get base path with institution ID
 * @returns {string} Base path for school update requests API
 */
function getBasePath() {
  const institutionId = getCurrentInstitutionId();
  if (!institutionId) {
    throw new Error('No institution selected. Please select an institution first.');
  }
  return `/${institutionId}/school-update-requests`;
}

export const schoolUpdateRequestsApi = {
  // ================================
  // Principal Update Requests
  // ================================

  /**
   * Get all principal update requests
   */
  getPrincipalRequests: (params = {}) =>
    apiClient.get(`${getBasePath()}/principal`, { params }),

  /**
   * Get principal update request by ID
   */
  getPrincipalRequestById: (id) =>
    apiClient.get(`${getBasePath()}/principal/${id}`),

  /**
   * Get principal update requests statistics
   */
  getPrincipalStatistics: (sessionId = null) =>
    apiClient.get(`${getBasePath()}/principal/statistics`, {
      params: sessionId ? { session_id: sessionId } : {},
    }),

  /**
   * Approve principal update request
   */
  approvePrincipalRequest: (id, adminNotes = null) =>
    apiClient.post(`${getBasePath()}/principal/${id}/approve`, {
      admin_notes: adminNotes,
    }),

  /**
   * Reject principal update request
   */
  rejectPrincipalRequest: (id, rejectionReason, adminNotes = null) =>
    apiClient.post(`${getBasePath()}/principal/${id}/reject`, {
      rejection_reason: rejectionReason,
      admin_notes: adminNotes,
    }),

  // ================================
  // Location Update Requests
  // ================================

  /**
   * Get all location update requests
   */
  getLocationRequests: (params = {}) =>
    apiClient.get(`${getBasePath()}/location`, { params }),

  /**
   * Get location update request by ID
   */
  getLocationRequestById: (id) =>
    apiClient.get(`${getBasePath()}/location/${id}`),

  /**
   * Get location update requests statistics
   */
  getLocationStatistics: (sessionId = null) =>
    apiClient.get(`${getBasePath()}/location/statistics`, {
      params: sessionId ? { session_id: sessionId } : {},
    }),

  /**
   * Approve location update request
   */
  approveLocationRequest: (id, adminNotes = null) =>
    apiClient.post(`${getBasePath()}/location/${id}/approve`, {
      admin_notes: adminNotes,
    }),

  /**
   * Reject location update request
   */
  rejectLocationRequest: (id, rejectionReason, adminNotes = null) =>
    apiClient.post(`${getBasePath()}/location/${id}/reject`, {
      rejection_reason: rejectionReason,
      admin_notes: adminNotes,
    }),
};

export default schoolUpdateRequestsApi;
