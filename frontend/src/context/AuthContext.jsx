/**
 * Authentication Context
 * Manages authentication state and auth methods.
 * 
 * 🔒 SECURITY: Institution context is now determined by subdomain, not by switching.
 * Super admin on institution subdomain = institution context
 * Super admin on admin subdomain = global context (no institution)
 * 
 * � MULTI-ACCOUNT: Uses tab-scoped sessionStorage for token/user storage.
 * Each browser tab has isolated auth state - multiple accounts can be
 * logged in simultaneously without session conflicts.
 * 
 * 🔗 SSO: Supports secure cross-subdomain single sign-on via one-time exchange tokens.
 * When navigating to a different subdomain with ?sso_token=..., the token is
 * exchanged server-side for a real JWT (the URL token is NOT stored directly).
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { createFeaturesApi, featuresApi } from '../api/features';
import { applyBrandingColors } from '../utils/colorGenerator';
import {
  getToken,
  setToken,
  getUser,
  setUser as storeUser,
  getSessionId,
  setSessionId,
  clearAuthState,
  prepareForLogin,
  storeAuthState,
} from '../utils/tabStorage';

const AuthContext = createContext(null);

/**
 * Extract and clean SSO token from URL IMMEDIATELY on module load.
 * This runs synchronously before React renders, so the token is never visible.
 */
let pendingSsoToken = null;

