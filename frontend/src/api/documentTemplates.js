/**
 * Document Templates API - MedeePay Pattern
 * Document template management
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a document templates API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Document Templates API methods
 */
export function createDocumentTemplatesApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/document-templates`;

  return {
    getAll: (params = {}) => 
      apiClient.get(basePath, { params }),
    
    getById: (id) => 
      apiClient.get(`${basePath}/${id}`),
    
    getPlaceholders: () => 
      apiClient.get(`${basePath}/placeholders`),
    
    create: (data) => 
      apiClient.post(basePath, data),
    
    update: (id, data) => 
      apiClient.put(`${basePath}/${id}`, data),
    
    delete: (id) => 
      apiClient.delete(`${basePath}/${id}`),
    
    preview: (id, data = {}) => 
      apiClient.post(`${basePath}/${id}/preview`, data),
    
    generate: (id, data = {}) => 
      apiClient.post(`${basePath}/${id}/generate`, data),
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
  return `/${institutionId}/document-templates`;
}

export const documentTemplatesApi = {
  getAll: (params = {}) => apiClient.get(getBasePath(), { params }),
  getById: (id) => apiClient.get(`${getBasePath()}/${id}`),
  getPlaceholders: (params = {}) => apiClient.get(`${getBasePath()}/placeholders`, { params }),
  // Alias for backward compatibility - same endpoint
  getPlaceholdersGrouped: (documentType) => apiClient.get(`${getBasePath()}/placeholders`, { 
    params: { document_type: documentType } 
  }),
  create: (data) => apiClient.post(getBasePath(), data),
  update: (id, data) => apiClient.put(`${getBasePath()}/${id}`, data),
  delete: (id) => apiClient.delete(`${getBasePath()}/${id}`),
  preview: (id, data = {}) => apiClient.get(`${getBasePath()}/${id}/preview`, { params: data }),
  // Alias for TemplatePreview component compatibility
  previewSample: (id, data = {}) => apiClient.get(`${getBasePath()}/${id}/preview`, { params: data }),
  // Render for specific student (uses generate endpoint)
  renderForStudent: (id, studentId, data = {}) => apiClient.post(`${getBasePath()}/${id}/generate`, { student_id: studentId, ...data }),
  generate: (id, data = {}) => apiClient.post(`${getBasePath()}/${id}/generate`, data),
  publish: (id) => apiClient.post(`${getBasePath()}/${id}/publish`),
  archive: (id) => apiClient.post(`${getBasePath()}/${id}/archive`),
  duplicate: (id) => apiClient.post(`${getBasePath()}/${id}/duplicate`),
  getVersions: (id) => apiClient.get(`${getBasePath()}/${id}/versions`),
  rollback: (id, version) => apiClient.post(`${getBasePath()}/${id}/rollback`, { version }),
};
