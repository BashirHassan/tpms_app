/**
 * Auto-Posting Engine
 *
 * Assigns supervisors to school/group/visit slots via a staged allocation pipeline:
 *
 *   Priority tiers -> LGA/route allocation -> supervisor allocation within LGA/route
 *   -> slot allocation within supervisor -> constrained local improvement
 *
 * Pure functions - no database access - so the whole allocation strategy is
 * unit-testable and the controller is left with data fetching only.
 *
 * CONSTRAINT HIERARCHY (enforced in this order, never traded against each other)
 *   HARD  slot uniqueness   each slot is assigned at most once
 *   HARD  supervisor capacity a supervisor never exceeds remaining_slots
 *   HARD  dean ceiling      total assignments capped when a dean allocation applies
 *   HARD  eligible inputs   only supplied supervisors/slots are ever used
 *   HARD  valid visits      only a selected visit_number is eligible
 *   STRONG priority         when enabled, senior tiers systematically receive the
 *                           harder/farther geographical work; inversions minimized
 *   STRONG LGA/route cohesion a supervisor's slots for one visit stay in one area
 *                           unless a hard constraint makes that impossible
 *   SOFT  repeat avoidance  prefer a school the supervisor has not already covered
 *   SOFT  workload balance  even total posting counts (including existing load)
 *   SOFT  travel balance    even total kilometres, only within an equivalent
 *                           priority/area group
 *
 * This is a lexicographic objective, not a weighted sum (see scoreCandidate /
 * compareObjectives): a tiny travel improvement can never buy back a broken
 * priority or LGA-cohesion rule. Multiple deterministic candidate solutions are
 * generated (generateInitialSolutions) and compared; the winner is then refined
 * by a small set of named, hierarchy-validated local moves (improveSolution).
 *
 * @see docs/AUTOMATED_POSTING_SYSTEM.md
 * @see docs/AUTO_POSTING_REWRITE_PROMT.MD
 */

// Bounds so a very large batch cannot degenerate into a long search
const LOCAL_SEARCH_MAX_PASSES = 4;
const LOCAL_SEARCH_MAX_COMPARISONS = 300000;

// ============================================================================
// SMALL MATH HELPERS
// ============================================================================

function standardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Linear-interpolation percentile on an already-sorted ascending array. */
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

