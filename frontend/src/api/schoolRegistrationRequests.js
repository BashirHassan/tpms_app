/**
 * School Registration Requests API - MedeePay Pattern
 * Students request a new school be added to the central registry;
 * super admin reviews and approves/rejects.
 */

import apiClient from './client';

const globalBasePath = '/global/school-registration-requests';
const portalBasePath = '/portal/school-registration-requests';

export const schoolRegistrationRequestsApi = {
  // Super admin (global)
  getAll: (params = {}) => apiClient.get(globalBasePath, { params }),
  getById: (id) => apiClient.get(`${globalBasePath}/${id}`),
  getStats: (params = {}) => apiClient.get(`${globalBasePath}/stats`, { params }),
  approve: (id) => apiClient.post(`${globalBasePath}/${id}/approve`),
  reject: (id, rejectionReason) => apiClient.post(`${globalBasePath}/${id}/reject`, { rejection_reason: rejectionReason }),

  // Student portal
  getStatus: () => apiClient.get(`${portalBasePath}/status`),
  searchMaster: (q) => apiClient.get(`${portalBasePath}/search-master`, { params: { q } }),
  submit: (data) => apiClient.post(portalBasePath, data),
};

export default schoolRegistrationRequestsApi;
