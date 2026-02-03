/**
 * Public API - MedeePay Pattern
 * Public endpoints (no authentication required)
 */

import apiClient from './client';

/**
 * Get the current institution ID from the subdomain context
 * This is cached in localStorage after initial lookup
 */
const getCurrentInstitutionId = () => {
  const cached = localStorage.getItem('institution');
  if (cached) {
    try {
      return JSON.parse(cached).id;
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * Public API for unauthenticated access
 */
export const publicApi = {
  // Institution lookup by subdomain
  getInstitutionBySubdomain: (subdomain) => {
    if (subdomain) {
      return apiClient.get(`/public/institution/${subdomain}`);
    }
    return apiClient.get('/public/institution');
  },
  
  // Get schools for current institution (via subdomain context)
  getSchoolsForCurrentInstitution: (options = {}) => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    
    const params = new URLSearchParams();
    if (options.excludePendingPrincipal) params.append('exclude_pending_principal', 'true');
    if (options.excludePendingLocation) params.append('exclude_pending_location', 'true');
    if (options.missingCoordinatesOnly) params.append('missing_coordinates_only', 'true');
    if (options.search) params.append('search', options.search);
    
    const queryString = params.toString();
    return apiClient.get(`/public/institutions/${institutionId}/schools${queryString ? `?${queryString}` : ''}`);
  },
  
  // Get school principal info for update page
  getSchoolPrincipal: (schoolId) => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    return apiClient.get(`/public/institutions/${institutionId}/schools/${schoolId}/principal`);
  },
  
  // Get school location info for update page
  getSchoolLocation: (schoolId) => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    return apiClient.get(`/public/institutions/${institutionId}/schools/${schoolId}/location`);
  },
  
  // Submit principal update request
  submitPrincipalUpdate: (data) => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    return apiClient.post(`/public/institutions/${institutionId}/schools/principal-update`, data);
  },
  
  // Submit location update request
  submitLocationUpdate: (data) => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    return apiClient.post(`/public/institutions/${institutionId}/schools/location-update`, data);
  },
  
  // Get feature toggles for current institution
  getFeatureToggles: () => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    return apiClient.get(`/public/institutions/${institutionId}/features`);
  },
  
  // Get current session for current institution
  getCurrentSession: () => {
    const institutionId = getCurrentInstitutionId();
    if (!institutionId) {
      return Promise.reject(new Error('Institution not found'));
    }
    return apiClient.get(`/public/institutions/${institutionId}/session`);
  },
  
  // Legacy: Public school data by code
  getSchoolByCode: (code) => 
    apiClient.get(`/public/schools/${code}`),
  
  requestLocationUpdate: (code, data) => 
    apiClient.post(`/public/schools/${code}/location-update`, data),
  
  requestPrincipalUpdate: (code, data) => 
    apiClient.post(`/public/schools/${code}/principal-update`, data),
  
  // Health check
  healthCheck: () => 
    apiClient.get('/public/health'),
};

export default publicApi;
