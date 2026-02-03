/**
 * Dean Allocations API - MedeePay Pattern
 * Manage posting allocations for deans
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a dean allocations API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Dean allocations API methods
 */
export function createDeanAllocationsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/dean-allocations`;

  return {
    // Get allocation stats (total, primary, merged postings and allocation summary)
    getStats: () => 
      apiClient.get(`${basePath}/stats`),
    
    // Get all allocations for current session
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    // Get available deans (without allocation)
    getAvailableDeans: (params = {}) => 
      apiClient.get(`${basePath}/available-deans`, { params }),
    
    // Get all deans
    getAllDeans: () => 
      apiClient.get(`${basePath}/all-deans`),
    
    // Get current user's allocation (for deans)
    getMyAllocation: () => 
      apiClient.get(`${basePath}/my-allocation`),
    
    // Get postings created by current dean
    getMyPostings: (params = {}) => 
      apiClient.get(`${basePath}/my-postings`, { params }),
    
    // Delete a posting created by dean
    deleteMyPosting: (postingId) => 
      apiClient.delete(`${basePath}/my-postings/${postingId}`),
    
    // Create or update allocation
    allocate: (data) => 
      apiClient.post(basePath, data),
    
    // Update allocation
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    // Delete allocation
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
  return `/${institutionId}/dean-allocations`;
}

export const deanAllocationsApi = {
  getStats: () => apiClient.get(`${getBasePath()}/stats`),
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getAvailableDeans: (params = {}) => apiClient.get(`${getBasePath()}/available-deans`, { params }),
  getAllDeans: () => apiClient.get(`${getBasePath()}/all-deans`),
  getMyAllocation: () => apiClient.get(`${getBasePath()}/my-allocation`),
  getMyPostings: (params = {}) => apiClient.get(`${getBasePath()}/my-postings`, { params }),
  deleteMyPosting: (postingId) => apiClient.delete(`${getBasePath()}/my-postings/${postingId}`),
  allocate: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
};