(function cleanSsoTokenFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const ssoToken = urlParams.get('sso_token');
  
  if (ssoToken) {
    // Store for later exchange
    pendingSsoToken = ssoToken;
    
    // Clean up URL IMMEDIATELY by removing the sso_token parameter
    urlParams.delete('sso_token');
    const newSearch = urlParams.toString();
    const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);
  }
})();

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [institution, setInstitution] = useState(null);
  const [isGlobalContext, setIsGlobalContext] = useState(false);
  const [subdomain, setSubdomain] = useState(null);
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if user is super_admin
  const isSuperAdmin = user?.role === 'super_admin';

  // Effective institution is the institution from subdomain context
  const effectiveInstitution = institution;

  // Initialize auth state from tab-scoped sessionStorage or SSO token exchange
  useEffect(() => {
    const initAuth = async () => {
      // Get SSO token that was extracted on module load
      const ssoToken = pendingSsoToken;
      pendingSsoToken = null; // Clear it so it's only used once
      
      // Get token from tab-scoped storage (isolated per tab)
      let token = getToken();
      
      // If we have an SSO token, clear existing state and exchange for new JWT
      if (ssoToken) {
        try {
          // Clear any existing auth state before SSO exchange
          prepareForLogin();
          
          const exchangeResponse = await authApi.exchangeSsoToken(ssoToken);
          const exchangeData = exchangeResponse.data.data || exchangeResponse.data;
          token = exchangeData.token;
          const sessionId = exchangeData.sessionId;
          
          // Store in tab-scoped storage
          setToken(token);
          if (sessionId) {
            setSessionId(sessionId);
          }
        } catch (err) {
          console.error('SSO token exchange failed:', err);
          // Continue with existing token if exchange fails
        }
      }

      // If we have a token (from SSO exchange or sessionStorage), verify and load profile
      if (token) {
        try {
          // Verify token is still valid and get profile with subdomain context
          const response = await authApi.getProfile();
          const profileData = response.data.data || response.data;
          
          // Update stored user with fresh profile data (tab-scoped)
          storeUser(profileData);
          
          setUserState(profileData);
          setInstitution(profileData.institution); // From subdomain resolution
          setIsGlobalContext(profileData.isGlobalContext || false);
          setSubdomain(profileData.subdomain || null);

          // Apply institution branding colors on init
          if (profileData.institution?.primary_color) {
            applyBrandingColors(
              profileData.institution.primary_color,
              profileData.institution.secondary_color
            );
          }

          // Load enabled features (requires institution context)
          if (profileData.institution?.id) {
            try {
              // Use institution ID directly from profile (don't rely on cached values)
              const institutionFeaturesApi = createFeaturesApi(profileData.institution.id);
              const featuresResponse = await institutionFeaturesApi.getEnabled();
              const featuresData = featuresResponse.data.data || featuresResponse.data || [];
              // Extract just the feature keys for quick lookup
              setFeatures(featuresData.map(f => f.feature_key));
            } catch (featuresErr) {
              console.warn('Could not load features:', featuresErr.message);
              setFeatures([]);
            }
          } else {
            // No institution = global context, no features needed
            setFeatures([]);
          }
        } catch (err) {
          // Token invalid, clear tab-scoped storage
          clearAuthState();
        }
      }

      setLoading(false);
    };

    initAuth();
  }, []);

  // Staff login
  const login = useCallback(async (email, password) => {
    setError(null);

    try {
      // 🔒 SECURITY: Clear existing auth state before new login
      // This prevents session pollution from previous logins in this tab
      prepareForLogin();

      const response = await authApi.login({ email, password });
      const loginData = response.data.data || response.data;
      const { token, sessionId } = loginData;

      // Store auth data in tab-scoped storage
      storeAuthState({ token, sessionId });

      // Fetch full profile data with subdomain context
      const profileResponse = await authApi.getProfile();
      const profileData = profileResponse.data.data || profileResponse.data;

      // Store user in tab-scoped storage
      storeUser(profileData);

      setUserState(profileData);
      setInstitution(profileData.institution); // From subdomain resolution
      setIsGlobalContext(profileData.isGlobalContext || false);
      setSubdomain(profileData.subdomain || null);

      // Apply institution branding colors
      if (profileData.institution?.primary_color) {
        applyBrandingColors(
          profileData.institution.primary_color,
          profileData.institution.secondary_color
        );
      }

      // Load enabled features if we have an institution context
      if (profileData.institution?.id) {
        try {
          // Use institution ID directly from profile (don't rely on cached values)
          const institutionFeaturesApi = createFeaturesApi(profileData.institution.id);
          const featuresResponse = await institutionFeaturesApi.getEnabled();
          const featuresData = featuresResponse.data.data || featuresResponse.data || [];
          // Extract just the feature keys for quick lookup
          setFeatures(featuresData.map(f => f.feature_key));
        } catch (featuresErr) {
          console.warn('Could not load features');
          setFeatures([]);
        }
      } else {
        // Global context = no features needed
        setFeatures([]);
      }

      return profileData;
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  // Student login
  const studentLogin = useCallback(async (registrationNumber, pin) => {
    setError(null);

    try {
      // 🔒 SECURITY: Clear existing auth state before new login
      prepareForLogin();

      const response = await authApi.studentLogin({ registrationNumber, pin });
      const loginData = response.data.data || response.data;
      const { token, sessionId } = loginData;

      // Store auth data in tab-scoped storage
      storeAuthState({ token, sessionId });

      // Fetch full profile data with subdomain context
      const profileResponse = await authApi.getProfile();
      const profileData = profileResponse.data.data || profileResponse.data;

      // Store user in tab-scoped storage
      storeUser(profileData);

      setUserState(profileData);
      setInstitution(profileData.institution);

      // Apply institution branding colors
      if (profileData.institution?.primary_color) {
        applyBrandingColors(
          profileData.institution.primary_color,
          profileData.institution.secondary_color
        );
      }

      // Load enabled features
      if (profileData.institution?.id) {
        try {
          // Use institution ID directly from profile
          const institutionFeaturesApi = createFeaturesApi(profileData.institution.id);
          const featuresResponse = await institutionFeaturesApi.getEnabled();
          const featuresData = featuresResponse.data.data || featuresResponse.data || [];
          setFeatures(featuresData.map(f => f.feature_key));
        } catch (featuresErr) {
          console.warn('Could not load features');
          setFeatures([]);
        }
      } else {
        setFeatures([]);
      }

      return profileData;
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  // Logout - clears ONLY this tab's session, not other tabs
  const logout = useCallback(async () => {
    try {
      // Notify server to invalidate session (fire and forget)
      // The sessionId in the token identifies which session to revoke
      await authApi.logout().catch(() => {});
    } finally {
      // Clear tab-scoped storage regardless of server response
      clearAuthState();
      setUserState(null);
      setInstitution(null);
      setIsGlobalContext(false);
      setSubdomain(null);
      setFeatures([]);
    }
  }, []);

  // Check if user has a specific role
  const hasRole = useCallback(
    (roles) => {
      if (!user) return false;
      const roleList = Array.isArray(roles) ? roles : [roles];
      return roleList.includes(user.role);
    },
    [user]
  );

  // Check if feature is enabled
  const hasFeature = useCallback(
    (featureKey) => {
      return features.includes(featureKey);
    },
    [features]
  );

  // Refresh features
  const refreshFeatures = useCallback(async () => {
    try {
      // Use institution from current state
      if (!institution?.id) {
        console.warn('No institution context for refreshing features');
        return;
      }
      const institutionFeaturesApi = createFeaturesApi(institution.id);
      const response = await institutionFeaturesApi.getEnabled();
      const featuresData = response.data.data || response.data || [];
      // Extract just the feature keys for quick lookup
      setFeatures(featuresData.map(f => f.feature_key));
    } catch (err) {
      console.error('Failed to refresh features:', err);
    }
  }, [institution]);

  const value = {
    user,
    institution,
    effectiveInstitution,
    features,
    loading,
    error,
    isAuthenticated: !!user,
    isStaff: user?.role !== 'student',
    isStudent: user?.role === 'student',
    isSuperAdmin,
    isGlobalContext, // On admin.* subdomain with no institution
    subdomain,
    login,
    studentLogin,
    logout,
    hasRole,
    hasFeature,
    refreshFeatures,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
