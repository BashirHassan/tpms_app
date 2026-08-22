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
 *   HARD  capacity         a supervisor at remaining_slots is never considered
 *   HARD  slot uniqueness  each slot is assigned at most once
 *   HARD  dean ceiling     total assignments capped when a dean allocation applies
 *   soft  school variety   don't send a supervisor back to a school they cover
 *   soft  cluster affinity keep a supervisor inside one route/LGA per visit
 *   soft  rank <-> distance higher ranked supervisors take longer journeys
 *   soft  load balance     even posting counts
 *   soft  travel balance   even total kilometres
 *
 * Soft constraints are weighted penalties rather than hard blocks, so the engine
 * always produces the best achievable answer instead of refusing to fill a slot.
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
 */
/**
 * Default cost weights.
 *
 * `load` is charged per whole posting a supervisor is ahead of the least loaded
 * peer, so it is deliberately larger than `priority` and `affinity`: being two
 * postings ahead should outweigh any area or rank preference, which is what keeps
 * the workload even. Within a tier of equally loaded supervisors the load term is
 * zero for everyone, so affinity and rank do the actual choosing.
 */
const DEFAULT_WEIGHTS = {
  repeat: 2000,   // supervisor already covers this school
  affinity: 300,  // trip outside the supervisor's area for that visit
  load: 200,      // per posting ahead of the least loaded supervisor
  priority: 30,   // mismatch between rank band and distance band
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

/**
 * Normalise values to [0,1]. Returns 0 for everything when all values match, so a
 * pool with a single rank (or a single distance) contributes no cost at all.
 */
function makeNormaliser(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return () => 0;

  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;

  if (span === 0) return () => 0;
  return (value) => (Number.isFinite(value) ? (value - min) / span : 0);
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
// CLUSTER PLANNING
//
// For route_based / lga_based, decide up front which area each supervisor will
// work on each visit. Without this the greedy pass always finds an idle
// supervisor cheapest (their load term is zero) and the areas scatter - which is
// how the previous round-robin implementation behaved despite the documentation.
// ============================================================================

/**
 * Plan supervisor -> area for every visit.
 *
 * Two stages, because a purely sequential greedy gets trapped: it hands out the
 * easy areas first and leaves the last supervisor holding the one area they
 * already covered. A pairwise improvement pass over the plan finds the rotation
 * that a sequential pass cannot.
 *
 * Once a supervisor is locked into a route/LGA for a visit, every slot in that
 * area becomes theirs regardless of rank - the per-slot priority term in
 * `marginalCost` never gets a say. Without a rank-aware term here, a cluster's
 * distance (and so its pay) is handed out by whoever happens to have the fewest
 * repeated schools, which has no relationship to seniority and can easily send
 * the longest, best-paid route to the most junior supervisor left in the queue.
 * Folding a rank <-> cluster-distance mismatch into the same cost keeps repeat
 * avoidance dominant (it is still weighted far higher) while making sure ties -
 * the common case, since most supervisors start a fresh area at zero repeats -
 * are broken in favour of the intended pairing.
 *
 * @param {boolean} [options.priorityEnabled] - Pair higher ranks with longer routes
 * @param {(supervisor: Object) => number} [options.rankBand] - Rank normalised to [0,1], 0 = most senior
 * @param {{repeat: number, priority: number}} [options.weights] - Same weights the
 *   run is actually using, so a boosted priority term (from the tuning loop or a
 *   caller override) reaches cluster assignment too, not just per-slot cost
 * @returns {Map} Map<`${supervisorId}-${visit}`, cluster>
 */
function planClusters(supervisors, slots, postingType, schoolHistory, options = {}) {
  const {
    priorityEnabled = false,
    rankBand = () => 0,
    weights = DEFAULT_WEIGHTS,
  } = options;

  const plan = new Map();
  if (postingType !== 'route_based' && postingType !== 'lga_based') return plan;

  // Schools each supervisor already covers, grown as the plan is built visit by
  // visit so later visits know what earlier ones committed to
  const covered = new Map(
    supervisors.map((s) => [s.id, new Set(schoolHistory.get(s.id) || [])])
  );
  const supervisorById = new Map(supervisors.map((s) => [s.id, s]));

  const visits = [...new Set(slots.map((s) => s.visit_number))].sort((a, b) => a - b);

  for (const visit of visits) {
    const visitSlots = slots.filter((s) => s.visit_number === visit);
    if (visitSlots.length === 0) continue;

    // cluster -> { slots, schools, distance }
    const clusters = new Map();
    for (const slot of visitSlots) {
      const key = clusterKeyFor(slot, postingType);
      if (!clusters.has(key)) clusters.set(key, { key, slots: 0, schools: new Set(), distance: 0 });
      const cluster = clusters.get(key);
      cluster.slots++;
      cluster.schools.add(slot.school_id);
      cluster.distance += slot.distance_km || 0;
    }

    // How many supervisors each area needs
    const targetPerSupervisor = Math.max(1, Math.ceil(visitSlots.length / supervisors.length));
    for (const cluster of clusters.values()) {
      cluster.needed = Math.max(1, Math.ceil(cluster.slots / targetPerSupervisor));
    }

    // Areas that genuinely need more than one supervisor go first (a capacity
    // requirement, not a preference). Among the rest - typically most areas, each
    // needing exactly one seat - the farthest area claims its seat first when
    // priority is on. With more areas than supervisors (routine for an
    // institution with many LGAs/routes), the seat budget runs out before every
    // area gets a dedicated supervisor; whichever areas miss out fall back to the
    // generic per-slot cost, so leaving that miss to chance let a genuinely
    // remote, high-value area go unrepresented while several short ones nearby
    // got seated - the single biggest source of rank/distance mismatch in
    // practice.
    const ordered = [...clusters.values()].sort((a, b) => {
      if (b.needed !== a.needed) return b.needed - a.needed;
      return priorityEnabled ? b.distance - a.distance : b.slots - a.slots;
    });

    const seats = [];
    for (const cluster of ordered) {
      for (let i = 0; i < cluster.needed && seats.length < supervisors.length; i++) {
        seats.push(cluster);
      }
    }

    // Cost of putting this supervisor in this area: how many of its schools they
    // already cover, i.e. how many repeats it would force
    const repeatCost = (supervisorId, cluster) => {
      const schools = covered.get(supervisorId) || new Set();
      let cost = 0;
      for (const schoolId of cluster.schools) if (schools.has(schoolId)) cost++;
      return cost;
    };

    // How far this cluster's total distance sits from "what this rank should be
    // doing" - the busiest (longest) cluster in the visit wants the most senior
    // rank band (0), the lightest wants the least senior (1)
    const clusterDemandNormaliser = priorityEnabled
      ? makeNormaliser([...clusters.values()].map((c) => c.distance))
      : () => 0;

    const priorityCost = (supervisorId, cluster) => {
      if (!priorityEnabled) return 0;
      const supervisor = supervisorById.get(supervisorId);
      if (!supervisor) return 0;
      const demand = 1 - clusterDemandNormaliser(cluster.distance);
      return Math.abs(rankBand(supervisor) - demand);
    };

    // Repeat avoidance stays dominant at the configured ratio - this mostly
    // decides the common case where repeat cost ties. Reads the run's actual
    // weights (not the fixed defaults) so a boosted priority term reaches
    // cluster assignment too, not just per-slot cost.
    const combinedCost = (supervisorId, cluster) =>
      weights.repeat * repeatCost(supervisorId, cluster) +
      weights.priority * priorityCost(supervisorId, cluster);

    // Stage 1 - greedy seat filling
    const unassigned = supervisors.map((s) => s.id);
    const seated = []; // [{ supervisorId, cluster }]

    for (const cluster of seats) {
      if (unassigned.length === 0) break;
      let bestIndex = 0;
      let bestCost = Infinity;
      for (let i = 0; i < unassigned.length; i++) {
        const cost = combinedCost(unassigned[i], cluster);
        if (cost < bestCost) {
          bestCost = cost;
          bestIndex = i;
        }
      }
      seated.push({ supervisorId: unassigned.splice(bestIndex, 1)[0], cluster });
    }

    // Stage 2 - swap areas between two supervisors while the total falls
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < seated.length; i++) {
        for (let j = i + 1; j < seated.length; j++) {
          const a = seated[i];
          const b = seated[j];
          if (a.cluster === b.cluster) continue;

          const before = combinedCost(a.supervisorId, a.cluster) + combinedCost(b.supervisorId, b.cluster);
          const after = combinedCost(a.supervisorId, b.cluster) + combinedCost(b.supervisorId, a.cluster);

          if (after < before) {
            const carried = a.cluster;
            a.cluster = b.cluster;
            b.cluster = carried;
            improved = true;
          }
        }
      }
    }

    for (const { supervisorId, cluster } of seated) {
      plan.set(`${supervisorId}-${visit}`, cluster.key);
      // Assume the plan is honoured, so the next visit avoids these schools
      const schools = covered.get(supervisorId);
      if (schools) for (const schoolId of cluster.schools) schools.add(schoolId);
    }
  }

  return plan;
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
  const { weights, rankBand, maxTravel } = context;

  // School variety - only the extra visits to a covered school are charged
  const repeat = schoolCountOf(entry, slot.school_id) > 0 ? 1 : 0;

  // Affinity, measured against the area this supervisor was planned into for this
  // visit. Falls back to their actual dominant area when there is no plan (which
  // happens once the plan is exhausted, e.g. more capacity than the area holds).
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

  // Priority as a distance-share target rather than per-slot matching.
  //
  // Matching each slot to a rank cannot survive count balancing: once every
  // supervisor must end up with a similar number of postings, each one takes a
  // slot from every distance band and the pairing washes out. Instead each rank
  // gets a target share of total distance - best rank aims high, lowest aims low -
  // and the cost is how far this assignment moves them from that target. Long
  // journeys then accumulate on senior staff without disturbing posting counts.
  let priority = 0;
  if (weights.priority > 0) {
    const target = (1 - rankBand(entry.supervisor)) * context.travelTarget;
    const before = Math.abs(entry.distance - target);
    const after = Math.abs(entry.distance + (slot.distance_km || 0) - target);
    priority = (after - before) / Math.max(context.travelTarget, 1);
  }

  // Load and travel are measured *relative to the lightest peer*, so a supervisor
  // level with everyone else pays nothing and the softer terms decide. Using
  // absolute counts would make the whole pool more expensive as the run fills,
  // drowning out priority and scattering the rank-to-distance pairing.
  const load = Math.max(0, entry.count - context.minCount);

  // Travel balance is only meaningful when ranks are NOT being paired to
  // distance - with priority on, an uneven travel spread is the intended outcome
  const travel = weights.priority > 0 || maxTravel <= 0
    ? 0
    : Math.max(0, entry.distance - context.minDistance) / maxTravel;

  const total =
    weights.repeat * repeat +
    weights.affinity * affinity +
    weights.priority * priority +
    weights.load * load +
    weights.travel * travel;

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

/**
 * How far a supervisor's accumulated travel sits from the target for their rank.
 * A property of the supervisor, not of any single assignment, so swaps delta it
 * by re-reading both supervisors after the exchange.
 */
function priorityCostOf(entry, context) {
  if (context.weights.priority === 0 || !entry) return 0;
  const target = (1 - context.rankBand(entry.supervisor)) * context.travelTarget;
  return (
    context.weights.priority *
    (Math.abs(entry.distance - target) / Math.max(context.travelTarget, 1))
  );
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

  const baseWeights = {
    ...DEFAULT_WEIGHTS,
    ...weightOverrides,
    repeat: avoidRepeatSchools ? (weightOverrides.repeat ?? DEFAULT_WEIGHTS.repeat) : 0,
    priority: priorityEnabled ? (weightOverrides.priority ?? DEFAULT_WEIGHTS.priority) : 0,
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

  // Rank normalised to [0,1] across this pool, so the bands stay comparable
  // however many distinct ranks the institution actually uses
  const rankNormaliser = makeNormaliser(supervisors.map((s) => Number(s.priority_number) || 99));
  const rankBand = (supervisor) => rankNormaliser(Number(supervisor.priority_number) || 99);

  const totalDistance = eligibleSlots.reduce((sum, s) => sum + (s.distance_km || 0), 0);
  const maxTravel = Math.max(totalDistance / supervisors.length, 1);

  // Distance the top-ranked supervisor aims for. Twice the mean, so the best rank
  // targets roughly double the average journey load and the lowest targets zero,
  // averaging out to the mean across the pool.
  const travelTarget = maxTravel * 2;

  const sortedSlots = sortSlots(eligibleSlots, postingType, priorityEnabled);

  /**
   * Run one full greedy + local-search pass under a given set of weights.
   * Always starts from a clean allocation state, so different weight choices can
   * be compared on equal footing and the best one kept.
   *
   * The cluster plan is rebuilt per attempt (not hoisted out) - it depends on the
   * weights too, so a boosted priority term from the tuning loop actually reaches
   * which supervisor gets which route/LGA, not only the per-slot fallback cost.
   */
  function runOnce(weights) {
    const clusterPlan = planClusters(supervisors, eligibleSlots, postingType, schoolHistory, {
      priorityEnabled, rankBand, weights,
    });
    const context = {
      weights, postingType, rankBand, maxTravel, travelTarget, avoidRepeatSchools, clusterPlan,
    };
    const state = createState(supervisors, schoolHistory);
    const assignments = [];
    const warnings = [];

    let unassignedSlots = 0;
    let quotaSkipped = 0;

    // ---- Greedy pass: each slot goes to its lowest-cost supervisor ----
    for (const slot of sortedSlots) {
      if (assignments.length >= maxAssignments) {
        quotaSkipped++;
        continue;
      }

      const cluster = clusterKeyFor(slot, postingType);
      let best = null;
      let bestScore = null;

      // Baselines for the relative load/travel terms, over supervisors still free.
      //
      // When this slot's area has planned supervisors, the baseline is taken from
      // *them* only. The plan already shares supervisors between areas in
      // proportion to their size, so balance across areas is settled; charging a
      // supervisor for getting ahead of someone working a different area would just
      // push them out of their own, which is how a route leaks its last schools.
      const plannedHere = [];
      if (cluster !== null) {
        for (const entry of state.values()) {
          if (entry.count >= Number(entry.supervisor.remaining_slots)) continue;
          if (clusterPlan.get(`${entry.supervisor.id}-${slot.visit_number}`) === cluster) {
            plannedHere.push(entry);
          }
        }
      }

      const baseline = plannedHere.length > 0 ? plannedHere : [...state.values()];
      context.minCount = Infinity;
      context.minDistance = Infinity;
      for (const entry of baseline) {
        if (entry.count >= Number(entry.supervisor.remaining_slots)) continue;
        if (entry.count < context.minCount) context.minCount = entry.count;
        if (entry.distance < context.minDistance) context.minDistance = entry.distance;
      }
      if (context.minCount === Infinity) context.minCount = 0;
      if (context.minDistance === Infinity) context.minDistance = 0;

      for (const entry of state.values()) {
        // HARD constraint - capacity
        if (entry.count >= Number(entry.supervisor.remaining_slots)) continue;

        const score = marginalCost(entry, slot, cluster, context);
        if (bestScore === null || score.total < bestScore.total) {
          best = entry;
          bestScore = score;
        }
      }

      if (!best) {
        unassignedSlots++;
        continue;
      }

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
    }

    // ---- Local search: swap supervisors while the total cost strictly falls ----
    const costBefore = scoreSolution(state, context);
    const searchResult = localSearch(assignments, state, context);
    const costAfter = scoreSolution(state, context);

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

  const firstPass = runOnce(baseWeights);
  if (baseWeights.priority <= 0) return firstPass;

  return tunePriorityWeight(runOnce, baseWeights, firstPass);
}

/**
 * Priority accuracy feedback loop.
 *
 * `priority_correlation` is the "accuracy number" - how well this run actually
 * paired seniority with distance. A single fixed weight does not fit every pool
 * (few ranks vs. many, tight vs. spread-out distances), so when the first pass
 * under-shoots the target, the priority term is strengthened and re-run. The
 * stronger pull is kept only when it *measurably improves* correlation without
 * costing more repeats/affinity breaks or unbalancing posting counts further -
 * otherwise escalation stops and the best attempt so far wins. Bounded to a few
 * attempts so a pool that simply can't do better doesn't loop needlessly.
 */
const PRIORITY_TUNING = {
  targetCorrelation: 0.6,
  maxAttempts: 3,
  boostFactor: 1.8,
};

function tunePriorityWeight(runOnce, baseWeights, firstResult) {
  if (firstResult.statistics.total_assignments < 2) return firstResult;

  let best = firstResult;
  let bestWeight = baseWeights.priority;
  let attempts = 0;

  while (
    attempts < PRIORITY_TUNING.maxAttempts &&
    best.statistics.priority_correlation < PRIORITY_TUNING.targetCorrelation
  ) {
    attempts++;
    const candidateWeight = bestWeight * PRIORITY_TUNING.boostFactor;
    const candidate = runOnce({ ...baseWeights, priority: candidateWeight });

    const bestLoadSpread = best.statistics.load.max - best.statistics.load.min;
    const candidateLoadSpread = candidate.statistics.load.max - candidate.statistics.load.min;

    const improved = candidate.statistics.priority_correlation > best.statistics.priority_correlation;
    const noWorseQuality =
      candidate.statistics.repeat_school_assignments <= best.statistics.repeat_school_assignments &&
      candidate.statistics.affinity_breaks <= best.statistics.affinity_breaks &&
      candidateLoadSpread <= Math.max(1, bestLoadSpread);

    if (!improved || !noWorseQuality) break;

    best = candidate;
    bestWeight = candidateWeight;
  }

  best.statistics.priority_tuning = {
    weight_used: Number(bestWeight.toFixed(2)),
    attempts,
    target_correlation: PRIORITY_TUNING.targetCorrelation,
    achieved_correlation: best.statistics.priority_correlation,
  };

  return best;
}

/**
 * Whole-solution score: structural cost from the state plus each supervisor's
 * distance-to-target gap.
 */
function scoreSolution(state, context) {
  let total = solutionCost(state, context);

  if (context.weights.priority > 0) {
    for (const entry of state.values()) {
      total += priorityCostOf(entry, context);
    }
  }

  return total;
}

// ============================================================================
// LOCAL SEARCH
// ============================================================================

/**
 * Swap the supervisors of two assignments whenever that strictly lowers the cost.
 *
 * Each slot keeps its own school/group/visit, so a swap only exchanges who goes
 * where - posting counts and capacity are untouched by construction, which means
 * the hard constraints survive the search automatically.
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
 * repeats, affinity, travel spread, and the priority term for those assignments.
 * Posting counts are unchanged by a swap, so the load term is deliberately omitted.
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

  if (entryA) total += priorityCostOf(entryA, context);
  if (entryB) total += priorityCostOf(entryB, context);

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

  // Mean journey length per rank band. This is the readable proof that seniority
  // is being honoured: the figures should fall as priority_number rises. A single
  // correlation number hides this, because the most senior bands all saturate on
  // whatever the longest available journeys are.
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

  // Kept as a secondary summary. Negated so positive means "better rank -> further".
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
  PRIORITY_TUNING,
  // Exported for testing
  clusterKeyFor,
  standardDeviation,
  correlation,
  planClusters,
};
