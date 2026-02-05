/**
 * Auto-Posting API - MedeePay Pattern
 * Automated supervisor posting operations
 * 
 * Provides preview, execute, history, and rollback operations
 * for bulk supervisor posting with configurable criteria
 * 
 * @see docs/AUTOMATED_POSTING_SYSTEM.md for full specification
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create an auto-posting API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Auto-posting API methods
 */
export function createAutoPostingApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/auto-posting`;

  return {
    /**
     * Preview auto-posting results without creating
     * @param {Object} criteria - Auto-posting criteria
     * @param {number} criteria.session_id - Session ID
     * @param {number} criteria.number_of_postings - Number of postings per supervisor
     * @param {string} criteria.posting_type - 'random' | 'route_based' | 'lga_based'
     * @param {boolean} criteria.priority_enabled - Enable priority-based distribution
     * @param {number} [criteria.faculty_id] - Optional faculty filter for deans
     */
    preview: (criteria) => 
      apiClient.post(`${basePath}/preview`, criteria),
    
    /**
     * Execute auto-posting
     * @param {Object} criteria - Auto-posting criteria (same as preview)
     */
    execute: (criteria) => 
      apiClient.post(`${basePath}/execute`, criteria),
    
    /**
     * Get auto-posting history (batches)
     * @param {Object} params - Query parameters
     * @param {number} [params.session_id] - Filter by session
     * @param {number} [params.limit] - Limit results
     * @param {number} [params.offset] - Offset for pagination
     */
    getHistory: (params = {}) => 
      apiClient.get(`${basePath}/history`, { params }),
    
    /**
     * Rollback an auto-posting batch
     * @param {number} batchId - Batch ID to rollback
     */
    rollback: (batchId) => 
      apiClient.post(`${basePath}/${batchId}/rollback`),
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
  return `/${institutionId}/auto-posting`;
}

export const autoPostingApi = {
  preview: (criteria) => apiClient.post(`${getBasePath()}/preview`, criteria),
  execute: (criteria) => apiClient.post(`${getBasePath()}/execute`, criteria),
  getHistory: (params = {}) => apiClient.get(`${getBasePath()}/history`, { params }),
  rollback: (batchId) => apiClient.post(`${getBasePath()}/${batchId}/rollback`),
};
