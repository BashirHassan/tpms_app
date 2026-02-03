/**
 * Settings API - MedeePay Pattern
 * Institution settings endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a settings API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Settings API methods
 */
export function createSettingsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/settings`;

  return {
    get: () => 
      apiClient.get(basePath),
    
    update: (data) => 
      apiClient.put(basePath, data),
    
    // SMTP settings
    getSmtp: () => 
      apiClient.get(`${basePath}/smtp`),
    
    updateSmtp: (data) => 
      apiClient.put(`${basePath}/smtp`, data),
    
    testSmtp: () => 
      apiClient.post(`${basePath}/smtp/test`),
    
    // Dashboard
    getDashboard: () => 
      apiClient.get(`${basePath}/dashboard`),
    
    // API Keys / SSO
    getApiKeys: () =>
      apiClient.get(`${basePath}/api-keys`),
    
    createApiKeys: (data) =>
      apiClient.post(`${basePath}/api-keys`, data),
    
    regenerateSecretKey: () =>
      apiClient.post(`${basePath}/api-keys/regenerate`),
    
    toggleSSO: (enabled) =>
      apiClient.patch(`${basePath}/api-keys/toggle`, { enabled }),
    
    updateAllowedOrigins: (allowedOrigins) =>
      apiClient.patch(`${basePath}/api-keys/origins`, { allowedOrigins }),
    
    deleteApiKeys: () =>
      apiClient.delete(`${basePath}/api-keys`),
    
    getSSOLogs: (params) =>
      apiClient.get(`${basePath}/api-keys/logs`, { params }),
    
    getSSOStats: () =>
      apiClient.get(`${basePath}/api-keys/stats`),
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
  return `/${institutionId}/settings`;
}

export const settingsApi = {
  get: () => apiClient.get(getBasePath()),
  update: (data) => apiClient.put(getBasePath(), data),
  getSmtp: () => apiClient.get(`${getBasePath()}/smtp`),
  updateSmtp: (data) => apiClient.put(`${getBasePath()}/smtp`, data),
  testSmtp: () => apiClient.post(`${getBasePath()}/smtp/test`),
  getDashboard: () => apiClient.get(`${getBasePath()}/dashboard`),
  // API Keys / SSO
  getApiKeys: () => apiClient.get(`${getBasePath()}/api-keys`),
  createApiKeys: (data) => apiClient.post(`${getBasePath()}/api-keys`, data),
  regenerateSecretKey: () => apiClient.post(`${getBasePath()}/api-keys/regenerate`),
  toggleSSO: (enabled) => apiClient.patch(`${getBasePath()}/api-keys/toggle`, { enabled }),
  updateAllowedOrigins: (allowedOrigins) => apiClient.patch(`${getBasePath()}/api-keys/origins`, { allowedOrigins }),
  deleteApiKeys: () => apiClient.delete(`${getBasePath()}/api-keys`),
  getSSOLogs: (params) => apiClient.get(`${getBasePath()}/api-keys/logs`, { params }),
  getSSOStats: () => apiClient.get(`${getBasePath()}/api-keys/stats`),
};
