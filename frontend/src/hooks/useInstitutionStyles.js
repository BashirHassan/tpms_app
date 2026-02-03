/**
 * useInstitutionStyles Hook
 * Provides institution-aware color utilities for dynamic theming
 * 
 * This hook generates style objects and class names based on the 
 * institution's primary and secondary colors, enabling consistent
 * branding across the application.
 */

import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { hexToHsl, generateColorPalette } from '../utils/colorGenerator';

/**
 * Default fallback color (teal)
 */
const DEFAULT_PRIMARY = '#096c74';
const DEFAULT_SECONDARY = '#6366f1';

/**
 * Hook to get institution-based style utilities
 * @returns {Object} Style utilities for institution branding
 */
export function useInstitutionStyles() {
  const { institution, effectiveInstitution } = useAuth();
  
  // Use effective institution (switched or home)
  const inst = effectiveInstitution || institution;
  
  // Memoize the color palette generation
  const colors = useMemo(() => {
    const primaryColor = inst?.primary_color || DEFAULT_PRIMARY;
    const secondaryColor = inst?.secondary_color || DEFAULT_SECONDARY;
    
    const primaryPalette = generateColorPalette(primaryColor);
    const secondaryPalette = generateColorPalette(secondaryColor);
    
    return {
      primary: primaryPalette,
      secondary: secondaryPalette,
      raw: {
        primary: primaryColor,
        secondary: secondaryColor,
      },
    };
  }, [inst?.primary_color, inst?.secondary_color]);

  // Generate gradient style for banners/headers
  const gradientStyle = useMemo(() => ({
    background: `linear-gradient(to right, ${colors.primary[600]}, ${colors.primary[700]})`,
  }), [colors]);

  // Generate gradient style with secondary color
  const gradientSecondaryStyle = useMemo(() => ({
    background: `linear-gradient(to right, ${colors.primary[600]}, ${colors.secondary[600]})`,
  }), [colors]);

  // Style generators for common patterns
  const styles = useMemo(() => ({
    // Background styles
    bgPrimary: { backgroundColor: colors.primary[600] },
    bgPrimary50: { backgroundColor: colors.primary[50] },
    bgPrimary100: { backgroundColor: colors.primary[100] },
    bgPrimary500: { backgroundColor: colors.primary[500] },
    bgPrimary600: { backgroundColor: colors.primary[600] },
    bgPrimary700: { backgroundColor: colors.primary[700] },
    
    // Text styles
    textPrimary: { color: colors.primary[600] },
    textPrimary100: { color: colors.primary[100] },
    textPrimary200: { color: colors.primary[200] },
    textPrimary500: { color: colors.primary[500] },
    textPrimary600: { color: colors.primary[600] },
    textPrimary700: { color: colors.primary[700] },
    textPrimary900: { color: colors.primary[900] },
    
    // Border styles
    borderPrimary: { borderColor: colors.primary[600] },
    borderPrimary200: { borderColor: colors.primary[200] },
    borderPrimary500: { borderColor: colors.primary[500] },
    
    // Common UI patterns
    primaryButton: {
      backgroundColor: colors.primary[600],
      color: '#ffffff',
    },
    primaryButtonHover: {
      backgroundColor: colors.primary[700],
    },
    primaryOutline: {
      borderColor: colors.primary[600],
      color: colors.primary[600],
    },
    primaryBadge: {
      backgroundColor: colors.primary[100],
      color: colors.primary[800],
    },
    
    // Loading spinner
    spinnerBorder: {
      borderColor: colors.primary[200],
      borderTopColor: colors.primary[600],
    },
    
    // Gradient banner
    gradient: gradientStyle,
    gradientSecondary: gradientSecondaryStyle,
  }), [colors, gradientStyle, gradientSecondaryStyle]);

  // Get contrast text color for a given background shade
  const getContrastText = (shade = 600) => {
    const { l } = hexToHsl(colors.primary[shade]);
    return l > 50 ? '#000000' : '#ffffff';
  };

  return {
    colors,
    styles,
    gradientStyle,
    gradientSecondaryStyle,
    getContrastText,
    primaryColor: colors.raw.primary,
    secondaryColor: colors.raw.secondary,
    // Helper to check if institution has custom colors
    hasCustomColors: !!(inst?.primary_color),
  };
}

export default useInstitutionStyles;
