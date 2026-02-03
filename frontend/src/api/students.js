/**
 * Students API - MedeePay Pattern
 * Student management with Excel upload
 * 
 * This module exports a function that creates an API bound to a specific institution.
 * 
 * Usage with hook:
 *   const { get, post } = useInstitutionApi();
 *   const students = await get('/students');
 * 
 * Usage with factory (for non-React contexts):
 *   const api = createStudentsApi(institutionId);
 *   const students = await api.getAll();
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a students API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Students API methods
 */
export function createStudentsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/students`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    resetPin: (id) => 
      apiClient.post(`${basePath}/${id}/reset-pin`),
    
    // Bulk operations
    bulkDetect: (registrationNumbers) =>
      apiClient.post(`${basePath}/bulk-detect`, { registration_numbers: registrationNumbers }),
    
    upload: (file, validateOnly = false) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post(`${basePath}/upload?validate_only=${validateOnly}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    
    downloadTemplate: () =>
      apiClient.get(`${basePath}/template`, { responseType: 'blob' }),
    
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
  return `/${institutionId}/students`;
}

export const studentsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  resetPin: (id) => apiClient.post(`${getBasePath()}/${id}/reset-pin`),
  bulkDetect: (registrationNumbers) => apiClient.post(`${getBasePath()}/bulk-detect`, { registration_numbers: registrationNumbers }),
  upload: (file, validateOnly = false) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`${getBasePath()}/upload?validate_only=${validateOnly}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadTemplate: () => apiClient.get(`${getBasePath()}/template`, { responseType: 'blob' }),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
};
