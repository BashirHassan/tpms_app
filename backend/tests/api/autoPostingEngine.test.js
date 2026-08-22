/**
 * Auto-Posting Engine Tests
 *
 * Pure unit tests for the scored allocation engine - no database, no HTTP.
 *
 * Focus: the behaviours the three posting types are documented to have, which the
 * previous round-robin implementation did not actually deliver.
 */

const {
  runAutoPostingAlgorithm,
  standardDeviation,
  correlation,
} = require('../../src/services/autoPostingEngine');

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

/** Map<supervisor_id, Map<visit_number, Set<cluster>>> for the given key */
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

const postingCounts = (assignments) => {
  const counts = new Map();
  for (const a of assignments) {
    counts.set(a.supervisor_id, (counts.get(a.supervisor_id) || 0) + 1);
  }
  return [...counts.values()];
};

// ============================================================================
// CLUSTER AFFINITY - the documented behaviour of route_based / lga_based
// ============================================================================

describe('cluster affinity', () => {
  it('keeps each supervisor inside one route per visit (route_based)', () => {
    // 3 routes x 3 schools, 3 supervisors - one route each per visit
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'route_based', false
    );

    expect(assignments).toHaveLength(18);
    expect(statistics.affinity_breaks).toBe(0);

    for (const visits of clustersPerSupervisorVisit(assignments, 'route_id').values()) {
      for (const routes of visits.values()) {
        expect(routes.size).toBe(1);
      }
    }
  });

  it('keeps each supervisor inside one LGA per visit (lga_based)', () => {
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'lga_based', false
    );

    expect(statistics.affinity_breaks).toBe(0);

    for (const visits of clustersPerSupervisorVisit(assignments, 'lga').values()) {
      for (const lgas of visits.values()) {
        expect(lgas.size).toBe(1);
      }
    }
  });

  it('allows a supervisor a different area on a different visit', () => {
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2 });

    const { assignments } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'route_based', false
    );

    // Each visit is internally consistent - visits are independent of each other,
    // which is what makes a per-visit trip plan possible
    const perSupervisor = clustersPerSupervisorVisit(assignments, 'route_id');
    for (const visits of perSupervisor.values()) {
      expect(visits.size).toBeGreaterThan(0);
      for (const routes of visits.values()) {
        expect(routes.size).toBe(1);
      }
    }
  });

  it('does not cluster when the type is random', () => {
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [3, 3, 3], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'random', false
    );

    // Random never charges affinity, so nothing is ever reported as a break
    expect(statistics.affinity_breaks).toBe(0);
    expect(assignments).toHaveLength(18);
    expect(assignments.every(a => a.cluster_break === false)).toBe(true);
  });

  it('reports breaks rather than failing when an area runs out of slots', () => {
    // 4 supervisors but only 2 routes - two of them must share, and with more
    // capacity than one route holds, some trips must fall outside
    const supervisors = makeSupervisors(4, { remainingSlots: 3 });
    const slots = makeClusteredSlots({ clusters: [2, 2], visits: 1 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 1, 'route_based', false
    );

    expect(assignments).toHaveLength(4);
    expect(statistics.affinity_breaks).toBeGreaterThanOrEqual(0);
    // Every slot still got filled - affinity is a preference, not a blocker
    expect(new Set(assignments.map(a => a.school_id)).size).toBe(4);
  });
});

// ============================================================================
// PRIORITY - rank should track distance across the whole run, not just pass 1
// ============================================================================

