/**
 * Sessions API - MedeePay Pattern
 * Academic sessions endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a sessions API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Sessions API methods
 */
export function createSessionsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/sessions`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getCurrent: () => 
      apiClient.get(`${basePath}/current`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    setCurrent: (id) => 
      apiClient.post(`${basePath}/${id}/set-current`),
    
    getScoringSummary: (id) => 
      apiClient.get(`${basePath}/${id}/scoring-summary`),
    
    // Supervision visit timelines
    getSupervisionTimelines: (id) => 
      apiClient.get(`${basePath}/${id}/supervision-timelines`),
    
    saveSupervisionTimelines: (id, timelines) => 
      apiClient.put(`${basePath}/${id}/supervision-timelines`, { timelines }),
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
  return `/${institutionId}/sessions`;
}

export const sessionsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getCurrent: () => apiClient.get(`${getBasePath()}/current`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  setCurrent: (id) => apiClient.post(`${getBasePath()}/${id}/set-current`),
  getScoringSummary: (id) => apiClient.get(`${getBasePath()}/${id}/scoring-summary`),
  // Supervision visit timelines
  getSupervisionTimelines: (id) => apiClient.get(`${getBasePath()}/${id}/supervision-timelines`),
  saveSupervisionTimelines: (id, timelines) => apiClient.put(`${getBasePath()}/${id}/supervision-timelines`, { timelines }),
};
