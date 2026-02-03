/**
 * useInstitutionApi Hook
 * 
 * Provides API methods that automatically include the institution ID in the URL path.
 * This follows the MedeePay pattern where institution context is explicit in the URL.
 * 
 * Usage:
 * const { get, post, put, del } = useInstitutionApi();
 * const students = await get('/students');  // becomes /api/:institutionId/students
 */

import { useCallback, useMemo } from 'react';
import apiClient from '../api/client';
import { useInstitutionSelection } from '../context/InstitutionSelectionContext';

/**
 * Hook that provides institution-scoped API methods
 * @returns {Object} API methods with automatic institution prefixing
 */
export function useInstitutionApi() {
  const { selectedInstitutionId, institutionId } = useInstitutionSelection();
  
  // Use selected institution ID from context
  const activeInstitutionId = selectedInstitutionId || institutionId;

  /**
   * Build the full path with institution ID prefix
   */
  const buildPath = useCallback((path) => {
    if (!activeInstitutionId) {
      console.warn('useInstitutionApi: No institution ID available');
      throw new Error('Institution context required. Please select an institution.');
    }
    
    // Remove leading slash if present, then add institution prefix
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `/${activeInstitutionId}/${cleanPath}`;
  }, [activeInstitutionId]);

  /**
   * GET request with institution prefix
   */
  const get = useCallback(async (path, config = {}) => {
    const response = await apiClient.get(buildPath(path), config);
    return response.data;
  }, [buildPath]);

  /**
   * POST request with institution prefix
   */
  const post = useCallback(async (path, data = {}, config = {}) => {
    const response = await apiClient.post(buildPath(path), data, config);
    return response.data;
  }, [buildPath]);

  /**
   * PUT request with institution prefix
   */
  const put = useCallback(async (path, data = {}, config = {}) => {
    const response = await apiClient.put(buildPath(path), data, config);
    return response.data;
  }, [buildPath]);

  /**
   * PATCH request with institution prefix
   */
  const patch = useCallback(async (path, data = {}, config = {}) => {
    const response = await apiClient.patch(buildPath(path), data, config);
    return response.data;
  }, [buildPath]);

  /**
   * DELETE request with institution prefix
   */
  const del = useCallback(async (path, config = {}) => {
    const response = await apiClient.delete(buildPath(path), config);
    return response.data;
  }, [buildPath]);

  /**
   * Upload file with institution prefix
   */
  const upload = useCallback(async (path, formData, config = {}) => {
    const response = await apiClient.post(buildPath(path), formData, {
      ...config,
      headers: {
        ...config.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }, [buildPath]);

  /**
   * Get raw axios response (for when you need headers, status, etc.)
   */
  const getRaw = useCallback(async (path, config = {}) => {
    return apiClient.get(buildPath(path), config);
  }, [buildPath]);

  /**
   * Post and get raw axios response
   */
  const postRaw = useCallback(async (path, data = {}, config = {}) => {
    return apiClient.post(buildPath(path), data, config);
  }, [buildPath]);

  return useMemo(() => ({
    get,
    post,
    put,
    patch,
    del,
    delete: del, // alias
    upload,
    getRaw,
    postRaw,
    institutionId,
    hasInstitution: !!institutionId,
    buildPath,
  }), [get, post, put, patch, del, upload, getRaw, postRaw, institutionId, buildPath]);
}

/**
 * Non-hook version for use in non-React contexts (e.g., utility functions)
 * Requires institution ID to be passed explicitly
 */
export function createInstitutionApi(institutionId) {
  if (!institutionId) {
    throw new Error('Institution ID is required');
  }

  const buildPath = (path) => {
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `/${institutionId}/${cleanPath}`;
  };

  return {
    get: async (path, config = {}) => {
      const response = await apiClient.get(buildPath(path), config);
      return response.data;
    },
    post: async (path, data = {}, config = {}) => {
      const response = await apiClient.post(buildPath(path), data, config);
      return response.data;
    },
    put: async (path, data = {}, config = {}) => {
      const response = await apiClient.put(buildPath(path), data, config);
      return response.data;
    },
    patch: async (path, data = {}, config = {}) => {
      const response = await apiClient.patch(buildPath(path), data, config);
      return response.data;
    },
    del: async (path, config = {}) => {
      const response = await apiClient.delete(buildPath(path), config);
      return response.data;
    },
    upload: async (path, formData, config = {}) => {
      const response = await apiClient.post(buildPath(path), formData, {
        ...config,
        headers: {
          ...config.headers,
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    buildPath,
    institutionId,
  };
}

export default useInstitutionApi;
