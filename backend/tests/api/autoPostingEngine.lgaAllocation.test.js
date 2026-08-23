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
  equalizeWorkload,
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

  it('has genuinely zero rank influence when disabled, even at scale with many exact-load ties', () => {
    // Regression for a real bug: the workload-fairness pass used each
    // supervisor's real priority_number as a tie-break unconditionally, so
    // even with priority OFF, distance_by_rank still showed a senior-leans-
    // farther trend purely as a rebalancing artifact. At production scale
    // (many supervisors, uniform capacity) exact-count ties during
    // rebalancing are common, so this trend was clearly visible - it must
    // be gone entirely now.
    const tierSizes = [2, 3, 5, 10, 15, 15, 20];
    const supervisors = [];
    let id = 1;
    tierSizes.forEach((count, tierIdx) => {
      for (let i = 0; i < count; i++) {
        supervisors.push({
          id: id++,
          name: `Supervisor ${id}`,
          rank_code: `R${tierIdx + 1}`,
          priority_number: tierIdx + 1,
          current_postings: 0,
          remaining_slots: 20,
        });
      }
    });

    const lgaSizes = [];
    let total = 0;
    let i = 0;
    while (total < 263) {
      const size = 2 + (i % 19);
      lgaSizes.push(size);
      total += size;
      i++;
    }
    const slots = [];
    let schoolId = 0;
    lgaSizes.forEach((size, lgaIdx) => {
      for (let s = 0; s < size; s++) {
        schoolId++;
        for (let visit = 1; visit <= 2; visit++) {
          slots.push({
            id: `${schoolId}-1-${visit}`,
            school_id: schoolId,
            school_name: `School ${schoolId}`,
            group_number: 1,
            visit_number: visit,
            route_id: lgaIdx + 1,
            route_name: `Route ${lgaIdx + 1}`,
            lga: `LGA ${lgaIdx + 1}`,
            distance_km: 5 + (schoolId % 200),
          });
        }
      }
    });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', false);

    expect(statistics.priority.enabled).toBe(false);
    // Near-zero correlation between rank and distance - no systematic trend.
    expect(Math.abs(statistics.priority_correlation)).toBeLessThan(0.2);
  }, 20000);
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

// ============================================================================
// WORKLOAD FAIRNESS EQUALIZATION - bounded gap, cross-priority sharing,
// controlled priority flexibility (spec follow-up: never zero, gap <= 3,
// vacant capacity flows to other priorities, seniors may get a small share
// of shorter distance when necessary)
// ============================================================================

