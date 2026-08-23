/**
 * Auto-Posting Engine Tests
 *
 * Pure unit tests for the staged allocation engine - no database, no HTTP.
 * Focus: end-to-end behavioural invariants documented in
 * docs/AUTO_POSTING_REWRITE_PROMT.MD (LGA/route cohesion, priority tiers,
 * workload/travel balance, dean allocation, determinism).
 *
 * Internals specific to the tier/LGA allocation core and the lexicographic
 * objective/candidate-selection machinery live in the sibling files
 * autoPostingEngine.lgaAllocation.test.js and autoPostingEngine.objective.test.js.
 */

const {
  runAutoPostingAlgorithm,
  standardDeviation,
  correlation,
} = require('../../src/services/autoPostingEngine');
const { assertValidSolution } = require('../helpers/autoPostingAssertions');

// ============================================================================
// FIXTURES
// ============================================================================

const makeSupervisors = (count, { remainingSlots = 10, priorities = null } = {}) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Supervisor ${i + 1}`,
    rank_code: 'SL',
    priority_number: priorities ? priorities[i] : 1,
    current_postings: 0,
    remaining_slots: remainingSlots,
  }));

/**
 * Build slots spread over clusters. `clusters` describes how many schools sit in
 * each route/LGA, e.g. [3, 3, 3] = three areas of three schools each.
 */
const makeClusteredSlots = ({ clusters, visits, distanceBase = 10 }) => {
  const slots = [];
  let schoolId = 0;

  clusters.forEach((schoolCount, clusterIndex) => {
    for (let s = 0; s < schoolCount; s++) {
      schoolId++;
      for (let visit = 1; visit <= visits; visit++) {
        slots.push({
          id: `${schoolId}-1-${visit}`,
          school_id: schoolId,
          school_name: `School ${schoolId}`,
          group_number: 1,
          visit_number: visit,
          route_id: clusterIndex + 1,
          route_name: `Route ${clusterIndex + 1}`,
          lga: `LGA ${clusterIndex + 1}`,
          distance_km: distanceBase * schoolId,
        });
      }
    }
  });

  return slots;
};

const makeFlatSlots = ({ schools, visits, groupsPerSchool = 1, distanceBase = 10 }) => {
  const slots = [];
  for (let school = 1; school <= schools; school++) {
    for (let group = 1; group <= groupsPerSchool; group++) {
      for (let visit = 1; visit <= visits; visit++) {
        slots.push({
          id: `${school}-${group}-${visit}`,
          school_id: school,
          school_name: `School ${school}`,
          group_number: group,
          visit_number: visit,
          route_id: null,
          route_name: null,
          lga: 'unknown',
          distance_km: distanceBase * school,
        });
      }
    }
  }
  return slots;
};

const postingCounts = (assignments) => {
  const counts = new Map();
  for (const a of assignments) counts.set(a.supervisor_id, (counts.get(a.supervisor_id) || 0) + 1);
  return [...counts.values()];
};

const clustersPerSupervisorVisit = (assignments, key) => {
  const result = new Map();
  for (const a of assignments) {
    if (!result.has(a.supervisor_id)) result.set(a.supervisor_id, new Map());
    const visits = result.get(a.supervisor_id);
    if (!visits.has(a.visit_number)) visits.set(a.visit_number, new Set());
    visits.get(a.visit_number).add(a[key]);
  }
  return result;
};

// ============================================================================
// CASE 1 / CLUSTER AFFINITY - the documented behaviour of route_based / lga_based
// ============================================================================

describe('cluster affinity', () => {
  it('keeps each supervisor inside one route per visit (route_based)', () => {
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'route_based', false);

    expect(assignments).toHaveLength(18);
    expect(statistics.affinity_breaks).toBe(0);
    assertValidSolution(assignments, supervisors, slots, 2, Infinity, statistics);

    for (const visits of clustersPerSupervisorVisit(assignments, 'route_id').values()) {
      for (const routes of visits.values()) expect(routes.size).toBe(1);
    }
  });

  it('keeps each supervisor inside one LGA per visit (lga_based) - single tier, single-area cohesion (Case 1)', () => {
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', false);

    expect(assignments).toHaveLength(18);
    expect(statistics.affinity_breaks).toBe(0);
    expect(statistics.geography.fragmented_assignments).toBe(0);

    for (const visits of clustersPerSupervisorVisit(assignments, 'lga').values()) {
      for (const lgas of visits.values()) expect(lgas.size).toBe(1);
    }
  });

  it('allows the same supervisor to work a different area on a different visit', () => {
    // Visit 1 only has demand in LGA A; visit 2 only has demand in LGA B - a
    // single supervisor covering both visits legitimately switches areas
    // between visits without that counting as a cluster break for either visit.
    const supervisors = makeSupervisors(1, { remainingSlots: 10 });
    const slots = [
      { id: '1-1-1', school_id: 1, school_name: 'School 1', group_number: 1, visit_number: 1, route_id: 1, route_name: 'Route 1', lga: 'LGA A', distance_km: 10 },
      { id: '2-1-2', school_id: 2, school_name: 'School 2', group_number: 1, visit_number: 2, route_id: 2, route_name: 'Route 2', lga: 'LGA B', distance_km: 20 },
    ];

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', false);

    expect(assignments).toHaveLength(2);
    expect(statistics.affinity_breaks).toBe(0);
    const visitLga = new Map(assignments.map((a) => [a.visit_number, a.lga]));
    expect(visitLga.get(1)).toBe('LGA A');
    expect(visitLga.get(2)).toBe('LGA B');
  });

  it('maximizes utilization even when a single supervisor must cross areas within one visit', () => {
    // Only one supervisor and two areas active in the SAME visit - filling
    // every slot (objective position 1) outranks LGA cohesion (position 6),
    // so both slots are assigned even though that forces a cluster_break.
    const supervisors = makeSupervisors(1, { remainingSlots: 10 });
    const slots = makeClusteredSlots({ clusters: [1, 1], visits: 1 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', false);

    expect(assignments).toHaveLength(2);
  });

  it('does not cluster at all for random posting', () => {
    const supervisors = makeSupervisors(2);
    const slots = makeClusteredSlots({ clusters: [3, 3], visits: 1 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    expect(statistics.affinity_breaks).toBe(0);
    expect(statistics.geography.cross_lga_assignments).toBe(0);
    expect(statistics.geography.cross_route_assignments).toBe(0);
  });

  it('still fills every slot when an area has more demand than one supervisor can absorb', () => {
    // 1 area, 6 schools, 2 supervisors capacity 3 each - one supervisor must
    // legitimately share the LGA (Case 9), every slot still gets filled.
    const supervisors = makeSupervisors(2, { remainingSlots: 3 });
    const slots = makeClusteredSlots({ clusters: [6], visits: 1 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', false);

    expect(assignments).toHaveLength(6);
  });
});

// ============================================================================
// RANK-TO-DISTANCE PAIRING
// ============================================================================

describe('rank to distance pairing', () => {
  it('gives higher-ranked (senior) supervisors materially longer journeys', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 6, priorities: [1, 2, 3] });
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 1, distanceBase: 20 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    const byRank = new Map(statistics.distance_by_rank.map((r) => [r.priority_number, r.mean_km]));
    expect(byRank.get(1)).toBeGreaterThan(byRank.get(3));
  });

  it('keeps postings fairly balanced regardless of distance differences', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 6, priorities: [1, 2, 3] });
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 1, distanceBase: 20 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    const counts = postingCounts(assignments);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('does not favour any rank when priority is disabled', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 6, priorities: [1, 2, 3] });
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 1, distanceBase: 20 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', false);

    expect(statistics.priority.enabled).toBe(false);
    expect(statistics.priority.inversion_count).toBe(0);
  });

  it('never leaves a supervisor at zero postings while another gets a second one, all else equal', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 3, priorities: [1, 1, 1] });
    const slots = makeFlatSlots({ schools: 3, visits: 1 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    expect(statistics.supervisors_none).toBe(0);
  });
});

// ============================================================================
// LOCAL SEARCH / IMPROVEMENT NEVER WORSENS THE SOLUTION
// ============================================================================

describe('local improvement', () => {
  it('never makes the solution worse than the winning initial candidate', () => {
    const supervisors = makeSupervisors(4, { remainingSlots: 5, priorities: [1, 1, 2, 2] });
    const slots = makeClusteredSlots({ clusters: [4, 4], visits: 2, distanceBase: 15 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', true);

    const before = statistics.optimization.objective_before;
    const after = statistics.optimization.objective_after;
    expect(statistics.local_search.cost_after).toBeLessThanOrEqual(statistics.local_search.cost_before + 1e-6);
    expect(after.unassignedCount).toBeLessThanOrEqual(before.unassignedCount);
    expect(after.hardViolationCount).toBe(0);
  });

  it('preserves hard constraints while optimising', () => {
    const supervisors = makeSupervisors(5, { remainingSlots: 4, priorities: [1, 2, 2, 3, 3] });
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2, distanceBase: 12 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', true);

    assertValidSolution(assignments, supervisors, slots, 2, Infinity, statistics);
  });
});

// ============================================================================
// WORKLOAD / TRAVEL BALANCE
// ============================================================================

describe('workload and travel balance', () => {
  it('spreads postings evenly across equally-capable supervisors', () => {
    const supervisors = makeSupervisors(4, { remainingSlots: 5 });
    const slots = makeFlatSlots({ schools: 16, visits: 1, distanceBase: 5 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    const counts = postingCounts(assignments);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('reports a sane travel spread', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 5 });
    const slots = makeFlatSlots({ schools: 9, visits: 1, distanceBase: 10 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    expect(statistics.travel_km.min).toBeLessThanOrEqual(statistics.travel_km.mean);
    expect(statistics.travel_km.mean).toBeLessThanOrEqual(statistics.travel_km.max);
    expect(statistics.travel.standard_deviation).toBeGreaterThanOrEqual(0);
  });

  it('final workload accounts for existing current_postings, not just new assignments', () => {
    const supervisors = [
      { id: 1, name: 'A', rank_code: 'SL', priority_number: 1, current_postings: 2, remaining_slots: 1 },
      { id: 2, name: 'B', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 1 },
    ];
    const slots = makeFlatSlots({ schools: 2, visits: 1 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    // Final totals: A ends at 3, B ends at 1 - imbalance should be reflected
    expect(statistics.workload.max).toBeGreaterThan(statistics.workload.min);
  });
});

// ============================================================================
// DEAN ALLOCATION CEILING (Case 11, 18)
// ============================================================================

describe('dean allocation ceiling', () => {
  it('stops at maxAssignments and reports how many were skipped', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 5 });
    const slots = makeFlatSlots({ schools: 9, visits: 1 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false, {
      maxAssignments: 4,
    });

    expect(assignments).toHaveLength(4);
    expect(statistics.quota_skipped).toBe(5);
  });

  it('creates nothing when the allocation is already exhausted', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 5 });
    const slots = makeFlatSlots({ schools: 9, visits: 1 });

    const { assignments, warnings } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false, {
      maxAssignments: 0,
    });

    expect(assignments).toHaveLength(0);
    expect(warnings.some((w) => w.toLowerCase().includes('exhausted'))).toBe(true);
  });

  it('picks the best feasible subset, not an arbitrary first N, when priority is enabled (Case 11)', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 5, priorities: [1, 2] });
    const slots = makeClusteredSlots({ clusters: [3, 3], visits: 1, distanceBase: 30 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true, {
      maxAssignments: 3,
    });

    expect(assignments).toHaveLength(3);
    // The kept assignments should skew toward the senior supervisor's harder work
    const seniorCount = assignments.filter((a) => a.priority_number === 1).length;
    expect(seniorCount).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// DATA QUALITY (Case 15)
// ============================================================================

describe('data quality', () => {
  it('does not crash on null/missing distances and flags them', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 3 });
    const slots = makeFlatSlots({ schools: 4, visits: 1 }).map((s, i) => ({
      ...s,
      distance_km: i % 2 === 0 ? null : s.distance_km,
    }));

    expect(() => runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false)).not.toThrow();

    const { warnings } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);
    expect(warnings.some((w) => w.toLowerCase().includes('unknown distance'))).toBe(true);
  });
});

// ============================================================================
// CAPACITY (Case 16, 19)
// ============================================================================

describe('capacity handling', () => {
  it('honours differing remaining_slots while still balancing intelligently', () => {
    const supervisors = [
      { id: 1, name: 'A', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 1 },
      { id: 2, name: 'B', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 3 },
    ];
    const slots = makeFlatSlots({ schools: 4, visits: 1 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    assertValidSolution(assignments, supervisors, slots, 1, Infinity, statistics);
    const counts = new Map();
    for (const a of assignments) counts.set(a.supervisor_id, (counts.get(a.supervisor_id) || 0) + 1);
    expect(counts.get(1)).toBeLessThanOrEqual(1);
    expect(counts.get(2)).toBeLessThanOrEqual(3);
  });

  it('assigns the maximum feasible number when demand exceeds total capacity', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 2 });
    const slots = makeFlatSlots({ schools: 10, visits: 1 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    expect(assignments).toHaveLength(4);
    expect(statistics.total_unassigned).toBe(6);
  });

  it('produces a clean warning and zero assignments when there is no available capacity', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 0 });
    const slots = makeFlatSlots({ schools: 3, visits: 1 });

    const { assignments, warnings } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    expect(assignments).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// MULTIPLE VISITS - GLOBAL CAPACITY (Case 6)
// ============================================================================

describe('capacity across visits', () => {
  it('shares supervisor capacity globally across all visits, not per visit', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 3 });
    const slots = makeFlatSlots({ schools: 3, visits: 2 }); // 6 slots total, capacity 6 total

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'random', false);

    assertValidSolution(assignments, supervisors, slots, 2, Infinity, statistics);
    const counts = new Map();
    for (const a of assignments) counts.set(a.supervisor_id, (counts.get(a.supervisor_id) || 0) + 1);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(3);
  });
});

// ============================================================================
// ROUTE-BASED LOCALITY (Case 14)
// ============================================================================

describe('route_based posting', () => {
  it('keeps route locality even when LGA differs across schools in the same route', () => {
    const supervisors = makeSupervisors(2);
    const slots = makeClusteredSlots({ clusters: [3, 3], visits: 1 }).map((s, i) => ({
      ...s,
      lga: `LGA ${i}`, // every school its own LGA, but route_id still groups them
    }));

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'route_based', false);

    expect(statistics.affinity_breaks).toBe(0);
  });
});

// ============================================================================
// DETERMINISM
// ============================================================================

describe('determinism', () => {
  it('produces the identical result for identical input', () => {
    const supervisors = makeSupervisors(4, { remainingSlots: 4, priorities: [1, 1, 2, 2] });
    const slots = makeClusteredSlots({ clusters: [4, 4, 4], visits: 2, distanceBase: 9 });

    const run1 = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', true);
    const run2 = runAutoPostingAlgorithm(
      supervisors.map((s) => ({ ...s })),
      slots.map((s) => ({ ...s })),
      2,
      'lga_based',
      true
    );

    expect(run1.assignments).toEqual(run2.assignments);
  });
});

// ============================================================================
// SEEDED SHUFFLE TIE-BREAKING
//
// Every tie-break used to fall back to raw supervisor ID, so the same
// low-ID supervisors always won every genuine tie, run after run. Fix:
// a per-batch seeded shuffle replaces ID as the final tie-break, so
// (a) different batches produce different winners, but
// (b) the exact same batch is still fully reproducible (Preview == Execute).
// ============================================================================

describe('seeded shuffle tie-breaking', () => {
  it('is reproducible for the exact same batch (Preview and Execute must agree)', () => {
    const supervisors = makeSupervisors(6, { remainingSlots: 4, priorities: [1, 1, 1, 1, 1, 1] });
    const slots = makeFlatSlots({ schools: 12, visits: 1, distanceBase: 5 });

    const run1 = runAutoPostingAlgorithm(
      supervisors.map((s) => ({ ...s })),
      slots.map((s) => ({ ...s })),
      1,
      'random',
      false
    );
    const run2 = runAutoPostingAlgorithm(
      supervisors.map((s) => ({ ...s })),
      slots.map((s) => ({ ...s })),
      1,
      'random',
      false
    );

    expect(run1.assignments).toEqual(run2.assignments);
  });

  it('breaks ties differently for a genuinely different batch, not always the lowest supervisor id', () => {
    // Many equally-good supervisors (same capacity, same tier, no distance
    // differences to break ties) - whoever wins ties should depend on the
    // batch's shuffle, not always be the lowest id.
    const makeBatch = (idOffset) => {
      const supervisors = makeSupervisors(10, { remainingSlots: 2, priorities: Array(10).fill(1) }).map((s) => ({
        ...s,
        id: s.id + idOffset,
      }));
      const slots = makeFlatSlots({ schools: 4, visits: 1, distanceBase: 5 }); // fewer slots than capacity - lots of ties
      return { supervisors, slots };
    };

    const batchA = makeBatch(0);
    const batchB = makeBatch(1000); // different supervisor id set = different batch

    const resultA = runAutoPostingAlgorithm(batchA.supervisors, batchA.slots, 1, 'random', false);
    const resultB = runAutoPostingAlgorithm(batchB.supervisors, batchB.slots, 1, 'random', false);

    // Map batch B's assignments back to "relative" ids to compare shapes
    const relativeWinnersA = resultA.assignments.map((a) => a.supervisor_id).sort((a, b) => a - b);
    const relativeWinnersB = resultB.assignments.map((a) => a.supervisor_id - 1000).sort((a, b) => a - b);

    expect(relativeWinnersA).not.toEqual(relativeWinnersB);
  });
});

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

describe('statistical helpers', () => {
  it('standardDeviation of a uniform array is 0', () => {
    expect(standardDeviation([5, 5, 5])).toBe(0);
  });

  it('standardDeviation reflects spread', () => {
    expect(standardDeviation([1, 2, 3, 4, 5])).toBeGreaterThan(0);
  });

  it('correlation is 1 for perfectly aligned increasing series', () => {
    expect(correlation([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 5);
  });

  it('correlation is -1 for perfectly inverted series', () => {
    expect(correlation([1, 2, 3], [30, 20, 10])).toBeCloseTo(-1, 5);
  });
});
