/**
 * Academic API - MedeePay Pattern
 * Faculties, Departments, Programs endpoints
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create an academic API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Academic API methods
 */
export function createAcademicApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/academic`;

  return {
    // Faculties
    getFaculties: (params = {}) => 
      apiClient.get(`${basePath}/faculties`, { params }),
    
    getFaculty: (id) => 
      apiClient.get(`${basePath}/faculties/${id}`),
    
    createFaculty: (data) => 
      apiClient.post(`${basePath}/faculties`, data),
    
    updateFaculty: (id, data) => 
      apiClient.put(`${basePath}/faculties/${id}`, data),
    
    deleteFaculty: (id) => 
      apiClient.delete(`${basePath}/faculties/${id}`),
    
    // Departments
    getDepartments: (params = {}) => 
      apiClient.get(`${basePath}/departments`, { params }),
    
    getDepartment: (id) => 
      apiClient.get(`${basePath}/departments/${id}`),
    
    createDepartment: (data) => 
      apiClient.post(`${basePath}/departments`, data),
    
    updateDepartment: (id, data) => 
      apiClient.put(`${basePath}/departments/${id}`, data),
    
    deleteDepartment: (id) => 
      apiClient.delete(`${basePath}/departments/${id}`),
    
    // Programs
    getPrograms: (params = {}) => 
      apiClient.get(`${basePath}/programs`, { params }),
    
    getProgram: (id) => 
      apiClient.get(`${basePath}/programs/${id}`),
    
    createProgram: (data) => 
      apiClient.post(`${basePath}/programs`, data),
    
    updateProgram: (id, data) => 
      apiClient.put(`${basePath}/programs/${id}`, data),
    
    deleteProgram: (id) => 
      apiClient.delete(`${basePath}/programs/${id}`),
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
  return `/${institutionId}/academic`;
}

/**
 * Faculties API (legacy - uses getCurrentInstitutionId)
 */
export const facultiesApi = {
  getAll: (params = {}) => apiClient.get(`${getBasePath()}/faculties`, { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/faculties/${id}`),
  create: (data) => apiClient.post(`${getBasePath()}/faculties`, data),
  update: (id, data) => apiClient.put(`${getBasePath()}/faculties/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/faculties/${id}`),
};

/**
 * Departments API (legacy - uses getCurrentInstitutionId)
 */
export const departmentsApi = {
  getAll: (params = {}) => apiClient.get(`${getBasePath()}/departments`, { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/departments/${id}`),
  create: (data) => apiClient.post(`${getBasePath()}/departments`, data),
  update: (id, data) => apiClient.put(`${getBasePath()}/departments/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/departments/${id}`),
};

/**
 * Programs API (legacy - uses getCurrentInstitutionId)
 */
export const programsApi = {
  getAll: (params = {}) => apiClient.get(`${getBasePath()}/programs`, { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/programs/${id}`),
  create: (data) => apiClient.post(`${getBasePath()}/programs`, data),
  update: (id, data) => apiClient.put(`${getBasePath()}/programs/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/programs/${id}`),
};

/**
 * Legacy academicApi for backward compatibility
 */
export const academicApi = {
  ...facultiesApi,
  ...departmentsApi,
  ...programsApi,
};