/** Pearson correlation, kept as a diagnostic only - never the optimization criterion. */
function correlation(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;

  const meanX = average(xs);
  const meanY = average(ys);

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
 * Robust geographical difficulty for a set of distances (one LGA, one route).
 * Deliberately NOT a function of how many schools/slots there are - that is
 * `demand`, tracked completely separately - so a large LGA with uniformly close
 * schools does not automatically outrank a small LGA with genuinely distant ones.
 */
function calculateGeographyDifficulty(distanceValues) {
  if (!distanceValues || distanceValues.length === 0) {
    return { max: 0, p75: 0, mean: 0, totalDistance: 0, difficulty: 0 };
  }
  const sorted = [...distanceValues].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  const mean = average(sorted);
  const p75 = percentile(sorted, 0.75);
  const totalDistance = sorted.reduce((a, b) => a + b, 0);
  const difficulty = 0.6 * max + 0.25 * p75 + 0.15 * mean;
  return { max, p75, mean, totalDistance, difficulty };
}

/** The clustering key for a slot under the given posting type. 'random' has none. */
function clusterKeyFor(slot, postingType) {
  if (postingType === 'route_based') return `route:${slot.route_id ?? 'unassigned'}`;
  if (postingType === 'lga_based') return `lga:${slot.lga ?? 'unknown'}`;
  return null;
}

/**
 * Human-readable label for the visits a run covers.
 * An array means an explicit selection ('Visit 2', 'Visits 1, 3'); a number keeps
 * the "visits 1 through N" shorthand.
 */
function describeVisits(visitsIncluded) {
  if (Array.isArray(visitsIncluded)) {
    return visitsIncluded.length === 1
      ? `Visit ${visitsIncluded[0]}`
      : `Visits ${visitsIncluded.join(', ')}`;
  }
  return visitsIncluded > 1 ? `Visit 1 through ${visitsIncluded}` : 'Visit 1';
}

/**
 * Normalizes a visit-eligibility test to a predicate function. Existing callers
 * (and tests) pass a plain number meaning "<= this"; the engine's own internals
 * pass a resolved predicate directly once an explicit visitNumbers selection is
 * in play, so both forms are accepted everywhere a visit filter is expected.
 */
function toVisitFilter(visitFilterOrNumber) {
  return typeof visitFilterOrNumber === 'function'
    ? visitFilterOrNumber
    : (v) => v <= visitFilterOrNumber;
}

// ============================================================================
// SEEDED SHUFFLE (deterministic-but-random tie-breaking)
//
// Every "who wins a tie" decision in the pipeline used to fall back to raw
// supervisor ID, which - since IDs are typically assigned in account-creation
// order - meant the same handful of low-ID supervisors won every genuine tie,
// run after run, forever. That's not randomness, it's a permanent silent bias.
//
// The fix is a per-BATCH shuffled rank: a random total order over this run's
// supervisor IDs, used as the final tie-break wherever ID used to be. It is
// seeded from the batch's own inputs (posting type/criteria + the exact set
// of supervisor and slot IDs) rather than Math.random(), so a Preview and the
// Execute that immediately follows it (same inputs) always agree, and the
// engine's "same input -> same output" determinism guarantee still holds -
// but two different sessions, criteria, or batches naturally shuffle
// differently, and once any postings are persisted the available-slot set
// changes, so a follow-up batch reshuffles too.
// ============================================================================

/** Small, fast, deterministic string hash (FNV-1a) - not cryptographic, just a seed source. */
function hashSeed(parts) {
  const str = parts.join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 - a small, fast, seeded PRNG. Returns a () => float in [0, 1) generator. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A random total order over `ids` for this run only, seeded so repeated runs
 * of the same batch agree. Fisher-Yates shuffle, then rank = index in the
 * shuffled order.
 * @returns {Map<number, number>} id -> rank (lower rank = wins ties first)
 */
function buildShuffledRank(ids, seed) {
  const shuffled = [...ids];
  const rng = mulberry32(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const rank = new Map();
  shuffled.forEach((id, idx) => rank.set(id, idx));
  return rank;
}

// ============================================================================
// PHASE 1 - NORMALIZE
// ============================================================================

/**
 * Validate and normalize raw inputs. Never mutates the caller's arrays/objects.
 * Unknown geography/priority is defaulted but explicitly flagged so it never
 * silently masquerades as "genuinely nearby" or "genuinely senior".
 */
function normalizeInput(supervisors, slots, visitFilterOrNumber, options) {
  const visitFilter = toVisitFilter(visitFilterOrNumber);
  const warnings = [];

  const normSupervisors = supervisors.map((s) => ({
    id: s.id,
    name: s.name,
    rank_code: s.rank_code ?? null,
    rank_name: s.rank_name ?? null,
    priority_number: Number.isFinite(Number(s.priority_number)) ? Number(s.priority_number) : 99,
    priorityKnown: s.priority_number != null && Number.isFinite(Number(s.priority_number)),
    current_postings: Math.max(0, Number(s.current_postings) || 0),
    remaining_slots: Math.max(0, Number(s.remaining_slots) || 0),
    _raw: s,
  }));

  // Defensive de-duplication: same (school, group, visit) supplied twice
  const seen = new Map();
  let duplicateInputSlots = 0;
  const dedupedSlots = [];
  for (const s of slots) {
    const key = `${s.school_id}-${s.group_number}-${s.visit_number}`;
    if (seen.has(key)) {
      duplicateInputSlots++;
      continue;
    }
    seen.set(key, true);
    dedupedSlots.push(s);
  }

  let unknownDistanceCount = 0;
  const normSlots = dedupedSlots
    .filter((s) => visitFilter(s.visit_number))
    .map((s) => {
      const distanceKnown = s.distance_km != null && Number.isFinite(Number(s.distance_km));
      if (!distanceKnown) unknownDistanceCount++;
      return {
        id: s.id ?? `${s.school_id}-${s.group_number}-${s.visit_number}`,
        school_id: s.school_id,
        school_name: s.school_name,
        group_number: s.group_number,
        visit_number: s.visit_number,
        route_id: s.route_id ?? null,
        route_name: s.route_name ?? 'unassigned',
        lga: s.lga ?? 'unknown',
        distance_km: distanceKnown ? Number(s.distance_km) : 0,
        distanceKnown,
        location_category: s.location_category ?? null,
      };
    });

  if (duplicateInputSlots > 0) {
    warnings.push(`${duplicateInputSlots} duplicate input slot(s) were ignored.`);
  }
  if (unknownDistanceCount > 0) {
    warnings.push(
      `${unknownDistanceCount} slot(s) have unknown distance and were treated as 0 km - verify school distance data.`
    );
  }

  const unknownPriorityCount = normSupervisors.filter((s) => !s.priorityKnown).length;

  return {
    supervisors: normSupervisors,
    slots: normSlots,
    warnings,
    dataQuality: {
      duplicate_input_slots: duplicateInputSlots,
      supervisors_with_unknown_priority: unknownPriorityCount,
      slots_with_unknown_distance: unknownDistanceCount,
    },
  };
}

// ============================================================================
// PHASE 2 - DEMAND / GEOGRAPHY MODEL
// ============================================================================

/**
 * Build one demand unit per (visit, clustering key). For 'random' postings each
 * slot is its own singleton unit (demand=1), which lets priority-aware random
 * posting reuse the exact same tier-allocation core as lga_based/route_based.
 */
function buildDemandModel(slots, postingType) {
  const byVisit = new Map();
  const byUnitKey = new Map();
  let totalDemand = 0;

  const visits = [...new Set(slots.map((s) => s.visit_number))].sort((a, b) => a - b);

  for (const visit of visits) {
    const visitSlots = slots.filter((s) => s.visit_number === visit);
    const units = new Map();

    for (const slot of visitSlots) {
      const key = postingType === 'random' ? `slot:${slot.id}` : clusterKeyFor(slot, postingType);
      if (!units.has(key)) {
        units.set(key, {
          key,
          visit_number: visit,
          lga: postingType === 'lga_based' ? slot.lga : undefined,
          route_id: postingType === 'route_based' ? slot.route_id : undefined,
          route_name: postingType === 'route_based' ? slot.route_name : undefined,
          slots: [],
          schools: new Set(),
          groups: new Set(),
          distanceValues: [],
        });
      }
      const unit = units.get(key);
      unit.slots.push(slot);
      unit.schools.add(slot.school_id);
      unit.groups.add(`${slot.school_id}-${slot.group_number}`);
      unit.distanceValues.push(slot.distance_km || 0);
    }

    const visitUnits = [];
    for (const unit of units.values()) {
      const geo = calculateGeographyDifficulty(unit.distanceValues);
      const finalUnit = {
        ...unit,
        demand: unit.slots.length,
        maxDistance: geo.max,
        averageDistance: geo.mean,
        p75Distance: geo.p75,
        totalDistance: geo.totalDistance,
        difficulty: geo.difficulty,
      };
      visitUnits.push(finalUnit);
      byUnitKey.set(`${unit.key}-${visit}`, finalUnit);
      totalDemand += finalUnit.demand;
    }

    // Deterministic order within a visit: hardest first, then key for stability
    visitUnits.sort((a, b) => b.difficulty - a.difficulty || a.key.localeCompare(b.key));
    byVisit.set(visit, visitUnits);
  }

  return { byVisit, byUnitKey, totalDemand, visits };
}

// ============================================================================
// PHASE 3 - SUPERVISOR CAPACITY MODEL
// ============================================================================

/**
 * @param {Array} supervisors normalized supervisors
 * @param {Map}   schoolHistory Map<supervisor_id, Set<school_id>> from existing postings
 */
function buildSupervisorModel(supervisors, schoolHistory) {
  const byId = new Map();

  for (const s of supervisors) {
    byId.set(s.id, {
      supervisor: s,
      priorityNumber: s.priority_number,
      totalCapacity: s.remaining_slots,
      currentPostings: s.current_postings,
      usedInRun: 0, // GLOBAL ledger, shared across every visit
      schoolHistory: new Set(schoolHistory.get(s.id) || []),
      visitUnit: new Map(), // visit_number -> unit key this supervisor is committed to
    });
  }

  const order = [...byId.keys()].sort((a, b) => {
    const ea = byId.get(a);
    const eb = byId.get(b);
    return (
      ea.priorityNumber - eb.priorityNumber ||
      ea.currentPostings - eb.currentPostings ||
      a - b
    );
  });

  return { byId, order };
}

function cloneSupervisorModel(model) {
  const byId = new Map();
  for (const [id, entry] of model.byId) {
    byId.set(id, {
      ...entry,
      usedInRun: 0,
      schoolHistory: new Set(entry.schoolHistory),
      visitUnit: new Map(),
    });
  }
  return { byId, order: [...model.order] };
}

function remainingCapacity(entry) {
  return Math.max(0, entry.totalCapacity - entry.usedInRun);
}

function repeatCost(entry, unit) {
  let cost = 0;
  for (const schoolId of unit.schools) {
    if (entry.schoolHistory.has(schoolId)) cost++;
  }
  return cost;
}

// ============================================================================
// PHASE 4 - PRIORITY TIERS
// ============================================================================

/**
 * Group supervisors by distinct priority_number, ascending (1 = most senior).
 * When priority is disabled, callers use a single synthetic tier so the
 * downstream allocation core never needs an `if (priorityEnabled)` branch.
 */
function buildPriorityTiers(supervisorModel, priorityEnabled) {
  if (!priorityEnabled) {
    const supervisorIds = [...supervisorModel.byId.keys()].sort((a, b) => a - b);
    const totalCapacity = supervisorIds.reduce(
      (sum, id) => sum + supervisorModel.byId.get(id).totalCapacity,
      0
    );
    const currentLoad = supervisorIds.reduce(
      (sum, id) => sum + supervisorModel.byId.get(id).currentPostings,
      0
    );
    return [
      {
        priority_number: null,
        supervisorIds,
        supervisorCount: supervisorIds.length,
        totalCapacity,
        currentLoad,
        remainingCapacity: totalCapacity,
      },
    ];
  }

  const byRank = new Map();
  for (const id of supervisorModel.order) {
    const entry = supervisorModel.byId.get(id);
    const rank = entry.priorityNumber;
    if (!byRank.has(rank)) {
      byRank.set(rank, {
        priority_number: rank,
        supervisorIds: [],
        supervisorCount: 0,
        totalCapacity: 0,
        currentLoad: 0,
        remainingCapacity: 0,
      });
    }
    const tier = byRank.get(rank);
    tier.supervisorIds.push(id);
    tier.supervisorCount++;
    tier.totalCapacity += entry.totalCapacity;
    tier.currentLoad += entry.currentPostings;
    tier.remainingCapacity += entry.totalCapacity;
  }

  return [...byRank.values()].sort((a, b) => a.priority_number - b.priority_number);
}

function cloneTiers(tiers) {
  return tiers.map((t) => ({ ...t, supervisorIds: [...t.supervisorIds] }));
}

// ============================================================================
// PHASE 5 - GEOGRAPHICAL ALLOCATION CORE (units -> tiers -> supervisors)
// ============================================================================

/**
 * How many supervisor seats a unit's demand genuinely requires, based on the
 * real distribution of supervisor capacity - not a population-wide average that
 * conflates total demand with total supervisor count.
 */
function medianSupervisorCapacity(supervisorModel) {
  const capacities = [...supervisorModel.byId.values()].map((e) => e.totalCapacity).filter((c) => c > 0);
  return Math.max(1, median(capacities));
}

/**
 * Assign whole demand units to priority tiers and then to individual supervisors
 * within each tier, honouring capacity as a single global ledger across every
 * visit. Returns unit ownership plus any units that fit nowhere at all.
 *
 * `orderedUnits` must already reflect the chosen strategy's primary ordering;
 * this function stabilizes it further with a hard-to-fit-first secondary sort.
 */
function solveGeographicalAllocation(orderedUnits, tiers, supervisorModel, options = {}) {
  const { priorityEnabled = false, shuffledRank = new Map() } = options;
  const rankOf = (id) => shuffledRank.get(id) ?? id;
  const medianCap = medianSupervisorCapacity(supervisorModel);

  // Step 1: how many DISTINCT supervisors this unit's demand genuinely needs,
  // from the real capacity distribution - a headcount estimate used only for
  // hard-to-fit ranking and multi-supervisor cohesion decisions. Capacity
  // itself is always tracked in actual slot/posting units (unit.demand), never
  // in this headcount, to avoid conflating "how many people" with "how much
  // capacity".
  for (const unit of orderedUnits) {
    unit.seatsNeeded = Math.max(1, Math.ceil(unit.demand / medianCap));
  }

  // Step 2: hard-to-fit-first stabilization - does this tier have enough raw
  // capacity (in postings) to even conceivably absorb this unit's demand.
  for (const unit of orderedUnits) {
    unit.constrainedness = tiers.filter((t) => t.totalCapacity >= unit.demand).length || 1;
  }
  const stableUnits = [...orderedUnits].sort((a, b) => {
    if (a.constrainedness !== b.constrainedness) return a.constrainedness - b.constrainedness;
    return 0; // preserve the strategy's own relative order otherwise (stable sort)
  });

  // Step 3: tier assignment - most senior tier with room, by natural
  // difficulty-descending order (already the incoming sort for most strategies;
  // for stability we re-sort by difficulty within equal constrainedness groups)
  const byDifficultyDesc = [...stableUnits].sort(
    (a, b) => b.difficulty - a.difficulty || a.key.localeCompare(b.key)
  );

  // Step 3: tier assignment. A unit can be SPLIT across tiers when its demand
  // exceeds what its natural (proportional-share) tier has room for - the
  // natural tier takes as much as it can first, and only the genuine leftover
  // spills to a neighbouring tier (more-senior tiers tried before junior
  // ones, via spilloverSearchOrder), so a small senior tier never loses an
  // entire hard unit to a junior tier just because the unit didn't fit whole
  // (spec §9 Case 3: the senior tier should be saturated with what it CAN
  // take, not skipped).
  const unitOwners = new Map(); // `${key}-${visit}` -> [{tierIndex, amount}]
  const unitByKey = new Map(byDifficultyDesc.map((u) => [`${u.key}-${u.visit_number}`, u]));
  const unplacedUnits = [];

  // Proportional-share threshold walk: each tier is offered a share of the
  // difficulty-sorted unit list proportional to its share of total capacity,
  // measured in real demand units (not raw unit count or distance-weight) -
  // this is what stops a senior tier with technically-spare capacity from
  // absorbing a second/third unit purely because it still has room, at the
  // expense of junior tiers getting nothing (spec §8's explicit example).
  const totalCapacityAll = tiers.reduce((sum, t) => sum + t.totalCapacity, 0);
  const totalDemandAll = byDifficultyDesc.reduce((sum, u) => sum + u.demand, 0);
  let cumulative = 0;
  const thresholds = tiers.map((t) => {
    cumulative += totalCapacityAll > 0 ? (t.totalCapacity / totalCapacityAll) * totalDemandAll : 0;
    return cumulative;
  });
  if (thresholds.length > 0) thresholds[thresholds.length - 1] = totalDemandAll;

  let tierPointer = 0;
  let running = 0;
  for (const unit of byDifficultyDesc) {
    // Advance at most one tier per unit, so a single oversized unit can't skip
    // an entire tier's window.
    if (tierPointer < tiers.length - 1 && running >= thresholds[tierPointer]) tierPointer++;
    running += unit.demand;

    const key = `${unit.key}-${unit.visit_number}`;
    let remaining = unit.demand;
    const owners = [];
    const tryOrder = [tierPointer, ...spilloverSearchOrder(tierPointer, tiers.length)];
    for (const idx of tryOrder) {
      if (remaining <= 0) break;
      const cap = tiers[idx].remainingCapacity;
      if (cap <= 0) continue;
      const grant = Math.min(remaining, cap);
      owners.push({ tierIndex: idx, amount: grant });
      tiers[idx].remainingCapacity -= grant;
      remaining -= grant;
    }

    if (owners.length > 0) unitOwners.set(key, owners);
    if (remaining > 0) unplacedUnits.push({ ...unit, remainingDemand: remaining, _partial: owners.length > 0 });
  }

  // Step 4: supervisor seating - for each unit, each tier that owns a portion
  // of it fills that portion from that tier's own supervisors only.
  const seatPlan = new Map(); // `${key}-${visit}` -> [{supervisorId, seats}]
  const partiallySeated = [];

  for (let tierIndex = 0; tierIndex < tiers.length; tierIndex++) {
    const tier = tiers[tierIndex];
    const pool = tier.supervisorIds.filter((id) => remainingCapacity(supervisorModel.byId.get(id)) > 0);

    const ownedHere = [];
    for (const [key, owners] of unitOwners) {
      const match = owners.find((o) => o.tierIndex === tierIndex);
      if (match) ownedHere.push({ key, unit: unitByKey.get(key), amount: match.amount });
    }
    ownedHere.sort((a, b) => b.unit.difficulty - a.unit.difficulty || a.key.localeCompare(b.key));

    // Fair-share cap: a unit's demand must rotate across this tier's own
    // members instead of one supervisor absorbing a whole unit just because
    // their remaining capacity happens to cover it. Without this, a tier with
    // many members but generous per-supervisor capacity leaves most of its
    // members untouched even though the tier's total owned demand could
    // easily be spread across all of them - the dominant cause of eligible
    // supervisors ending up with zero postings. Capping to a tier-wide target
    // (not a per-unit one) is what actually spreads load across the whole
    // tier, since a single small unit alone can't force rotation on its own.
    const tierOwnedDemand = ownedHere.reduce((sum, o) => sum + o.amount, 0);
    const targetPerSupervisor = Math.max(1, Math.ceil(tierOwnedDemand / Math.max(1, tier.supervisorIds.length)));

    for (const { key, unit, amount } of ownedHere) {
      const seats = seatPlan.get(key) || [];
      let seatsToFill = amount;

      while (seatsToFill > 0 && pool.length > 0) {
        let bestIdx = -1;
        let bestKey = null;
        for (let i = 0; i < pool.length; i++) {
          const entry = supervisorModel.byId.get(pool[i]);
          if (remainingCapacity(entry) <= 0) continue;
          const cmpKey = [repeatCost(entry, unit), entry.usedInRun, rankOf(pool[i])];
          if (bestKey === null || compareArrays(cmpKey, bestKey) < 0) {
            bestKey = cmpKey;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) break; // pool exhausted

        const supervisorId = pool[bestIdx];
        const entry = supervisorModel.byId.get(supervisorId);
        const grant = Math.min(seatsToFill, remainingCapacity(entry), targetPerSupervisor);
        entry.usedInRun += grant;
        entry.visitUnit.set(unit.visit_number, unit.key);
        seats.push({ supervisorId, seats: grant });
        seatsToFill -= grant;

        if (remainingCapacity(entry) <= 0) pool.splice(bestIdx, 1);
      }

      seatPlan.set(key, seats);
      if (seatsToFill > 0) partiallySeated.push({ unit, key, shortfall: seatsToFill, tierIndex });
    }
  }

  // Step 3b/4b: units unplaced entirely, or partially seated because their own
  // tier ran out mid-way, borrow from the next most-senior tier with room
  // before ever falling to a junior tier (never the reverse).
  for (const { unit, shortfall, tierIndex } of partiallySeated) {
    let need = shortfall;
    const searchOrder = spilloverSearchOrder(tierIndex, tiers.length);
    for (const idx of searchOrder) {
      if (need <= 0) break;
      const donorPool = tiers[idx].supervisorIds.filter(
        (id) => remainingCapacity(supervisorModel.byId.get(id)) > 0
      );
      for (const supervisorId of donorPool) {
        if (need <= 0) break;
        const entry = supervisorModel.byId.get(supervisorId);
        const grant = Math.min(need, remainingCapacity(entry));
        if (grant <= 0) continue;
        entry.usedInRun += grant;
        entry.visitUnit.set(unit.visit_number, unit.key);
        const key = `${unit.key}-${unit.visit_number}`;
        seatPlan.get(key).push({ supervisorId, seats: grant });
        need -= grant;
      }
    }
    if (need > 0) {
      unplacedUnits.push({ ...unit, remainingDemand: need, _partial: true });
    }
  }

  for (const unit of unplacedUnits) {
    let need = unit.remainingDemand ?? unit.demand;
    for (const entry of supervisorModel.byId.values()) {
      if (need <= 0) break;
      const cap = remainingCapacity(entry);
      if (cap <= 0) continue;
      const grant = Math.min(need, cap);
      entry.usedInRun += grant;
      entry.visitUnit.set(unit.visit_number, unit.key);
      const key = `${unit.key}-${unit.visit_number}`;
      if (!seatPlan.has(key)) seatPlan.set(key, []);
      seatPlan.get(key).push({ supervisorId: entry.supervisor.id, seats: grant, fallback: true });
      need -= grant;
    }
    unit._finalUnfilled = need;
  }

  return { seatPlan, unplacedUnits: unplacedUnits.filter((u) => (u._finalUnfilled ?? u.remainingDemand ?? u.demand) > 0) };
}

function compareArrays(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Most-senior-with-room first, then next-senior, ..., only touching junior tiers last. */
function spilloverSearchOrder(homeTierIndex, tierCount) {
  const order = [];
  for (let i = homeTierIndex - 1; i >= 0; i--) order.push(i);
  for (let i = homeTierIndex + 1; i < tierCount; i++) order.push(i);
  return order;
}

// solveLgaAllocation / solveRouteAllocation / solveRandomAllocation are the same
// core parameterized only by which model built the units - kept as distinct
// exported names because the spec calls for named per-posting-type entry points,
// and it documents at the call site which posting type is active.
function solveLgaAllocation(orderedUnits, tiers, supervisorModel, options) {
  return solveGeographicalAllocation(orderedUnits, tiers, supervisorModel, options);
}
function solveRouteAllocation(orderedUnits, tiers, supervisorModel, options) {
  return solveGeographicalAllocation(orderedUnits, tiers, supervisorModel, options);
}
function solveRandomAllocation(orderedUnits, tiers, supervisorModel, options) {
  return solveGeographicalAllocation(orderedUnits, tiers, supervisorModel, options);
}

// ============================================================================
// PHASE 6 - ASSIGN ACTUAL SLOTS WITHIN THE PLANNED STRUCTURE
// ============================================================================

/**
 * Once unit ownership/seating is decided, hand out the real school/group/visit
 * slots. Within a unit, supervisors with more seats get first pick of
 * non-repeat schools; ties broken deterministically by school_id/group_number.
 */
function assignSlotsWithinClusters(demandModel, seatPlan, supervisorModel, postingType, avoidRepeatSchools, shuffledRank = new Map()) {
  const rankOf = (id) => shuffledRank.get(id) ?? id;
  const assignments = [];
  let unassignedCount = 0;

  for (const visit of demandModel.visits) {
    const units = demandModel.byVisit.get(visit) || [];
    for (const unit of units) {
      const key = `${unit.key}-${visit}`;
      const seats = seatPlan.get(key) || [];

      // Expand seats into a flat, deterministic supervisor queue (more seats = appears more)
      const queue = [];
      for (const seat of seats) {
        for (let i = 0; i < seat.seats; i++) queue.push(seat.supervisorId);
      }

      // Order this unit's slots: non-repeat-for-someone-in-queue first is handled
      // per-slot below; slots themselves ordered by school/group for determinism.
      const orderedSlots = [...unit.slots].sort(
        (a, b) => a.school_id - b.school_id || a.group_number - b.group_number
      );

      if (queue.length === 0) {
        unassignedCount += orderedSlots.length;
        continue;
      }

      // Round-robin the queue across the unit's slots, but at each step prefer
      // whichever queued supervisor has the lowest repeat cost for that specific
      // slot's school - deterministic, and keeps repeat avoidance working even
      // when a unit has more than one seated supervisor.
      const counts = new Map();
      for (const id of queue) counts.set(id, (counts.get(id) || 0) + 1);
      const remainingBySupervisor = new Map(counts);

      for (const slot of orderedSlots) {
        let bestId = null;
        let bestKeyArr = null;
        for (const [supervisorId, remaining] of remainingBySupervisor) {
          if (remaining <= 0) continue;
          const entry = supervisorModel.byId.get(supervisorId);
          const isRepeat = avoidRepeatSchools && entry.schoolHistory.has(slot.school_id) ? 1 : 0;
          const keyArr = [isRepeat, -remaining, rankOf(supervisorId)];
          if (bestKeyArr === null || compareArrays(keyArr, bestKeyArr) < 0) {
            bestKeyArr = keyArr;
            bestId = supervisorId;
          }
        }

        if (bestId === null) {
          unassignedCount++;
          continue;
        }

        const entry = supervisorModel.byId.get(bestId);
        const wasRepeat = avoidRepeatSchools && entry.schoolHistory.has(slot.school_id);

        assignments.push({
          supervisor_id: entry.supervisor.id,
          supervisor_name: entry.supervisor.name,
          rank_code: entry.supervisor.rank_code,
          priority_number: entry.supervisor.priority_number,
          school_id: slot.school_id,
          school_name: slot.school_name,
          group_number: slot.group_number,
          visit_number: slot.visit_number,
          distance_km: slot.distance_km,
          route_id: slot.route_id,
          route_name: slot.route_name,
          lga: slot.lga,
          repeat_school: !!wasRepeat,
          cluster_break: false, // finalized by reflagAssignments
          _unitKey: unit.key,
        });

        entry.schoolHistory.add(slot.school_id);
        remainingBySupervisor.set(bestId, remainingBySupervisor.get(bestId) - 1);
      }
    }
  }

  return { assignments, unassignedCount };
}

/** Authoritative cluster_break: true when an assignment falls outside a
 *  supervisor's dominant unit for that visit. */
function reflagClusterBreaks(assignments, postingType) {
  if (postingType === 'random') {
    for (const a of assignments) a.cluster_break = false;
    return;
  }

  const histogram = new Map(); // `${supervisorId}-${visit}` -> Map(unitKey -> count)
  for (const a of assignments) {
    const cluster = clusterKeyFor(a, postingType);
    const key = `${a.supervisor_id}-${a.visit_number}`;
    if (!histogram.has(key)) histogram.set(key, new Map());
    const m = histogram.get(key);
    m.set(cluster, (m.get(cluster) || 0) + 1);
  }

  const dominant = new Map();
  for (const [key, m] of histogram) {
    let best = null;
    let bestCount = -1;
    for (const [cluster, count] of m) {
      if (count > bestCount) {
        best = cluster;
        bestCount = count;
      }
    }
    dominant.set(key, best);
  }

  for (const a of assignments) {
    const cluster = clusterKeyFor(a, postingType);
    const key = `${a.supervisor_id}-${a.visit_number}`;
    a.cluster_break = dominant.get(key) !== cluster;
  }
}

// ============================================================================
// PHASE 7 - LEXICOGRAPHIC OBJECTIVE
// ============================================================================

const OBJECTIVE_FIELDS = [
  'unassignedCount',
  'hardViolationCount',
  'priorityInversionCount',
  'priorityInversionSeverity',
  'crossLgaAssignmentCount',
  'lgaFragmentation',
  'repeatCount',
  'workloadImbalance',
  'travelImbalance',
];

/** Tier-pair priority-inversion detection, based on realized mean distance per tier. */
function computePriorityInversions(assignments, tiers) {
  const byTier = new Map();
  for (const a of assignments) {
    const key = a.priority_number;
    if (!byTier.has(key)) byTier.set(key, []);
    byTier.get(key).push(a.distance_km || 0);
  }

  const tierStats = tiers
    .filter((t) => t.priority_number != null)
    .map((t) => {
      const distances = byTier.get(t.priority_number) || [];
      return {
        priority_number: t.priority_number,
        postings: distances.length,
        mean_km: distances.length ? average(distances) : 0,
        min_km: distances.length ? Math.min(...distances) : 0,
        max_km: distances.length ? Math.max(...distances) : 0,
        p25_km: distances.length ? percentile([...distances].sort((a, b) => a - b), 0.25) : 0,
        median_km: distances.length ? median(distances) : 0,
        p75_km: distances.length ? percentile([...distances].sort((a, b) => a - b), 0.75) : 0,
      };
    })
    .sort((a, b) => a.priority_number - b.priority_number);

  let inversionCount = 0;
  let inversionSeverity = 0;
  const tierOverlap = [];

  for (let i = 0; i < tierStats.length; i++) {
    for (let j = i + 1; j < tierStats.length; j++) {
      const senior = tierStats[i];
      const junior = tierStats[j];
      if (senior.postings === 0 || junior.postings === 0) continue;
      if (senior.mean_km < junior.mean_km) {
        inversionCount++;
        inversionSeverity += Math.max(0, junior.mean_km - senior.mean_km);
      }
      const overlap = Math.max(0, Math.min(senior.max_km, junior.max_km) - Math.max(senior.min_km, junior.min_km));
      tierOverlap.push({ tier_a: senior.priority_number, tier_b: junior.priority_number, overlap_km: Number(overlap.toFixed(1)) });
    }
  }

  const totalPairs = (tierStats.length * (tierStats.length - 1)) / 2;
  const monotonicityScore = totalPairs > 0 ? 1 - inversionCount / totalPairs : 1;

  return { tierStats, inversionCount, inversionSeverity, tierOverlap, monotonicityScore, totalPairs };
}

function scoreCandidate(assignments, ctx) {
  const { tiers, eligibleSlotCount, supervisors, maxDistanceNorm } = ctx;

  const violations = validateSolution(
    assignments,
    supervisors,
    ctx.slots,
    ctx.visitFilter,
    ctx.maxAssignments
  ).violations;

  const { inversionCount, inversionSeverity } = computePriorityInversions(assignments, tiers);

  let crossLgaAssignmentCount = 0;
  let lgaFragmentation = 0;
  if (ctx.postingType !== 'random') {
    const byPair = new Map();
    for (const a of assignments) {
      const key = `${a.supervisor_id}-${a.visit_number}`;
      if (!byPair.has(key)) byPair.set(key, new Set());
      byPair.get(key).add(clusterKeyFor(a, ctx.postingType));
    }
    for (const clusters of byPair.values()) {
      if (clusters.size > 1) lgaFragmentation++;
    }
    crossLgaAssignmentCount = assignments.filter((a) => a.cluster_break).length;
  }

  const repeatCountVal = assignments.filter((a) => a.repeat_school).length;

  const totalsBySupervisor = new Map();
  const distanceBySupervisor = new Map();
  for (const a of assignments) {
    totalsBySupervisor.set(a.supervisor_id, (totalsBySupervisor.get(a.supervisor_id) || 0) + 1);
    distanceBySupervisor.set(
      a.supervisor_id,
      (distanceBySupervisor.get(a.supervisor_id) || 0) + (a.distance_km || 0)
    );
  }
  const finalTotals = [...supervisors.values()].map(
    (s) => s.currentPostings + (totalsBySupervisor.get(s.supervisor.id) || 0)
  );
  const workloadImbalance = standardDeviation(finalTotals);
  const travelValues = [...distanceBySupervisor.values()];
  const travelImbalance = maxDistanceNorm > 0 ? standardDeviation(travelValues) / maxDistanceNorm : 0;

  return {
    unassignedCount: Math.max(0, eligibleSlotCount - assignments.length),
    hardViolationCount: violations.length,
    priorityInversionCount: inversionCount,
    priorityInversionSeverity: Number(inversionSeverity.toFixed(2)),
    crossLgaAssignmentCount,
    lgaFragmentation,
    repeatCount: repeatCountVal,
    workloadImbalance: Number(workloadImbalance.toFixed(3)),
    travelImbalance: Number(travelImbalance.toFixed(3)),
  };
}

function compareObjectives(a, b) {
  for (const field of OBJECTIVE_FIELDS) {
    const diff = a[field] - b[field];
    if (Math.abs(diff) > 1e-9) return diff;
  }
  return 0;
}

// ============================================================================
// PHASE 8 - MULTIPLE DETERMINISTIC INITIAL SOLUTIONS
// ============================================================================

const STRATEGIES = [
  'A-hardest-difficulty-first',
  'B-largest-demand-first',
  'C-hardest-to-fit-first',
  'D-highest-priority-tier-first',
  'E-visit-balanced',
];

function orderUnitsForStrategy(strategyName, demandModel, tiers, supervisorModel) {
  const allUnits = [];
  for (const visit of demandModel.visits) {
    for (const unit of demandModel.byVisit.get(visit)) allUnits.push(unit);
  }

  const byKey = (a, b) => a.key.localeCompare(b.key) || a.visit_number - b.visit_number;

  switch (strategyName) {
    case 'A-hardest-difficulty-first':
      return [...allUnits].sort((a, b) => b.difficulty - a.difficulty || byKey(a, b));

    case 'B-largest-demand-first':
      return [...allUnits].sort((a, b) => b.demand - a.demand || byKey(a, b));

    case 'C-hardest-to-fit-first': {
      return [...allUnits].sort((a, b) => {
        const feasA = tiers.filter((t) => t.totalCapacity >= a.demand).length || 1;
        const feasB = tiers.filter((t) => t.totalCapacity >= b.demand).length || 1;
        return feasA - feasB || b.difficulty - a.difficulty || byKey(a, b);
      });
    }

    case 'D-highest-priority-tier-first': {
      // Process the whole difficulty-sorted list once - it already places the
      // hardest work first, which is what a senior-tier-first pass wants to see
      // first anyway (senior tiers are seeded from the hardest units).
      return [...allUnits].sort((a, b) => b.difficulty - a.difficulty || byKey(a, b));
    }

    case 'E-visit-balanced': {
      // Round-robin across visits so no single visit's demand can monopolize
      // capacity purely because it was processed first.
      const byVisit = new Map();
      for (const unit of allUnits) {
        if (!byVisit.has(unit.visit_number)) byVisit.set(unit.visit_number, []);
        byVisit.get(unit.visit_number).push(unit);
      }
      for (const list of byVisit.values()) {
        list.sort((a, b) => b.difficulty - a.difficulty || byKey(a, b));
      }
      const visitKeys = [...byVisit.keys()].sort((a, b) => a - b);
      const result = [];
      let more = true;
      let idx = 0;
      while (more) {
        more = false;
        for (const v of visitKeys) {
          const list = byVisit.get(v);
          if (idx < list.length) {
            result.push(list[idx]);
            more = true;
          }
        }
        idx++;
      }
      return result;
    }

    default:
      return [...allUnits].sort((a, b) => b.difficulty - a.difficulty || byKey(a, b));
  }
}

function buildCandidate(strategyName, demandModel, baseSupervisorModel, baseTiers, postingType, priorityEnabled, avoidRepeatSchools, ctx) {
  const supervisorModel = cloneSupervisorModel(baseSupervisorModel);
  const tiers = cloneTiers(baseTiers);

  const orderedUnits = orderUnitsForStrategy(strategyName, demandModel, tiers, supervisorModel);

  const { seatPlan, unplacedUnits } = solveGeographicalAllocation(orderedUnits, tiers, supervisorModel, {
    priorityEnabled,
    shuffledRank: ctx.shuffledRank,
  });

  const { assignments, unassignedCount } = assignSlotsWithinClusters(
    demandModel,
    seatPlan,
    supervisorModel,
    postingType,
    avoidRepeatSchools,
    ctx.shuffledRank
  );

  reflagClusterBreaks(assignments, postingType);

  const objective = scoreCandidate(assignments, { ...ctx, tiers });

  return {
    strategyName,
    assignments,
    supervisorModel,
    tiers,
    unplacedUnits,
    unassignedFromAllocation: unassignedCount,
    objective,
  };
}

function generateInitialSolutions(demandModel, supervisorModel, tiers, postingType, priorityEnabled, avoidRepeatSchools, ctx) {
  return STRATEGIES.map((name) =>
    buildCandidate(name, demandModel, supervisorModel, tiers, postingType, priorityEnabled, avoidRepeatSchools, ctx)
  );
}

function selectBestCandidate(candidates) {
  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (compareObjectives(candidates[i].objective, best.objective) < 0) {
      best = candidates[i];
    }
  }
  return best;
}

// ============================================================================
// PHASE 9 - CONSTRAINED LOCAL IMPROVEMENT (Moves A-D)
// ============================================================================

function assignmentSlotKey(a) {
  return `${a.school_id}-${a.group_number}-${a.visit_number}`;
}

function checkHardConstraints(assignments, supervisors, maxAssignments) {
  const seen = new Set();
  const perSupervisor = new Map();
  for (const a of assignments) {
    const key = assignmentSlotKey(a);
    if (seen.has(key)) return false;
    seen.add(key);
    perSupervisor.set(a.supervisor_id, (perSupervisor.get(a.supervisor_id) || 0) + 1);
  }
  for (const [id, count] of perSupervisor) {
    const sup = supervisors.get(id);
    if (!sup || count > sup.totalCapacity) return false;
  }
  if (assignments.length > maxAssignments) return false;
  return true;
}

/**
 * Try Moves A/B/C/D on the winning candidate. Every move is validated by
 * re-scoring the FULL objective vector before/after and only applied when the
 * result is not lexicographically worse (and, for A-C, never crosses a tier
 * boundary; only D may do that, and only to shrink an existing inversion).
 */
function improveSolution(candidate, demandModel, supervisorModel, tiers, postingType, priorityEnabled, avoidRepeatSchools, ctx, limits = {}) {
  const maxPasses = limits.maxPasses ?? LOCAL_SEARCH_MAX_PASSES;
  const maxComparisons = limits.maxComparisons ?? LOCAL_SEARCH_MAX_COMPARISONS;
  const maxMoveD = limits.maxMoveDCount ?? Math.max(3, tiers.length * 3);

  let assignments = candidate.assignments.map((a) => ({ ...a }));
  let objectiveBefore = scoreCandidate(assignments, { ...ctx, tiers });
  let objective = objectiveBefore;

  const moves = { A: 0, B: 0, C: 0, D: 0 };
  let comparisons = 0;
  let pass = 0;
  let budgetExhausted = false;

  for (; pass < maxPasses; pass++) {
    let improvedThisPass = false;

    // ---- Move A: reassign one slot within the same unit to a different
    // already-seated supervisor, when it reduces repeat/workload/travel.
    const unitOf = (a) => (postingType === 'random' ? null : clusterKeyFor(a, postingType));
    const candidatesForA = assignments.filter((a) => a.repeat_school || a.cluster_break);

    for (const a of candidatesForA) {
      if (comparisons > maxComparisons) {
        budgetExhausted = true;
        break;
      }
      const sameUnitPeers = assignments.filter(
        (b) =>
          b !== a &&
          b.visit_number === a.visit_number &&
          unitOf(b) === unitOf(a) &&
          b.supervisor_id !== a.supervisor_id
      );
      for (const peer of sameUnitPeers) {
        comparisons++;
        const trial = assignments.map((x) => (x === a ? { ...x, supervisor_id: peer.supervisor_id, supervisor_name: peer.supervisor_name, rank_code: peer.rank_code, priority_number: peer.priority_number } : x));
        reflagRepeatFlag(trial, a, peer.supervisor_id, supervisorModel, avoidRepeatSchools);
        if (!checkHardConstraints(trial, supervisorModel.byId, ctx.maxAssignments)) continue;
        if (a.priority_number !== peer.priority_number) continue; // A never crosses tiers
        reflagClusterBreaks(trial, postingType);
        const trialObjective = scoreCandidate(trial, { ...ctx, tiers });
        if (compareObjectives(trialObjective, objective) < 0) {
          assignments = trial;
          objective = trialObjective;
          moves.A++;
          improvedThisPass = true;
          break;
        }
      }
      if (budgetExhausted) break;
    }
    if (budgetExhausted) break;

    // ---- Move B: swap two supervisors' full allocations within the same unit
    const unitGroups = new Map();
    for (const a of assignments) {
      const uk = `${unitOf(a)}-${a.visit_number}`;
      if (!unitGroups.has(uk)) unitGroups.set(uk, new Map());
      const bySup = unitGroups.get(uk);
      if (!bySup.has(a.supervisor_id)) bySup.set(a.supervisor_id, []);
      bySup.get(a.supervisor_id).push(a);
    }
    for (const bySup of unitGroups.values()) {
      const supIds = [...bySup.keys()];
      if (supIds.length < 2) continue;
      for (let i = 0; i < supIds.length && !budgetExhausted; i++) {
        for (let j = i + 1; j < supIds.length; j++) {
          if (comparisons > maxComparisons) {
            budgetExhausted = true;
            break;
          }
          comparisons++;
          const x = supIds[i];
          const y = supIds[j];
          const px = assignments.find((a) => a.supervisor_id === x)?.priority_number;
          const py = assignments.find((a) => a.supervisor_id === y)?.priority_number;
          if (px !== py) continue; // B never crosses tiers

          const trial = swapFullAllocations(assignments, x, y);
          if (!checkHardConstraints(trial, supervisorModel.byId, ctx.maxAssignments)) continue;
          reflagClusterBreaks(trial, postingType);
          const trialObjective = scoreCandidate(trial, { ...ctx, tiers });
          if (compareObjectives(trialObjective, objective) < 0) {
            assignments = trial;
            objective = trialObjective;
            moves.B++;
            improvedThisPass = true;
          }
        }
      }
    }
    if (budgetExhausted) break;

    // ---- Move C: exchange whole unit ownership between two same-tier
    // supervisors when it improves without touching tier membership.
    // (Implemented as: for each pair of units owned respectively by two
    // different same-tier supervisors in the same visit, try swapping which
    // supervisor is associated with which unit's assignments wholesale.)
    const bySupervisorVisitUnit = new Map(); // supervisorId -> visit -> unitKey -> assignments[]
    for (const a of assignments) {
      const uk = unitOf(a);
      if (!bySupervisorVisitUnit.has(a.supervisor_id)) bySupervisorVisitUnit.set(a.supervisor_id, new Map());
      const byVisit = bySupervisorVisitUnit.get(a.supervisor_id);
      if (!byVisit.has(a.visit_number)) byVisit.set(a.visit_number, new Map());
      const byUnit = byVisit.get(a.visit_number);
      if (!byUnit.has(uk)) byUnit.set(uk, []);
      byUnit.get(uk).push(a);
    }
    const soleOwners = []; // {supervisorId, visit, unitKey, priority_number}
    for (const [supervisorId, byVisit] of bySupervisorVisitUnit) {
      for (const [visit, byUnit] of byVisit) {
        if (byUnit.size === 1) {
          const [unitKey] = byUnit.keys();
          const prio = byUnit.get(unitKey)[0].priority_number;
          soleOwners.push({ supervisorId, visit, unitKey, priority_number: prio });
        }
      }
    }
    for (let i = 0; i < soleOwners.length && !budgetExhausted; i++) {
      for (let j = i + 1; j < soleOwners.length; j++) {
        const x = soleOwners[i];
        const y = soleOwners[j];
        if (x.visit !== y.visit || x.priority_number !== y.priority_number) continue;
        if (x.unitKey === y.unitKey) continue;
        if (comparisons > maxComparisons) {
          budgetExhausted = true;
          break;
        }
        comparisons++;
        const trial = swapFullAllocations(assignments, x.supervisorId, y.supervisorId);
        if (!checkHardConstraints(trial, supervisorModel.byId, ctx.maxAssignments)) continue;
        reflagClusterBreaks(trial, postingType);
        const trialObjective = scoreCandidate(trial, { ...ctx, tiers });
        if (compareObjectives(trialObjective, objective) < 0) {
          assignments = trial;
          objective = trialObjective;
          moves.C++;
          improvedThisPass = true;
        }
      }
    }
    if (budgetExhausted) break;

    // ---- Move D: controlled cross-tier move, only to shrink an existing inversion
    if (priorityEnabled && objective.priorityInversionCount > 0 && moves.D < maxMoveD) {
      const { inversionCount: beforeCount, inversionSeverity: beforeSeverity } = computePriorityInversions(
        assignments,
        tiers
      );
      const seniorTiers = [...tiers].filter((t) => t.priority_number != null).sort((a, b) => a.priority_number - b.priority_number);

      outer: for (let si = 0; si < seniorTiers.length; si++) {
        for (let sj = si + 1; sj < seniorTiers.length; sj++) {
          const senior = seniorTiers[si];
          const junior = seniorTiers[sj];
          const seniorAssignments = assignments.filter((a) => a.priority_number === senior.priority_number);
          const juniorAssignments = assignments.filter((a) => a.priority_number === junior.priority_number);
          if (seniorAssignments.length === 0 || juniorAssignments.length === 0) continue;

          // Pick the senior's easiest assignment and the junior's hardest -
          // a bounded single-slot exchange, not a full re-plan.
          const seniorEasiest = [...seniorAssignments].sort((a, b) => a.distance_km - b.distance_km)[0];
          const juniorHardest = [...juniorAssignments].sort((a, b) => b.distance_km - a.distance_km)[0];
          if (!seniorEasiest || !juniorHardest) continue;
          if (seniorEasiest.distance_km >= juniorHardest.distance_km) continue;

          if (comparisons > maxComparisons) {
            budgetExhausted = true;
            break outer;
          }
          comparisons++;

          const trial = assignments.map((a) => {
            if (a === seniorEasiest) {
              return { ...a, supervisor_id: juniorHardest.supervisor_id, supervisor_name: juniorHardest.supervisor_name, rank_code: juniorHardest.rank_code, priority_number: juniorHardest.priority_number };
            }
            if (a === juniorHardest) {
              return { ...a, supervisor_id: seniorEasiest.supervisor_id, supervisor_name: seniorEasiest.supervisor_name, rank_code: seniorEasiest.rank_code, priority_number: seniorEasiest.priority_number };
            }
            return a;
          });

          if (!checkHardConstraints(trial, supervisorModel.byId, ctx.maxAssignments)) continue;
          reflagClusterBreaks(trial, postingType);
          const trialObjective = scoreCandidate(trial, { ...ctx, tiers });
          const { inversionCount: afterCount, inversionSeverity: afterSeverity } = computePriorityInversions(
            trial,
            tiers
          );

          const strictlyBetterInversion =
            afterCount < beforeCount || (afterCount === beforeCount && afterSeverity < beforeSeverity - 1e-9);
          const noRegressionElsewhere =
            trialObjective.unassignedCount === objective.unassignedCount &&
            trialObjective.hardViolationCount === objective.hardViolationCount;

          if (strictlyBetterInversion && noRegressionElsewhere) {
            for (const a of trial) {
              if (a.supervisor_id === seniorEasiest.supervisor_id || a.supervisor_id === juniorHardest.supervisor_id) {
                a.priority_inversion_resolved = true;
              }
            }
            assignments = trial;
            objective = trialObjective;
            moves.D++;
            improvedThisPass = true;
            break outer;
          }
        }
      }
    }

    if (!improvedThisPass) break;
  }

  const objectiveAfter = objective;
  return {
    assignments,
    movesApplied: moves,
    passes: pass + 1,
    objectiveBefore,
    objectiveAfter,
    budgetExhausted,
  };
}

function swapFullAllocations(assignments, supervisorIdX, supervisorIdY) {
  return assignments.map((a) => {
    if (a.supervisor_id === supervisorIdX) {
      const template = assignments.find((b) => b.supervisor_id === supervisorIdY);
      return { ...a, supervisor_id: supervisorIdY, supervisor_name: template.supervisor_name, rank_code: template.rank_code, priority_number: template.priority_number };
    }
    if (a.supervisor_id === supervisorIdY) {
      const template = assignments.find((b) => b.supervisor_id === supervisorIdX);
      return { ...a, supervisor_id: supervisorIdX, supervisor_name: template.supervisor_name, rank_code: template.rank_code, priority_number: template.priority_number };
    }
    return a;
  });
}

function reflagRepeatFlag(trial, originalAssignment, newSupervisorId, supervisorModel, avoidRepeatSchools) {
  if (!avoidRepeatSchools) return;
  const entry = supervisorModel.byId.get(newSupervisorId);
  if (!entry) return;
  for (const a of trial) {
    if (a.school_id === originalAssignment.school_id && a.visit_number === originalAssignment.visit_number && a.supervisor_id === newSupervisorId) {
      a.repeat_school = entry.schoolHistory.has(a.school_id);
    }
  }
}

// ============================================================================
// PHASE 9.4 - TRAVEL DISTANCE EQUALIZATION
//
// equalizeWorkload (below) balances posting COUNT, but count-fairness alone
// does nothing for cumulative DISTANCE: whichever LGA/route unit(s) a
// supervisor ends up owning entirely determines their total travel, and unit
// difficulty varies a lot by design (see calculateGeographyDifficulty), so
// two supervisors can land on the identical posting count with a wildly
// different total distance - one supervisor's owned unit(s) happen to be
// near, another's happen to be far, and nothing rebalanced that.
//
// The core allocator's objective vector does include travelImbalance, but it
// is deliberately the LAST, lowest-priority term (see scoreCandidate) - by
// design, since travel balance is a soft concern below repeat-avoidance and
// workload-count balance. That means Move C in improveSolution, which could
// in principle swap whole-unit ownership for travel reasons, rarely fires
// for that reason alone: any regression in an earlier objective term blocks
// it even when the travel improvement is large.
//
// This pass is a dedicated, un-gated mechanism for exactly that. The first
// design tried was "swap a whole sole-owned unit between two supervisors" -
// but that turned out to be mathematically futile whenever each supervisor's
// total distance IS just that one unit's distance (the common case): trading
// two whole values between exactly two people only relabels who holds which
// value, it can never change the underlying set of distances or narrow the
// population's spread. What actually works is asymmetric: repeatedly find
// the globally busiest eligible supervisor, and peel off their single
// costliest assignment - but ONLY from a visit where they are confined to
// one unit already (never partially strip an already-mixed visit) - and
// hand it to the least-loaded eligible supervisor who can receive it with
// ZERO new fragmentation for THEM (either they have nothing yet for that
// visit, or everything they already hold that visit is the SAME unit). That
// last condition is what guarantees zero new out-of-area trips: both sides
// of every move stay confined to a single area per visit throughout. It
// never crosses a priority tier boundary, matching this engine's own
// documented principle that travel balance only applies "within an
// equivalent priority/area group". equalizeWorkload runs immediately after
// this and has the final word on posting-count fairness, cleaning up any
// small count drift these moves introduce.
// ============================================================================

const EQUALIZE_TRAVEL_MAX_MOVES = 500;
const EQUALIZE_TRAVEL_MAX_COMPARISONS = 200000;

/**
 * Narrow the spread of cumulative distance per supervisor. Each move takes
 * the single costliest assignment from the globally busiest eligible
 * supervisor's own confined area for one visit, and gives it to the
 * least-loaded eligible supervisor who can take it without ever spanning a
 * second area for that visit - so cohesion (and out-of-area trip count) is
 * never affected. Never crosses a priority tier.
 */
function equalizeTravel(assignments, supervisorModel, tiers, postingType, avoidRepeatSchools, priorityEnabled = false, shuffledRank = new Map()) {
  const rankOf = (id) => shuffledRank.get(id) ?? id;
  const unitOf = (a) => (postingType === 'random' ? null : clusterKeyFor(a, postingType));
  const eligible = [...supervisorModel.byId.values()].filter((e) => e.totalCapacity > 0);

  let movesApplied = 0;
  let comparisons = 0;
  let budgetExhausted = false;

  for (let move = 0; move < EQUALIZE_TRAVEL_MAX_MOVES; move++) {
    const distanceBySupervisor = new Map();
    const countBySupervisor = new Map();
    for (const e of eligible) {
      distanceBySupervisor.set(e.supervisor.id, 0);
      countBySupervisor.set(e.supervisor.id, 0);
    }
    for (const a of assignments) {
      distanceBySupervisor.set(a.supervisor_id, (distanceBySupervisor.get(a.supervisor_id) || 0) + (a.distance_km || 0));
      countBySupervisor.set(a.supervisor_id, (countBySupervisor.get(a.supervisor_id) || 0) + 1);
    }

    // Per (supervisor, visit): every assignment they hold there, grouped by
    // unit - used to tell whether a supervisor is confined to a single area
    // that visit (safe to peel from/give to) or already spans more than one
    // (leave alone - already fragmented, don't compound it).
    const bySupervisorVisit = new Map();
    for (const a of assignments) {
      const uk = unitOf(a);
      if (!bySupervisorVisit.has(a.supervisor_id)) bySupervisorVisit.set(a.supervisor_id, new Map());
      const byVisit = bySupervisorVisit.get(a.supervisor_id);
      if (!byVisit.has(a.visit_number)) byVisit.set(a.visit_number, new Map());
      const byUnit = byVisit.get(a.visit_number);
      if (!byUnit.has(uk)) byUnit.set(uk, []);
      byUnit.get(uk).push(a);
    }
    const soleUnitFor = (supervisorId, visit) => {
      const byUnit = bySupervisorVisit.get(supervisorId)?.get(visit);
      if (!byUnit || byUnit.size !== 1) return null;
      return [...byUnit.keys()][0];
    };

    // Peer groups a swap can happen within: one group per priority tier when
    // priority is enabled (a swap must never cross tiers), or a single group
    // covering everyone when it's disabled. The spread that matters for
    // deciding whether a move genuinely helps is the spread WITHIN a group,
    // never the cross-tier population spread - cross-tier distance
    // differences are intentional when priority is on and no same-tier swap
    // could ever touch them, so comparing against the whole population would
    // make every candidate look like a non-improvement.
    const groups = (priorityEnabled
      ? [...new Set(eligible.map((e) => e.priorityNumber))].map((pn) => eligible.filter((e) => e.priorityNumber === pn))
      : [eligible]
    )
      .filter((g) => g.length >= 2) // nobody to trade with in a group of 1
      .map((g) => {
        const vals = g.map((e) => distanceBySupervisor.get(e.supervisor.id) || 0);
        return { members: g, spread: Math.max(...vals) - Math.min(...vals) };
      })
      .sort((a, b) => b.spread - a.spread); // try the neediest group first

    // Try each group's busiest member as donor, in spread-descending order,
    // until one produces a genuine improvement - a smaller tier may still
    // have room to improve even once the largest one is already optimal.
    let applied = false;
    for (const { members: group, spread: currentSpread } of groups) {
      if (budgetExhausted) break;

      let donor = null;
      for (const e of group) {
        const d = distanceBySupervisor.get(e.supervisor.id) || 0;
        if (
          donor === null ||
          d > distanceBySupervisor.get(donor.supervisor.id) ||
          (d === distanceBySupervisor.get(donor.supervisor.id) && rankOf(e.supervisor.id) > rankOf(donor.supervisor.id))
        ) {
          donor = e;
        }
      }
      if (!donor) continue;

      const groupValues = group.map((e) => distanceBySupervisor.get(e.supervisor.id) || 0);

      // Candidates to peel off: donor's own assignments, but ONLY from a
      // visit where the donor is confined to a single unit (never partially
      // strip an already-mixed visit), costliest first - this is what
      // genuinely lowers the donor's total instead of just relabelling who
      // holds a whole unit.
      const donorCandidates = assignments
        .filter((a) => a.supervisor_id === donor.supervisor.id && soleUnitFor(a.supervisor_id, a.visit_number) === unitOf(a))
        .sort((a, b) => b.distance_km - a.distance_km || a.school_id - b.school_id);

      for (const candidate of donorCandidates) {
        if (comparisons++ > EQUALIZE_TRAVEL_MAX_COMPARISONS) {
          budgetExhausted = true;
          break;
        }

        const uk = unitOf(candidate);
        const visit = candidate.visit_number;
        const donorDistance = distanceBySupervisor.get(donor.supervisor.id) || 0;

        // Receiver: least-loaded compatible supervisor within the SAME
        // group (never crosses a tier) - compatible means giving them this
        // one slot creates ZERO new fragmentation for them: either they
        // have nothing yet for this visit, or everything they already have
        // this visit is the SAME unit as the candidate. Among compatible
        // candidates, one who would NOT repeat this school is always
        // preferred over one who would - repeat avoidance is a real
        // constraint this pass must respect too, not just cohesion.
        let receiver = null;
        let receiverKey = null;
        for (const e of group) {
          if (e.supervisor.id === donor.supervisor.id) continue;
          const count = countBySupervisor.get(e.supervisor.id) || 0;
          if (count >= e.totalCapacity) continue;

          const byUnitThisVisit = bySupervisorVisit.get(e.supervisor.id)?.get(visit);
          const compatible = !byUnitThisVisit || byUnitThisVisit.size === 0 || (byUnitThisVisit.size === 1 && byUnitThisVisit.has(uk));
          if (!compatible) continue;

          const d = distanceBySupervisor.get(e.supervisor.id) || 0;
          if (d >= donorDistance) continue; // wouldn't move either total toward the other

          const wouldRepeat = avoidRepeatSchools && e.schoolHistory.has(candidate.school_id) ? 1 : 0;
          const key = [wouldRepeat, d, rankOf(e.supervisor.id)];
          if (receiver === null || compareArrays(key, receiverKey) < 0) {
            receiver = e;
            receiverKey = key;
          }
        }

        if (receiver) {
          // Confirm this specific move genuinely narrows the group's
          // spread, not just the donor/receiver pairwise gap - otherwise
          // skip it and try the donor's next costliest candidate. Without
          // this gate, once a group is already as tight as an integer split
          // of unit sizes allows, the loop would keep "trading" the same
          // leftover slot back and forth forever (each trade looks locally
          // sensible - receiver was below donor - while never actually
          // reducing the true spread), burning the whole move budget on a
          // no-op oscillation instead of stopping.
          const donorNew = donorDistance - (candidate.distance_km || 0);
          const receiverOld = distanceBySupervisor.get(receiver.supervisor.id) || 0;
          const receiverNew = receiverOld + (candidate.distance_km || 0);
          const simulated = groupValues.map((v, idx) => {
            const id = group[idx].supervisor.id;
            if (id === donor.supervisor.id) return donorNew;
            if (id === receiver.supervisor.id) return receiverNew;
            return v;
          });
          const newSpread = Math.max(...simulated) - Math.min(...simulated);
          if (newSpread >= currentSpread - 1e-9) continue; // no genuine improvement - try a smaller candidate

          candidate.supervisor_id = receiver.supervisor.id;
          candidate.supervisor_name = receiver.supervisor.name;
          candidate.rank_code = receiver.supervisor.rank_code;
          candidate.priority_number = receiver.supervisor.priority_number;
          candidate.repeat_school = avoidRepeatSchools ? receiver.schoolHistory.has(candidate.school_id) : false;
          receiver.schoolHistory.add(candidate.school_id);
          movesApplied++;
          applied = true;
          break;
        }
      }

      if (applied) break;
    }

    if (!applied) break; // no group has a cohesion-safe move left that narrows its spread
  }

  if (movesApplied > 0) reflagClusterBreaks(assignments, postingType);

  return { movesApplied, budgetExhausted };
}

// ============================================================================
// PHASE 9.5 - WORKLOAD FAIRNESS EQUALIZATION
//
// Even with the fair-share grant cap in solveGeographicalAllocation, the gap
// between the busiest and least-busy eligible supervisor can still be wide -
// a small senior tier legitimately owns less geography than a large junior
// one, so "nobody is idle" alone doesn't mean the spread is fair. This final
// deterministic pass narrows every eligible supervisor's posting count to
// within MAX_LOAD_GAP of each other wherever their own capacity allows,
// pulling from whichever supervisor is busiest regardless of tier (so a
// tier that has used up its own geography/capacity naturally stops donating,
// and a tier with slack naturally starts receiving - the same loop handles
// overflow in both directions without special-casing "which tier is
// exhausted"). When a cross-tier move is unavoidable, the donor's SHORTEST
// distance posting is the one reassigned - a receiver that outranks the
// donor gets a small, short-distance top-up rather than a large one, which
// is exactly the bounded "small share of shorter distance if necessary"
// flexibility this pass is allowed and the core allocator (objective vector,
// Move A-D) is not.
// ============================================================================

const MAX_LOAD_GAP = 3; // "fair share" ceiling on max-min postings per eligible supervisor
const EQUALIZE_MAX_MOVES = 5000; // defensive bound - never hang, matches LOCAL_SEARCH's own guard style

/**
 * Narrow the spread of postings-per-supervisor across every eligible
 * supervisor (capacity > 0) to at most MAX_LOAD_GAP, by repeatedly moving one
 * assignment from the busiest supervisor to the least-busy one who still has
 * room. Pure reassignment - `assignments.length` never changes, so this can
 * never interact with the dean `maxAssignments` ceiling.
 */
function equalizeWorkload(assignments, supervisorModel, tiers, postingType, avoidRepeatSchools, priorityEnabled = false, shuffledRank = new Map()) {
  const rankOf = (id) => shuffledRank.get(id) ?? id;
  const countBySupervisor = new Map();
  for (const a of assignments) {
    countBySupervisor.set(a.supervisor_id, (countBySupervisor.get(a.supervisor_id) || 0) + 1);
  }

  const eligible = [...supervisorModel.byId.values()].filter((e) => e.totalCapacity > 0);
  for (const e of eligible) {
    if (!countBySupervisor.has(e.supervisor.id)) countBySupervisor.set(e.supervisor.id, 0);
  }

  let movesApplied = 0;
  let budgetExhausted = false;

  for (let move = 0; move < EQUALIZE_MAX_MOVES; move++) {
    // Receiver: the least-loaded eligible supervisor who still has capacity room.
    let receiver = null;
    for (const e of eligible) {
      const count = countBySupervisor.get(e.supervisor.id);
      if (count >= e.totalCapacity) continue;
      if (
        receiver === null ||
        count < countBySupervisor.get(receiver.supervisor.id) ||
        (count === countBySupervisor.get(receiver.supervisor.id) &&
          (priorityEnabled
            ? e.priorityNumber < receiver.priorityNumber ||
              (e.priorityNumber === receiver.priorityNumber && rankOf(e.supervisor.id) < rankOf(receiver.supervisor.id))
            : rankOf(e.supervisor.id) < rankOf(receiver.supervisor.id)))
      ) {
        receiver = e;
      }
    }
    if (!receiver) break; // nobody has room left to receive anything

    const receiverCount = countBySupervisor.get(receiver.supervisor.id);

    // Donor: the busiest eligible supervisor, strictly more loaded than the
    // receiver would be after the move (so it actually shrinks the gap).
    let donor = null;
    for (const e of eligible) {
      if (e.supervisor.id === receiver.supervisor.id) continue;
      const count = countBySupervisor.get(e.supervisor.id);
      if (count <= receiverCount + 1) continue;
      if (
        donor === null ||
        count > countBySupervisor.get(donor.supervisor.id) ||
        (count === countBySupervisor.get(donor.supervisor.id) &&
          (priorityEnabled
            ? e.priorityNumber > donor.priorityNumber ||
              (e.priorityNumber === donor.priorityNumber && rankOf(e.supervisor.id) > rankOf(donor.supervisor.id))
            : rankOf(e.supervisor.id) > rankOf(donor.supervisor.id)))
      ) {
        donor = e;
      }
    }
    if (!donor) break; // no donor can shrink the gap any further

    const donorCount = countBySupervisor.get(donor.supervisor.id);
    if (donorCount - receiverCount <= MAX_LOAD_GAP) break; // target already met

    // Prefer a school the receiver doesn't already cover, then shortest
    // distance: within the same tier the distance ordering is a purely
    // cosmetic tie-break, but across tiers it's the mechanism itself - the
    // donor's remaining set stays skewed toward their own harder work, and a
    // cross-tier receiver only ever gets a modest top-up rather than a large
    // chunk of the donor's load.
    const repeatForReceiver = (a) => (avoidRepeatSchools && receiver.schoolHistory.has(a.school_id) ? 1 : 0);
    const donorAssignments = assignments
      .filter((a) => a.supervisor_id === donor.supervisor.id)
      .sort(
        (a, b) =>
          repeatForReceiver(a) - repeatForReceiver(b) ||
          a.distance_km - b.distance_km ||
          a.school_id - b.school_id
      );
    const moved = donorAssignments[0];
    if (!moved) break;

    moved.supervisor_id = receiver.supervisor.id;
    moved.supervisor_name = receiver.supervisor.name;
    moved.rank_code = receiver.supervisor.rank_code;
    moved.priority_number = receiver.supervisor.priority_number;
    moved.repeat_school = avoidRepeatSchools ? receiver.schoolHistory.has(moved.school_id) : false;

    countBySupervisor.set(donor.supervisor.id, donorCount - 1);
    countBySupervisor.set(receiver.supervisor.id, receiverCount + 1);
    receiver.schoolHistory.add(moved.school_id);
    movesApplied++;

    if (move === EQUALIZE_MAX_MOVES - 1) budgetExhausted = true;
  }

  const finalCounts = eligible.map((e) => countBySupervisor.get(e.supervisor.id));
  const remainingGap = finalCounts.length ? Math.max(...finalCounts) - Math.min(...finalCounts) : 0;
  // Supervisors still below a fair share purely because their OWN
  // remaining_slots ceiling is lower than their peers' - a genuine capacity
  // constraint, not a bug, so it's reported rather than forced.
  const belowCapacityCeiling = eligible.filter((e) => {
    const count = countBySupervisor.get(e.supervisor.id);
    const maxCount = Math.max(...finalCounts);
    return count < maxCount - MAX_LOAD_GAP && count >= e.totalCapacity;
  }).length;

  if (movesApplied > 0) reflagClusterBreaks(assignments, postingType);

  return { movesApplied, remainingGap, belowCapacityCeiling, budgetExhausted };
}

// ============================================================================
// PHASE 10 - VALIDATION (authoritative, never trusts running ledgers)
// ============================================================================

/**
 * Recomputes correctness from `assignments` alone. Callers pass the ORIGINAL
 * (normalized) supervisors/slots so this never trusts the optimizer's own
 * bookkeeping - spec requirement: "do not trust the algorithm's own bookkeeping
 * to prove correctness."
 *
 * @param {Function|number} visitFilterOrNumber - either a (visit_number) => boolean
 *   predicate, or a plain number meaning "<= this" (legacy numberOfPostings form)
 */
function validateSolution(assignments, supervisors, slots, visitFilterOrNumber, maxAssignments) {
  const visitFilter = toVisitFilter(visitFilterOrNumber);
  const violations = [];

  const slotIndex = new Set(slots.map((s) => `${s.school_id}-${s.group_number}-${s.visit_number}`));
  const supervisorIds = new Set(supervisors instanceof Map ? [...supervisors.keys()] : supervisors.map((s) => s.id));
  const capacityOf = (id) => {
    if (supervisors instanceof Map) return supervisors.get(id)?.totalCapacity;
    const sup = supervisors.find((s) => s.id === id);
    return sup?.remaining_slots;
  };

  const seenSlots = new Set();
  const perSupervisor = new Map();

  for (const a of assignments) {
    const slotKey = assignmentSlotKey(a);

    if (!slotIndex.has(slotKey)) {
      violations.push({ type: 'invalid_slot_reference', message: `Assignment references unsupplied slot ${slotKey}`, assignment: a });
    }
    if (seenSlots.has(slotKey)) {
      violations.push({ type: 'duplicate_slot', message: `Slot ${slotKey} assigned more than once`, assignment: a });
    }
    seenSlots.add(slotKey);

    if (!supervisorIds.has(a.supervisor_id)) {
      violations.push({ type: 'invalid_supervisor_reference', message: `Assignment references unsupplied supervisor ${a.supervisor_id}`, assignment: a });
    }

    if (!visitFilter(a.visit_number)) {
      violations.push({ type: 'visit_out_of_range', message: `visit_number ${a.visit_number} is not part of this run's visit selection`, assignment: a });
    }

    perSupervisor.set(a.supervisor_id, (perSupervisor.get(a.supervisor_id) || 0) + 1);
  }

  for (const [id, count] of perSupervisor) {
    const cap = capacityOf(id);
    if (cap != null && count > cap) {
      violations.push({ type: 'over_capacity', message: `Supervisor ${id} has ${count} assignments, capacity ${cap}` });
    }
  }

  if (assignments.length > maxAssignments) {
    violations.push({ type: 'over_dean_ceiling', message: `${assignments.length} assignments exceed ceiling ${maxAssignments}` });
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Deterministically drop the minimum set of offending assignments to restore
 * feasibility, then re-validate once as a backstop.
 */
function repairSolution(assignments, supervisors, slots, visitFilterOrNumber, maxAssignments) {
  const visitFilter = toVisitFilter(visitFilterOrNumber);
  let working = [...assignments];

  // Duplicates: keep the first occurrence, drop later ones
  const seenSlots = new Set();
  working = working.filter((a) => {
    const key = assignmentSlotKey(a);
    if (seenSlots.has(key)) return false;
    seenSlots.add(key);
    return true;
  });

  // Invalid slot/supervisor references
  const slotIndex = new Set(slots.map((s) => `${s.school_id}-${s.group_number}-${s.visit_number}`));
  const supervisorIds = new Set(supervisors instanceof Map ? [...supervisors.keys()] : supervisors.map((s) => s.id));
  working = working.filter(
    (a) => slotIndex.has(assignmentSlotKey(a)) && supervisorIds.has(a.supervisor_id) && visitFilter(a.visit_number)
  );

  // Over-capacity: drop the supervisor's most-recently-added assignments first
  const capacityOf = (id) => {
    if (supervisors instanceof Map) return supervisors.get(id)?.totalCapacity ?? Infinity;
    const sup = supervisors.find((s) => s.id === id);
    return sup?.remaining_slots ?? Infinity;
  };
  const perSupervisor = new Map();
  const kept = [];
  for (const a of working) {
    const count = perSupervisor.get(a.supervisor_id) || 0;
    if (count < capacityOf(a.supervisor_id)) {
      kept.push(a);
      perSupervisor.set(a.supervisor_id, count + 1);
    }
  }
  working = kept;

  // Dean ceiling: drop from the end deterministically
  if (working.length > maxAssignments) {
    working = working.slice(0, maxAssignments);
  }

  const revalidated = validateSolution(working, supervisors, slots, visitFilter, maxAssignments);
  if (!revalidated.valid) {
    throw new Error(
      `autoPostingEngine: solution still invalid after repair - ${JSON.stringify(revalidated.violations.slice(0, 3))}`
    );
  }

  return working;
}

// ============================================================================
// PHASE 11 - STATISTICS + WARNINGS
// ============================================================================

function calculateStatistics(assignments, supervisorModel, slots, visitsIncluded, tiers, priorityEnabled, postingType, extras) {
  const {
    quotaSkipped = 0,
    unplacedUnitsCount = 0,
    optimizationMeta,
  } = extras;

  const byVisit = {};
  const bySupervisor = {};
  const bySchool = {};
  const repeatsMap = new Map();

  for (const a of assignments) {
    const visitKey = `visit_${a.visit_number}`;
    byVisit[visitKey] = (byVisit[visitKey] || 0) + 1;

    if (!bySupervisor[a.supervisor_id]) {
      bySupervisor[a.supervisor_id] = { count: 0, name: a.supervisor_name, distance: 0 };
    }
    bySupervisor[a.supervisor_id].count++;
    bySupervisor[a.supervisor_id].distance += a.distance_km || 0;

    if (!bySchool[a.school_id]) bySchool[a.school_id] = { count: 0, name: a.school_name };
    bySchool[a.school_id].count++;

    if (a.repeat_school) {
      const key = `${a.supervisor_id}-${a.school_id}`;
      if (!repeatsMap.has(key)) {
        repeatsMap.set(key, {
          supervisor_id: a.supervisor_id,
          supervisor_name: a.supervisor_name,
          school_id: a.school_id,
          school_name: a.school_name,
          visit_numbers: [],
        });
      }
      repeatsMap.get(key).visit_numbers.push(a.visit_number);
    }
  }

  const counts = Object.values(bySupervisor).map((s) => s.count);
  const travels = Object.values(bySupervisor).map((s) => s.distance);
  const supervisorsWithPostings = Object.keys(bySupervisor).length;
  const totalSupervisors = supervisorModel.byId.size;

  const finalTotals = [...supervisorModel.byId.values()].map(
    (e) => e.currentPostings + (bySupervisor[e.supervisor.id]?.count || 0)
  );

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

  let priorityCorrelation = 0;
  if (assignments.length >= 2) {
    priorityCorrelation = -correlation(
      assignments.map((a) => Number(a.priority_number) || 99),
      assignments.map((a) => a.distance_km || 0)
    );
  }

  const { tierStats, inversionCount, inversionSeverity, tierOverlap, monotonicityScore, totalPairs } =
    computePriorityInversions(assignments, tiers);

  const crossLgaCount = postingType === 'lga_based' ? assignments.filter((a) => a.cluster_break).length : 0;
  const crossRouteCount = postingType === 'route_based' ? assignments.filter((a) => a.cluster_break).length : 0;
  const distinctLgas = postingType === 'lga_based' ? new Set(assignments.map((a) => a.lga)).size : 0;

  const repeatCountVal = assignments.filter((a) => a.repeat_school).length;
  const unavoidableRepeats = assignments.filter((a) => a.repeat_school && a._unavoidable).length;

  const statistics = {
    total_assignments: assignments.length,
    total_schools: Object.keys(bySchool).length,
    by_visit: byVisit,
    by_round: byVisit,
    supervisors_full: supervisorsWithPostings,
    supervisors_partial: 0,
    supervisors_none: totalSupervisors - supervisorsWithPostings,
    visits_included: visitsIncluded,
    filtered_slots_count: slots.length,

    avg_postings_per_supervisor: counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0,
    min_postings: counts.length ? Math.min(...counts) : 0,
    max_postings: counts.length ? Math.max(...counts) : 0,

    repeat_school_assignments: repeatCountVal,
    repeat_school_details: [...repeatsMap.values()].slice(0, 20),
    affinity_breaks: postingType === 'random' ? 0 : assignments.filter((a) => a.cluster_break).length,

    load: {
      min: counts.length ? Math.min(...counts) : 0,
      max: counts.length ? Math.max(...counts) : 0,
      stddev: Number(standardDeviation(counts).toFixed(2)),
    },
    travel_km: {
      min: travels.length ? Number(Math.min(...travels).toFixed(1)) : 0,
      max: travels.length ? Number(Math.max(...travels).toFixed(1)) : 0,
      mean: travels.length ? Number(average(travels).toFixed(1)) : 0,
    },
    distance_by_rank: distanceByRank,
    priority_correlation: Number(priorityCorrelation.toFixed(3)),
    quota_skipped: quotaSkipped,

    // ---- new top-level fields ----
    total_slots: slots.length,
    total_assigned: assignments.length,
    total_unassigned: Math.max(0, slots.length - assignments.length),
    supervisors_total: totalSupervisors,
    supervisors_used: supervisorsWithPostings,
    utilization_rate: slots.length > 0 ? Number((assignments.length / slots.length).toFixed(3)) : 0,
    assignments_by_visit: byVisit,
    assignments_by_supervisor: bySupervisor,

    workload: {
      min: finalTotals.length ? Math.min(...finalTotals) : 0,
      max: finalTotals.length ? Math.max(...finalTotals) : 0,
      mean: finalTotals.length ? Number(average(finalTotals).toFixed(2)) : 0,
      median: finalTotals.length ? Number(median(finalTotals).toFixed(2)) : 0,
      standard_deviation: Number(standardDeviation(finalTotals).toFixed(2)),
    },
    travel: {
      total_km: Number(travels.reduce((a, b) => a + b, 0).toFixed(1)),
      min_supervisor_km: travels.length ? Number(Math.min(...travels).toFixed(1)) : 0,
      max_supervisor_km: travels.length ? Number(Math.max(...travels).toFixed(1)) : 0,
      mean_km: travels.length ? Number(average(travels).toFixed(1)) : 0,
      standard_deviation: Number(standardDeviation(travels).toFixed(2)),
    },
    repeats: {
      count: repeatCountVal,
      rate: assignments.length > 0 ? Number((repeatCountVal / assignments.length).toFixed(3)) : 0,
      unavoidable_count: unavoidableRepeats,
    },
    geography: {
      lgAs: distinctLgas,
      fragmented_assignments: postingType === 'random' ? 0 : assignments.filter((a) => a.cluster_break).length,
      cross_lga_assignments: crossLgaCount,
      cross_route_assignments: crossRouteCount,
      unplaced_units: unplacedUnitsCount,
    },
    priority: {
      enabled: priorityEnabled,
      inversion_count: inversionCount,
      inversion_severity: Number(inversionSeverity.toFixed(2)),
      tier_overlap: tierOverlap,
      monotonicity_score: Number(monotonicityScore.toFixed(3)),
      distance_by_rank: distanceByRank,
      tiers: tierStats,
    },
    optimization: optimizationMeta,
  };

  // Backward-compatible diagnostic scalarization (display only, never used to decide anything)
  const scalarize = (v) =>
    v.unassignedCount * 1e9 +
    v.hardViolationCount * 1e8 +
    v.priorityInversionCount * 1e6 +
    v.priorityInversionSeverity * 1e4 +
    v.crossLgaAssignmentCount * 1e3 +
    v.lgaFragmentation * 1e2 +
    v.repeatCount * 10 +
    v.workloadImbalance +
    v.travelImbalance;

  statistics.cost_total = Number(scalarize(optimizationMeta.objective_after).toFixed(2));
  statistics.local_search = {
    swaps_applied: Object.values(optimizationMeta.moves_applied).reduce((a, b) => a + b, 0),
    passes: optimizationMeta.improvement_passes,
    cost_before: Number(scalarize(optimizationMeta.objective_before).toFixed(2)),
    cost_after: Number(scalarize(optimizationMeta.objective_after).toFixed(2)),
    budget_exhausted: optimizationMeta.budget_exhausted === true,
  };

  return statistics;
}

function buildWarnings(assignments, statistics, extras) {
  const warnings = [...(extras.upstreamWarnings || [])];

  if (extras.quotaSkipped > 0) {
    warnings.push(`${extras.quotaSkipped} slot(s) skipped - the posting allocation for this session is exhausted`);
  }

  if (statistics.total_unassigned > 0) {
    warnings.push(
      `${statistics.total_unassigned} slot(s) could not be assigned (more slots than total supervisor capacity)`
    );
  }

  if (statistics.repeat_school_assignments > 0) {
    warnings.push(
      `${statistics.repeat_school_assignments} posting(s) reuse a school for the same supervisor - no alternative supervisor had capacity`
    );
  }

  if (statistics.priority.inversion_count > 0) {
    const affectedTiers = [...new Set(statistics.priority.tier_overlap.map((o) => o.tier_a))];
    warnings.push(
      `${statistics.priority.inversion_count} priority inversion(s) remain because the senior priority tier(s) [${affectedTiers.join(', ')}] had insufficient remaining capacity.`
    );
  }

  if (statistics.geography.cross_lga_assignments > 0 && extras.postingType === 'lga_based') {
    warnings.push(
      `${statistics.geography.cross_lga_assignments} slot(s) required cross-LGA allocation because LGA demand exceeded the available supervisor capacity assigned to that area.`
    );
  }
  if (statistics.geography.cross_route_assignments > 0 && extras.postingType === 'route_based') {
    warnings.push(
      `${statistics.geography.cross_route_assignments} slot(s) required cross-route allocation because route demand exceeded the available supervisor capacity assigned to that area.`
    );
  }

  if (statistics.geography.unplaced_units > 0) {
    warnings.push(
      `${statistics.geography.unplaced_units} geographical unit(s) could not be placed in any priority tier and were handled by a last-resort fallback pass.`
    );
  }

  // Safety net: the algorithm must never assign a slot twice
  const seenSlots = new Map();
  const duplicates = [];
  for (const a of assignments) {
    const slotKey = assignmentSlotKey(a);
    if (seenSlots.has(slotKey)) {
      duplicates.push({ slot: slotKey, first_supervisor: seenSlots.get(slotKey), second_supervisor: a.supervisor_name });
    } else {
      seenSlots.set(slotKey, a.supervisor_name);
    }
  }
  if (duplicates.length > 0) {
    warnings.push(`Algorithm error: ${duplicates.length} duplicate slot assignments detected`);
    statistics.duplicate_errors = duplicates;
  }

  return warnings;
}

function finishResult(assignments, warnings, statistics) {
  for (const a of assignments) {
    delete a._unitKey;
    delete a._unavoidable;
  }
  return { assignments, warnings, statistics };
}

function emptyResult(warnings, visitsIncluded, slotsCount = 0) {
  const statistics = {
    total_assignments: 0,
    total_schools: 0,
    by_visit: {},
    by_round: {},
    supervisors_full: 0,
    supervisors_partial: 0,
    supervisors_none: 0,
    visits_included: visitsIncluded,
    filtered_slots_count: slotsCount,
    avg_postings_per_supervisor: 0,
    min_postings: 0,
    max_postings: 0,
    repeat_school_assignments: 0,
    repeat_school_details: [],
    affinity_breaks: 0,
    load: { min: 0, max: 0, stddev: 0 },
    travel_km: { min: 0, max: 0, mean: 0 },
    distance_by_rank: [],
    priority_correlation: 0,
    quota_skipped: 0,
    total_slots: slotsCount,
    total_assigned: 0,
    total_unassigned: slotsCount,
    supervisors_total: 0,
    supervisors_used: 0,
    utilization_rate: 0,
    assignments_by_visit: {},
    assignments_by_supervisor: {},
    workload: { min: 0, max: 0, mean: 0, median: 0, standard_deviation: 0 },
    travel: { total_km: 0, min_supervisor_km: 0, max_supervisor_km: 0, mean_km: 0, standard_deviation: 0 },
    repeats: { count: 0, rate: 0, unavoidable_count: 0 },
    geography: { lgAs: 0, fragmented_assignments: 0, cross_lga_assignments: 0, cross_route_assignments: 0, unplaced_units: 0 },
    priority: { enabled: false, inversion_count: 0, inversion_severity: 0, tier_overlap: [], monotonicity_score: 1, distance_by_rank: [], tiers: [] },
    optimization: { strategy: null, candidate_solutions: [], improvement_passes: 0, objective_before: null, objective_after: null, moves_applied: { A: 0, B: 0, C: 0, D: 0 }, budget_exhausted: false },
    cost_total: 0,
    local_search: { swaps_applied: 0, passes: 0, cost_before: 0, cost_after: 0, budget_exhausted: false },
  };
  return { assignments: [], warnings, statistics };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Assign supervisors to slots.
 *
 * @param {Array} supervisors - Eligible supervisors with remaining_slots and priority_number
 * @param {Array} slots - Available slots (school+group+visit combinations)
 * @param {number} numberOfPostings - Highest visit number to include (1 = Visit 1 only);
 *   superseded by options.visitNumbers when that is given
 * @param {string} postingType - 'random' | 'route_based' | 'lga_based'
 * @param {boolean} priorityEnabled - Pair higher ranks with harder/farther geographical work
 * @param {Object} [options]
 * @param {boolean} [options.avoidRepeatSchools=true]
 * @param {Map}     [options.schoolHistory] - Map<supervisor_id, Set<school_id>> already covered
 * @param {number}  [options.maxAssignments] - Hard ceiling (dean allocation)
 * @param {number[]} [options.visitNumbers] - Exact visits to fill. When set it replaces the
 *   "visits 1 through numberOfPostings" shorthand, so a run can target Visit 2 alone, or a
 *   non-contiguous set, without disturbing the others.
 * @param {Object}  [options.limits] - { maxPasses, maxComparisons, maxMoveDCount }
 * @returns {{assignments: Array, warnings: Array, statistics: Object}}
 */
function runAutoPostingAlgorithm(supervisors, slots, numberOfPostings, postingType, priorityEnabled, options = {}) {
  const {
    avoidRepeatSchools = true,
    schoolHistory = new Map(),
    maxAssignments = Infinity,
    visitNumbers = [],
    limits = {},
  } = options;

  // An explicit visit selection wins over the "visits 1 through N" shorthand, so a
  // run can fill Visit 2 alone, or a non-contiguous set, without disturbing others.
  const selectedVisits =
    Array.isArray(visitNumbers) && visitNumbers.length > 0
      ? [...new Set(visitNumbers.map(Number))].sort((a, b) => a - b)
      : null;
  const visitsIncluded = selectedVisits ?? numberOfPostings;
  const visitFilter = selectedVisits ? (v) => selectedVisits.includes(v) : (v) => v <= numberOfPostings;

  if (supervisors.length === 0) {
    return emptyResult(['No eligible supervisors available'], visitsIncluded, 0);
  }
  if (slots.length === 0) {
    return emptyResult(['No available slots to assign'], visitsIncluded, 0);
  }

  const preFilterEligible = slots.filter((s) => visitFilter(s.visit_number));
  if (preFilterEligible.length === 0) {
    return emptyResult([`No available slots for ${describeVisits(visitsIncluded)}`], visitsIncluded, 0);
  }
  if (maxAssignments <= 0) {
    return emptyResult(
      ['No postings could be created - the posting allocation for this session is exhausted'],
      visitsIncluded,
      preFilterEligible.length
    );
  }

  // ---- Phase 1: normalize ----
  const normalized = normalizeInput(supervisors, slots, visitFilter, options);
  const eligibleSlots = normalized.slots;
  const upstreamWarnings = normalized.warnings;

  if (eligibleSlots.length === 0) {
    return emptyResult(
      [...upstreamWarnings, `No available slots for ${describeVisits(visitsIncluded)}`],
      visitsIncluded,
      0
    );
  }

  // ---- Phase 2: demand model ----
  const demandModel = buildDemandModel(eligibleSlots, postingType);

  // ---- Phase 3: supervisor capacity model ----
  const baseSupervisorModel = buildSupervisorModel(normalized.supervisors, schoolHistory);

  // ---- Phase 4: priority tiers ----
  const baseTiers = buildPriorityTiers(baseSupervisorModel, priorityEnabled);

  // Seeded shuffle for tie-breaking (see SEEDED SHUFFLE section above) -
  // derived from this batch's own inputs so a Preview and the Execute that
  // follows it agree, and re-running the identical batch is reproducible,
  // while different sessions/criteria/batches naturally shuffle differently.
  const seed = hashSeed([
    postingType,
    String(priorityEnabled),
    String(avoidRepeatSchools),
    String(numberOfPostings),
    normalized.supervisors.map((s) => s.id).sort((a, b) => a - b).join(','),
    eligibleSlots.map((s) => s.id).sort().join(','),
  ]);
  const shuffledRank = buildShuffledRank(normalized.supervisors.map((s) => s.id), seed);

  const totalDistance = eligibleSlots.reduce((sum, s) => sum + (s.distance_km || 0), 0);
  const maxDistanceNorm = Math.max(totalDistance / normalized.supervisors.length, 1);

  const scoringCtx = {
    slots: eligibleSlots,
    visitFilter,
    maxAssignments: Number.isFinite(maxAssignments) ? maxAssignments : eligibleSlots.length,
    postingType,
    eligibleSlotCount: eligibleSlots.length,
    supervisors: baseSupervisorModel.byId,
    maxDistanceNorm,
    shuffledRank,
  };

  // ---- Phase 5-6-8: multiple deterministic initial solutions ----
  const candidates = generateInitialSolutions(
    demandModel,
    baseSupervisorModel,
    baseTiers,
    postingType,
    priorityEnabled,
    avoidRepeatSchools,
    scoringCtx
  );

  let winner = selectBestCandidate(candidates);

  // Respect dean ceiling as a hard cap on the chosen candidate (best-first by objective)
  let quotaSkipped = 0;
  if (winner.assignments.length > scoringCtx.maxAssignments) {
    const ordered = [...winner.assignments].sort((a, b) => {
      // Keep the "best" assignments per the same tie-break used elsewhere:
      // priority (senior first when enabled), then distance desc, then ids
      return (
        (a.priority_number ?? 99) - (b.priority_number ?? 99) ||
        (b.distance_km || 0) - (a.distance_km || 0) ||
        a.school_id - b.school_id ||
        a.group_number - b.group_number ||
        a.visit_number - b.visit_number
      );
    });
    quotaSkipped = ordered.length - scoringCtx.maxAssignments;
    winner = { ...winner, assignments: ordered.slice(0, scoringCtx.maxAssignments) };
  }

  // ---- Phase 9: constrained local improvement ----
  const improvement = improveSolution(
    winner,
    demandModel,
    winner.supervisorModel,
    winner.tiers,
    postingType,
    priorityEnabled,
    avoidRepeatSchools,
    scoringCtx,
    limits
  );

  let finalAssignments = improvement.assignments;

  // ---- Phase 9.4: narrow cumulative travel distance via whole-unit swaps ----
  const travelEqualization = equalizeTravel(
    finalAssignments,
    baseSupervisorModel,
    winner.tiers,
    postingType,
    avoidRepeatSchools,
    priorityEnabled,
    shuffledRank
  );

  // ---- Phase 9.5: narrow the postings-per-supervisor gap to a fair share ----
  const utilization = equalizeWorkload(
    finalAssignments,
    baseSupervisorModel,
    winner.tiers,
    postingType,
    avoidRepeatSchools,
    priorityEnabled,
    shuffledRank
  );
  if (utilization.remainingGap > MAX_LOAD_GAP) {
    const reason = utilization.belowCapacityCeiling > 0
      ? `${utilization.belowCapacityCeiling} of them are capped by their own lower posting capacity`
      : 'no further reassignment was available without exceeding another hard constraint';
    upstreamWarnings.push(
      `Postings-per-supervisor gap is ${utilization.remainingGap} (target: ${MAX_LOAD_GAP}) - ${reason}.`
    );
  }

  // ---- Phase 10: authoritative validation + repair ----
  const validation = validateSolution(
    finalAssignments,
    baseSupervisorModel.byId,
    eligibleSlots,
    visitFilter,
    scoringCtx.maxAssignments
  );
  if (!validation.valid) {
    finalAssignments = repairSolution(
      finalAssignments,
      baseSupervisorModel.byId,
      eligibleSlots,
      visitFilter,
      scoringCtx.maxAssignments
    );
  }

  reflagClusterBreaks(finalAssignments, postingType);

  // Neutral display order. `assignSlotsWithinClusters` builds this array by
  // walking demand units hardest-difficulty-first (see buildDemandModel) -
  // that's the right order for the allocation math, but it means the array's
  // *first* entries are always the objectively farthest schools in the
  // dataset, for every posting type and every priority setting, since
  // distance_km is a fixed fact about each school. Any consumer that shows
  // "the first N assignments" as a sample (e.g. the preview dialog's "Sample
  // Assignments") would then always show the same extreme outlier schools
  // regardless of what the admin changed, which looks like the settings have
  // no effect even though the full result genuinely differs. Sorting into a
  // neutral order here - after the allocation is fully decided - fixes this
  // for every caller without affecting any aggregate statistic (all of the
  // stats below are order-independent sums/counts, not order-sensitive).
  finalAssignments = [...finalAssignments].sort(
    (a, b) =>
      a.visit_number - b.visit_number ||
      a.supervisor_name.localeCompare(b.supervisor_name) ||
      a.school_name.localeCompare(b.school_name) ||
      a.group_number - b.group_number
  );

  const optimizationMeta = {
    strategy: winner.strategyName,
    candidate_solutions: candidates.map((c) => ({ strategy: c.strategyName, objective: c.objective })),
    improvement_passes: improvement.passes,
    objective_before: improvement.objectiveBefore,
    objective_after: improvement.objectiveAfter,
    moves_applied: improvement.movesApplied,
    budget_exhausted: improvement.budgetExhausted,
    travel_equalization_moves: travelEqualization.movesApplied,
  };

  const unplacedUnitsCount = winner.unplacedUnits ? winner.unplacedUnits.length : 0;

  const statistics = calculateStatistics(
    finalAssignments,
    baseSupervisorModel,
    eligibleSlots,
    visitsIncluded,
    winner.tiers,
    priorityEnabled,
    postingType,
    { quotaSkipped, unplacedUnitsCount, optimizationMeta }
  );

  const warnings = buildWarnings(finalAssignments, statistics, {
    upstreamWarnings,
    quotaSkipped,
    postingType,
  });

  return finishResult(finalAssignments, warnings, statistics);
}

module.exports = {
  runAutoPostingAlgorithm,
  // Small math/geography helpers
  clusterKeyFor,
  describeVisits,
  standardDeviation,
  correlation,
  calculateGeographyDifficulty,
  // Pipeline stages, exported for testing
  normalizeInput,
  buildDemandModel,
  buildSupervisorModel,
  buildPriorityTiers,
  solveLgaAllocation,
  solveRouteAllocation,
  solveRandomAllocation,
  generateInitialSolutions,
  assignSlotsWithinClusters,
  scoreCandidate,
  compareObjectives,
  improveSolution,
  equalizeTravel,
  equalizeWorkload,
  validateSolution,
};