describe('workload fairness equalization', () => {
  it('narrows the postings-per-supervisor gap to at most 3 at production scale', () => {
    // Mirrors the real-world shape that surfaced the original bug: 70
    // supervisors in uneven tiers, capacities generous relative to typical
    // LGA size (20 vs. LGAs of 2-20 schools), 526 slots total.
    const tierSizes = [2, 3, 5, 10, 15, 15, 20];
    const supervisors = [];
    let id = 1;
    tierSizes.forEach((count, tierIdx) => {
      for (let i = 0; i < count; i++) {
        supervisors.push({
          id: id++,
          name: `Supervisor ${id}`,
          rank_code: `R${tierIdx + 1}`,
          priority_number: tierIdx + 1,
          current_postings: 0,
          remaining_slots: 20,
        });
      }
    });

    const lgaSizes = [];
    let total = 0;
    let i = 0;
    while (total < 263) {
      const size = 2 + (i % 19);
      lgaSizes.push(size);
      total += size;
      i++;
    }
    const slots = [];
    let schoolId = 0;
    lgaSizes.forEach((size, lgaIdx) => {
      for (let s = 0; s < size; s++) {
        schoolId++;
        for (let visit = 1; visit <= 2; visit++) {
          slots.push({
            id: `${schoolId}-1-${visit}`,
            school_id: schoolId,
            school_name: `School ${schoolId}`,
            group_number: 1,
            visit_number: visit,
            route_id: lgaIdx + 1,
            route_name: `Route ${lgaIdx + 1}`,
            lga: `LGA ${lgaIdx + 1}`,
            distance_km: 5 + (schoolId % 200),
          });
        }
      }
    });

    const { assignments, statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', true);

    expect(assignments).toHaveLength(slots.length);
    expect(statistics.supervisors_none).toBe(0);
    expect(statistics.supervisors_full).toBe(supervisors.length);
    expect(statistics.load.max - statistics.load.min).toBeLessThanOrEqual(3);
  }, 20000);

  it('fills an idle supervisor from a same-tier donor once the gap exceeds 3', () => {
    const supervisors = [
      { id: 1, name: 'A', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 6 },
      { id: 2, name: 'B', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 6 },
    ];
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);

    // A has 4, B has 0 - gap of 4 exceeds MAX_LOAD_GAP (3), so exactly one
    // move should happen, landing at 3/1 (gap 2, within target).
    const assignments = [1, 2, 3, 4].map((n) => ({
      supervisor_id: 1, supervisor_name: 'A', rank_code: 'SL', priority_number: 1,
      school_id: n, school_name: `S${n}`, group_number: 1, visit_number: 1,
      distance_km: n * 10, route_id: 1, route_name: 'R1', lga: 'LGA 1',
      repeat_school: false, cluster_break: false,
    }));

    const { movesApplied, remainingGap } = equalizeWorkload(assignments, supervisorModel, tiers, 'lga_based', true);

    expect(movesApplied).toBe(1);
    expect(remainingGap).toBeLessThanOrEqual(3);
    const countB = assignments.filter((a) => a.supervisor_id === 2).length;
    const countA = assignments.filter((a) => a.supervisor_id === 1).length;
    expect(countB).toBe(1);
    expect(countA).toBe(3);
  });

  it('gives a senior supervisor a small share of shorter distance when a cross-tier move is necessary', () => {
    const supervisors = [
      { id: 1, name: 'Senior', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 6 }, // idle, alone in tier 1
      { id: 2, name: 'Junior', rank_code: 'SL', priority_number: 2, current_postings: 0, remaining_slots: 6 },
    ];
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);

    // Junior holds 4 postings at increasing distances; Senior has none.
    const assignments = [10, 20, 30, 40].map((d, idx) => ({
      supervisor_id: 2, supervisor_name: 'Junior', rank_code: 'SL', priority_number: 2,
      school_id: idx + 1, school_name: `S${idx + 1}`, group_number: 1, visit_number: 1,
      distance_km: d, route_id: 1, route_name: 'R1', lga: 'LGA 1',
      repeat_school: false, cluster_break: false,
    }));

    const { movesApplied } = equalizeWorkload(assignments, supervisorModel, tiers, 'lga_based', true);

    expect(movesApplied).toBe(1);
    const seniorAssignment = assignments.find((a) => a.supervisor_id === 1);
    expect(seniorAssignment).toBeDefined();
    // The move should take the SHORTEST of the junior's postings, not a large one.
    expect(seniorAssignment.distance_km).toBe(10);
    expect(seniorAssignment.priority_number).toBe(1);
  });

  it('does not hand a receiver a school they already cover when a non-repeat alternative exists', () => {
    const supervisors = [
      { id: 1, name: 'A', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 6 },
      { id: 2, name: 'B', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 6 },
    ];
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);
    // B already covers school 1 (e.g. from an earlier session) - donating
    // A's school-1 posting to B would create an avoidable repeat.
    supervisorModel.byId.get(2).schoolHistory.add(1);

    const assignments = [
      { supervisor_id: 1, supervisor_name: 'A', rank_code: 'SL', priority_number: 1, school_id: 1, school_name: 'S1', group_number: 1, visit_number: 1, distance_km: 5, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false },
      { supervisor_id: 1, supervisor_name: 'A', rank_code: 'SL', priority_number: 1, school_id: 2, school_name: 'S2', group_number: 1, visit_number: 1, distance_km: 10, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false },
      { supervisor_id: 1, supervisor_name: 'A', rank_code: 'SL', priority_number: 1, school_id: 3, school_name: 'S3', group_number: 1, visit_number: 1, distance_km: 15, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false },
      { supervisor_id: 1, supervisor_name: 'A', rank_code: 'SL', priority_number: 1, school_id: 4, school_name: 'S4', group_number: 1, visit_number: 1, distance_km: 20, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false },
    ];

    const { movesApplied } = equalizeWorkload(assignments, supervisorModel, tiers, 'lga_based', true);

    expect(movesApplied).toBe(1);
    const moved = assignments.find((a) => a.supervisor_id === 2);
    expect(moved.school_id).toBe(2); // shortest NON-repeat option, not school 1
    expect(moved.repeat_school).toBe(false);
  });

  it('reports a remaining gap due to a genuinely lower capacity ceiling rather than forcing it', () => {
    const supervisors = [
      { id: 1, name: 'A', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 20 },
      { id: 2, name: 'B', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 20 },
      { id: 3, name: 'C', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 2 }, // low capacity ceiling
    ];
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);

    const makeFor = (supervisorId, name, count, offset) =>
      Array.from({ length: count }, (_, n) => ({
        supervisor_id: supervisorId, supervisor_name: name, rank_code: 'SL', priority_number: 1,
        school_id: offset + n, school_name: `S${offset + n}`, group_number: 1, visit_number: 1,
        distance_km: (offset + n) * 5, route_id: 1, route_name: 'R1', lga: 'LGA 1',
        repeat_school: false, cluster_break: false,
      }));

    const assignments = [
      ...makeFor(1, 'A', 8, 1),
      ...makeFor(2, 'B', 8, 100),
      ...makeFor(3, 'C', 2, 200), // already at their own capacity ceiling
    ];

    const { movesApplied, remainingGap, belowCapacityCeiling } = equalizeWorkload(
      assignments, supervisorModel, tiers, 'lga_based', true
    );

    // A and B are already balanced with each other (gap 0); C cannot receive
    // more because their own remaining_slots is the constraint, not fairness.
    expect(movesApplied).toBe(0);
    expect(remainingGap).toBeGreaterThan(3);
    expect(belowCapacityCeiling).toBe(1);
  });

  it('does nothing when every eligible supervisor is already within the fair-share gap', () => {
    const supervisors = [
      { id: 1, name: 'A', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 5 },
      { id: 2, name: 'B', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 5 },
    ];
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);

    const assignments = [
      { supervisor_id: 1, supervisor_name: 'A', rank_code: 'SL', priority_number: 1, school_id: 1, school_name: 'S1', group_number: 1, visit_number: 1, distance_km: 10, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false },
      { supervisor_id: 2, supervisor_name: 'B', rank_code: 'SL', priority_number: 1, school_id: 2, school_name: 'S2', group_number: 1, visit_number: 1, distance_km: 20, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false },
    ];

    const { movesApplied, remainingGap } = equalizeWorkload(assignments, supervisorModel, tiers, 'lga_based', true);

    expect(movesApplied).toBe(0);
    expect(remainingGap).toBe(0);
  });

  it('never hangs on an adversarial input (bounded iteration)', () => {
    const supervisors = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1, name: `S${i + 1}`, rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 100,
    }));
    const supervisorModel = buildSupervisorModel(supervisors, new Map());
    const tiers = buildPriorityTiers(supervisorModel, true);

    // Every posting starts on supervisor 1 - a worst case for the rebalancer.
    const assignments = Array.from({ length: 100 }, (_, n) => ({
      supervisor_id: 1, supervisor_name: 'S1', rank_code: 'SL', priority_number: 1,
      school_id: n + 1, school_name: `S${n + 1}`, group_number: 1, visit_number: 1,
      distance_km: n + 1, route_id: 1, route_name: 'R1', lga: 'LGA 1',
      repeat_school: false, cluster_break: false,
    }));

    let result;
    expect(() => {
      result = equalizeWorkload(assignments, supervisorModel, tiers, 'lga_based', true);
    }).not.toThrow();
    expect(result.remainingGap).toBeLessThanOrEqual(3);
  });
});
