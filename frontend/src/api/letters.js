/**
 * Letters API - MedeePay Pattern
 * Posting letters endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a letters API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Letters API methods
 */
export function createLettersApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/letters`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getByPosting: (postingId) => 
      apiClient.get(`${basePath}/posting/${postingId}`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    generate: (postingId, data) => 
      apiClient.post(`${basePath}/generate/${postingId}`, data),
    
    download: (id) => 
      apiClient.get(`${basePath}/${id}/download`, { responseType: 'blob' }),
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
  return `/${institutionId}/letters`;
}

export const lettersApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getByPosting: (postingId) => apiClient.get(`${getBasePath()}/posting/${postingId}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  generate: (postingId, data) => apiClient.post(`${getBasePath()}/generate/${postingId}`, data),
  download: (id) => apiClient.get(`${getBasePath()}/${id}/download`, { responseType: 'blob' }),
};
