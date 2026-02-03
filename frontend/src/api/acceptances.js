/**
 * Acceptances API - MedeePay Pattern
 * Student acceptances with Cloudinary uploads
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create an acceptances API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Acceptances API methods
 */
export function createAcceptancesApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/acceptances`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getByStudent: (studentId) => 
      apiClient.get(`${basePath}/student/${studentId}`),
    
    getStatistics: (sessionId) =>
      apiClient.get(`${basePath}/statistics`, { params: { session_id: sessionId } }),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    // File upload to Cloudinary
    uploadDocument: (id, file) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post(`${basePath}/${id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    
    // Bulk operations
    bulkCreate: (data) => 
      apiClient.post(`${basePath}/bulk`, data),
    
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
  return `/${institutionId}/acceptances`;
}

export const acceptancesApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getByStudent: (studentId) => apiClient.get(`${getBasePath()}/student/${studentId}`),
  getStatistics: (sessionId) => apiClient.get(`${getBasePath()}/statistics`, { params: { session_id: sessionId } }),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  // Review acceptance (approve/reject) - calls update endpoint
  review: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  uploadDocument: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`${getBasePath()}/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  bulkCreate: (data) => apiClient.post(`${getBasePath()}/bulk`, data),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
  // Student portal methods (use /portal paths, not institution-scoped)
  getStudentStatus: () => apiClient.get('/portal/acceptance/status'),
  getAvailableSchools: (params = {}) => apiClient.get('/portal/acceptance/schools', { params }),
  submit: (data) => apiClient.post('/portal/acceptance/submit', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};
