/**
 * School Update Requests API - MedeePay Pattern
 * School location and principal update requests
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a school update requests API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} School Update Requests API methods
 */
export function createSchoolUpdateRequestsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/school-update-requests`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getBySchool: (schoolId) => 
      apiClient.get(`${basePath}/school/${schoolId}`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    approve: (id) => 
      apiClient.post(`${basePath}/${id}/approve`),
    
    reject: (id, reason) => 
      apiClient.post(`${basePath}/${id}/reject`, { reason }),
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
  return `/${institutionId}/school-update-requests`;
}

export const schoolUpdateRequestsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getBySchool: (schoolId) => apiClient.get(`${getBasePath()}/school/${schoolId}`),
  create: (data) => apiClient.post(getBasePath(), data),
  approve: (id) => apiClient.post(`${getBasePath()}/${id}/approve`),
  reject: (id, reason) => apiClient.post(`${getBasePath()}/${id}/reject`, { reason }),
};
