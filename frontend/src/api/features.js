/**
 * Features API - MedeePay Pattern
 * Feature toggles endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a features API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Features API methods
 */
export function createFeaturesApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/features`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getEnabled: () =>
      apiClient.get(`${basePath}/enabled`),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getByKey: (key) => 
      apiClient.get(`${basePath}/key/${key}`),
    
    create: (data) =>
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    toggle: (id, enabled) => 
      apiClient.patch(`${basePath}/${id}/toggle`, { enabled }),
    
    delete: (id) =>
      apiClient.delete(`${basePath}/${id}`),
    
    bulkUpdate: (features) => 
      apiClient.put(`${basePath}/bulk`, { features }),
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
  return `/${institutionId}/features`;
}

export const featuresApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getEnabled: () => apiClient.get(`${getBasePath()}/enabled`),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getByKey: (key) => apiClient.get(`${getBasePath()}/key/${key}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  toggle: (id, enabled) => apiClient.patch(`${getBasePath()}/${id}/toggle`, { enabled }),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  bulkUpdate: (features) => apiClient.put(`${getBasePath()}/bulk`, { features }),
};
