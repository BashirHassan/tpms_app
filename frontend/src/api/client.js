/**
 * API Client
 * Axios instance with authentication interceptor
 * 
 * 🔒 SECURITY: Institution context comes from subdomain, not headers.
 * The backend uses X-Subdomain header to resolve institution.
 * 
 * 🔒 MULTI-ACCOUNT: Uses tab-scoped sessionStorage for token storage.
 * Each browser tab has isolated auth state - multiple accounts can be
 * logged in simultaneously without session conflicts.
 */

import axios from 'axios';
import { getSubdomain } from '../hooks/useSubdomain';
import { getToken, getTabId, clearTabAuthOnly } from '../utils/tabStorage';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Cached institution ID for APIs
let cachedInstitutionId = null;

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Get current institution ID for API calls
 * This is used by legacy API wrappers for backward compatibility
 */
export function getCurrentInstitutionId() {
  if (cachedInstitutionId) return cachedInstitutionId;
  
  // Get from user data in tab-scoped storage
  try {
    const { getUser } = require('../utils/tabStorage');
    const user = getUser();
    if (user) {
      const institutionId = user.institution?.id;
      if (institutionId) {
        cachedInstitutionId = institutionId;
        return institutionId;
      }
    }
  } catch (e) {
    console.warn('Failed to get user data for institution ID');
  }
  
  return null;
}

/**
 * Set the current institution ID (called by InstitutionSelectionContext)
 */
export function setCurrentInstitutionId(institutionId) {
  cachedInstitutionId = institutionId;
}

/**
 * Clear cached institution ID on logout
 */
export function clearCachedInstitutionId() {
  cachedInstitutionId = null;
}

// Request interceptor - add auth token, tab ID, and subdomain
apiClient.interceptors.request.use(
  (config) => {
    // Get token from tab-scoped storage (isolated per tab)
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add tab ID header for session tracking
    const tabId = getTabId();
    if (tabId) {
      config.headers['X-Tab-Id'] = tabId;
    }

    // Add subdomain header for institution context resolution
    const subdomain = getSubdomain();
    if (subdomain) {
      config.headers['X-Subdomain'] = subdomain;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle auth errors
// NOTE: We do NOT unwrap response.data.data here because it would lose sibling properties
// like pagination, summary, etc. Components should access response.data.data for the array
// and response.data.pagination for pagination info.
apiClient.interceptors.response.use(
  (response) => {
    // Return response as-is to preserve full structure including pagination, summary, etc.
    return response;
  },
  (error) => {
    // Check if this is a login request - don't redirect on login failures
    const isLoginRequest = error.config?.url?.includes('/auth/login') || 
                           error.config?.url?.includes('/auth/student/login');
    
    if (error.response?.status === 401 && !isLoginRequest) {
      // Clear only this tab's auth state (NOT shared auth - don't affect other tabs)
      clearTabAuthOnly();
      clearCachedInstitutionId();
      
      const isStudentRoute = window.location.pathname.startsWith('/student');
      window.location.href = isStudentRoute ? '/student/login' : '/login';
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
