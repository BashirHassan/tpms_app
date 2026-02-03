/**
 * Master Schools API - MedeePay Pattern
 * Super admin only: Global school registry management
 */

import apiClient from './client';

const basePath = '/global/master-schools';

/**
 * Master Schools API for super_admin
 * Manages the central schools registry
 */
export const masterSchoolsApi = {
  // CRUD operations
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
  
  // Actions
  verify: (id) => 
    apiClient.post(`${basePath}/${id}/verify`),
  
  merge: (sourceIds, targetId) => 
    apiClient.post(`${basePath}/merge`, {
      source_ids: sourceIds,
      target_id: targetId,
    }),
  
  // Utilities
  getStats: () => 
    apiClient.get(`${basePath}/stats`),
  
  findDuplicates: (params = {}) => 
    apiClient.get(`${basePath}/duplicates`, { params }),
  
  // Location data from Nigeria GeoJSON (states, LGAs, wards with coordinates)
  getStates: () => 
    apiClient.get(`${basePath}/states`),
  
  getLGAs: (state) => 
    apiClient.get(`${basePath}/states/${encodeURIComponent(state)}/lgas`),
  
  getWards: (state, lga) =>
    apiClient.get(`${basePath}/states/${encodeURIComponent(state)}/lgas/${encodeURIComponent(lga)}/wards`),
  
  getWardCoordinates: (state, lga, ward) =>
    apiClient.get(`${basePath}/ward-coordinates/${encodeURIComponent(state)}/${encodeURIComponent(lga)}/${encodeURIComponent(ward)}`),
};

export default masterSchoolsApi;
