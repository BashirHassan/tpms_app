/**
 * Groups API - MedeePay Pattern
 * Student groups endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a groups API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Groups API methods
 */
export function createGroupsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/groups`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getMembers: (id) => 
      apiClient.get(`${basePath}/${id}/members`),
    
    getSummary: (sessionId) =>
      apiClient.get(`${basePath}/summary`, { params: { session_id: sessionId } }),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    addMembers: (id, studentIds) => 
      apiClient.post(`${basePath}/${id}/members`, { student_ids: studentIds }),
    
    removeMembers: (id, studentIds) => 
      apiClient.delete(`${basePath}/${id}/members`, { data: { student_ids: studentIds } }),
    
    merge: (data) => 
      apiClient.post(`${basePath}/merge`, data),
    
    // School-specific endpoints
    getStudentsBySchool: (schoolId, sessionId) =>
      apiClient.get(`${basePath}/schools/${schoolId}/students`, { params: { session_id: sessionId } }),
    
    getSchoolGroups: (schoolId, sessionId) =>
      apiClient.get(`${basePath}/schools/${schoolId}/groups`, { params: { session_id: sessionId } }),
    
    assignStudentGroup: (studentId, schoolId, groupNumber, sessionId) =>
      apiClient.post(`${basePath}/assign-student`, { student_id: studentId, school_id: schoolId, group_number: groupNumber, session_id: sessionId }),
    
    // Merge-related endpoints
    getMergedGroups: (sessionId) =>
      apiClient.get(`${basePath}/merged`, { params: { session_id: sessionId } }),
    
    getAvailableForMerge: (sessionId) =>
      apiClient.get(`${basePath}/available-for-merge`, { params: { session_id: sessionId } }),
    
    createMerge: (primarySchoolId, primaryGroupNumber, secondarySchoolId, secondaryGroupNumber, sessionId) =>
      apiClient.post(`${basePath}/merge`, {
        primary_school_id: primarySchoolId,
        primary_group_number: primaryGroupNumber,
        secondary_school_id: secondarySchoolId,
        secondary_group_number: secondaryGroupNumber,
        session_id: sessionId,
      }),
    
    cancelMerge: (mergeId) =>
      apiClient.delete(`${basePath}/merge/${mergeId}`),
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
  return `/${institutionId}/groups`;
}

export const groupsApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getMembers: (id) => apiClient.get(`${getBasePath()}/${id}/members`),
  getSummary: (sessionId) => apiClient.get(`${getBasePath()}/summary`, { params: { session_id: sessionId } }),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  addMembers: (id, studentIds) => apiClient.post(`${getBasePath()}/${id}/members`, { student_ids: studentIds }),
  removeMembers: (id, studentIds) => apiClient.delete(`${getBasePath()}/${id}/members`, { data: { student_ids: studentIds } }),
  merge: (data) => apiClient.post(`${getBasePath()}/merge`, data),
  
  // School-specific endpoints
  getStudentsBySchool: (schoolId, sessionId) => 
    apiClient.get(`${getBasePath()}/schools/${schoolId}/students`, { params: { session_id: sessionId } }),
  
  getSchoolGroups: (schoolId, sessionId) => 
    apiClient.get(`${getBasePath()}/schools/${schoolId}/groups`, { params: { session_id: sessionId } }),
  
  assignStudentGroup: (studentId, schoolId, groupNumber, sessionId) =>
    apiClient.post(`${getBasePath()}/assign-student`, { 
      student_id: studentId, 
      school_id: schoolId, 
      group_number: groupNumber, 
      session_id: sessionId 
    }),
  
  // Merge-related endpoints
  getMergedGroups: (sessionId) => 
    apiClient.get(`${getBasePath()}/merged`, { params: { session_id: sessionId } }),
  
  getAvailableForMerge: (sessionId) => 
    apiClient.get(`${getBasePath()}/available-for-merge`, { params: { session_id: sessionId } }),
  
  createMerge: (primarySchoolId, primaryGroupNumber, secondarySchoolId, secondaryGroupNumber, sessionId) =>
    apiClient.post(`${getBasePath()}/merge`, {
      primary_school_id: primarySchoolId,
      primary_group_number: primaryGroupNumber,
      secondary_school_id: secondarySchoolId,
      secondary_group_number: secondaryGroupNumber,
      session_id: sessionId,
    }),
  
  cancelMerge: (mergeId) => 
    apiClient.delete(`${getBasePath()}/merge/${mergeId}`),
};
