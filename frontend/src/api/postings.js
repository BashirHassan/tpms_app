/**
 * Postings API - MedeePay Pattern
 * Supervisor postings and student placements
 * 
 * Includes all methods from legacy SupervisorPosting model:
 * - CRUD operations
 * - Statistics & summaries
 * - Supervisor posting counts with location breakdown
 * - Allowance summaries
 * - School postings
 * - Multiposting support
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a postings API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Postings API methods
 */
export function createPostingsApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/postings`;

  return {
    // =========================================================================
    // CRUD Operations
    // =========================================================================
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

    // =========================================================================
    // Statistics & Summaries
    // =========================================================================
    getStatistics: (params = {}) => 
      apiClient.get(`${basePath}/statistics`, { params }),
    
    getSummaryStats: (sessionId) =>
      apiClient.get(`${basePath}/statistics`, { params: { session_id: sessionId } }),
    
    getAllowanceSummary: (sessionId) =>
      apiClient.get(`${basePath}/allowance-summary`, { params: { session_id: sessionId } }),
    
    getSupervisorCounts: (sessionId) =>
      apiClient.get(`${basePath}/supervisor-counts`, { params: { session_id: sessionId } }),

    // =========================================================================
    // Session & Supervisor Routes
    // =========================================================================
    getBySession: (sessionId, params = {}) => 
      apiClient.get(`${basePath}/session/${sessionId}`, { params }),
    
    getMyPostings: (params = {}) => 
      apiClient.get(`${basePath}/my-postings`, { params }),
    
    getMyPostingsPrintable: (params = {}) => 
      apiClient.get(`${basePath}/my-postings-printable`, { params }),

    getMyInvitationLetter: () => 
      apiClient.get(`${basePath}/my-invitation-letter`),

    // Supervisor-specific (from legacy SupervisorPosting)
    getSupervisorPostings: (supervisorId, params = {}) =>
      apiClient.get(`${basePath}/supervisor/${supervisorId}`, { params }),
    
    getSupervisorPostingCount: (supervisorId, sessionId) =>
      apiClient.get(`${basePath}/supervisor/${supervisorId}/count`, { params: { session_id: sessionId } }),
    
    getSupervisorAllowances: (supervisorId, sessionId) =>
      apiClient.get(`${basePath}/supervisor/${supervisorId}/allowances`, { params: { session_id: sessionId } }),

    // =========================================================================
    // School Routes
    // =========================================================================
    getSchoolPostings: (schoolId, params = {}) =>
      apiClient.get(`${basePath}/school/${schoolId}`, { params }),
    
    getSchoolGroups: (schoolId, sessionId) =>
      apiClient.get(`${basePath}/school/${schoolId}/groups`, { params: { session_id: sessionId } }),
    
    // =========================================================================
    // Display & Printable Views
    // =========================================================================
    getAllPostingsPrintable: (params = {}) =>
      apiClient.get(`${basePath}/printable`, { params }),
    
    getPostingsForDisplay: (params = {}) => 
      apiClient.get(`${basePath}/display`, { params }),
    
    getPrepostingTemplate: (params = {}) => 
      apiClient.get(`${basePath}/preposting-template`, { params }),

    // =========================================================================
    // Schools & Students Related
    // =========================================================================
    getSchoolsStudents: (sessionId) => 
      apiClient.get(`${basePath}/schools-students`, { params: { session_id: sessionId } }),
    
    getSchoolsSupervisors: (sessionId) => 
      apiClient.get(`${basePath}/schools-supervisors`, { params: { session_id: sessionId } }),
    
    getSchoolsWithGroups: (sessionId) => 
      apiClient.get(`${basePath}/schools-with-groups`, { params: { session_id: sessionId } }),
    
    getAvailableSchools: (params = {}) => 
      apiClient.get(`${basePath}/available-schools`, { params }),
    
    getAvailableSupervisors: (params = {}) => 
      apiClient.get(`${basePath}/available-supervisors`, { params }),

    // =========================================================================
    // Bulk & Automated Operations
    // =========================================================================
    validatePosting: (data) => 
      apiClient.post(`${basePath}/validate`, data),
    
    createMultiPostings: (sessionId, postings) => 
      apiClient.post(`${basePath}/multi`, { session_id: sessionId, postings }),
    
    bulkCreate: (data) => 
      apiClient.post(`${basePath}/bulk`, data),
    
    autoPost: (data) => 
      apiClient.post(`${basePath}/auto-post`, data),
    
    clear: (data) => 
      apiClient.post(`${basePath}/clear`, data),
    
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
  return `/${institutionId}/postings`;
}

export const postingsApi = {
  // CRUD
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  
  // Statistics & Summaries
  getStatistics: (params = {}) => apiClient.get(`${getBasePath()}/statistics`, { params }),
  getSummaryStats: (sessionId) => apiClient.get(`${getBasePath()}/statistics`, { params: { session_id: sessionId } }),
  getAllowanceSummary: (sessionId) => apiClient.get(`${getBasePath()}/allowance-summary`, { params: { session_id: sessionId } }),
  getSupervisorCounts: (sessionId) => apiClient.get(`${getBasePath()}/supervisor-counts`, { params: { session_id: sessionId } }),
  
  // Session & User Postings
  getBySession: (sessionId, params = {}) => apiClient.get(`${getBasePath()}/session/${sessionId}`, { params }),
  getMyPostings: (params = {}) => apiClient.get(`${getBasePath()}/my-postings`, { params }),
  getMyPostingsPrintable: (params = {}) => apiClient.get(`${getBasePath()}/my-postings-printable`, { params }),
  getMyInvitationLetter: () => apiClient.get(`${getBasePath()}/my-invitation-letter`),
  
  // Supervisor-specific (from legacy SupervisorPosting)
  getSupervisorPostings: (supervisorId, params = {}) => apiClient.get(`${getBasePath()}/supervisor/${supervisorId}`, { params }),
  getSupervisorPostingCount: (supervisorId, sessionId) => apiClient.get(`${getBasePath()}/supervisor/${supervisorId}/count`, { params: { session_id: sessionId } }),
  getSupervisorAllowances: (supervisorId, sessionId) => apiClient.get(`${getBasePath()}/supervisor/${supervisorId}/allowances`, { params: { session_id: sessionId } }),
  
  // School-specific (from legacy SupervisorPosting)
  getSchoolPostings: (schoolId, params = {}) => apiClient.get(`${getBasePath()}/school/${schoolId}`, { params }),
  getSchoolGroups: (schoolId, sessionId) => apiClient.get(`${getBasePath()}/school/${schoolId}/groups`, { params: { session_id: sessionId } }),
  
  // Display & Printable
  getAllPostingsPrintable: (params = {}) => apiClient.get(`${getBasePath()}/printable`, { params }),
  getPostingsForDisplay: (params = {}) => apiClient.get(`${getBasePath()}/display`, { params }),
  getPrepostingTemplate: (params = {}) => apiClient.get(`${getBasePath()}/preposting-template`, { params }),
  
  // Schools & Students Related
  getSchoolsStudents: (sessionId) => apiClient.get(`${getBasePath()}/schools-students`, { params: { session_id: sessionId } }),
  getSchoolsSupervisors: (sessionId) => apiClient.get(`${getBasePath()}/schools-supervisors`, { params: { session_id: sessionId } }),
  getSchoolsWithGroups: (sessionId) => apiClient.get(`${getBasePath()}/schools-with-groups`, { params: { session_id: sessionId } }),
  getAvailableSchools: (params = {}) => apiClient.get(`${getBasePath()}/available-schools`, { params }),
  getAvailableSupervisors: (params = {}) => apiClient.get(`${getBasePath()}/available-supervisors`, { params }),
  
  // Bulk & Automated Operations
  validatePosting: (data) => apiClient.post(`${getBasePath()}/validate`, data),
  createMultiPostings: (sessionId, postings) => apiClient.post(`${getBasePath()}/multi`, { session_id: sessionId, postings }),
  bulkCreate: (data) => apiClient.post(`${getBasePath()}/bulk`, data),
  autoPost: (data) => apiClient.post(`${getBasePath()}/auto-post`, data),
  clear: (data) => apiClient.post(`${getBasePath()}/clear`, data),
  export: (params = {}) => apiClient.get(`${getBasePath()}/export`, { params, responseType: 'blob' }),
  
  // Aliases for backward compatibility with MultipostingPage
  getSupervisorsForPosting: (sessionId, facultyId = null) => {
    const params = { session_id: sessionId };
    if (facultyId) params.faculty_id = facultyId;
    return apiClient.get(`${getBasePath()}/available-supervisors`, { params });
  },
};
