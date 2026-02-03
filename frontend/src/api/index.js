/**
 * API Index - MedeePay Pattern
 * 
 * This module exports API factory functions that create institution-scoped APIs.
 * 
 * Usage:
 *   import { createStudentsApi, createSchoolsApi } from './api';
 *   
 *   // In a React component with InstitutionSelectionContext:
 *   const { institutionId } = useInstitutionSelection();
 *   const studentsApi = createStudentsApi(institutionId);
 *   const students = await studentsApi.getAll();
 * 
 *   // OR use the useInstitutionApi hook for simpler usage:
 *   import { useInstitutionApi } from '../hooks';
 *   const { get, post } = useInstitutionApi();
 *   const students = await get('/students');
 */

// Core client
export { default as apiClient } from './client';

// Global APIs (not institution-scoped)
export { authApi } from './auth';
export { institutionsApi } from './institutions';
export { publicApi } from './publicApi';
export { portalApi } from './portal';

// Institution-scoped API factories
export { createStudentsApi } from './students';
export { createSchoolsApi } from './schools';
export { createAcademicApi } from './academic';
export { createSessionsApi } from './sessions';
export { createRanksApi } from './ranks';
export { createRoutesApi } from './routes';
export { createAllowancesApi } from './allowances';
export { createLettersApi } from './letters';
export { createGroupsApi } from './groups';
export { createAcceptancesApi } from './acceptances';
export { createMonitoringApi } from './monitoring';
export { createResultsApi } from './results';
export { createPaymentsApi } from './payments';
export { createPostingsApi } from './postings';
export { createFeaturesApi } from './features';
export { createSettingsApi } from './settings';
export { createDocumentTemplatesApi } from './documentTemplates';
export { createSchoolUpdateRequestsApi } from './schoolUpdateRequests';
export { createUsersApi } from './users';
export { createPortalAdminApi } from './portal';
export { createDeanAllocationsApi } from './deanAllocations';

// Location tracking API (supervisor geofencing)
export { locationApi } from './location';

/**
 * Legacy exports for backward compatibility
 * These use getCurrentInstitutionId() to automatically get institution context
 */
export { studentsApi } from './students';
export { schoolsApi } from './schools';
export { academicApi, facultiesApi, departmentsApi, programsApi } from './academic';
export { sessionsApi } from './sessions';
export { ranksApi } from './ranks';
export { routesApi } from './routes';
export { allowancesApi } from './allowances';
export { lettersApi } from './letters';
export { groupsApi } from './groups';
export { acceptancesApi } from './acceptances';
export { monitoringApi } from './monitoring';
export { resultsApi } from './results';
export { paymentsApi } from './payments';
export { postingsApi } from './postings';
export { featuresApi } from './features';
export { settingsApi } from './settings';
export { documentTemplatesApi } from './documentTemplates';
export { schoolUpdateRequestsApi } from './schoolUpdateRequests';
export { usersApi } from './users';
export { deanAllocationsApi } from './deanAllocations';
