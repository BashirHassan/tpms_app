/**
 * Auto-Posting Engine
 *
 * Assigns supervisors to school/group/visit slots by minimising an explicit cost
 * function, then improving the result with a bounded local search.
 *
 * Pure functions - no database access - so the whole allocation strategy is
 * unit-testable and the controller is left with data fetching only.
 *
 * CONSTRAINT HIERARCHY
 *   HARD  capacity          a supervisor at remaining_slots is never considered
 *   HARD  slot uniqueness   each slot is assigned at most once
 *   HARD  dean ceiling      total assignments capped when a dean allocation applies
 *   HARD  priority tier     when priority is on, a slot's distance bucket restricts
 *                           who can even be a candidate for it (see PRIORITY TIERS)
 *   soft  school variety    don't send a supervisor back to a school they cover
 *   soft  cluster affinity  keep a supervisor inside one route/LGA per visit
 *   soft  load balance      even posting counts
 *   soft  travel balance    even total kilometres
 *
 * Soft constraints are weighted penalties rather than hard blocks, so the engine
 * always produces the best achievable answer instead of refusing to fill a slot.
 * Priority is deliberately NOT one of them: an earlier design paired rank with
 * distance via a weighted cost term, tuned against several other soft costs, and
 * it kept losing close comparisons in ways that were hard to fully bound - see
 * PRIORITY TIERS below for why this is now a hard, deterministic partition
 * instead.
 *
 * AFFINITY OBJECTIVE
 * For each (supervisor, visit) the engine tracks how many assignments fall in each
 * cluster and charges `count - largestClusterCount` - i.e. the number of trips
 * outside that supervisor's dominant area for that visit. This is order
 * independent (unlike "the first slot fixes the cluster"), which makes the local
 * search's swap deltas exact and cheap to compute.
 *
 * @see docs/AUTOMATED_POSTING_SYSTEM.md
 */

/**
 * Default cost weights, ordered so the hierarchy above is explicit.
 * Exported so they can be tuned in one place, and overridden per call in tests.
 *
 * There is deliberately no `priority` weight here - pairing rank with distance is
 * a hard, deterministic bucket assignment (see PRIORITY TIERS), not one more
 * soft cost to balance against `load`/`affinity`/`repeat`. `load` is charged per
 * whole posting a supervisor is ahead of the least loaded peer *within their
 * priority tier* (or within their planned cluster, when one exists) - a discrete
 * jump, not a gradient - so a supervisor level with their tier-mates pays nothing
 * and the softer terms decide.
 */
const DEFAULT_WEIGHTS = {
  repeat: 2000,   // supervisor already covers this school
  affinity: 300,  // trip outside the supervisor's area for that visit
  load: 200,      // per posting ahead of the least loaded supervisor
  travel: 1,      // per unit of normalised distance ahead of the lightest travel
};

// Bounds so a very large batch cannot degenerate into a long search
const LOCAL_SEARCH_MAX_PASSES = 4;
const LOCAL_SEARCH_MAX_COMPARISONS = 300000;

// ============================================================================
// SMALL HELPERS
// ============================================================================

/**
 * The clustering key for a slot under the given posting type.
 * 'random' has no clustering, so this returns null and the term vanishes.
 */
function clusterKeyFor(slot, postingType) {
  if (postingType === 'route_based') return `route:${slot.route_id ?? 'unassigned'}`;
  if (postingType === 'lga_based') return `lga:${slot.lga ?? 'unknown'}`;
  return null;
}

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

