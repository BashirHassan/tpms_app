/**
 * Institution Selection Context
 * 
 * Manages active institution context and feature toggles.
 * 
 * 🔒 SECURITY: Institution context is now subdomain-determined.
 * - Regular users: institution from their user record
 * - Super admin on institution subdomain: institution from subdomain
 * - Super admin on admin subdomain: null (global context)
 * 
 * This context no longer allows "switching" - institution is fixed by subdomain.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { featuresApi, createFeaturesApi } from '../api/features';
import { setCurrentInstitutionId } from '../api/client';
import { applyBrandingColors, removeBrandingColors } from '../utils/colorGenerator';

/**
 * @typedef {'NOT_SELECTED' | 'SELECTED' | 'LOADING'} InstitutionStatus
 */

/**
 * @typedef {Object} Institution
 * @property {number} id
 * @property {string} name
 * @property {string} code
 * @property {string} subdomain
 * @property {string} status
 * @property {string} [primary_color]
 * @property {string} [secondary_color]
 * @property {string} [logo_url]
 */

/**
 * @typedef {Object} FeatureToggle
 * @property {string} feature_key
 * @property {string} name
 * @property {boolean} is_enabled
 * @property {boolean} is_premium
 * @property {string} module
 */

/**
 * @typedef {Object} InstitutionContextValue
 * @property {Institution|null} institution - Current active institution (from subdomain)
 * @property {InstitutionStatus} status - Current institution status
 * @property {string|null} error - Error message if status is ERROR
 * @property {boolean} hasInstitution - Whether an institution is available
 * @property {boolean} isLoading - Whether institution is loading
 * @property {Object<string, boolean>} features - Map of feature keys to enabled status
 * @property {Function} clearInstitution - Clear current institution
 * @property {Function} refreshInstitution - Refresh current institution data
 * @property {Function} isFeatureEnabled - Check if a feature is enabled
 * @property {Function} refreshFeatures - Refresh feature toggles
 */

const InstitutionSelectionContext = createContext(null);

export function InstitutionSelectionProvider({ children, user }) {
  const [institution, setInstitution] = useState(null);
  const [status, setStatus] = useState('NOT_SELECTED');
  const [featureToggles, setFeatureToggles] = useState([]);
  const [featuresLoading, setFeaturesLoading] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';
  // Institution comes directly from user object (resolved from subdomain by backend)
  const userInstitution = user?.institution;

  /**
   * Load feature toggles for an institution
   */
  const loadFeatures = useCallback(async (institutionId) => {
    if (!institutionId) {
      setFeatureToggles([]);
      return [];
    }

    setFeaturesLoading(true);
    try {
      // Use createFeaturesApi with explicit institutionId to avoid dependency on getCurrentInstitutionId
      const api = createFeaturesApi(institutionId);
      const response = await api.getEnabled();
      const features = response.data.data || response.data || [];
      setFeatureToggles(features);
      return features;
    } catch (err) {
      console.warn('Failed to load feature toggles:', err.message);
      setFeatureToggles([]);
      return [];
    } finally {
      setFeaturesLoading(false);
    }
  }, []);

  /**
   * Set institution from user data (from subdomain resolution)
   */
  const setInstitutionFromData = useCallback((institutionData) => {
    if (!institutionData || !institutionData.id) {
      setInstitution(null);
      setStatus('NOT_SELECTED');
      setCurrentInstitutionId(null);
      removeBrandingColors();
      return null;
    }

    setInstitution(institutionData);
    setStatus('SELECTED');

    // Update cached institution ID for API calls
    setCurrentInstitutionId(institutionData.id);

    // Apply institution branding
    if (institutionData.primary_color) {
      applyBrandingColors(institutionData.primary_color, institutionData.secondary_color);
    }

    // Load features for this institution (non-blocking)
    loadFeatures(institutionData.id);

    return institutionData;
  }, [loadFeatures]);

  /**
   * Clear institution context
   */
  const clearInstitution = useCallback(() => {
    setInstitution(null);
    setStatus('NOT_SELECTED');
    setFeatureToggles([]);
    setCurrentInstitutionId(null);
    removeBrandingColors();
  }, []);

  /**
   * Refresh only feature toggles
   */
  const refreshFeatures = useCallback(async () => {
    if (institution?.id) {
      return loadFeatures(institution.id);
    }
    return [];
  }, [institution?.id, loadFeatures]);

  /**
   * Check if a feature is enabled
   * @param {string} featureKey - The feature key to check
   * @returns {boolean} Whether the feature is enabled
   */
  const isFeatureEnabled = useCallback((featureKey) => {
    const feature = featureToggles.find(f => f.feature_key === featureKey);
    // The getEnabled endpoint only returns enabled features, so if found, it's enabled
    // Also handle cases where is_enabled might be 1 (number) or true (boolean)
    return feature ? (feature.is_enabled === true || feature.is_enabled === 1) : false;
  }, [featureToggles]);

  /**
   * Get features as a map for quick lookup
   */
  const featuresMap = useMemo(() => {
    const map = {};
    featureToggles.forEach(f => {
      map[f.feature_key] = f.is_enabled;
    });
    return map;
  }, [featureToggles]);

  /**
   * Initialize institution context when user changes
   * 
   * Institution context now comes from subdomain resolution:
   * - User's institution field is populated by backend based on subdomain
   * - No switching or manual selection allowed
   */
  useEffect(() => {
    if (!user) {
      // No user = clear institution
      clearInstitution();
      return;
    }

    // Institution comes directly from user object (resolved from subdomain by backend)
    if (userInstitution) {
      setInstitutionFromData(userInstitution);
    } else {
      // No institution = global context (super_admin on admin subdomain)
      clearInstitution();
    }
  }, [user?.id, userInstitution, setInstitutionFromData, clearInstitution]);

  const value = {
    // State
    institution,
    status,

    // Features
    features: featuresMap,
    featureToggles,
    featuresLoading,

    // Computed
    hasInstitution: status === 'SELECTED' && institution !== null,
    isLoading: status === 'LOADING',
    isGlobalContext: isSuperAdmin && !institution, // On admin.* subdomain

    // Actions
    clearInstitution,
    refreshFeatures,
    isFeatureEnabled,

    // For API client - current institution ID
    institutionId: institution?.id || null,
    selectedInstitutionId: institution?.id || null,  // Alias for useInstitutionApi hook
  };

  return <InstitutionSelectionContext.Provider value={value}>{children}</InstitutionSelectionContext.Provider>;
}

/**
 * Hook to access institution selection context
 * @returns {InstitutionContextValue}
 */
export function useInstitutionSelection() {
  const context = useContext(InstitutionSelectionContext);
  if (!context) {
    throw new Error('useInstitutionSelection must be used within an InstitutionSelectionProvider');
  }
  return context;
}

/**
 * Hook that requires an institution to be selected
 * Throws if no institution is selected
 * @returns {InstitutionContextValue & { institution: Institution }}
 */
export function useRequiredInstitution() {
  const context = useInstitutionSelection();
  if (!context.hasInstitution) {
    throw new Error('This component requires an active institution. Please select an institution.');
  }
  return context;
}

/**
 * Hook to check if a specific feature is enabled
 * @param {string} featureKey - The feature key to check
 * @returns {boolean} Whether the feature is enabled
 */
export function useFeature(featureKey) {
  const { isFeatureEnabled } = useInstitutionSelection();
  return isFeatureEnabled(featureKey);
}

/**
 * Hook to get all features as a map
 * @returns {Object<string, boolean>}
 */
export function useFeatures() {
  const { features } = useInstitutionSelection();
  return features;
}

export default InstitutionSelectionContext;
