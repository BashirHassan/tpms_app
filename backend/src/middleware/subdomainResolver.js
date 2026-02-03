/**
 * Subdomain Resolution Middleware
 * 
 * Resolves institution from subdomain before authentication.
 * This allows institution-specific login pages and public routes.
 * 
 * Resolution Priority:
 * 1. Subdomain from host header (primary for SaaS)
 * 2. X-Subdomain header (for Nginx proxy)
 * 
 * Special Subdomains:
 * - 'admin' subdomain = Global admin context (super_admin only, no institution)
 * - Institution subdomain = Institution-scoped context
 */

const pool = require('../db/connection');
const config = require('../config');

// In-memory cache for institution lookups (TTL: 5 minutes)
const institutionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extract subdomain from host (with local dev support)
 * @param {string} host - Full host header (e.g., "fuk.digitaltipi.com")
 * @param {object} query - Query parameters
 * @returns {string|null} - Subdomain or null
 */
function extractSubdomain(host, query = {}) {
  if (!host) return null;
  
  // Remove port if present
  const hostWithoutPort = host.split(':')[0];
  const parts = hostWithoutPort.split('.');
  
  // LOCAL DEV: Check query parameter first (only in dev)
  if (config.localDev?.allowQuerySubdomain && query.subdomain) {
    return query.subdomain.toLowerCase();
  }
  
  // LOCAL DEV: Handle .localhost domains (e.g., fuk.localhost, demo.localhost, admin.localhost)
  if (config.localDev?.enabled && hostWithoutPort.endsWith('.localhost')) {
    if (parts.length >= 2) {
      const subdomain = parts[0].toLowerCase();
      // 'admin' is a special subdomain for global context, not reserved
      const reserved = ['www', 'api'];
      if (!reserved.includes(subdomain)) {
        return subdomain;
      }
    }
  }
  
  // LOCAL DEV: Handle .local domains (e.g., fuk.digitaltipi.local)
  if (config.localDev?.enabled) {
    const localDomains = config.localDev.localDomains || [];
    
    // Check if it's a local subdomain
    if (parts.length >= 3) {
      const baseDomain = parts.slice(-2).join('.');
      const subdomain = parts[0].toLowerCase();
      
      // If base is a local domain, extract subdomain
      // 'admin' is a special subdomain for global context, not reserved
      if (localDomains.some(d => baseDomain.includes(d) || hostWithoutPort.includes(d))) {
        const reserved = ['www', 'api'];
        if (!reserved.includes(subdomain)) {
          return subdomain;
        }
      }
    }
    
    // Plain localhost - check for subdomain query param
    if (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1') {
      return query.subdomain || null;
    }
  }
  
  // PRODUCTION: Standard subdomain extraction
  // Match pattern: subdomain.domain.tld
  // Expect at least 3 parts for subdomain (sub.domain.tld)
  if (parts.length >= 3) {
    const subdomain = parts[0].toLowerCase();
    
    // Reserved subdomains (not institution subdomains)
    // Note: 'admin' is NOT reserved - it's the global admin subdomain
    const reserved = ['www', 'api', 'mail', 'ftp', 'staging', 'dev'];
    if (reserved.includes(subdomain)) {
      return null;
    }
    
    return subdomain;
  }
  
  return null;
}

/**
 * Lookup institution by subdomain with caching
 * @param {string} subdomain - Institution subdomain
 * @returns {Promise<object|null>} - Institution data or null
 */
async function getInstitutionBySubdomain(subdomain) {
  if (!subdomain) return null;
  
  const cacheKey = `subdomain:${subdomain}`;
  const cached = institutionCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const [institutions] = await pool.query(
      `SELECT id, name, code, subdomain, status, logo_url, primary_color, secondary_color,
              maintenance_mode, maintenance_message, tp_unit_name
       FROM institutions 
       WHERE subdomain = ? AND status = 'active'
       LIMIT 1`,
      [subdomain]
    );
    
    const institution = institutions[0] || null;
    
    // Cache the result (even null to prevent repeated DB hits)
    institutionCache.set(cacheKey, {
      data: institution,
      timestamp: Date.now(),
    });
    
    return institution;
  } catch (error) {
    console.error('Error looking up institution by subdomain:', error);
    return null;
  }
}

/**
 * Clear institution cache (call when institution is updated)
 * @param {string|null} subdomain - Specific subdomain to clear, or null to clear all
 */
function clearInstitutionCache(subdomain = null) {
  if (subdomain) {
    institutionCache.delete(`subdomain:${subdomain}`);
  } else {
    institutionCache.clear();
  }
}

/**
 * Subdomain resolution middleware
 * Attaches institution context to request before authentication
 * 
 * Special handling:
 * - 'admin' subdomain = Global context (super_admin only)
 * - Institution subdomain = Institution-scoped context
 * - No subdomain = Landing page (public)
 */
const resolveSubdomain = async (req, res, next) => {
  try {
    // Try to get subdomain from various sources
    const host = req.headers.host || req.headers['x-forwarded-host'];
    const nginxSubdomain = req.headers['x-subdomain'];
    
    // Pass query params for local dev support
    const subdomain = nginxSubdomain || extractSubdomain(host, req.query);
    
    // Store subdomain on request
    req.subdomain = subdomain;
    
    // 'admin' subdomain = Global admin context (no institution)
    if (subdomain === 'admin') {
      req.isGlobalContext = true;
      req.subdomainInstitution = null;
      return next();
    }
    
    if (subdomain) {
      const institution = await getInstitutionBySubdomain(subdomain);
      
      if (institution) {
        // Check maintenance mode
        if (institution.maintenance_mode) {
          return res.status(503).json({
            success: false,
            message: institution.maintenance_message || 'System is under maintenance',
            errorCode: 'MAINTENANCE_MODE',
            institution: {
              name: institution.name,
              logo_url: institution.logo_url,
            },
          });
        }
        
        // Attach to request for use in routes
        req.subdomainInstitution = institution;
        req.isGlobalContext = false;
      }
      // Unknown subdomain - allow request to continue (might be invalid)
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Require valid subdomain middleware
 * Use for routes that MUST have institution context from subdomain
 */
const requireSubdomain = (req, res, next) => {
  if (!req.subdomainInstitution) {
    return res.status(404).json({
      success: false,
      message: 'Institution not found. Please check the URL.',
      errorCode: 'INSTITUTION_NOT_FOUND',
    });
  }
  next();
};

/**
 * Check if request is from global admin portal (admin.* subdomain)
 * @param {object} req - Express request
 * @returns {boolean}
 */
function isGlobalAdminPortal(req) {
  // Use already-resolved subdomain if available
  if (req.subdomain === 'admin' || req.isGlobalContext === true) {
    return true;
  }
  
  const host = req.headers.host || req.headers['x-forwarded-host'] || '';
  const hostWithoutPort = host.split(':')[0];
  const parts = hostWithoutPort.split('.');
  
  // Check for admin subdomain (admin.localhost, admin.digitaltipi.com)
  if (parts.length >= 2 && parts[0].toLowerCase() === 'admin') {
    return true;
  }
  
  return false;
}

/**
 * @deprecated Use isGlobalAdminPortal instead
 */
const isSuperAdminPortal = isGlobalAdminPortal;

module.exports = {
  resolveSubdomain,
  requireSubdomain,
  extractSubdomain,
  getInstitutionBySubdomain,
  clearInstitutionCache,
  isGlobalAdminPortal,
  isSuperAdminPortal, // Alias for backwards compatibility
};