/** Pearson correlation, used to report how well rank tracks distance. */
function correlation(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

/**
 * Sort slots: visit number first (all Visit 1s before Visit 2s), then cluster so
 * same-area work stays adjacent, then longest distance first when priority is on,
 * then school/group for a stable order.
 */
function sortSlots(slots, postingType, priorityEnabled) {
  return [...slots].sort((a, b) => {
    const visitCompare = a.visit_number - b.visit_number;
    if (visitCompare !== 0) return visitCompare;

    const clusterA = clusterKeyFor(a, postingType);
    if (clusterA !== null) {
      const clusterCompare = clusterA.localeCompare(clusterKeyFor(b, postingType));
      if (clusterCompare !== 0) return clusterCompare;
    }

    if (priorityEnabled) {
      const distCompare = (b.distance_km || 0) - (a.distance_km || 0);
      if (distCompare !== 0) return distCompare;
    }

    const schoolCompare = a.school_id - b.school_id;
    if (schoolCompare !== 0) return schoolCompare;
    return a.group_number - b.group_number;
  });
}

// ============================================================================
// PRIORITY TIERS
//
// Priority used to be one more weighted term in the shared cost function,
// self-tuned against a reported correlation statistic. Across several rounds of
// fixes it kept losing close comparisons to `load`/`repeat`/`affinity` in ways
// that were hard to fully bound, and real production runs still came out with a
// junior rank averaging *more* distance than the most senior one.
//
// Priority is now a hard, deterministic partition computed up front: rank the
// distinct ranks present, rank the distance (by whole route/LGA for clustered
// posting types, by individual slot for random), and divide the distance ranking
// into bands sized by each rank's share of total supervisor capacity - not an
// equal split, since tiers are rarely evenly sized. The most senior band owns the
// longest distances by construction; there is nothing left to tune. Everything
// else (repeat avoidance, cluster cohesion, load balance) still applies, but only
// decides who *within* a tier's band gets which specific slot.
// ============================================================================

/**
 * Group eligible supervisors by distinct `priority_number`, ascending (1 = most
 * senior first). Each tier's `capacity` is the summed `remaining_slots` of its
 * members - the basis for proportional (not equal-N) bucket sizing.
 */
function computePriorityTiers(supervisors) {
  const byRank = new Map();

  for (const supervisor of supervisors) {
    const rank = Number(supervisor.priority_number) || 99;
    if (!byRank.has(rank)) {
      byRank.set(rank, { priority_number: rank, supervisors: [], capacity: 0 });
    }
    const tier = byRank.get(rank);
    tier.supervisors.push(supervisor);
    tier.capacity += Math.max(0, Number(supervisor.remaining_slots) || 0);
  }

  return [...byRank.values()].sort((a, b) => a.priority_number - b.priority_number);
}

/**
 * Cumulative cutoffs (in units of `totalUnits`) for each tier's proportional
 * share of capacity. Cumulative rather than tier-local, so a unit that overshoots
 * one tier's share automatically eats into the next tier's remaining room instead
 * of being double-counted. The last tier absorbs whatever rounding remains.
 */
function computeTierThresholds(tiers, totalUnits) {
  const totalCapacity = tiers.reduce((sum, tier) => sum + tier.capacity, 0);
  if (totalCapacity <= 0 || tiers.length === 0) return tiers.map(() => totalUnits);

  let cumulative = 0;
  const thresholds = tiers.map((tier) => {
    cumulative += (tier.capacity / totalCapacity) * totalUnits;
    return cumulative;
  });
  thresholds[thresholds.length - 1] = totalUnits;
  return thresholds;
}

/**
 * Assign each unit (a whole route/LGA, or an individual slot for random posting)
 * to the tier whose proportional distance band it falls in.
 *
 * `units` MUST already be sorted descending by distance. Walks the sorted list
 * against the cumulative thresholds, advancing the tier pointer as the running
 * weight total crosses each cutoff - advancing at most one tier per unit, so a
 * single oversized atomic unit (a huge LGA) can't skip an entire small tier's
 * window and leave it owning nothing. This doesn't fully eliminate the
 * possibility of an empty tier (one unit could still exceed an entire tier's
 * share), but real route/LGA sizes are rarely that disproportionate to tier
 * capacities - treat a genuinely empty tier as an edge case to monitor, not
 * something to solve further here.
 *
 * @param {Array<{key: string|number, weight: number, distance: number}>} units
 * @param {Array} tiers - from computePriorityTiers
 * @returns {Map} unit.key -> tier.priority_number
 */
function assignUnitsToTiers(units, tiers) {
  const ownerOf = new Map();
  if (tiers.length === 0) return ownerOf;

  const totalUnits = units.reduce((sum, unit) => sum + unit.weight, 0);
  const thresholds = computeTierThresholds(tiers, totalUnits);

  let tierIndex = 0;
  let running = 0;
  for (const unit of units) {
    if (tierIndex < tiers.length - 1 && running >= thresholds[tierIndex]) tierIndex++;
    ownerOf.set(unit.key, tiers[tierIndex].priority_number);
    running += unit.weight;
  }

  return ownerOf;
}

/**
 * Deterministic overflow search order for a tier that can't cover its own
 * bucketed demand: more-senior tiers first (closest first), then less-senior
 * tiers (nearest first), only as a last resort.
 *
 * Spilling toward a more-senior tier first can never invert the rank ordering -
 * a senior tier's own bucket is, by construction, already supposed to hold
 * distances at least as large, so absorbing overflow there is safe. Spilling
 * downward to a junior tier is exactly the failure mode this design fixes, so
 * it's used only when no more-senior tier has any room at all.
 *
 * @returns {number[]} tier indices in search order
 */
function spilloverOrder(homeTierIndex, tiers) {
  const order = [];
  for (let i = homeTierIndex - 1; i >= 0; i--) order.push(i);
  for (let i = homeTierIndex + 1; i < tiers.length; i++) order.push(i);
  return order;
}

// ============================================================================
// ALLOCATION STATE
//
// Everything the cost function reads, maintained incrementally so the local
// search can evaluate a swap in constant time instead of rebuilding the world.
// ============================================================================

/**
 * @param {Array} supervisors
 * @param {Map} schoolHistory - Map<supervisor_id, Set<school_id>> from existing postings
 */
function createState(supervisors, schoolHistory) {
  const state = new Map();

  for (const supervisor of supervisors) {
    state.set(supervisor.id, {
      supervisor,
      count: 0,
      distance: 0,
      // How many times this supervisor covers each school, seeded from history so
      // an existing posting counts as the first visit
      schoolCounts: new Map(
        [...(schoolHistory.get(supervisor.id) || [])].map((schoolId) => [schoolId, 1])
      ),
      // visit_number -> Map(cluster -> count)
      clusterCounts: new Map(),
      // visit_number -> total assignments for that visit
      visitCounts: new Map(),
    });
  }

  return state;
}

function schoolCountOf(entry, schoolId) {
  return entry.schoolCounts.get(schoolId) || 0;
}

/** Trips outside the dominant cluster for one (supervisor, visit). */
function affinityCostFor(entry, visitNumber) {
  const clusters = entry.clusterCounts.get(visitNumber);
  if (!clusters || clusters.size === 0) return 0;

  const total = entry.visitCounts.get(visitNumber) || 0;
  const largest = Math.max(...clusters.values());
  return total - largest;
}

function applyAssignment(entry, slot, cluster, direction = 1) {
  entry.count += direction;
  entry.distance += direction * (slot.distance_km || 0);

  const schoolNext = schoolCountOf(entry, slot.school_id) + direction;
  if (schoolNext <= 0) entry.schoolCounts.delete(slot.school_id);
  else entry.schoolCounts.set(slot.school_id, schoolNext);

  if (cluster === null) return;

  const visitTotal = (entry.visitCounts.get(slot.visit_number) || 0) + direction;
  if (visitTotal <= 0) entry.visitCounts.delete(slot.visit_number);
  else entry.visitCounts.set(slot.visit_number, visitTotal);

  if (!entry.clusterCounts.has(slot.visit_number)) {
    entry.clusterCounts.set(slot.visit_number, new Map());
  }
  const clusters = entry.clusterCounts.get(slot.visit_number);
  const clusterNext = (clusters.get(cluster) || 0) + direction;
  if (clusterNext <= 0) clusters.delete(cluster);
  else clusters.set(cluster, clusterNext);

  if (clusters.size === 0) entry.clusterCounts.delete(slot.visit_number);
}

// ============================================================================
// PRIORITY ALLOCATION PLANNING
//
// For route_based / lga_based, decide up front which area each supervisor will
// work on each visit - and, when priority is on, which priority tier each area
// belongs to. Without an upfront plan the greedy pass always finds an idle
// supervisor cheapest (their load term is zero) and the areas scatter.
// ============================================================================

/**
 * Plan supervisor -> area for every visit, and area -> owning priority tier.
 *
 * `tiers` is always at least one tier - callers pass a single synthetic tier
 * holding every supervisor when priority is disabled, so the clustering/seating
 * logic below is identical either way; only the *number* of tiers changes
 * whether areas get partitioned by distance at all.
 *
 * Per visit:
 *   1. Bucket slots into clusters (route or LGA) with slot/school/distance tallies.
 *   2. Bucket clusters to tiers by aggregate distance, proportional to each
 *      tier's capacity share (`assignUnitsToTiers`).
 *   3. Within each tier, seat that tier's own supervisors to that tier's own
 *      clusters in two phases:
 *        Phase A - every owned cluster gets one seat, farthest first (a tier's
 *          single member must not be handed a nearer-but-bigger owned cluster
 *          over a farther-but-smaller one - that would defeat the bucket).
 *        Phase B - clusters still under their capacity-driven `needed` seat
 *          count get extra seats, largest-need first (a genuine packing
 *          requirement, not a preference).
 *      Both phases pick the tier's lowest-repeat-cost remaining member.
 *   4. Pairwise swap-improvement within the tier's own seated set.
 *   5. Any of a tier's owned clusters that couldn't get even one seat (the tier
 *      ran out of members) spill to neighbouring tiers via `spilloverOrder`,
 *      drawing only from each spillover tier's own *leftover* pool (members not
 *      already seated to their own tier's clusters) - so nobody is ever seated
 *      twice. A cluster that still can't be seated anywhere is left unplanned
 *      and falls through to the generic per-slot fallback in `marginalCost`.
 *
 * @param {boolean} [options.priorityEnabled]
 * @param {Array} [options.tiers] - from computePriorityTiers, or a single
 *   synthetic tier when priority is disabled
 * @returns {{
 *   clusterPlan: Map<string, string>,        // '${supervisorId}-${visit}' -> clusterKey
 *   clusterOwnerTier: Map<string, number>,    // '${clusterKey}-${visit}' -> priority_number
 *   slotOwnerTier: Map<string, number>,       // slot.id -> priority_number (random only)
 * }}
 */
function planPriorityAllocation(supervisors, slots, postingType, schoolHistory, options = {}) {
  const { priorityEnabled = false, tiers = [] } = options;

  const effectiveTiers = tiers.length > 0
    ? tiers
    : [{ priority_number: null, supervisors, capacity: Infinity }];

  const clusterPlan = new Map();
  const clusterOwnerTier = new Map();
  const slotOwnerTier = new Map();

  const visits = [...new Set(slots.map((s) => s.visit_number))].sort((a, b) => a - b);

  if (postingType !== 'route_based' && postingType !== 'lga_based') {
    // random: no clustering, just bucket individual slots to a tier directly
    if (priorityEnabled) {
      for (const visit of visits) {
        const visitSlots = slots.filter((s) => s.visit_number === visit);
        const units = visitSlots
          .map((s) => ({ key: s.id, weight: 1, distance: s.distance_km || 0 }))
          .sort((a, b) => b.distance - a.distance);
        const ownerOf = assignUnitsToTiers(units, effectiveTiers);
        for (const slot of visitSlots) slotOwnerTier.set(slot.id, ownerOf.get(slot.id));
      }
    }
    return { clusterPlan, clusterOwnerTier, slotOwnerTier };
  }

  // Schools each supervisor already covers, grown as the plan is built visit by
  // visit so later visits know what earlier ones committed to
  const covered = new Map(
    supervisors.map((s) => [s.id, new Set(schoolHistory.get(s.id) || [])])
  );

  for (const visit of visits) {
    const visitSlots = slots.filter((s) => s.visit_number === visit);
    if (visitSlots.length === 0) continue;

    // cluster -> { slots, schools, distance, needed, ownerTier }
    const clusters = new Map();
    for (const slot of visitSlots) {
      const key = clusterKeyFor(slot, postingType);
      if (!clusters.has(key)) clusters.set(key, { key, slots: 0, schools: new Set(), distance: 0 });
      const cluster = clusters.get(key);
      cluster.slots++;
      cluster.schools.add(slot.school_id);
      cluster.distance += slot.distance_km || 0;
    }

    // How many supervisors each area genuinely needs (a capacity requirement)
    const targetPerSupervisor = Math.max(1, Math.ceil(visitSlots.length / supervisors.length));
    for (const cluster of clusters.values()) {
      cluster.needed = Math.max(1, Math.ceil(cluster.slots / targetPerSupervisor));
    }

    // Bucket whole clusters (not individual schools) to tiers, farthest first
    const units = [...clusters.values()]
      .map((c) => ({ key: c.key, weight: c.slots, distance: c.distance }))
      .sort((a, b) => b.distance - a.distance);
    const ownerOf = assignUnitsToTiers(units, effectiveTiers);
    for (const cluster of clusters.values()) {
      cluster.ownerTier = ownerOf.get(cluster.key);
      clusterOwnerTier.set(`${cluster.key}-${visit}`, cluster.ownerTier);
    }

    // Cost of putting this supervisor in this area: how many of its schools they
    // already cover, i.e. how many repeats it would force
    const repeatCost = (supervisorId, cluster) => {
      const schools = covered.get(supervisorId) || new Set();
      let cost = 0;
      for (const schoolId of cluster.schools) if (schools.has(schoolId)) cost++;
      return cost;
    };

    const pickCheapest = (pool, cluster) => {
      let bestIndex = 0;
      let bestCost = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const cost = repeatCost(pool[i], cluster);
        if (cost < bestCost) {
          bestCost = cost;
          bestIndex = i;
        }
      }
      return pool.splice(bestIndex, 1)[0];
    };

    const allSeated = [];
    const tierPools = [];
    const unseededByTier = [];

    for (let tierIndex = 0; tierIndex < effectiveTiers.length; tierIndex++) {
      const tier = effectiveTiers[tierIndex];
      const ownClusters = [...clusters.values()].filter((c) => c.ownerTier === tier.priority_number);
      const pool = tier.supervisors.map((s) => s.id);
      const seated = [];

      if (ownClusters.length > 0) {
        // Phase A - every owned cluster gets one seat, farthest first
        const byDistanceDesc = [...ownClusters].sort((a, b) => b.distance - a.distance);
        for (const cluster of byDistanceDesc) {
          if (pool.length === 0) break;
          seated.push({ supervisorId: pickCheapest(pool, cluster), cluster });
        }

        // Phase B - extra seats for clusters still under `needed`, largest-need first
        const byNeededDesc = [...ownClusters].sort((a, b) => b.needed - a.needed);
        for (const cluster of byNeededDesc) {
          while (
            pool.length > 0 &&
            seated.filter((s) => s.cluster === cluster).length < cluster.needed
          ) {
            seated.push({ supervisorId: pickCheapest(pool, cluster), cluster });
          }
        }

        // Stage 2 - swap areas between two supervisors while the total falls,
        // same tier only (nothing to swap across tiers now)
        let improved = true;
        while (improved) {
          improved = false;
          for (let i = 0; i < seated.length; i++) {
            for (let j = i + 1; j < seated.length; j++) {
              const a = seated[i];
              const b = seated[j];
              if (a.cluster === b.cluster) continue;

              const before = repeatCost(a.supervisorId, a.cluster) + repeatCost(b.supervisorId, b.cluster);
              const after = repeatCost(a.supervisorId, b.cluster) + repeatCost(b.supervisorId, a.cluster);

              if (after < before) {
                const carried = a.cluster;
                a.cluster = b.cluster;
                b.cluster = carried;
                improved = true;
              }
            }
          }
        }
      }

      allSeated.push(...seated);
      tierPools.push(pool); // leftover members, available for spillover donation

      const unseeded = ownClusters.filter((c) => !seated.some((s) => s.cluster === c));
      if (unseeded.length > 0) unseededByTier.push({ tierIndex, unseeded });
    }

    // Spillover - a tier that couldn't seat one of its own clusters (it has
    // fewer members than clusters it owns) borrows from a neighbouring tier's
    // leftover pool, more-senior first
    for (const { tierIndex, unseeded } of unseededByTier) {
      for (const cluster of unseeded) {
        for (const spillIndex of spilloverOrder(tierIndex, effectiveTiers)) {
          const spillPool = tierPools[spillIndex];
          if (spillPool.length === 0) continue;
          allSeated.push({ supervisorId: pickCheapest(spillPool, cluster), cluster });
          clusterOwnerTier.set(`${cluster.key}-${visit}`, effectiveTiers[spillIndex].priority_number);
          break;
        }
        // If no tier anywhere has room, the cluster is left unplanned - it falls
        // through to the generic per-slot fallback in marginalCost, unchanged.
      }
    }

    for (const { supervisorId, cluster } of allSeated) {
      clusterPlan.set(`${supervisorId}-${visit}`, cluster.key);
      // Assume the plan is honoured, so the next visit avoids these schools
      const schools = covered.get(supervisorId);
      if (schools) for (const schoolId of cluster.schools) schools.add(schoolId);
    }
  }

  return { clusterPlan, clusterOwnerTier, slotOwnerTier };
}

