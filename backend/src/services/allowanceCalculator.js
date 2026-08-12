/**
 * Allowance Calculator
 *
 * Single source of truth for supervisor posting allowances. Pure functions - no
 * database access - so both the manual posting controller and the auto-posting
 * engine compute identical figures for the same inputs.
 *
 * Previously duplicated in postingController.js and autoPostingController.js.
 */

/**
 * Calculate distance-based location category
 */
function getLocationCategory(distanceKm, thresholdKm = 10) {
  return distanceKm <= thresholdKm ? 'inside' : 'outside';
}

/**
 * Calculate allowances based on rank and distance
 *
 * ALLOWANCE CALCULATION RULES:
 *
 * 1. LOCAL RUNNING (distance <= inside_distance_threshold_km):
 *    - Local Running Allowance ONLY
 *    - Transport = 0, DSA = 0, DTA = 0, Tetfund = 0
 *    (Inside postings are not eligible for tetfund)
 *
 * 2. DSA ENABLED & distance within DSA range (dsa_min_distance_km to dsa_max_distance_km):
 *    - Local Running = 0
 *    - Transport = distance_km × transport_per_km
 *    - DSA = DTA × (dsa_percentage / 100)
 *    - DTA = 0
 *    - Tetfund = supervisor tetfund rate (eligible for tetfund)
 *
 * 3. DSA DISABLED or distance > dsa_max_distance_km (full DTA range):
 *    - Local Running = 0
 *    - Transport = distance_km × transport_per_km
 *    - DSA = 0
 *    - DTA = full DTA rate
 *    - Tetfund = supervisor tetfund rate (eligible for tetfund)
 *
 * NOTE: Tetfund is stored on ALL eligible postings (DSA and DTA range).
 * When calculating totals, use MAX(tetfund) to count it only ONCE per supervisor per session.
 * This provides resilience - if one posting is deleted, tetfund remains on other eligible postings.
 *
 * @param {Object} supervisor - Supervisor with rank allowance rates
 * @param {Object} school - School with distance_km
 * @param {Object} session - Session with threshold settings
 * @param {boolean} isSecondary - If true, this is a dependent/merged posting (zero allowances)
 * @returns {Object} Calculated allowances
 */
function calculateAllowances(supervisor, school, session, isSecondary = false) {
  const distanceKm = parseFloat(school.distance_km) || 0;
  const insideThreshold = parseFloat(session.inside_distance_threshold_km) || 10;
  const locationCategory = getLocationCategory(distanceKm, insideThreshold);

  // Secondary/dependent postings for merged groups get ZERO allowances
  if (isSecondary) {
    return {
      transport: 0,
      dsa: 0,
      dta: 0,
      local_running: 0,
      tetfund: 0,
      total: 0,
      location_category: locationCategory,
      distance_km: distanceKm,
      is_secondary: true,
    };
  }

  // Get supervisor rank rates
  const localRunningRate = parseFloat(supervisor.local_running_allowance) || 0;
  const transportPerKm = parseFloat(supervisor.transport_per_km) || 0;
  const dtaRate = parseFloat(supervisor.dta) || 0;
  const tetfundRate = parseFloat(supervisor.tetfund) || 0;

  // Get session DSA settings
  const dsaEnabled = session.dsa_enabled === 1 || session.dsa_enabled === true;
  const dsaMinDistance = parseFloat(session.dsa_min_distance_km) || 11;
  const dsaMaxDistance = parseFloat(session.dsa_max_distance_km) || 30;
  const dsaPercentage = parseFloat(session.dsa_percentage) || 50;

  let transport = 0;
  let dsa = 0;
  let dta = 0;
  let localRunning = 0;
  let tetfund = 0;

  if (locationCategory === 'inside') {
    // RULE 1: Inside distance threshold - LOCAL RUNNING ONLY
    // Inside postings are NOT eligible for tetfund
    localRunning = localRunningRate;
    // All other allowances are 0 (including tetfund)
  } else if (dsaEnabled && distanceKm >= dsaMinDistance && distanceKm <= dsaMaxDistance) {
    // RULE 2: DSA enabled AND distance within DSA range
    // Transport + DSA (percentage of DTA) + Tetfund
    transport = transportPerKm * distanceKm;
    dsa = (dtaRate * dsaPercentage) / 100;
    tetfund = tetfundRate; // Eligible for tetfund
    // DTA = 0
  } else {
    // RULE 3: Outside + (DSA disabled OR distance > dsa_max_distance_km)
    // Transport + full DTA + Tetfund
    transport = transportPerKm * distanceKm;
    dta = dtaRate;
    tetfund = tetfundRate; // Eligible for tetfund
  }

  return {
    transport,
    dsa,
    dta,
    local_running: localRunning,
    tetfund,
    total: transport + dsa + dta + localRunning + tetfund,
    location_category: locationCategory,
    distance_km: distanceKm,
    is_secondary: false,
  };
}

module.exports = {
  getLocationCategory,
  calculateAllowances,
};
