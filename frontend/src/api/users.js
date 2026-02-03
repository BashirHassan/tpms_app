/**
 * Users API - MedeePay Pattern
 * User management within institution
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a users API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Users API methods
 */
export function createUsersApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/users`;

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
    
    resendCredentials: (id) => 
      apiClient.post(`${basePath}/${id}/resend-credentials`),
    
    hardResetPassword: (id) =>
      apiClient.post(`${basePath}/${id}/hard-reset-password`),
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
  return `/${institutionId}/users`;
}

export const usersApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  resendCredentials: (id) => apiClient.post(`${getBasePath()}/${id}/resend-credentials`),
  hardResetPassword: (id) => apiClient.post(`${getBasePath()}/${id}/hard-reset-password`),
};
