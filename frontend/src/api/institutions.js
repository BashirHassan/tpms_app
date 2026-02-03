/**
 * Institutions API - MedeePay Pattern
 * Institution management (super_admin global routes)
 */

import apiClient from './client';

/**
 * Institutions API for super_admin operations
 * These use /global/ prefix, not institution-scoped
 */
export const institutionsApi = {
  // Global routes (super_admin only)
  getAll: (params = {}) => 
    apiClient.get('/global/institutions', { params }),
  
  getAllStats: () => 
    apiClient.get('/global/institutions/stats'),
  
  getById: (id) => 
    apiClient.get(`/global/institutions/${id}`),
  
  // Alias for switching institutions (same as getAll)
  getSwitchList: (params = {}) => 
    apiClient.get('/global/institutions', { params: { ...params, status: 'active' } }),
  
  create: (data) => {
    if (data instanceof FormData) {
      return apiClient.post('/global/institutions', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return apiClient.post('/global/institutions', data);
  },
  
  update: (id, data) => {
    if (data instanceof FormData) {
      return apiClient.put(`/global/institutions/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return apiClient.put(`/global/institutions/${id}`, data);
  },
  
  updateStatus: (id, status) => 
    apiClient.patch(`/global/institutions/${id}/status`, { status }),
  
  delete: (id) => 
    apiClient.delete(`/global/institutions/${id}`),
  
  activate: (id) => 
    apiClient.patch(`/global/institutions/${id}/status`, { status: 'active' }),
  
  deactivate: (id) => 
    apiClient.patch(`/global/institutions/${id}/status`, { status: 'inactive' }),
  
  /**
   * Provision a new institution with complete setup
   * @param {Object} data - Institution configuration including SMTP, payment, etc.
   */
  provision: (data) => 
    apiClient.post('/global/institutions/provision', data),
  
  /**
   * Upload institution logo
   * @param {File} file - Logo file
   * @param {string} code - Institution code for folder organization
   * @param {string|null} oldLogoUrl - Previous logo URL to delete
   */
  uploadLogo: (file, code, oldLogoUrl = null) => {
    const formData = new FormData();
    formData.append('logo', file);
    formData.append('code', code);
    if (oldLogoUrl) {
      formData.append('old_logo_url', oldLogoUrl);
    }
    return apiClient.post('/global/institutions/upload-logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  
  /**
   * Test SMTP settings for any institution (super_admin only)
   * @param {number} institutionId - Institution ID to test
   * @param {string} testEmail - Optional email to send test to (defaults to super admin's email)
   */
  testSmtp: (institutionId, testEmail = null) => 
    apiClient.post(`/global/institutions/${institutionId}/smtp/test`, { test_email: testEmail }),
};

export default institutionsApi;