// ============================================================================
// COST
// ============================================================================

/**
 * Marginal cost of giving this slot to this supervisor. Lower is better.
 * Every term is the *increase* the assignment would cause, so the greedy pass and
 * the local search optimise the same objective.
 */
function marginalCost(entry, slot, cluster, context) {
  const { weights, maxTravel } = context;

  // School variety - only the extra visits to a covered school are charged
  const repeat = schoolCountOf(entry, slot.school_id) > 0 ? 1 : 0;

  // Affinity, measured against the area this supervisor was planned into for this
  // visit. Falls back to their actual dominant area when there is no plan (which
  // happens once the plan is exhausted, e.g. more capacity than the area holds).
  // Cross-tier poaching is no longer possible - `eligibleCandidates` already
  // restricts the candidate pool to the slot's owning priority tier before this
  // is ever called - so an out-of-area candidate only ever pays the ordinary,
  // flat overflow cost.
  let affinity = 0;
  if (cluster !== null && weights.affinity > 0) {
    const planned = context.clusterPlan.get(`${entry.supervisor.id}-${slot.visit_number}`);

    if (planned !== undefined) {
      affinity = planned === cluster ? 0 : 1;
    } else {
      const clusters = entry.clusterCounts.get(slot.visit_number);
      if (!clusters || clusters.size === 0) {
        affinity = 0.5; // committing an unplanned supervisor to a new area
      } else {
        const before = affinityCostFor(entry, slot.visit_number);
        applyAssignment(entry, slot, cluster, 1);
        affinity = affinityCostFor(entry, slot.visit_number) - before;
        applyAssignment(entry, slot, cluster, -1);
      }
    }
  }

  // Load and travel are measured *relative to the lightest peer*, so a supervisor
  // level with everyone else pays nothing and the softer terms decide. Using
  // absolute counts would make the whole pool more expensive as the run fills.
  const load = Math.max(0, entry.count - context.minCount);

  // Getting everyone their first posting is treated as close to inviolable - the
  // same tier as avoiding a repeat school - so nobody in a baseline is skipped
  // for a second posting while a peer still has zero.
  const leavesSomeoneEmpty = context.minCount === 0 && load > 0;

  // Travel balance is only meaningful when ranks are NOT being paired to
  // distance - with priority on, an uneven travel spread (within a tier's own
  // band) is the intended outcome
  const travel = context.priorityEnabled || maxTravel <= 0
    ? 0
    : Math.max(0, entry.distance - context.minDistance) / maxTravel;

  const total =
    weights.repeat * repeat +
    weights.affinity * affinity +
    weights.load * load +
    weights.travel * travel +
    (leavesSomeoneEmpty ? weights.repeat : 0);

  return { total, repeat, affinity };
}

