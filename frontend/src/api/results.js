/**
 * Results API - MedeePay Pattern
 * Student results and scoring
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a results API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Results API methods
 */
export function createResultsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/results`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getByStudent: (studentId) => 
      apiClient.get(`${basePath}/student/${studentId}`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    // Scoring criteria
    getScoringCriteria: (params = {}) => 
      apiClient.get(`${basePath}/scoring-criteria`, { params }),
    
    updateScoringCriteria: (data) => 
      apiClient.put(`${basePath}/scoring-criteria`, data),
    
    createCriteria: (data) =>
      apiClient.post(`${basePath}/scoring-criteria`, data),
    
    updateCriteria: (id, data) =>
      apiClient.put(`${basePath}/scoring-criteria/${id}`, data),
    
    deleteCriteria: (id) =>
      apiClient.delete(`${basePath}/scoring-criteria/${id}`),
    
    initializeDefaultCriteria: () =>
      apiClient.post(`${basePath}/scoring-criteria/initialize`),
    
    // Admin students with results
    getAdminStudentsWithResults: (params = {}) =>
      apiClient.get(`${basePath}/admin-students`, { params }),
    
    // Admin bulk submit
    adminBulkSubmitResults: (sessionId, changes) =>
      apiClient.post(`${basePath}/admin-bulk-submit`, { session_id: sessionId, changes }),
    
    // Bulk upload
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
    
    exportExcel: (params = {}) =>
      apiClient.get(`${basePath}/export/excel`, { params, responseType: 'blob' }),
    
    exportPDF: (params = {}) =>
      apiClient.get(`${basePath}/export/pdf`, { params, responseType: 'blob' }),
    
    // Statistics
    getStatistics: (params = {}) => 
      apiClient.get(`${basePath}/statistics`, { params }),
    
    // Supervisor result upload
    getAssignedGroups: () =>
      apiClient.get(`${basePath}/assigned-groups`),
    
    getStudentsForScoring: (schoolId, groupNumber, visitNumber) =>
      apiClient.get(`${basePath}/students-for-scoring`, { 
        params: { school_id: schoolId, group_number: groupNumber, visit_number: visitNumber } 
      }),
    
    submitBulkResults: (results) =>
      apiClient.post(`${basePath}/bulk-submit`, { results }),
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
  return `/${institutionId}/results`;
}

export const resultsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getByStudent: (studentId) => apiClient.get(`${getBasePath()}/student/${studentId}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  getScoringCriteria: (params = {}) => apiClient.get(`${getBasePath()}/scoring-criteria`, { params }),
  updateScoringCriteria: (data) => apiClient.put(`${getBasePath()}/scoring-criteria`, data),
  createCriteria: (data) => apiClient.post(`${getBasePath()}/scoring-criteria`, data),
  updateCriteria: (id, data) => apiClient.put(`${getBasePath()}/scoring-criteria/${id}`, data),
  deleteCriteria: (id) => apiClient.delete(`${getBasePath()}/scoring-criteria/${id}`),
  initializeDefaultCriteria: () => apiClient.post(`${getBasePath()}/scoring-criteria/initialize`),
  getAdminStudentsWithResults: (params = {}) => apiClient.get(`${getBasePath()}/admin-students`, { params }),
  adminBulkSubmitResults: (sessionId, changes) => apiClient.post(`${getBasePath()}/admin-bulk-submit`, { session_id: sessionId, changes }),
  upload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`${getBasePath()}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  downloadTemplate: () => apiClient.get(`${getBasePath()}/template`, { responseType: 'blob' }),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
  exportExcel: (params = {}) => apiClient.get(`${getBasePath()}/export/excel`, { params, responseType: 'blob' }),
  exportPDF: (params = {}) => apiClient.get(`${getBasePath()}/export/pdf`, { params, responseType: 'blob' }),
  getStatistics: (params = {}) => apiClient.get(`${getBasePath()}/statistics`, { params }),
  // Supervisor result upload
  getAssignedGroups: () => apiClient.get(`${getBasePath()}/assigned-groups`),
  getStudentsForScoring: (schoolId, groupNumber, visitNumber) => apiClient.get(`${getBasePath()}/students-for-scoring`, { params: { school_id: schoolId, group_number: groupNumber, visit_number: visitNumber } }),
  submitBulkResults: (results) => apiClient.post(`${getBasePath()}/bulk-submit`, { results }),
};
