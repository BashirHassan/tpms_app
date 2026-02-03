/**
 * Feature Toggle Middleware
 * Dynamic feature flag enforcement
 * 
 * MedeePay Pattern: Uses direct SQL queries instead of models.
 * Institution context comes from req.institution (set by requireInstitutionAccess middleware).
 */

const { query } = require('../db/database');

// Simple cache for feature lookups (1 minute TTL)
const featureCache = new Map();
const CACHE_TTL = 60 * 1000;

/**
 * Check if a feature is enabled for an institution
 * @param {string} featureKey - Feature key to check
 * @param {number} institutionId - Institution ID
 * @returns {Promise<boolean>}
 */
async function isFeatureEnabled(featureKey, institutionId) {
  if (!featureKey || !institutionId) return false;

  const cacheKey = `${institutionId}:${featureKey}`;
  const cached = featureCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.enabled;
  }

  try {
    const rows = await query(
      `SELECT 
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled
       FROM feature_toggles ft
       LEFT JOIN institution_feature_toggles ift 
         ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?
       WHERE ft.feature_key = ?`,
      [institutionId, featureKey]
    );

    const enabled = rows.length > 0 && rows[0].is_enabled === 1;
    featureCache.set(cacheKey, { enabled, timestamp: Date.now() });
    return enabled;
  } catch (error) {
    console.error(`Error checking feature ${featureKey}:`, error.message);
    return false;
  }
}

/**
 * Get all enabled features for an institution
 * @param {number} institutionId - Institution ID
 * @returns {Promise<string[]>}
 */
async function getEnabledFeatures(institutionId) {
  if (!institutionId) return [];

  const cacheKey = `${institutionId}:all`;
  const cached = featureCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.features;
  }

  try {
    const rows = await query(
      `SELECT 
        ft.feature_key,
        COALESCE(ift.is_enabled, ft.default_enabled, ft.is_enabled) as is_enabled
       FROM feature_toggles ft
       LEFT JOIN institution_feature_toggles ift 
         ON ft.id = ift.feature_toggle_id AND ift.institution_id = ?`,
      [institutionId]
    );

    const features = rows
      .filter(row => row.is_enabled === 1)
      .map(row => row.feature_key);
    
    featureCache.set(cacheKey, { features, timestamp: Date.now() });
    return features;
  } catch (error) {
    console.error('Error getting enabled features:', error.message);
    return [];
  }
}

/**
 * Clear feature cache for an institution
 * @param {number} [institutionId] - Clear specific institution, or all if not provided
 */
function clearFeatureCache(institutionId = null) {
  if (institutionId) {
    // Clear all entries for this institution
    for (const key of featureCache.keys()) {
      if (key.startsWith(`${institutionId}:`)) {
        featureCache.delete(key);
      }
    }
  } else {
    featureCache.clear();
  }
}

/**
 * Require feature to be enabled for institution
 * @param {string} featureKey - The feature key to check
 * @returns {Function} Express middleware
 */
const requireFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      // Get institution ID from req.institution (set by requireInstitutionAccess) or req.institutionId
      const institutionId = req.institution?.id || req.institutionId;

      if (!institutionId) {
        return res.status(401).json({
          success: false,
          message: 'Institution context required.',
          errorCode: 'NO_INSTITUTION_CONTEXT',
        });
      }

      const enabled = await isFeatureEnabled(featureKey, institutionId);

      if (!enabled) {
        return res.status(403).json({
          success: false,
          message: `This feature is not available for your institution.`,
          errorCode: 'FEATURE_DISABLED',
          feature: featureKey,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check multiple features (all must be enabled)
 * @param {...string} featureKeys - Feature keys to check
 * @returns {Function} Express middleware
 */
const requireAllFeatures = (...featureKeys) => {
  return async (req, res, next) => {
    try {
      const institutionId = req.institution?.id || req.institutionId;

      if (!institutionId) {
        return res.status(401).json({
          success: false,
          message: 'Institution context required.',
          errorCode: 'NO_INSTITUTION_CONTEXT',
        });
      }

      const enabledFeatures = await getEnabledFeatures(institutionId);
      const missingFeatures = featureKeys.filter((key) => !enabledFeatures.includes(key));

      if (missingFeatures.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Required features are not available.`,
          errorCode: 'FEATURES_DISABLED',
          missingFeatures,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check any of multiple features (at least one must be enabled)
 * @param {...string} featureKeys - Feature keys to check
 * @returns {Function} Express middleware
 */
const requireAnyFeature = (...featureKeys) => {
  return async (req, res, next) => {
    try {
      const institutionId = req.institution?.id || req.institutionId;

      if (!institutionId) {
        return res.status(401).json({
          success: false,
          message: 'Institution context required.',
          errorCode: 'NO_INSTITUTION_CONTEXT',
        });
      }

      const enabledFeatures = await getEnabledFeatures(institutionId);
      const hasAny = featureKeys.some((key) => enabledFeatures.includes(key));

      if (!hasAny) {
        return res.status(403).json({
          success: false,
          message: `None of the required features are available.`,
          errorCode: 'FEATURES_DISABLED',
          requiredFeatures: featureKeys,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  requireFeature,
  requireAllFeatures,
  requireAnyFeature,
  isFeatureEnabled,
  getEnabledFeatures,
  clearFeatureCache,
};