/**
 * Total cost of the whole solution. Used for reporting and as the local search's
 * objective; O(supervisors + assignments).
 */
function solutionCost(state, context) {
  const { weights } = context;
  let total = 0;

  const counts = [];
  const distances = [];

  for (const entry of state.values()) {
    counts.push(entry.count);
    distances.push(entry.distance);

    for (const occurrences of entry.schoolCounts.values()) {
      if (occurrences > 1) total += weights.repeat * (occurrences - 1);
    }

    for (const visitNumber of entry.clusterCounts.keys()) {
      total += weights.affinity * affinityCostFor(entry, visitNumber);
    }
  }

  total += weights.load * standardDeviation(counts);
  total += weights.travel * (standardDeviation(distances) / Math.max(context.maxTravel, 1));

  return total;
}

// ============================================================================
// MAIN ALGORITHM
// ============================================================================

/**
 * Assign supervisors to slots.
 *
 * @param {Array} supervisors - Eligible supervisors with remaining_slots and priority_number
 * @param {Array} slots - Available slots (school+group+visit combinations)
 * @param {number} numberOfPostings - Highest visit number to include (1 = Visit 1 only)
 * @param {string} postingType - 'random' | 'route_based' | 'lga_based'
 * @param {boolean} priorityEnabled - Pair higher ranks with longer distances
 * @param {Object} [options]
 * @param {boolean} [options.avoidRepeatSchools=true] - Penalise repeating a school
 * @param {Map}     [options.schoolHistory] - Map<supervisor_id, Set<school_id>> already covered
 * @param {number}  [options.maxAssignments] - Hard ceiling (dean allocation)
 * @param {Object}  [options.weights] - Override DEFAULT_WEIGHTS
 * @returns {{assignments: Array, warnings: Array, statistics: Object}}
 */
