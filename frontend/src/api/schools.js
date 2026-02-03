/**
 * Schools API - MedeePay Pattern
 * School management endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a schools API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Schools API methods
 */
export function createSchoolsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/schools`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    updateStatus: (id, status) => 
      apiClient.patch(`${basePath}/${id}/status`, { status }),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    // Location data from Nigeria GeoJSON (states, LGAs, wards with coordinates)
    getStates: () => 
      apiClient.get(`${basePath}/states`),
    
    getLGAs: (state) => 
      apiClient.get(`${basePath}/lgas/${encodeURIComponent(state)}`),
    
    getWards: (state, lga) =>
      apiClient.get(`${basePath}/wards/${encodeURIComponent(state)}/${encodeURIComponent(lga)}`),
    
    getWardCoordinates: (state, lga, ward) =>
      apiClient.get(`${basePath}/ward-coordinates/${encodeURIComponent(state)}/${encodeURIComponent(lga)}/${encodeURIComponent(ward)}`),
    
    // Bulk operations
    upload: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post(`${basePath}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    
    downloadTemplate: () =>
      apiClient.get(`${basePath}/template`, { responseType: 'blob' }),
    
    export: (params = {}) =>
      apiClient.get(`${basePath}/export`, { params, responseType: 'blob' }),
    
    // New: Capacity tracking
    getWithCapacity: (params = {}) =>
      apiClient.get(`${basePath}/with-capacity`, { params }),
    
    getCapacity: (id) =>
      apiClient.get(`${basePath}/${id}/capacity`),
    
    // New: Master schools linking
    searchMasterSchools: (params = {}) =>
      apiClient.get(`${basePath}/search-master`, { params }),
    
    linkSchool: (data) =>
      apiClient.post(`${basePath}/link`, data),
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
  return `/${institutionId}/schools`;
}

export const schoolsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  updateStatus: (id, status) => apiClient.patch(`${getBasePath()}/${id}/status`, { status }),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  
  // Location data from Nigeria GeoJSON (states, LGAs, wards with coordinates)
  getStates: () => apiClient.get(`${getBasePath()}/states`),
  getLGAs: (state) => apiClient.get(`${getBasePath()}/lgas/${encodeURIComponent(state)}`),
  getWards: (state, lga) => apiClient.get(`${getBasePath()}/wards/${encodeURIComponent(state)}/${encodeURIComponent(lga)}`),
  getWardCoordinates: (state, lga, ward) => apiClient.get(`${getBasePath()}/ward-coordinates/${encodeURIComponent(state)}/${encodeURIComponent(lga)}/${encodeURIComponent(ward)}`),
  
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`${getBasePath()}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadTemplate: () => apiClient.get(`${getBasePath()}/template`, { responseType: 'blob' }),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
  // New capacity methods
  getWithCapacity: (params = {}) => apiClient.get(`${getBasePath()}/with-capacity`, { params }),
  getCapacity: (id) => apiClient.get(`${getBasePath()}/${id}/capacity`),
  // New master schools linking
  searchMasterSchools: (params = {}) => apiClient.get(`${getBasePath()}/search-master`, { params }),
  linkSchool: (data) => apiClient.post(`${getBasePath()}/link`, data),
};
