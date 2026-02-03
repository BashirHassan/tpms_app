/**
 * Payments API - MedeePay Pattern
 * Student payments with Paystack integration
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a payments API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Payments API methods
 */
export function createPaymentsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/payments`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getByStudent: (studentId) => 
      apiClient.get(`${basePath}/student/${studentId}`),
    
    // Initialize Paystack payment
    initialize: (data) => 
      apiClient.post(`${basePath}/initialize`, data),
    
    // Verify Paystack payment
    verify: (reference) => 
      apiClient.get(`${basePath}/verify/${reference}`),
    
    // Manual payment recording
    recordManual: (data) => 
      apiClient.post(`${basePath}/manual`, data),
    
    // Statistics
    getStatistics: (params = {}) => 
      apiClient.get(`${basePath}/statistics`, { params }),
    
    export: (params = {}) =>
      apiClient.get(`${basePath}/export`, { params, responseType: 'blob' }),
  };
}

// ============================================================================
// Legacy exports for backward compatibility
// These automatically use getCurrentInstitutionId() to get the institution context
// ============================================================================

function getBasePath() {
  const institutionId = getCurrentInstitutionId();
  if (!institutionId) {
    throw new Error('No institution selected. Please select an institution first.');
  }
  return `/${institutionId}/payments`;
}

export const paymentsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getByStudent: (studentId) => apiClient.get(`${getBasePath()}/student/${studentId}`),
  initialize: (data) => apiClient.post(`${getBasePath()}/initialize`, data),
  verify: (reference) => apiClient.get(`${getBasePath()}/verify/${reference}`),
  recordManual: (data) => apiClient.post(`${getBasePath()}/manual`, data),
  getStats: (params = {}) => apiClient.get(`${getBasePath()}/stats`, { params }),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
  // Admin payment verification (verify pending payments with Paystack)
  verifyPaystack: (reference) => apiClient.post(`${getBasePath()}/verify-paystack`, { reference }),
  cancelPayment: (id) => apiClient.post(`${getBasePath()}/${id}/cancel`),
  // Student portal methods (use /portal paths)
  getStudentStatus: (sessionId) => apiClient.get('/portal/payments/status', { params: { session_id: sessionId } }),
  initializePayment: (sessionId) => apiClient.post('/portal/payments/initialize', { session_id: sessionId }),
  verifyPayment: (reference) => apiClient.post('/portal/payments/verify', { reference }),
};