function runAutoPostingAlgorithm(
  supervisors,
  slots,
  numberOfPostings,
  postingType,
  priorityEnabled,
  options = {}
) {
  const {
    avoidRepeatSchools = true,
    schoolHistory = new Map(),
    maxAssignments = Infinity,
    weights: weightOverrides = {},
  } = options;

  const weights = {
    ...DEFAULT_WEIGHTS,
    ...weightOverrides,
    repeat: avoidRepeatSchools ? (weightOverrides.repeat ?? DEFAULT_WEIGHTS.repeat) : 0,
  };

  if (supervisors.length === 0) {
    return finish([], ['No eligible supervisors available'], supervisors, numberOfPostings, [], {});
  }

  if (slots.length === 0) {
    return finish([], ['No available slots to assign'], supervisors, numberOfPostings, [], {});
  }

  const eligibleSlots = slots.filter((slot) => slot.visit_number <= numberOfPostings);

  if (eligibleSlots.length === 0) {
    return finish([], [
      `No available slots for Visit 1${numberOfPostings > 1 ? ` through ${numberOfPostings}` : ''}`,
    ], supervisors, numberOfPostings, [], {});
  }

  if (maxAssignments <= 0) {
    return finish([], [
      'No postings could be created - the posting allocation for this session is exhausted',
    ], supervisors, numberOfPostings, [], {});
  }

  const totalDistance = eligibleSlots.reduce((sum, s) => sum + (s.distance_km || 0), 0);
  const maxTravel = Math.max(totalDistance / supervisors.length, 1);

  const sortedSlots = sortSlots(eligibleSlots, postingType, priorityEnabled);

  // Priority tiers and the up-front area/tier plan are computed once - there is
  // nothing weight-dependent left to retry with, unlike the old self-tuning loop.
  const tiers = priorityEnabled ? computePriorityTiers(supervisors) : [];
  const { clusterPlan, clusterOwnerTier, slotOwnerTier } = planPriorityAllocation(
    supervisors, eligibleSlots, postingType, schoolHistory, { priorityEnabled, tiers }
  );
  const effectiveTiers = tiers.length > 0 ? tiers : [{ priority_number: null, supervisors, capacity: Infinity }];

  const context = {
    weights, postingType, maxTravel, avoidRepeatSchools, priorityEnabled,
    clusterPlan, clusterOwnerTier, slotOwnerTier, tiers: effectiveTiers,
  };
  const state = createState(supervisors, schoolHistory);
  const assignments = [];
  const warnings = [];

  let unassignedSlots = 0;
  let quotaSkipped = 0;

  /**
   * The candidate pool for one slot: hard-restricted to the priority tier that
   * owns this slot's distance bucket (cluster, for route/lga_based; the slot
   * itself, for random). `allowSpillover` gates whether `spilloverOrder`'s
   * neighbouring tiers are considered when the home tier has no capacity left -
   * see the two-pass loop below for why this must be a separate, later pass
   * rather than falling back immediately. When priority is disabled there is
   * only one (synthetic) tier, so this is simply everyone.
   */
  function eligibleCandidates(slot, cluster, allowSpillover) {
    if (!priorityEnabled) return [...state.values()];

    const homeTierNum = cluster !== null
      ? clusterOwnerTier.get(`${cluster}-${slot.visit_number}`)
      : slotOwnerTier.get(slot.id);

    if (homeTierNum == null) return [...state.values()];

    const homeIndex = effectiveTiers.findIndex((t) => t.priority_number === homeTierNum);
    const withCapacity = (tierNum) => [...state.values()].filter((e) =>
      (Number(e.supervisor.priority_number) || 99) === tierNum &&
      e.count < Number(e.supervisor.remaining_slots)
    );

    let pool = withCapacity(homeTierNum);
    if (pool.length > 0 || !allowSpillover) return pool;

    for (const idx of spilloverOrder(homeIndex, effectiveTiers)) {
      pool = withCapacity(effectiveTiers[idx].priority_number);
      if (pool.length > 0) return pool;
    }
    return [];
  }

  /**
   * Assign one slot to its lowest-cost eligible candidate. Returns false without
   * mutating anything if there is no eligible candidate (capacity exhausted for
   * every tier this slot is allowed to draw from under the current pass).
   */
  function assignSlot(slot, cluster, allowSpillover) {
    const candidates = eligibleCandidates(slot, cluster, allowSpillover).filter(
      (entry) => entry.count < Number(entry.supervisor.remaining_slots)
    );
    if (candidates.length === 0) return false;

    // Baseline for the relative load/travel terms. When this slot's cluster has
    // its own planned team within the candidate pool, the baseline is taken from
    // *them* only - the plan already shares supervisors between areas in
    // proportion to their size, so balance across areas is settled; charging a
    // supervisor for getting ahead of someone working a different area would
    // just push them out of their own, which is how a route leaks its schools
    // to an idle outsider.
    const plannedHere = cluster !== null
      ? candidates.filter(
          (entry) => clusterPlan.get(`${entry.supervisor.id}-${slot.visit_number}`) === cluster
        )
      : [];
    const baseline = plannedHere.length > 0 ? plannedHere : candidates;

    context.minCount = Infinity;
    context.minDistance = Infinity;
    for (const entry of baseline) {
      if (entry.count < context.minCount) context.minCount = entry.count;
      if (entry.distance < context.minDistance) context.minDistance = entry.distance;
    }
    if (context.minCount === Infinity) context.minCount = 0;
    if (context.minDistance === Infinity) context.minDistance = 0;

    let best = null;
    let bestScore = null;
    for (const entry of candidates) {
      const score = marginalCost(entry, slot, cluster, context);
      if (bestScore === null || score.total < bestScore.total) {
        best = entry;
        bestScore = score;
      }
    }

    if (!best) return false;

    assignments.push({
      supervisor_id: best.supervisor.id,
      supervisor_name: best.supervisor.name,
      rank_code: best.supervisor.rank_code,
      priority_number: best.supervisor.priority_number,
      school_id: slot.school_id,
      school_name: slot.school_name,
      group_number: slot.group_number,
      visit_number: slot.visit_number,
      distance_km: slot.distance_km,
      route_id: slot.route_id,
      route_name: slot.route_name,
      lga: slot.lga,
      repeat_school: bestScore.repeat === 1,
      cluster_break: bestScore.affinity > 0,
      _cluster: cluster,
    });

    applyAssignment(best, slot, cluster, 1);
    return true;
  }

  // ---- Greedy pass, two rounds ----
  //
  // Priority-restricted candidate pools are computed per slot, and slots are
  // processed grouped by cluster (see sortSlots), not by which tier "gets there
  // first". Left as one pass, an early-processed cluster's overflow could spill
  // into a still-untouched tier and consume capacity that tier's *own* cluster
  // needs later in the same run - most visible across combined multi-visit runs,
  // where a supervisor's total capacity is shared across every visit's own
  // cluster. Round 1 gives every cluster first claim on its own tier's capacity,
  // in full, before anyone is allowed to draw on a neighbouring tier at all.
  // Round 2 then handles only what's left, with spillover allowed - by which
  // point every tier's genuine leftover capacity (not just a per-slot snapshot)
  // is known.
  const deferredSlots = [];
  for (const slot of sortedSlots) {
    if (assignments.length >= maxAssignments) {
      quotaSkipped++;
      continue;
    }
    const cluster = clusterKeyFor(slot, postingType);
    if (!assignSlot(slot, cluster, false)) deferredSlots.push(slot);
  }

  for (const slot of deferredSlots) {
    if (assignments.length >= maxAssignments) {
      quotaSkipped++;
      continue;
    }
    const cluster = clusterKeyFor(slot, postingType);
    if (!assignSlot(slot, cluster, true)) unassignedSlots++;
  }

  // ---- Local search: swap supervisors while the total cost strictly falls ----
  const costBefore = solutionCost(state, context);
  const searchResult = localSearch(assignments, state, context);
  const costAfter = solutionCost(state, context);

  reflagAssignments(assignments, schoolHistory, postingType, avoidRepeatSchools);
  for (const a of assignments) delete a._cluster;

  if (quotaSkipped > 0) {
    warnings.push(
      `${quotaSkipped} slot(s) skipped - the posting allocation for this session is exhausted`
    );
  }

  if (unassignedSlots > 0) {
    warnings.push(
      `${unassignedSlots} slot(s) could not be assigned (more slots than total supervisor capacity)`
    );
  }

  return finish(assignments, warnings, supervisors, numberOfPostings, eligibleSlots, {
    context,
    costBefore,
    costAfter,
    searchResult,
    quotaSkipped,
  });
}

