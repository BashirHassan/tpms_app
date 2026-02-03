/**
 * Allowances API - MedeePay Pattern
 * Posting allowances endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create an allowances API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Allowances API methods
 */
export function createAllowancesApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/allowances`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getSummaryStats: (sessionId) =>
      apiClient.get(`${basePath}/statistics`, { params: { session_id: sessionId } }),
    
    getAllowancesBySupervisor: (sessionId) =>
      apiClient.get(`${basePath}/by-supervisor`, { params: { session_id: sessionId } }),
    
    getAllowancesByVisit: (sessionId) =>
      apiClient.get(`${basePath}/by-visit`, { params: { session_id: sessionId } }),
    
    getAllowancesBySupervisorAndVisit: (sessionId, visitNumber = null) =>
      apiClient.get(`${basePath}/by-supervisor-visit`, { 
        params: { session_id: sessionId, ...(visitNumber ? { visit_number: visitNumber } : {}) } 
      }),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
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
  return `/${institutionId}/allowances`;
}

export const allowancesApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getSummaryStats: (sessionId) => apiClient.get(`${getBasePath()}/statistics`, { params: { session_id: sessionId } }),
  getAllowancesBySupervisor: (sessionId) => apiClient.get(`${getBasePath()}/by-supervisor`, { params: { session_id: sessionId } }),
  getAllowancesByVisit: (sessionId) => apiClient.get(`${getBasePath()}/by-visit`, { params: { session_id: sessionId } }),
  getAllowancesBySupervisorAndVisit: (sessionId, visitNumber = null) => 
    apiClient.get(`${getBasePath()}/by-supervisor-visit`, { 
      params: { session_id: sessionId, ...(visitNumber ? { visit_number: visitNumber } : {}) } 
    }),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
};
