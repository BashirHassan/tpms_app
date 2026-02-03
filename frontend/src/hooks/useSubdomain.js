/**
 * Subdomain Detection Hook
 * Extracts subdomain from current URL with local development support
 */

import { useMemo } from 'react';

/**
 * Check if running in local development
 * @returns {boolean}
 */
export function isLocalDev() {
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    import.meta.env.DEV
  );
}

/**
 * Get subdomain from URL (works in both dev and production)
 * @returns {string|null}
 */
export function getSubdomain() {
  const host = window.location.hostname;
  const parts = host.split('.');
  
  // LOCAL DEV: Check query parameter first
  if (isLocalDev()) {
    const urlParams = new URLSearchParams(window.location.search);
    const querySubdomain = urlParams.get('subdomain');
    if (querySubdomain) {
      return querySubdomain.toLowerCase();
    }
    
    // Check localStorage fallback for persistent testing
    const storedSubdomain = localStorage.getItem('dev_subdomain');
    if (storedSubdomain) {
      return storedSubdomain.toLowerCase();
    }
  }
  
  // Handle .localhost domains (e.g., fuk.localhost, admin.localhost)
  if (host.endsWith('.localhost') && parts.length >= 2) {
    const subdomain = parts[0].toLowerCase();
    // 'admin' is a valid subdomain for global admin portal
    // Only filter out www, api (not used for UI)
    const reserved = ['www', 'api'];
    if (!reserved.includes(subdomain)) {
      return subdomain;
    }
  }
  
  // Handle .local domains (e.g., fuk.digitaltipi.local, admin.digitaltipi.local)
  if (host.endsWith('.local') && parts.length >= 3) {
    const subdomain = parts[0].toLowerCase();
    const reserved = ['www', 'api'];
    if (!reserved.includes(subdomain)) {
      return subdomain;
    }
  }
  
  // Plain localhost without query param = super admin / default
  if (host === 'localhost' || host === '127.0.0.1') {
    return null;
  }
  
  // PRODUCTION: Standard subdomain extraction
  if (parts.length >= 3) {
    const subdomain = parts[0].toLowerCase();
    // 'admin' is valid for global admin portal
    const reserved = ['www', 'api', 'localhost'];
    if (!reserved.includes(subdomain)) {
      return subdomain;
    }
  }
  
  return null;
}

/**
 * React hook for subdomain detection (memoized)
 * @returns {string|null}
 */
export function useSubdomain() {
  return useMemo(() => getSubdomain(), []);
}

/**
 * Check if current host is the super admin portal
 * @returns {boolean}
 */
export function isSuperAdminPortal() {
  const host = window.location.hostname;
  const parts = host.split('.');
  
  // LOCAL DEV: localhost without subdomain query = admin
  if (isLocalDev()) {
    const subdomain = getSubdomain();
    // If no subdomain specified, treat as admin portal
    if (!subdomain) {
      return true;
    }
    // Explicit admin subdomain
    if (subdomain === 'admin') {
      return true;
    }
    // Check for admin.digitaltipi.local
    if (parts.length >= 3 && parts[0].toLowerCase() === 'admin') {
      return true;
    }
    return false;
  }
  
  // PRODUCTION: admin.digitaltipi.com
  if (parts.length >= 3) {
    const subdomain = parts[0].toLowerCase();
    return subdomain === 'admin';
  }
  
  return false;
}

/**
 * Check if current host is the landing page (main domain without institution subdomain)
 * @returns {boolean}
 */
export function isLandingPage() {
  const host = window.location.hostname;
  const parts = host.split('.');
  
  // LOCAL DEV: Check if any subdomain is specified
  if (isLocalDev()) {
    // Check for .localhost subdomain (e.g., demo.localhost, fuk.localhost, admin.localhost)
    if (host.endsWith('.localhost') && parts.length >= 2) {
      const subdomain = parts[0].toLowerCase();
      // www is landing page, everything else (including admin, institution subdomains) is NOT landing
      if (subdomain !== 'www') {
        return false; // Has a subdomain (admin or institution), not landing page
      }
    }
    
    // Check query param or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const querySubdomain = urlParams.get('subdomain');
    const storedSubdomain = localStorage.getItem('dev_subdomain');
    
    // If no subdomain specified anywhere, this is the landing page
    if (!querySubdomain && !storedSubdomain) {
      return true;
    }
    return false;
  }
  
  // Main domain without subdomain (digitaltipi.com)
  if (parts.length === 2) {
    return true;
  }
  
  // www subdomain
  if (parts.length >= 3 && parts[0].toLowerCase() === 'www') {
    return true;
  }
  
  return false;
}

/**
 * Development helper: Set subdomain for testing
 * Usage: setDevSubdomain('fuk') then reload
 * @param {string|null} subdomain
 */
export function setDevSubdomain(subdomain) {
  if (!isLocalDev()) {
    console.warn('setDevSubdomain only works in development');
    return;
  }
  
  if (subdomain) {
    localStorage.setItem('dev_subdomain', subdomain.toLowerCase());
    console.log(`Dev subdomain set to: ${subdomain}. Reload to apply.`);
  } else {
    localStorage.removeItem('dev_subdomain');
    console.log('Dev subdomain cleared. Reload to apply.');
  }
}

/**
 * Development helper: Get current subdomain info
 * @returns {object}
 */
export function getSubdomainInfo() {
  return {
    subdomain: getSubdomain(),
    isSuperAdmin: isSuperAdminPortal(),
    isLanding: isLandingPage(),
    isLocalDev: isLocalDev(),
    host: window.location.hostname,
    queryParam: new URLSearchParams(window.location.search).get('subdomain'),
    localStorage: localStorage.getItem('dev_subdomain'),
  };
}

/**
 * React hook for landing page detection (memoized)
 * @returns {boolean}
 */
export function useLandingPage() {
  return useMemo(() => isLandingPage(), []);
}

/**
 * Check if current subdomain is the admin subdomain
 * @returns {boolean}
 */
export function isAdminSubdomain() {
  const subdomain = getSubdomain();
  return subdomain === 'admin' || isSuperAdminPortal();
}

/**
 * Get the admin domain URL based on environment
 * @returns {string}
 */
export function getAdminDomain() {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return 'http://admin.localhost:5173';
  }
  return 'https://admin.digitaltipi.com';
}

/**
 * Get institution URL based on environment
 * @param {string} subdomain - Institution subdomain
 * @returns {string}
 */
export function getInstitutionUrl(subdomain) {
  const host = window.location.host;
  if (host.includes('localhost')) {
    return `http://${subdomain}.localhost:5173`;
  }
  return `https://${subdomain}.digitaltipi.com`;
}

// Expose helpers to window for console debugging
if (typeof window !== 'undefined' && isLocalDev()) {
  window.digitaltp = {
    setSubdomain: setDevSubdomain,
    getSubdomainInfo,
    clearSubdomain: () => setDevSubdomain(null),
  };
  console.log('🔧 DigitalTP Dev Tools loaded. Use window.digitaltp.setSubdomain("fuk") to test institutions.');
}

export default useSubdomain;