// ============================================================================
// LOCAL SEARCH
// ============================================================================

/**
 * Swap the supervisors of two assignments whenever that strictly lowers the cost.
 *
 * Each slot keeps its own school/group/visit, so a swap only exchanges who goes
 * where - posting counts and capacity are untouched by construction, which means
 * the hard constraints survive the search automatically. Swaps never cross a
 * priority tier boundary - that would undo the deterministic bucket assignment -
 * so `a`/`b` are skipped whenever their `priority_number` differs; within a tier
 * there is nothing left to swap over except repeat/affinity/travel.
 *
 * Only assignments that currently carry a penalty are used as swap candidates, and
 * each swap is evaluated with an exact local delta rather than a global rebuild,
 * keeping this O(penalised x assignments) with O(1) work per comparison.
 */
function localSearch(assignments, state, context) {
  if (assignments.length < 2) return { swaps_applied: 0, passes: 0 };

  let swapsApplied = 0;
  let comparisons = 0;
  let pass = 0;

  for (; pass < LOCAL_SEARCH_MAX_PASSES; pass++) {
    let improvedThisPass = false;

    // Only assignments that cost something are worth moving
    const candidates = assignments.filter((a) => a.repeat_school || a.cluster_break);
    if (candidates.length === 0) break;

    for (const a of candidates) {
      for (const b of assignments) {
        if (a === b || a.supervisor_id === b.supervisor_id) continue;
        if (a.priority_number !== b.priority_number) continue;

        if (++comparisons > LOCAL_SEARCH_MAX_COMPARISONS) {
          return { swaps_applied: swapsApplied, passes: pass + 1, budget_exhausted: true };
        }

        const delta = swapDelta(a, b, state, context);
        if (delta < -1e-9) {
          performSwap(a, b, state);
          swapsApplied++;
          improvedThisPass = true;
          break; // `a` has moved; stop pairing it
        }
      }
    }

    if (!improvedThisPass) break;

    // Refresh flags so the next pass picks the right candidates
    refreshFlags(assignments, state, context);
  }

  return { swaps_applied: swapsApplied, passes: pass + 1 };
}

