/**
 * School Capture API - MedeePay Pattern
 *
 * Supervisor school data capture: the Head of TP bulk-assigns supervisors to
 * schools missing a verified location / principal details; supervisors record
 * them and the submissions go to School Update Requests as pending.
 *
 * Every endpoint sits behind the `school_data_capture` feature toggle.
 *
 * Response shapes (all wrapped as { success, data, ... }):
 *  - getOptions       -> data: { session, scope, counts: { missing_any, missing_location, missing_principal, all },
 *                                supervisors: [{ id, name, email, phone, current_assignments }],
 *                                states: [{ state, count }], lgas: [{ state, lga, count }] }
 *  - preview          -> data: { plan_hash, mode, scope, total_schools, total_supervisors, assigned_count,
 *                                unassigned_count, unassigned: [School], per_supervisor: [{ supervisor_id, name, count, clusters }],
 *                                assignments: [{ supervisor_id, supervisor_name, school: School }], warnings }
 *                       School = { id, name, code, state, lga, ward, needs_location, needs_principal }
 *  - execute          -> 201, data: { batch_id, assigned_count, unassigned_count, supervisor_count, warnings }
 *  - getAssignments   -> data: [Assignment], pagination, supervisors: [Summary], session
 *  - getMySchools     -> data: [MySchool], session: { id, name, max_gps_accuracy_meters }, min_correction_distance_m, summary
 */

import apiClient, { getCurrentInstitutionId } from './client';

function getBasePath() {
  const institutionId = getCurrentInstitutionId();
  if (!institutionId) {
    throw new Error('No institution selected. Please select an institution first.');
  }
  return `/${institutionId}/school-capture`;
}

export const FEATURE_KEY = 'school_data_capture';

export const schoolCaptureApi = {
  // ---------------- Head of TP ----------------

  /** @param {{session_id?: number, scope?: string}} params */
  getOptions: (params = {}) => apiClient.get(`${getBasePath()}/options`, { params }),

  /**
   * Schools a run could pick up right now (feeds the manual-pick list).
   * -> data: [School] (same shape as preview's `school`), total, scope
   * @param {{session_id?: number, scope?: string, state?: string, lga?: string}} params
   */
  getEligibleSchools: (params = {}) => apiClient.get(`${getBasePath()}/eligible-schools`, { params }),

  /**
   * @param {Object} body
   * @param {number} body.session_id
   * @param {'lga'|'random'} body.mode
   * @param {'missing_any'|'missing_location'|'missing_principal'|'all'} body.scope
   * @param {number[]} [body.supervisor_ids] - empty = every active supervisor
   * @param {string[]} [body.states]
   * @param {{state: string, lga: string}[]} [body.lgas]
   * @param {number|null} [body.max_per_supervisor]
   * @param {number} [body.shuffle_salt] - re-draws the plan
   */
  preview: (body) => apiClient.post(`${getBasePath()}/preview`, body),

  /** Same body as preview plus `expected_plan_hash` (the preview's plan_hash). */
  execute: (body) => apiClient.post(`${getBasePath()}/execute`, body),

  /** Manual pick: { session_id, supervisor_id, school_ids } */
  bulkAssign: (body) => apiClient.post(`${getBasePath()}/assignments/bulk`, body),

  /**
   * Every supervisor's live assignments with location/principal progress.
   * Pass `limit: 'all'` for the full filtered set (table + export).
   * @param {{session_id?: number, supervisor_id?: number, state?: string, lga?: string,
   *          progress?: string, search?: string, page?: number, limit?: number|'all'}} params
   */
  getAssignments: (params = {}) => apiClient.get(`${getBasePath()}/assignments`, { params }),

  reassign: (id, supervisorId) => apiClient.patch(`${getBasePath()}/assignments/${id}`, { supervisor_id: supervisorId }),
  cancel: (id) => apiClient.delete(`${getBasePath()}/assignments/${id}`),

  /**
   * Everything that happened on one assignment, oldest first: assignment, each
   * submission with its GPS evidence + risk flags, and how it was reviewed.
   * -> data: { assignment, events: [Event], totals: { events, location_submissions, flagged } }
   */
  getTimeline: (assignmentId) => apiClient.get(`${getBasePath()}/assignments/${assignmentId}/timeline`),

  /**
   * Capture log (all supervisors, or one), newest first.
   * -> data: [Event & { school_name, school_code, state, lga, supervisor_name }], pagination
   * @param {{session_id?: number, supervisor_id?: number, school_id?: number, event_type?: string,
   *          risk?: 'flagged'|'high'|'medium', page?: number, limit?: number}} params
   */
  getActivityLog: (params = {}) => apiClient.get(`${getBasePath()}/activity`, { params }),

  getBatches: (params = {}) => apiClient.get(`${getBasePath()}/batches`, { params }),
  rollbackBatch: (batchId) => apiClient.post(`${getBasePath()}/batches/${batchId}/rollback`),

  // ---------------- Supervisor ----------------

  getMySchools: (params = {}) => apiClient.get(`${getBasePath()}/my-schools`, { params }),

  /**
   * @param {number} assignmentId
   * @param {Object} body
   * @param {number} body.proposed_latitude
   * @param {number} body.proposed_longitude
   * @param {string|null} [body.proposed_ward]
   * @param {string|null} [body.proposed_address]
   * @param {number|null} [body.accuracy_meters] - required for 'gps' when the session sets a max accuracy
   * @param {'gps'|'manual'} body.capture_method
   * @param {string|null} [body.note] - required (>= 10 chars) when correcting an already-verified location
   */
  submitLocation: (assignmentId, body) => apiClient.post(`${getBasePath()}/my-schools/${assignmentId}/location`, body),

  /** body: { proposed_principal_name, proposed_principal_phone } */
  submitPrincipal: (assignmentId, body) => apiClient.post(`${getBasePath()}/my-schools/${assignmentId}/principal`, body),
};

export default schoolCaptureApi;