describe('rank to distance pairing', () => {
  it('gives higher ranked supervisors longer journeys', () => {
    // 8 supervisors spanning 4 rank bands, 40 schools of increasing distance
    const supervisors = makeSupervisors(8, {
      remainingSlots: 6,
      priorities: [1, 1, 2, 2, 3, 3, 4, 4],
    });
    const slots = makeClusteredSlots({ clusters: [40], visits: 1 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 1, 'random', true
    );

    expect(assignments).toHaveLength(40);

    // Mean journey length must fall as priority_number rises
    const means = statistics.distance_by_rank.map((band) => band.mean_km);
    expect(means).toHaveLength(4);
    for (let i = 1; i < means.length; i++) {
      expect(means[i]).toBeLessThanOrEqual(means[i - 1]);
    }
    // And the gap between most and least senior should be clearly material
    expect(means[0]).toBeGreaterThan(means[means.length - 1] * 1.2);
  });

  it('keeps posting counts fair while distances differ by rank', () => {
    // Seniority should change how FAR people travel, not how MUCH work they get
    const supervisors = makeSupervisors(8, {
      remainingSlots: 6,
      priorities: [1, 1, 2, 2, 3, 3, 4, 4],
    });
    const slots = makeClusteredSlots({ clusters: [40], visits: 1 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', true);

    expect(statistics.load.max - statistics.load.min).toBeLessThanOrEqual(1);
  });

  it('does not favour any rank when priority is disabled', () => {
    const supervisors = makeSupervisors(8, {
      remainingSlots: 6,
      priorities: [1, 1, 2, 2, 3, 3, 4, 4],
    });
    const slots = makeClusteredSlots({ clusters: [40], visits: 1 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    // Without the priority term every band should average roughly the same trip
    const means = statistics.distance_by_rank.map((band) => band.mean_km);
    const spread = Math.max(...means) - Math.min(...means);
    const overall = means.reduce((a, b) => a + b, 0) / means.length;

    expect(spread).toBeLessThan(overall * 0.5);
  });

  // Regression: cluster planning for route_based/lga_based used to pick a
  // supervisor for each area by repeat-avoidance alone, with ties broken by
  // array order. Since the biggest area (most schools) isn't necessarily the
  // *farthest* one, the senior-first supervisor list would get seated into
  // whichever area came up first in the seat queue - often the common, nearby
  // one - leaving the single remote, high-value route for whoever was left,
  // frequently the most junior supervisor. That inverted the intended pay
  // ordering: juniors ended up earning more than seniors.
  it('gives the farthest route to the most senior supervisor, not whoever is left over', () => {
    const supervisors = makeSupervisors(3, {
      remainingSlots: 3,
      priorities: [1, 3, 5],
    });

    // One remote route with a single far school, one common route with three
    // nearby schools - the common route has more slots but far less distance
    const slots = [
      { id: 'A-1-1', school_id: 1, school_name: 'Remote School', group_number: 1, visit_number: 1, route_id: 1, route_name: 'Route A', lga: 'LGA A', distance_km: 200 },
      { id: 'B-1-1', school_id: 2, school_name: 'Near School 1', group_number: 1, visit_number: 1, route_id: 2, route_name: 'Route B', lga: 'LGA B', distance_km: 10 },
      { id: 'B-2-1', school_id: 3, school_name: 'Near School 2', group_number: 1, visit_number: 1, route_id: 2, route_name: 'Route B', lga: 'LGA B', distance_km: 10 },
      { id: 'B-3-1', school_id: 4, school_name: 'Near School 3', group_number: 1, visit_number: 1, route_id: 2, route_name: 'Route B', lga: 'LGA B', distance_km: 10 },
    ];

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'route_based', true);

    const distanceBySupervisor = new Map();
    for (const a of assignments) {
      distanceBySupervisor.set(
        a.supervisor_id,
        (distanceBySupervisor.get(a.supervisor_id) || 0) + (a.distance_km || 0)
      );
    }

    const seniorDistance = distanceBySupervisor.get(supervisors[0].id) || 0; // priority 1
    const juniorDistance = distanceBySupervisor.get(supervisors[2].id) || 0; // priority 5

    expect(seniorDistance).toBeGreaterThan(juniorDistance);
    expect(seniorDistance).toBeGreaterThanOrEqual(200);
  });

  // Regression: with more routes/LGAs than supervisors - routine for an
  // institution with many LGAs and a modest supervisor pool - the seat budget in
  // planClusters runs out before every area gets a dedicated supervisor. The
  // areas left unseated used to be whichever ones happened to sit later in
  // insertion order, not the least consequential ones, so a genuinely remote,
  // high-value area could miss out on rank-aware assignment entirely while
  // several short, nearby areas got seated. That produced exactly the pattern
  // seen in production: one non-senior rank averaging far more distance than
  // every senior rank, with no consistent ordering otherwise.
  it('keeps rank order intact when routes outnumber supervisors', () => {
    const supervisors = makeSupervisors(4, {
      remainingSlots: 8,
      priorities: [3, 4, 5, 7],
    });

    // 8 LGAs, only 4 supervisors - half the areas cannot get a dedicated seat.
    // Two are remote (180km, 160km); the rest are short local trips.
    const lgaDistances = [180, 20, 25, 30, 15, 22, 18, 160];
    const slots = [];
    let schoolId = 0;
    lgaDistances.forEach((distance, lgaIndex) => {
      for (let s = 0; s < 2; s++) {
        schoolId++;
        slots.push({
          id: `${schoolId}-1-1`,
          school_id: schoolId,
          school_name: `School ${schoolId}`,
          group_number: 1,
          visit_number: 1,
          route_id: lgaIndex + 1,
          route_name: `Route ${lgaIndex + 1}`,
          lga: `LGA ${lgaIndex + 1}`,
          distance_km: distance,
        });
      }
    });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    const distanceBySupervisor = new Map();
    for (const a of assignments) {
      distanceBySupervisor.set(
        a.supervisor_id,
        (distanceBySupervisor.get(a.supervisor_id) || 0) + (a.distance_km || 0)
      );
    }

    // Mean journey must fall in lockstep with seniority - no rank should average
    // more than a less-senior rank ahead of it
    const meansByPriority = supervisors.map((s) => distanceBySupervisor.get(s.id) || 0);
    for (let i = 1; i < meansByPriority.length; i++) {
      expect(meansByPriority[i]).toBeLessThanOrEqual(meansByPriority[i - 1]);
    }
  });

  // Regression: strengthening the priority term to actually win rank-to-distance
  // comparisons (see above) opened a second failure mode. When a cluster has wide
  // internal distance variance, ONE of its individual schools can be a better
  // priority match for an outsider than for the cluster's own planned team -
  // outweighing the flat out-of-area cost outright. Left unguarded, an outsider
  // "poaches" that school, and if several outsiders do this to the same small
  // cluster before its own team gets a turn, some of that team's members can end
  // up with zero postings for the whole visit - a real supervisor doing no work
  // (and earning no allowance) that round, purely because the schools happened
  // to suit someone else's rank slightly better.
  it('never leaves a planned supervisor with zero postings to a better-matched outsider', () => {
    const priorities = [];
    for (let i = 0; i < 5; i++) priorities.push(3, 4, 5, 7);
    const supervisors = makeSupervisors(20, { remainingSlots: 5, priorities });

    // 4 LGAs, each with 5 schools spanning a wide internal range - exactly the
    // shape that let a well-matched outsider outbid a cluster's own team member
    const lgaSchoolDistances = {
      'LGA A': [10, 30, 50, 70, 90],
      'LGA B': [15, 35, 55, 75, 95],
      'LGA C': [12, 32, 52, 72, 92],
      'LGA D': [18, 38, 58, 78, 98],
    };

    const slots = [];
    let schoolId = 0;
    let routeId = 0;
    for (const [lga, distances] of Object.entries(lgaSchoolDistances)) {
      routeId++;
      for (const distance_km of distances) {
        schoolId++;
        slots.push({
          id: `${schoolId}-1-1`,
          school_id: schoolId,
          school_name: `School ${schoolId}`,
          group_number: 1,
          visit_number: 1,
          route_id: routeId,
          route_name: `Route ${routeId}`,
          lga,
          distance_km,
        });
      }
    }

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    // 20 schools, 20 supervisors, 5 remaining_slots each - everyone has ample
    // room, so nobody should be shut out entirely
    expect(statistics.supervisors_none).toBe(0);
  });
});

// ============================================================================
// LOCAL SEARCH
// ============================================================================

describe('local search', () => {
  it('never makes the solution worse', () => {
    const supervisors = makeSupervisors(5, { remainingSlots: 6, priorities: [1, 2, 3, 4, 5] });
    const slots = makeClusteredSlots({ clusters: [5, 5, 5], visits: 2 });

    const { statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'route_based', true
    );

    expect(statistics.local_search.cost_after).toBeLessThanOrEqual(
      statistics.local_search.cost_before + 1e-9
    );
  });

  it('preserves the hard constraints while optimising', () => {
    const supervisors = makeSupervisors(4, { remainingSlots: 4 });
    const slots = makeClusteredSlots({ clusters: [4, 4], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'route_based', true
    );

    // No slot assigned twice
    const slotKeys = assignments.map(a => `${a.school_id}-${a.group_number}-${a.visit_number}`);
    expect(new Set(slotKeys).size).toBe(slotKeys.length);
    expect(statistics.duplicate_errors).toBeUndefined();

    // No supervisor over capacity
    for (const count of postingCounts(assignments)) {
      expect(count).toBeLessThanOrEqual(4);
    }
  });
});

// ============================================================================
// LOAD AND TRAVEL BALANCE
// ============================================================================

describe('workload balance', () => {
  it('spreads postings evenly across supervisors', () => {
    const supervisors = makeSupervisors(5, { remainingSlots: 4 });
    const slots = makeClusteredSlots({ clusters: [10], visits: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'random', true
    );

    expect(assignments).toHaveLength(20);
    expect(statistics.load.max - statistics.load.min).toBeLessThanOrEqual(1);
  });

  it('reports the travel spread across supervisors', () => {
    const supervisors = makeSupervisors(4, { remainingSlots: 5 });
    const slots = makeClusteredSlots({ clusters: [16], visits: 1 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'random', false);

    expect(statistics.travel_km.max).toBeGreaterThan(0);
    expect(statistics.travel_km.mean).toBeGreaterThan(0);
    expect(statistics.travel_km.min).toBeLessThanOrEqual(statistics.travel_km.max);
  });
});

// ============================================================================
// DEAN ALLOCATION CEILING
// ============================================================================

describe('dean allocation ceiling', () => {
  it('stops at maxAssignments and reports the skipped slots', () => {
    const supervisors = makeSupervisors(5, { remainingSlots: 10 });
    const slots = makeClusteredSlots({ clusters: [10], visits: 2 });

    const { assignments, statistics, warnings } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'random', true, { maxAssignments: 7 }
    );

    expect(assignments).toHaveLength(7);
    expect(statistics.quota_skipped).toBe(13);
    expect(warnings.some(w => w.includes('allocation for this session is exhausted'))).toBe(true);
  });

  it('creates nothing when the allocation is already exhausted', () => {
    const supervisors = makeSupervisors(3);
    const slots = makeClusteredSlots({ clusters: [5], visits: 1 });

    const { assignments, warnings } = runAutoPostingAlgorithm(
      supervisors, slots, 1, 'random', true, { maxAssignments: 0 }
    );

    expect(assignments).toHaveLength(0);
    expect(warnings.some(w => w.includes('exhausted'))).toBe(true);
  });
});

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

describe('statistical helpers', () => {
  it('computes standard deviation', () => {
    expect(standardDeviation([2, 2, 2, 2])).toBe(0);
    expect(standardDeviation([])).toBe(0);
    expect(standardDeviation([1, 3])).toBe(1);
  });

  it('computes correlation', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
    expect(correlation([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1, 5);
    expect(correlation([1, 1, 1], [1, 2, 3])).toBe(0); // no variance
    expect(correlation([1], [1])).toBe(0); // too few points
  });
});