/**
 * Exact cost change from swapping the supervisors of assignments `a` and `b`.
 * Computed by removing both, re-adding them crossed over, and differencing the
 * affected supervisors' contributions.
 */
function swapDelta(a, b, state, context) {
  const entryA = state.get(a.supervisor_id);
  const entryB = state.get(b.supervisor_id);
  if (!entryA || !entryB) return 0;

  const before = pairCost(a, b, state, context);
  performSwap(a, b, state);
  const after = pairCost(a, b, state, context);
  performSwap(a, b, state); // revert

  return after - before;
}

/**
 * Combined contribution of the two supervisors currently holding `a` and `b`:
 * repeats, affinity, and travel spread. Posting counts are unchanged by a swap,
 * so the load term is deliberately omitted.
 */
function pairCost(a, b, state, context) {
  const { weights } = context;
  const entryA = state.get(a.supervisor_id);
  const entryB = state.get(b.supervisor_id);

  let total = 0;

  for (const entry of new Set([entryA, entryB])) {
    if (!entry) continue;

    for (const occurrences of entry.schoolCounts.values()) {
      if (occurrences > 1) total += weights.repeat * (occurrences - 1);
    }

    for (const visitNumber of entry.clusterCounts.keys()) {
      total += weights.affinity * affinityCostFor(entry, visitNumber);
    }

    total += weights.travel * (entry.distance / Math.max(context.maxTravel, 1));
  }

  return total;
}

/** Move both assignments between supervisors and keep the state in step. */
function performSwap(a, b, state) {
  const entryA = state.get(a.supervisor_id);
  const entryB = state.get(b.supervisor_id);

  if (entryA) applyAssignment(entryA, a, a._cluster ?? null, -1);
  if (entryB) applyAssignment(entryB, b, b._cluster ?? null, -1);

  swapSupervisorFields(a, b);

  const newEntryA = state.get(a.supervisor_id);
  const newEntryB = state.get(b.supervisor_id);
  if (newEntryA) applyAssignment(newEntryA, a, a._cluster ?? null, 1);
  if (newEntryB) applyAssignment(newEntryB, b, b._cluster ?? null, 1);
}

function swapSupervisorFields(a, b) {
  const carried = {
    supervisor_id: a.supervisor_id,
    supervisor_name: a.supervisor_name,
    rank_code: a.rank_code,
    priority_number: a.priority_number,
  };
  a.supervisor_id = b.supervisor_id;
  a.supervisor_name = b.supervisor_name;
  a.rank_code = b.rank_code;
  a.priority_number = b.priority_number;
  Object.assign(b, carried);
}

/** Cheap in-search flag refresh so the next pass targets the right assignments. */
function refreshFlags(assignments, state, context) {
  for (const a of assignments) {
    const entry = state.get(a.supervisor_id);
    if (!entry) continue;

    a.repeat_school = context.avoidRepeatSchools && schoolCountOf(entry, a.school_id) > 1;

    if (a._cluster == null) {
      a.cluster_break = false;
      continue;
    }
    const clusters = entry.clusterCounts.get(a.visit_number);
    if (!clusters || clusters.size <= 1) {
      a.cluster_break = false;
    } else {
      const largest = Math.max(...clusters.values());
      a.cluster_break = (clusters.get(a._cluster) || 0) < largest;
    }
  }
}

/**
 * Final, authoritative flagging. Only the extra visits to an already-covered
 * school count as repeats, and only trips outside a supervisor's dominant cluster
 * for that visit count as affinity breaks.
 */
