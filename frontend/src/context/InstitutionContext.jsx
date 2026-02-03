/**
 * Institution Branding Context
 * Manages institution branding, colors, and theming across the app
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSubdomain, isSuperAdminPortal } from '../hooks/useSubdomain';
import { applyBrandingColors, removeBrandingColors } from '../utils/colorGenerator';
import apiClient from '../api/client';

const InstitutionContext = createContext(null);

// Default branding for super admin portal / platform default
const DEFAULT_BRANDING = {
  name: 'DigitalTP',
  code: 'DIGITALTP',
  logo_url: null,
  primary_color: '#096c74',
  secondary_color: '#6366f1', // Indigo
  tagline: 'Teaching Practice Management System',
  tp_unit_name: 'Teaching Practice Coordination Unit',
};

export function InstitutionProvider({ children }) {
  const subdomain = useSubdomain();
  const isSuperAdmin = isSuperAdminPortal();
  
  const [institution, setInstitution] = useState(null);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch institution branding
  const fetchBranding = useCallback(async () => {
    // No subdomain or super admin portal - use default platform branding
    if (!subdomain || isSuperAdmin) {
      setBranding(DEFAULT_BRANDING);
      applyBrandingColors(DEFAULT_BRANDING.primary_color, DEFAULT_BRANDING.secondary_color);
      // Clear institution cache for super admin / no subdomain
      localStorage.removeItem('institution');
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get(`/public/institution/${subdomain}`);
      const data = response.data.data || response.data || {};
      
      setInstitution(data);
      
      // Cache institution in localStorage for publicApi access
      localStorage.setItem('institution', JSON.stringify({ id: data.id, code: data.code, name: data.name }));
      
      setBranding({
        name: data.name,
        code: data.code,
        logo_url: data.logo_url,
        primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
        secondary_color: data.secondary_color || DEFAULT_BRANDING.secondary_color,
        tagline: data.tagline || DEFAULT_BRANDING.tagline,
        tp_unit_name: data.tp_unit_name || DEFAULT_BRANDING.tp_unit_name,
      });
      
      // Apply colors to CSS variables
      applyBrandingColors(
        data.primary_color || DEFAULT_BRANDING.primary_color,
        data.secondary_color || DEFAULT_BRANDING.secondary_color
      );
      
      // Update page title
      document.title = `${data.name} - DigitalTP`;
      
      // Update favicon if institution has logo
      if (data.logo_url) {
        const existingFavicon = document.querySelector('link[rel="icon"]');
        if (existingFavicon) {
          existingFavicon.href = data.logo_url;
        }
      }

      setError(null);
    } catch (err) {
      console.error('Failed to fetch institution branding:', err);
      setError(err.response?.data?.message || 'Institution not found');
      setBranding(DEFAULT_BRANDING);
      applyBrandingColors(DEFAULT_BRANDING.primary_color, DEFAULT_BRANDING.secondary_color);
      // Clear cached institution on error
      localStorage.removeItem('institution');
    } finally {
      setLoading(false);
    }
  }, [subdomain, isSuperAdmin]);

  // Fetch branding on mount and when subdomain changes
  useEffect(() => {
    fetchBranding();
  }, [fetchBranding]);

  // Update branding (for super admin switching)
  const updateBranding = useCallback((newInstitution) => {
    if (!newInstitution) {
      setBranding(DEFAULT_BRANDING);
      applyBrandingColors(DEFAULT_BRANDING.primary_color, DEFAULT_BRANDING.secondary_color);
      setInstitution(null);
      document.title = 'DigitalTP - Teaching Practice Management';
      return;
    }
    
    setInstitution(newInstitution);
    setBranding({
      name: newInstitution.name,
      code: newInstitution.code,
      logo_url: newInstitution.logo_url,
      primary_color: newInstitution.primary_color || DEFAULT_BRANDING.primary_color,
      secondary_color: newInstitution.secondary_color || DEFAULT_BRANDING.secondary_color,
      tagline: newInstitution.tagline || DEFAULT_BRANDING.tagline,
      tp_unit_name: newInstitution.tp_unit_name || DEFAULT_BRANDING.tp_unit_name,
    });
    
    applyBrandingColors(
      newInstitution.primary_color || DEFAULT_BRANDING.primary_color,
      newInstitution.secondary_color || DEFAULT_BRANDING.secondary_color
    );

    document.title = `${newInstitution.name} - DigitalTP`;
  }, []);

  // Reset to default branding
  const resetBranding = useCallback(() => {
    removeBrandingColors();
    setBranding(DEFAULT_BRANDING);
    setInstitution(null);
    setError(null);
    document.title = 'DigitalTP - Teaching Practice Management';
    // Clear cached institution
    localStorage.removeItem('institution');
  }, []);

  const value = {
    subdomain,
    institution,
    branding,
    loading,
    error,
    isSuperAdminPortal: isSuperAdmin,
    updateBranding,
    resetBranding,
    refetchBranding: fetchBranding,
    // Helper to check if we have institution context
    hasInstitution: !!institution,
  };

  return (
    <InstitutionContext.Provider value={value}>
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitution() {
  const context = useContext(InstitutionContext);
  if (!context) {
    throw new Error('useInstitution must be used within InstitutionProvider');
  }
  return context;
}

export default InstitutionContext;
