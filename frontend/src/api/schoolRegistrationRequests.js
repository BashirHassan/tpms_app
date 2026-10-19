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
  // expectedResubmitCount: the edit count the reviewer loaded; the server returns a
  // conflict if the student has edited the request since
  approve: (id, expectedResubmitCount) =>
    apiClient.post(`${globalBasePath}/${id}/approve`, { expected_resubmit_count: expectedResubmitCount }),
  reject: (id, rejectionReason, expectedResubmitCount) =>
    apiClient.post(`${globalBasePath}/${id}/reject`, {
      rejection_reason: rejectionReason,
      expected_resubmit_count: expectedResubmitCount,
    }),

  // Student portal
  getStatus: () => apiClient.get(`${portalBasePath}/status`),
  searchMaster: (q) => apiClient.get(`${portalBasePath}/search-master`, { params: { q } }),
  submit: (data) => apiClient.post(portalBasePath, data),
  // Correct a pending or rejected request
  update: (id, data) => apiClient.put(`${portalBasePath}/${id}`, data),
};

export default schoolRegistrationRequestsApi;
