/**
 * Monitoring API - MedeePay Pattern
 * Monitoring assignments and reports
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a monitoring API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Monitoring API methods
 */
export function createMonitoringApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/monitoring`;

  return {
    // Dashboard
    getDashboard: (sessionId) =>
      apiClient.get(`${basePath}/dashboard`, { params: { session_id: sessionId } }),
    
    // Assignments
    getAssignments: (params = {}) => 
      apiClient.get(`${basePath}/assignments`, { params }),
    
    getAssignment: (id) => 
      apiClient.get(`${basePath}/assignments/${id}`),
    
    createAssignment: (data) => 
      apiClient.post(`${basePath}/assignments`, data),
    
    createAssignments: (data) =>
      apiClient.post(`${basePath}/assignments/bulk`, data),
    
    updateAssignment: (id, data) => 
      apiClient.put(`${basePath}/assignments/${id}`, data),
    
    deleteAssignment: (id) => 
      apiClient.delete(`${basePath}/assignments/${id}`),
    
    // My assignments (for monitors)
    getMyAssignments: (sessionId) => 
      apiClient.get(`${basePath}/my-assignments`, { params: { session_id: sessionId } }),
    
    // Available monitors and unassigned schools
    getAvailableMonitors: (sessionId) =>
      apiClient.get(`${basePath}/available-monitors`, { params: { session_id: sessionId } }),
    
    getUnassignedSchools: (sessionId, monitoringType) =>
      apiClient.get(`${basePath}/unassigned-schools`, { params: { session_id: sessionId, monitoring_type: monitoringType } }),
    
    // Reports
    getReports: (params = {}) => 
      apiClient.get(`${basePath}/reports`, { params }),
    
    getReport: (id) => 
      apiClient.get(`${basePath}/reports/${id}`),
    
    getReportById: (id) => 
      apiClient.get(`${basePath}/reports/${id}`),
    
    createReport: (data) => 
      apiClient.post(`${basePath}/reports`, data),
    
    updateReport: (id, data) => 
      apiClient.put(`${basePath}/reports/${id}`, data),
    
    deleteReport: (id) => 
      apiClient.delete(`${basePath}/reports/${id}`),
    
    // My reports (submitted by current user)
    getMyReports: (params = {}) => 
      apiClient.get(`${basePath}/my-reports`, { params }),
    
    // Statistics
    getStatistics: (params = {}) => 
      apiClient.get(`${basePath}/statistics`, { params }),
    
    export: (params = {}) =>
      apiClient.get(`${basePath}/export`, { params, responseType: 'blob' }),
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
  return `/${institutionId}/monitoring`;
}

export const monitoringApi = {
  // Dashboard
  getDashboard: (sessionId) => apiClient.get(`${getBasePath()}/dashboard`, { params: { session_id: sessionId } }),
  // Assignments
  getAssignments: (params = {}) => apiClient.get(`${getBasePath()}/assignments`, { params }),
  getAssignment: (id) => apiClient.get(`${getBasePath()}/assignments/${id}`),
  createAssignment: (data) => apiClient.post(`${getBasePath()}/assignments`, data),
  createAssignments: (data) => apiClient.post(`${getBasePath()}/assignments/bulk`, data),
  updateAssignment: (id, data) => apiClient.put(`${getBasePath()}/assignments/${id}`, data),
  deleteAssignment: (id) => apiClient.delete(`${getBasePath()}/assignments/${id}`),
  getMyAssignments: (sessionId) => apiClient.get(`${getBasePath()}/my-assignments`, { params: { session_id: sessionId } }),
  getAvailableMonitors: (sessionId) => apiClient.get(`${getBasePath()}/available-monitors`, { params: { session_id: sessionId } }),
  getUnassignedSchools: (sessionId, monitoringType) => apiClient.get(`${getBasePath()}/unassigned-schools`, { params: { session_id: sessionId, monitoring_type: monitoringType } }),
  // Reports
  getReports: (params = {}) => apiClient.get(`${getBasePath()}/reports`, { params }),
  getReport: (id) => apiClient.get(`${getBasePath()}/reports/${id}`),
  getReportById: (id) => apiClient.get(`${getBasePath()}/reports/${id}`),
  createReport: (data) => apiClient.post(`${getBasePath()}/reports`, data),
  updateReport: (id, data) => apiClient.put(`${getBasePath()}/reports/${id}`, data),
  deleteReport: (id) => apiClient.delete(`${getBasePath()}/reports/${id}`),
  getMyReports: (params = {}) => apiClient.get(`${getBasePath()}/my-reports`, { params }),
  // Statistics
  getStatistics: (params = {}) => apiClient.get(`${getBasePath()}/statistics`, { params }),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
};
