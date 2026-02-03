/**
 * Dashboard API - MedeePay Pattern
 * Dashboard statistics endpoints for different user roles
 */

import apiClient, { getCurrentInstitutionId } from './client';

/**
 * Create a dashboard API bound to a specific institution
 * @param {number|string} institutionId - Institution ID
 * @returns {Object} Dashboard API methods
 */
export function createDashboardApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const basePath = `/${institutionId}/dashboard`;

  return {
    /**
     * Get institution dashboard statistics
     * For: head_of_teaching_practice, supervisors, monitors
     */
    getInstitutionStats: () => apiClient.get(basePath),

    /**
     * Get supervisor/monitor specific dashboard
     * For: supervisor, field_monitor
     */
    getSupervisorStats: () => apiClient.get(`${basePath}/supervisor`),
  };
}

// ============================================================================
// Global Dashboard API (super_admin only)
// ============================================================================

export const globalDashboardApi = {
  /**
   * Get global platform statistics
   * For: super_admin only
   */
  getGlobalStats: () => apiClient.get('/global/dashboard'),
};

// ============================================================================
// Legacy exports for backward compatibility
// These automatically use getCurrentInstitutionId() to get the institution context
// ============================================================================

function getBasePath() {
  const institutionId = getCurrentInstitutionId();
  if (!institutionId) {
    throw new Error('No institution selected. Please select an institution first.');
  }
  return `/${institutionId}/dashboard`;
}

export const dashboardApi = {
  /**
   * Get institution dashboard statistics
   */
  getInstitutionStats: () => apiClient.get(getBasePath()),

  /**
   * Get supervisor/monitor specific dashboard
   */
  getSupervisorStats: () => apiClient.get(`${getBasePath()}/supervisor`),

  /**
   * Get global platform statistics (super_admin only)
   * Note: This doesn't require institution selection
   */
  getGlobalStats: () => apiClient.get('/global/dashboard'),
};

export default dashboardApi;