function reflagAssignments(assignments, schoolHistory, postingType, avoidRepeatSchools = true) {
  const covered = new Map();

  for (const a of assignments) {
    if (!avoidRepeatSchools) {
      // The penalty is off, so a repeated school is not a problem to report
      a.repeat_school = false;
      continue;
    }

    if (!covered.has(a.supervisor_id)) {
      covered.set(a.supervisor_id, new Set(schoolHistory.get(a.supervisor_id) || []));
    }
    const schools = covered.get(a.supervisor_id);
    a.repeat_school = schools.has(a.school_id);
    schools.add(a.school_id);
  }

  // Dominant cluster per (supervisor, visit)
  const histogram = new Map();
  for (const a of assignments) {
    const cluster = clusterKeyFor(a, postingType);
    if (cluster === null) continue;

    const key = `${a.supervisor_id}-${a.visit_number}`;
    if (!histogram.has(key)) histogram.set(key, new Map());
    const clusters = histogram.get(key);
    clusters.set(cluster, (clusters.get(cluster) || 0) + 1);
  }

  const dominant = new Map();
  for (const [key, clusters] of histogram) {
    let bestCluster = null;
    let bestCount = -1;
    for (const [cluster, count] of clusters) {
      if (count > bestCount) {
        bestCluster = cluster;
        bestCount = count;
      }
    }
    dominant.set(key, bestCluster);
  }

  for (const a of assignments) {
    const cluster = clusterKeyFor(a, postingType);
    if (cluster === null) {
      a.cluster_break = false;
      continue;
    }
    a.cluster_break = dominant.get(`${a.supervisor_id}-${a.visit_number}`) !== cluster;
  }
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Build the result payload. Deliberately richer than a set of counts: the preview
 * needs to show how *good* the distribution is, not just how big it is.
 */
function finish(assignments, warnings, supervisors, visitsIncluded, eligibleSlots, extras) {
  const { context, costBefore, costAfter, searchResult, quotaSkipped = 0 } = extras;

  const byVisit = {};
  const bySupervisor = {};
  const bySchool = {};
  const repeats = new Map();

  for (const a of assignments) {
    const visitKey = `visit_${a.visit_number}`;
    byVisit[visitKey] = (byVisit[visitKey] || 0) + 1;

    if (!bySupervisor[a.supervisor_id]) {
      bySupervisor[a.supervisor_id] = { count: 0, name: a.supervisor_name, distance: 0 };
    }
    bySupervisor[a.supervisor_id].count++;
    bySupervisor[a.supervisor_id].distance += a.distance_km || 0;

    if (!bySchool[a.school_id]) {
      bySchool[a.school_id] = { count: 0, name: a.school_name };
    }
    bySchool[a.school_id].count++;

    if (a.repeat_school) {
      const key = `${a.supervisor_id}-${a.school_id}`;
      if (!repeats.has(key)) {
        repeats.set(key, {
          supervisor_id: a.supervisor_id,
          supervisor_name: a.supervisor_name,
          school_id: a.school_id,
          school_name: a.school_name,
          visit_numbers: [],
        });
      }
      repeats.get(key).visit_numbers.push(a.visit_number);
    }
  }

  const counts = Object.values(bySupervisor).map((s) => s.count);
  const travels = Object.values(bySupervisor).map((s) => s.distance);
  const supervisorsWithPostings = Object.keys(bySupervisor).length;

  // Mean journey length per rank band - the readable, deterministic proof that
  // seniority is honoured: since priority is now a hard bucket assignment, these
  // figures should fall as priority_number rises, not just correlate loosely.
  const rankBuckets = new Map();
  for (const a of assignments) {
    const band = Number(a.priority_number) || 99;
    if (!rankBuckets.has(band)) rankBuckets.set(band, { distance: 0, count: 0 });
    const bucket = rankBuckets.get(band);
    bucket.distance += a.distance_km || 0;
    bucket.count++;
  }

  const distanceByRank = [...rankBuckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([priority_number, bucket]) => ({
      priority_number,
      postings: bucket.count,
      mean_km: Number((bucket.distance / bucket.count).toFixed(1)),
    }));

  // Pure reporting/QA metric - proves the bucketing worked, doesn't drive
  // anything. Negated so positive means "better rank -> further".
  let priorityCorrelation = 0;
  if (assignments.length >= 2) {
    priorityCorrelation = -correlation(
      assignments.map((a) => Number(a.priority_number) || 99),
      assignments.map((a) => a.distance_km || 0)
    );
  }

  const statistics = {
    total_assignments: assignments.length,
    total_schools: Object.keys(bySchool).length,
    by_visit: byVisit,
    by_round: byVisit, // Alias for frontend compatibility
    supervisors_full: supervisorsWithPostings,
    supervisors_partial: 0,
    supervisors_none: supervisors.length - supervisorsWithPostings,
    visits_included: visitsIncluded,
    filtered_slots_count: eligibleSlots.length,

    avg_postings_per_supervisor: counts.length
      ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length)
      : 0,
    min_postings: counts.length ? Math.min(...counts) : 0,
    max_postings: counts.length ? Math.max(...counts) : 0,

    // Distribution quality
    repeat_school_assignments: assignments.filter((a) => a.repeat_school).length,
    repeat_school_details: [...repeats.values()].slice(0, 20),
    affinity_breaks: assignments.filter((a) => a.cluster_break).length,
    load: {
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      stddev: Number(standardDeviation(counts).toFixed(2)),
    },
    travel_km: {
      min: travels.length ? Number(Math.min(...travels).toFixed(1)) : 0,
      max: travels.length ? Number(Math.max(...travels).toFixed(1)) : 0,
      mean: travels.length
        ? Number((travels.reduce((a, b) => a + b, 0) / travels.length).toFixed(1))
        : 0,
    },
    distance_by_rank: distanceByRank,
    priority_correlation: Number(priorityCorrelation.toFixed(3)),
    quota_skipped: quotaSkipped,
  };

  if (context) {
    statistics.cost_total = Number((costAfter ?? 0).toFixed(2));
    statistics.local_search = {
      swaps_applied: searchResult?.swaps_applied ?? 0,
      passes: searchResult?.passes ?? 0,
      cost_before: Number((costBefore ?? 0).toFixed(2)),
      cost_after: Number((costAfter ?? 0).toFixed(2)),
      budget_exhausted: searchResult?.budget_exhausted === true,
    };
  }

  if (statistics.repeat_school_assignments > 0) {
    warnings.push(
      `${statistics.repeat_school_assignments} posting(s) reuse a school for the same supervisor - no alternative supervisor had capacity`
    );
  }

  if (statistics.affinity_breaks > 0) {
    warnings.push(
      `${statistics.affinity_breaks} posting(s) fall outside the supervisor's usual route/LGA for that visit - the area ran out of available slots`
    );
  }

  // Safety net: the algorithm must never assign a slot twice
  const seenSlots = new Map();
  const duplicates = [];
  for (const a of assignments) {
    const slotKey = `${a.school_id}-${a.group_number}-${a.visit_number}`;
    if (seenSlots.has(slotKey)) {
      duplicates.push({
        slot: slotKey,
        first_supervisor: seenSlots.get(slotKey),
        second_supervisor: a.supervisor_name,
      });
    } else {
      seenSlots.set(slotKey, a.supervisor_name);
    }
  }

  if (duplicates.length > 0) {
    warnings.push(`Algorithm error: ${duplicates.length} duplicate slot assignments detected`);
    statistics.duplicate_errors = duplicates;
  }

  return { assignments, warnings, statistics };
}

module.exports = {
  runAutoPostingAlgorithm,
  DEFAULT_WEIGHTS,
  // Exported for testing
  clusterKeyFor,
  standardDeviation,
  correlation,
  computePriorityTiers,
  computeTierThresholds,
  assignUnitsToTiers,
  planPriorityAllocation,
};
