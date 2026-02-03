/**
 * Portal API - MedeePay Pattern
 * Student portal endpoints (uses student auth, not institution URL)
 */

import apiClient from './client';

/**
 * Portal API for student self-service
 * Note: These don't use institution ID in URL - student's institution
 * is determined from their authentication token
 */
export const portalApi = {
  // Student status
  getStatus: () => 
    apiClient.get('/portal/status'),
  
  // Student profile
  getProfile: () => 
    apiClient.get('/portal/profile'),
  
  updateProfile: (data) => 
    apiClient.put('/portal/profile', data),
  
  // Student posting info
  getPosting: () => 
    apiClient.get('/portal/posting'),
  
  // Student results
  getResults: () => 
    apiClient.get('/portal/results'),
  
  // Student payments
  getPayments: () => 
    apiClient.get('/portal/payments'),
  
  // Document rendering
  renderDocument: (documentType) =>
    apiClient.get(`/portal/documents/${documentType}`),
};

/**
 * Create a portal admin API bound to a specific institution
 * For admins viewing student portal data
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Portal Admin API methods
 */
export function createPortalAdminApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/portal/students`;

  return {
    getStudentProfile: (studentId) => 
      apiClient.get(`${basePath}/${studentId}/profile`),
    
    getStudentPosting: (studentId) => 
      apiClient.get(`${basePath}/${studentId}/posting`),
    
    getStudentResults: (studentId) => 
      apiClient.get(`${basePath}/${studentId}/results`),
  };
}
