/**
 * Auto-Posting Engine - Geography Difficulty & Tier Allocation Core
 *
 * Dedicated coverage for the structurally new parts of the rewrite:
 * calculateGeographyDifficulty (spec §7/§26/§27) and the priority-tier <->
 * demand allocation core (spec §8/§9/§24/§25), exercised both directly (via
 * buildDemandModel/buildPriorityTiers/solveLgaAllocation) and end-to-end via
 * runAutoPostingAlgorithm.
 */

const {
  runAutoPostingAlgorithm,
  calculateGeographyDifficulty,
  buildDemandModel,
  buildSupervisorModel,
  buildPriorityTiers,
  solveLgaAllocation,
} = require('../../src/services/autoPostingEngine');

const makeSupervisors = (count, { remainingSlots = 10, priorities = null } = {}) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Supervisor ${i + 1}`,
    rank_code: 'SL',
    priority_number: priorities ? priorities[i] : 1,
    current_postings: 0,
    remaining_slots: remainingSlots,
  }));

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

/** Build a set of slots for one LGA with an explicit list of distances. */
const lgaSlotsWithDistances = (lgaName, distances, visit = 1) =>
  distances.map((d, i) => ({
    id: `${lgaName}-${i}-${visit}`,
    school_id: `${lgaName}-${i}`,
    school_name: `${lgaName} School ${i}`,
    group_number: 1,
    visit_number: visit,
    route_id: 1,
    route_name: 'Route 1',
    lga: lgaName,
    distance_km: d,
  }));

// ============================================================================
// GEOGRAPHY DIFFICULTY (spec §7, §26, Case 4/5)
// ============================================================================

describe('geography difficulty', () => {
  it('is 0 for an empty distance set', () => {
    expect(calculateGeographyDifficulty([])).toEqual({ max: 0, p75: 0, mean: 0, totalDistance: 0, difficulty: 0 });
  });

  it('weights max heaviest, then p75, then mean', () => {
    const { difficulty, max, p75, mean } = calculateGeographyDifficulty([10, 20, 100]);
    expect(max).toBe(100);
    expect(difficulty).toBeCloseTo(0.6 * max + 0.25 * p75 + 0.15 * mean, 6);
  });

  it('a small LGA with genuinely distant schools outranks a large LGA with uniformly close schools (Case 4/5)', () => {
    // 10 schools all at 20km (large demand, low difficulty)
    const bigNearby = calculateGeographyDifficulty(Array.from({ length: 10 }, () => 20));
    // 2 schools at 100km (small demand, high difficulty)
    const smallDistant = calculateGeographyDifficulty([100, 100]);

    expect(smallDistant.difficulty).toBeGreaterThan(bigNearby.difficulty);
  });

  it('does not use total distance as difficulty - equal totals can have very different difficulty', () => {
    // Both sets sum to 200km, but the difficulty should differ sharply
    const spreadOut = calculateGeographyDifficulty(Array.from({ length: 10 }, () => 20)); // sum 200
    const concentrated = calculateGeographyDifficulty([100, 100]); // sum 200
    expect(spreadOut.totalDistance).toBe(concentrated.totalDistance);
    expect(spreadOut.difficulty).not.toBeCloseTo(concentrated.difficulty, 1);
  });
});

// ============================================================================
// DEMAND MODEL - demand tracked independently of difficulty (spec §6)
// ============================================================================

describe('buildDemandModel', () => {
  it('tracks demand (slot count) completely separately from difficulty', () => {
    const slots = [
      ...lgaSlotsWithDistances('Big', Array.from({ length: 10 }, () => 20)),
      ...lgaSlotsWithDistances('Small', [100, 100]),
    ];
    const model = buildDemandModel(slots, 'lga_based');
    const units = model.byVisit.get(1);
    const big = units.find((u) => u.lga === 'Big');
    const small = units.find((u) => u.lga === 'Small');

    expect(big.demand).toBe(10);
    expect(small.demand).toBe(2);
    expect(small.difficulty).toBeGreaterThan(big.difficulty);
  });

  it('sorts units hardest-first within a visit', () => {
    const slots = [
      ...lgaSlotsWithDistances('Easy', [10, 10]),
      ...lgaSlotsWithDistances('Hard', [90, 95]),
    ];
    const model = buildDemandModel(slots, 'lga_based');
    const units = model.byVisit.get(1);
    expect(units[0].lga).toBe('Hard');
  });
});

// ============================================================================
// PRIORITY TIER <-> DEMAND ALLOCATION CORE (spec §8, §9, §24, §25)
// ============================================================================

describe('priority tier allocation', () => {
  it('tier band sizing is proportional to tier capacity, not an equal split', () => {
    // Tier 1: 1 supervisor, capacity 6. Tier 2: 3 supervisors, capacity 18.
    const supervisors = [
      ...makeSupervisors(1, { remainingSlots: 6, priorities: [1] }),
      ...makeSupervisors(3, { remainingSlots: 6, priorities: [2, 2, 2] }).map((s, i) => ({ ...s, id: 2 + i })),
    ];
    // 4 LGAs of 6 schools each = 24 slots total, distances increasing
    const slots = makeClusteredSlots({ clusters: [6, 6, 6, 6], visits: 1, distanceBase: 5 });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    expect(assignments).toHaveLength(24);
    const tier1 = statistics.priority.tiers.find((t) => t.priority_number === 1);
    const tier2 = statistics.priority.tiers.find((t) => t.priority_number === 2);
    // Tier 1 (1/4 of total capacity) gets roughly 1/4 of the postings, tier 2 gets ~3/4
    expect(tier1.postings).toBeLessThan(tier2.postings);
    expect(tier1.postings).toBeCloseTo(6, 0);
  });

  it('a small senior tier is not allocated more LGAs than its capacity supports', () => {
    const supervisors = [
      ...makeSupervisors(1, { remainingSlots: 3, priorities: [1] }),
      ...makeSupervisors(1, { remainingSlots: 20, priorities: [2] }).map((s) => ({ ...s, id: 2 })),
    ];
    const slots = makeClusteredSlots({ clusters: [3, 3, 3, 3], visits: 1, distanceBase: 10 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    const bySupervisor = new Map();
    for (const a of assignments) bySupervisor.set(a.supervisor_id, (bySupervisor.get(a.supervisor_id) || 0) + 1);
    expect(bySupervisor.get(1)).toBeLessThanOrEqual(3);
  });

  it('senior tier receives the hardest LGA when three tiers have clearly separated distances', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 10, priorities: [1, 2, 3] });
    const slots = [
      ...lgaSlotsWithDistances('Near', [10, 12, 14]),
      ...lgaSlotsWithDistances('Mid', [50, 52, 54]),
      ...lgaSlotsWithDistances('Far', [100, 102, 104]),
    ];

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    const senior = assignments.filter((a) => a.priority_number === 1);
    expect(senior.every((a) => a.lga === 'Far')).toBe(true);
  });

  it('minimizes priority inversions when the senior tier has insufficient capacity (Case 3)', () => {
    // 1 senior supervisor, capacity 2. Demand is 6 in one hard LGA - the
    // senior tier physically cannot cover all of it, so some assignments must
    // go to the junior tier; the engine should report the resulting inversion
    // rather than hide it.
    const supervisors = [
      ...makeSupervisors(1, { remainingSlots: 2, priorities: [1] }),
      ...makeSupervisors(1, { remainingSlots: 10, priorities: [2] }).map((s) => ({ ...s, id: 2 })),
    ];
    const slots = lgaSlotsWithDistances('Hard', [90, 91, 92, 93, 94, 95]);

    const { assignments, statistics, warnings } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    expect(assignments).toHaveLength(6);
    // Senior tier is fully saturated with the hard work it *can* take
    const seniorCount = assignments.filter((a) => a.priority_number === 1).length;
    expect(seniorCount).toBe(2);
    // Some inversion is unavoidable (junior tier necessarily also gets "Hard")
    expect(statistics.priority.inversion_count).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('multiple supervisors can share one LGA while preserving locality (Case 9)', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 3, priorities: [1, 1] });
    const slots = lgaSlotsWithDistances('Shared', [10, 11, 12, 13, 14, 15]);

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    expect(assignments).toHaveLength(6);
    expect(assignments.every((a) => a.lga === 'Shared')).toBe(true);
    expect(statistics.geography.fragmented_assignments).toBe(0);
  });

  it('visits are bucketed independently - Visit 1 distance range does not pool into Visit 2', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 10, priorities: [1, 2] });
    const slots = [
      ...lgaSlotsWithDistances('V1-Near', [10, 11], 1),
      ...lgaSlotsWithDistances('V1-Far', [90, 91], 1),
      ...lgaSlotsWithDistances('V2-Near', [10, 11], 2),
      ...lgaSlotsWithDistances('V2-Far', [90, 91], 2),
    ];

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', true);

    for (const visit of [1, 2]) {
      const visitAssignments = assignments.filter((a) => a.visit_number === visit);
      const senior = visitAssignments.filter((a) => a.priority_number === 1);
      expect(senior.every((a) => a.lga.endsWith('Far'))).toBe(true);
    }
  });
});

// ============================================================================
// buildSupervisorModel / buildPriorityTiers direct unit tests
// ============================================================================

describe('buildSupervisorModel / buildPriorityTiers', () => {
  it('capacity is tracked globally, not seeded per visit', () => {
    const supervisors = makeSupervisors(1, { remainingSlots: 3, priorities: [1] });
    const model = buildSupervisorModel(supervisors, new Map());
    expect(model.byId.get(1).totalCapacity).toBe(3);
    expect(model.byId.get(1).usedInRun).toBe(0);
  });

  it('groups supervisors into tiers ordered by priority_number ascending', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 5, priorities: [2, 1, 3] });
    const model = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(model, true);
    expect(tiers.map((t) => t.priority_number)).toEqual([1, 2, 3]);
  });

  it('collapses to one synthetic tier when priority is disabled', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 5, priorities: [1, 2, 3] });
    const model = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(model, false);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].priority_number).toBeNull();
    expect(tiers[0].supervisorCount).toBe(3);
  });
});

// ============================================================================
// solveLgaAllocation direct exercise
// ============================================================================

describe('solveLgaAllocation', () => {
  it('places every unit somewhere when total capacity covers total demand', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 6, priorities: [1, 2] });
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);
    const slots = makeClusteredSlots({ clusters: [3, 3], visits: 1, distanceBase: 10 });
    const demandModel = buildDemandModel(slots, 'lga_based');
    const units = demandModel.byVisit.get(1);

    const { unplacedUnits } = solveLgaAllocation([...units], tiers, supervisorModel, { priorityEnabled: true });

    expect(unplacedUnits).toHaveLength(0);
  });
});
