/**
 * Hooks Index
 * Central export for all custom hooks
 */

export { default as usePaystackInline } from './usePaystackInline';
export { 
  default as useSubdomain,
  getSubdomain,
  isLocalDev,
  isSuperAdminPortal,
  isLandingPage,
  useLandingPage,
  setDevSubdomain,
  getSubdomainInfo,
} from './useSubdomain';
export { useInstitutionStyles } from './useInstitutionStyles';
export { 
  useInstitutionApi,
  createInstitutionApi,
} from './useInstitutionApi';
