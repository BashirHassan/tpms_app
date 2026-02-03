/**
 * Nigeria GeoData Service (Frontend)
 * 
 * Provides access to Nigeria's administrative geography data:
 * - States
 * - LGAs (Local Government Areas)
 * - Wards with GPS coordinates
 * 
 * This is a frontend-only service that loads data from local JSON files,
 * eliminating the need for API calls for static geographic data.
 * 
 * Data source: Nigeria GeoJSON data (copied from backend)
 */

// Import static data - these are bundled with the app
import statesData from './states.json';
import lgasData from './lgas.json';

// Lazy-loaded data (larger files, loaded on demand)
let lgasWithWardsData = null;
let wardsData = null;

/**
 * Load wards data lazily (only when needed)
 * @returns {Promise<Object>} LGAs with wards data
 */
async function loadWardsData() {
  if (!lgasWithWardsData) {
    const module = await import('./lgas-with-wards.json');
    lgasWithWardsData = module.default;
  }
  return lgasWithWardsData;
}

/**
 * Load flat wards data lazily (for searching)
 * @returns {Promise<Array>} Flat list of all wards
 */
async function loadFlatWardsData() {
  if (!wardsData) {
    const module = await import('./wards.json');
    wardsData = module.default;
  }
  return wardsData;
}

/**
 * Normalize state name (handle FCT variations and spelling)
 * @param {string} state - State name
 * @returns {string} Normalized state name
 */
function normalizeStateName(state) {
  if (!state) return '';
  
  const stateLower = state.toLowerCase().trim();
  
  // Handle FCT variations
  if (stateLower === 'fct' || stateLower === 'abuja' || stateLower.includes('federal capital')) {
    return 'Federal Capital Territory';
  }
  
  // Handle Nassarawa/Nasarawa spelling
  if (stateLower === 'nasarawa' || stateLower === 'nassarawa') {
    return 'Nassarawa';
  }
  
  // Find case-insensitive match
  const match = statesData?.find(s => s.toLowerCase() === stateLower);
  return match || state;
}

/**
 * Get all Nigerian states
 * @returns {string[]} Array of state names
 */
function getStates() {
  return statesData || [];
}

/**
 * Get LGAs for a specific state
 * @param {string} state - State name
 * @returns {string[]} Array of LGA names
 */
function getLGAs(state) {
  if (!state) return [];
  
  const normalizedState = normalizeStateName(state);
  return lgasData[normalizedState] || [];
}

/**
 * Get wards for a specific state and LGA (async - lazy loads data)
 * @param {string} state - State name
 * @param {string} lga - LGA name
 * @returns {Promise<Array<{name: string, latitude: number, longitude: number}>>} Array of ward objects with coordinates
 */
async function getWards(state, lga) {
  if (!state || !lga) return [];
  
  const data = await loadWardsData();
  const normalizedState = normalizeStateName(state);
  const stateData = data[normalizedState];
  if (!stateData) return [];
  
  return stateData[lga] || [];
}

/**
 * Get ward details with coordinates (async - lazy loads data)
 * @param {string} state - State name
 * @param {string} lga - LGA name
 * @param {string} wardName - Ward name
 * @returns {Promise<{name: string, latitude: number, longitude: number} | null>} Ward details or null
 */
async function getWardCoordinates(state, lga, wardName) {
  const wards = await getWards(state, lga);
  if (!wards.length) return null;
  
  // Find exact match first
  let ward = wards.find(w => w.name.toLowerCase() === wardName.toLowerCase());
  
  // If no exact match, try partial match
  if (!ward) {
    ward = wards.find(w => 
      w.name.toLowerCase().includes(wardName.toLowerCase()) ||
      wardName.toLowerCase().includes(w.name.toLowerCase())
    );
  }
  
  return ward || null;
}

/**
 * Search wards by name across all states/LGAs (async - lazy loads data)
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array<{state: string, lga: string, name: string, latitude: number, longitude: number}>>}
 */
async function searchWards(query, limit = 20) {
  if (!query || query.length < 2) return [];
  
  const data = await loadFlatWardsData();
  const searchLower = query.toLowerCase();
  const results = [];
  
  for (const ward of data) {
    if (ward.Ward.toLowerCase().includes(searchLower)) {
      results.push({
        state: ward.State,
        lga: ward.LGA,
        name: ward.Ward,
        latitude: ward.Latitude,
        longitude: ward.Longitude
      });
      
      if (results.length >= limit) break;
    }
  }
  
  return results;
}

/**
 * Get all location data for a state (LGAs with their wards) (async)
 * @param {string} state - State name
 * @returns {Promise<Object>} State data with LGAs and wards
 */
async function getStateFullData(state) {
  const normalizedState = normalizeStateName(state);
  const lgas = getLGAs(normalizedState);
  
  const lgasWithWards = await Promise.all(
    lgas.map(async (lgaName) => ({
      name: lgaName,
      wards: await getWards(normalizedState, lgaName)
    }))
  );
  
  return {
    state: normalizedState,
    lgas: lgasWithWards
  };
}

/**
 * Validate if a state exists
 * @param {string} state - State name
 * @returns {boolean}
 */
function isValidState(state) {
  if (!state) return false;
  const normalized = normalizeStateName(state);
  return statesData?.some(s => s.toLowerCase() === normalized.toLowerCase()) || false;
}

/**
 * Validate if an LGA exists in a state
 * @param {string} state - State name
 * @param {string} lga - LGA name
 * @returns {boolean}
 */
function isValidLGA(state, lga) {
  if (!state || !lga) return false;
  const lgas = getLGAs(state);
  return lgas.some(l => l.toLowerCase() === lga.toLowerCase());
}

/**
 * Validate if a ward exists in an LGA (async)
 * @param {string} state - State name
 * @param {string} lga - LGA name
 * @param {string} ward - Ward name
 * @returns {Promise<boolean>}
 */
async function isValidWard(state, lga, ward) {
  if (!state || !lga || !ward) return false;
  const wards = await getWards(state, lga);
  return wards.some(w => w.name.toLowerCase() === ward.toLowerCase());
}

/**
 * Get the centroid/average coordinates for an LGA (async)
 * @param {string} state - State name
 * @param {string} lga - LGA name
 * @returns {Promise<{latitude: number, longitude: number} | null>}
 */
async function getLGACentroid(state, lga) {
  const wards = await getWards(state, lga);
  if (!wards.length) return null;
  
  const sumLat = wards.reduce((sum, w) => sum + w.latitude, 0);
  const sumLng = wards.reduce((sum, w) => sum + w.longitude, 0);
  
  return {
    latitude: sumLat / wards.length,
    longitude: sumLng / wards.length
  };
}

// Export the service
export const nigeriaGeoData = {
  getStates,
  getLGAs,
  getWards,
  getWardCoordinates,
  searchWards,
  getStateFullData,
  normalizeStateName,
  isValidState,
  isValidLGA,
  isValidWard,
  getLGACentroid
};

// Also export individual functions for tree-shaking
export {
  getStates,
  getLGAs,
  getWards,
  getWardCoordinates,
  searchWards,
  getStateFullData,
  normalizeStateName,
  isValidState,
  isValidLGA,
  isValidWard,
  getLGACentroid
};

export default nigeriaGeoData;
