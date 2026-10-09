/**
 * Auto-Posting Engine - visit spread
 *
 * A supervisor's postings must be mixed across the visits a run covers, under
 * every posting distribution type. Regression cover for supervisors who ended
 * up with e.g. six postings that were all 1st visit.
 */

const {
  runAutoPostingAlgorithm,
  buildSupervisorModel,
  buildPriorityTiers,
  equalizeWorkload,
  scoreCandidate,
  compareObjectives,
} = require('../../src/services/autoPostingEngine');
const { assertValidSolution } = require('../helpers/autoPostingAssertions');

const POSTING_TYPES = ['random', 'lga_based', 'route_based'];

const makeScenario = ({ supervisorCount, capacity, areas, schoolsPerArea, groups, visits, priorities = null }) => {
  const supervisors = Array.from({ length: supervisorCount }, (_, i) => ({
    id: i + 1,
    name: `Supervisor ${String(i + 1).padStart(3, '0')}`,
    rank_code: 'SL',
    priority_number: priorities ? priorities[i % priorities.length] : 1,
    current_postings: 0,
    remaining_slots: capacity,
  }));

  const slots = [];
  let schoolId = 0;
  for (let area = 1; area <= areas; area++) {
    for (let s = 0; s < schoolsPerArea; s++) {
      schoolId++;
      for (let group = 1; group <= groups; group++) {
        for (let visit = 1; visit <= visits; visit++) {
          slots.push({
            id: `${schoolId}-${group}-${visit}`,
            school_id: schoolId,
            school_name: `School ${String(schoolId).padStart(3, '0')}`,
            group_number: group,
            visit_number: visit,
            route_id: area,
            route_name: `Route ${area}`,
            lga: `LGA ${area}`,
            distance_km: 5 + ((schoolId * 37) % 90),
          });
        }
      }
    }
  }

  return { supervisors, slots };
};

/** supervisor_id -> [count for visit 1, count for visit 2, ...] */
const visitCountsBySupervisor = (assignments, visits) => {
  const counts = new Map();
  for (const a of assignments) {
    if (!counts.has(a.supervisor_id)) counts.set(a.supervisor_id, new Array(visits).fill(0));
    counts.get(a.supervisor_id)[a.visit_number - 1]++;
  }
  return counts;
};

const SCENARIOS = [
  ['two groups per school, three visits', { supervisorCount: 40, capacity: 6, areas: 8, schoolsPerArea: 5, groups: 2, visits: 3 }],
  // 30 supervisors over 3 visits: a plain round-robin phase-locks every supervisor to one visit
  ['supervisor count divisible by the visit count', { supervisorCount: 30, capacity: 10, areas: 6, schoolsPerArea: 6, groups: 1, visits: 3 }],
  ['three priority tiers', { supervisorCount: 45, capacity: 8, areas: 10, schoolsPerArea: 4, groups: 2, visits: 3, priorities: [1, 2, 3] }],
  ['two visits', { supervisorCount: 25, capacity: 12, areas: 5, schoolsPerArea: 7, groups: 2, visits: 2 }],
];

describe('Auto-posting engine - visit spread per supervisor', () => {
  describe.each(SCENARIOS)('%s', (_label, config) => {
    describe.each(POSTING_TYPES)('%s', (postingType) => {
      it.each([false, true])('mixes each supervisor across the visits (priority=%s)', (priorityEnabled) => {
        const { supervisors, slots } = makeScenario(config);
        const result = runAutoPostingAlgorithm(supervisors, slots, config.visits, postingType, priorityEnabled, {});

        assertValidSolution(result.assignments, supervisors, slots, config.visits, Infinity, result.statistics);
        expect(result.assignments).toHaveLength(slots.length);

        const counts = visitCountsBySupervisor(result.assignments, config.visits);
        for (const [supervisorId, perVisit] of counts) {
          const total = perVisit.reduce((a, b) => a + b, 0);
          const visitsCovered = perVisit.filter((c) => c > 0).length;

          // Never the whole load on one visit, and enough postings means every visit is covered
          expect({ supervisorId, perVisit, covered: visitsCovered }).toEqual({
            supervisorId,
            perVisit,
            covered: Math.min(total, config.visits),
          });
          // ...and the load is even across them, not 4/1/1. Clustered postings keep
          // a supervisor in one area per visit, so area sizes allow one more of slack.
          expect(Math.max(...perVisit) - Math.min(...perVisit)).toBeLessThanOrEqual(postingType === 'random' ? 1 : 2);
        }
      });
    });
  });

  it.each(POSTING_TYPES)('leaves nobody on a single visit with uneven areas and small senior tiers (%s)', (postingType) => {
    // 70 supervisors in 7 tiers (the top one has just 2 members) over 28 areas of 2-20 schools
    const supervisors = [];
    [2, 3, 5, 10, 15, 15, 20].forEach((count, tierIndex) => {
      for (let i = 0; i < count; i++) {
        const id = supervisors.length + 1;
        supervisors.push({
          id,
          name: `Supervisor ${String(id).padStart(3, '0')}`,
          rank_code: `R${tierIndex + 1}`,
          priority_number: tierIndex + 1,
          current_postings: 0,
          remaining_slots: 20,
        });
      }
    });

    const slots = [];
    let schoolId = 0;
    for (let area = 0; schoolId < 263; area++) {
      for (let s = 0; s < 2 + (area % 19); s++) {
        schoolId++;
        for (let visit = 1; visit <= 2; visit++) {
          slots.push({
            id: `${schoolId}-1-${visit}`,
            school_id: schoolId,
            school_name: `School ${String(schoolId).padStart(3, '0')}`,
            group_number: 1,
            visit_number: visit,
            route_id: area + 1,
            route_name: `Route ${area + 1}`,
            lga: `LGA ${area + 1}`,
            distance_km: 5 + (schoolId % 200),
          });
        }
      }
    }

    for (const priorityEnabled of [false, true]) {
      const result = runAutoPostingAlgorithm(supervisors, slots, 2, postingType, priorityEnabled, {});
      assertValidSolution(result.assignments, supervisors, slots, 2, Infinity, result.statistics);

      const counts = visitCountsBySupervisor(result.assignments, 2);
      expect(counts.size).toBe(supervisors.length);
      for (const perVisit of counts.values()) {
        expect(Math.min(...perVisit)).toBeGreaterThan(0);
      }
    }
  }, 30000);

  it('keeps Preview and Execute in agreement (same input, same output)', () => {
    const config = SCENARIOS[0][1];
    const first = makeScenario(config);
    const second = makeScenario(config);
    const a = runAutoPostingAlgorithm(first.supervisors, first.slots, config.visits, 'lga_based', true, {});
    const b = runAutoPostingAlgorithm(second.supervisors, second.slots, config.visits, 'lga_based', true, {});
    expect(a.assignments).toEqual(b.assignments);
  });

  describe('reported visit spread', () => {
    it('reports a clean mix and each supervisor\'s postings per visit', () => {
      const config = SCENARIOS[0][1];
      const { supervisors, slots } = makeScenario(config);
      const { statistics, warnings } = runAutoPostingAlgorithm(supervisors, slots, config.visits, 'lga_based', false, {});

      expect(statistics.visit_spread).toEqual({ supervisors_on_single_visit: 0, supervisors_uneven: 0, max_gap: 0 });
      expect(statistics.assignments_by_supervisor[1].by_visit).toEqual({ visit_1: 2, visit_2: 2, visit_3: 2 });
      expect(warnings.join(' ')).not.toMatch(/only one visit/);
    });

    it('warns when supply forces supervisors onto one visit', () => {
      // Visit 1 has ten open slots, visit 2 a single one: nine supervisors can only get visit 1
      const { supervisors, slots } = makeScenario({ supervisorCount: 5, capacity: 4, areas: 2, schoolsPerArea: 5, groups: 1, visits: 2 });
      const lopsided = slots.filter((s) => s.visit_number === 1 || s.school_id === 1);
      const { statistics, warnings } = runAutoPostingAlgorithm(supervisors, lopsided, 2, 'random', false, {});

      expect(statistics.visit_spread.supervisors_on_single_visit).toBeGreaterThan(0);
      expect(warnings.join(' ')).toMatch(/supervisor\(s\) have all their postings on only one visit/);
    });

    it('reports an empty spread when there is nothing to assign', () => {
      const { supervisors } = makeScenario(SCENARIOS[0][1]);
      const { statistics } = runAutoPostingAlgorithm(supervisors, [], 3, 'random', false, {});
      expect(statistics.visit_spread).toEqual({ supervisors_on_single_visit: 0, supervisors_uneven: 0, max_gap: 0 });
    });

    it('says nothing about spread on a single-visit run', () => {
      const { supervisors, slots } = makeScenario({ supervisorCount: 5, capacity: 4, areas: 2, schoolsPerArea: 5, groups: 1, visits: 3 });
      const { statistics, warnings } = runAutoPostingAlgorithm(supervisors, slots, 3, 'random', false, { visitNumbers: [2] });

      expect(statistics.visit_spread.supervisors_on_single_visit).toBe(0);
      expect(warnings.join(' ')).not.toMatch(/only one visit/);
    });
  });

  it('leaves a single-visit run untouched', () => {
    const { supervisors, slots } = makeScenario({ supervisorCount: 10, capacity: 6, areas: 4, schoolsPerArea: 5, groups: 1, visits: 3 });
    const result = runAutoPostingAlgorithm(supervisors, slots, 3, 'lga_based', false, { visitNumbers: [2] });

    expect(result.assignments).toHaveLength(20);
    expect(result.assignments.every((a) => a.visit_number === 2)).toBe(true);
  });

  describe('as part of the objective', () => {
    const posting = (supervisorId, schoolId, visit) => ({
      supervisor_id: supervisorId, supervisor_name: `S${supervisorId}`, rank_code: 'SL', priority_number: 1,
      school_id: schoolId, school_name: `School ${schoolId}`, group_number: 1, visit_number: visit,
      distance_km: 10, route_id: 1, route_name: 'R1', lga: 'LGA 1', repeat_school: false, cluster_break: false,
    });
    const supervisors = [1, 2].map((id) => ({ id, name: `S${id}`, rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 6 }));
    const slots = [1, 2, 3, 4].flatMap((school) => [1, 2].map((visit) => ({ school_id: school, group_number: 1, visit_number: visit })));
    const score = (assignments) => {
      const model = buildSupervisorModel(supervisors, new Map());
      return scoreCandidate(assignments, {
        tiers: buildPriorityTiers(model, false), eligibleSlotCount: assignments.length, supervisors: model.byId,
        maxDistanceNorm: 1, slots, visitFilter: () => true, maxAssignments: Infinity, postingType: 'random',
      });
    };

    const mixed = [posting(1, 1, 1), posting(1, 2, 1), posting(1, 3, 2), posting(1, 4, 2), posting(2, 3, 1), posting(2, 4, 1), posting(2, 1, 2), posting(2, 2, 2)];
    const piled = [posting(1, 1, 1), posting(1, 2, 1), posting(1, 3, 1), posting(1, 4, 1), posting(2, 1, 2), posting(2, 2, 2), posting(2, 3, 2), posting(2, 4, 2)];

    it('scores a mixed plan as clean and a piled-up plan as single-visit and uneven', () => {
      expect(score(mixed)).toMatchObject({ singleVisitCount: 0, visitImbalance: 0 });
      expect(score(piled)).toMatchObject({ singleVisitCount: 2, visitImbalance: 6 });
    });

    it('ranks a single-visit pile-up above repeat avoidance but below area cohesion', () => {
      const base = score(mixed);
      expect(compareObjectives({ ...base, singleVisitCount: 0, repeatCount: 5 }, { ...base, singleVisitCount: 1, repeatCount: 0 })).toBeLessThan(0);
      expect(compareObjectives({ ...base, lgaFragmentation: 0, singleVisitCount: 5 }, { ...base, lgaFragmentation: 1, singleVisitCount: 0 })).toBeLessThan(0);
    });

    it('ranks mere unevenness below repeat avoidance but above workload balance', () => {
      const base = score(mixed);
      expect(compareObjectives({ ...base, repeatCount: 0, visitImbalance: 5 }, { ...base, repeatCount: 1, visitImbalance: 0 })).toBeLessThan(0);
      expect(compareObjectives({ ...base, visitImbalance: 0, workloadImbalance: 5 }, { ...base, visitImbalance: 1, workloadImbalance: 0 })).toBeLessThan(0);
    });
  });

  describe('workload pass', () => {
    it('hands over a posting from the receiver\'s own area rather than a nearer one elsewhere', () => {
      const supervisors = [
        { id: 1, name: 'Busy', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 8 },
        { id: 2, name: 'Light', rank_code: 'SL', priority_number: 1, current_postings: 0, remaining_slots: 8 },
      ];
      const model = buildSupervisorModel(supervisors, new Map());
      const tiers = buildPriorityTiers(model, false);
      const posting = (supervisorId, schoolId, visit, lga, distance) => ({
        supervisor_id: supervisorId, supervisor_name: supervisorId === 1 ? 'Busy' : 'Light', rank_code: 'SL', priority_number: 1,
        school_id: schoolId, school_name: `School ${schoolId}`, group_number: 1, visit_number: visit,
        distance_km: distance, route_id: 1, route_name: 'R1', lga, repeat_school: false, cluster_break: false,
      });

      // Busy: visit 1 in LGA B (near), visit 2 in LGA A (far). Light: visit 1 in LGA C, visit 2 in LGA A.
      const assignments = [
        posting(1, 1, 1, 'LGA B', 10), posting(1, 2, 1, 'LGA B', 10), posting(1, 3, 1, 'LGA B', 10),
        posting(1, 4, 2, 'LGA A', 50), posting(1, 5, 2, 'LGA A', 50), posting(1, 6, 2, 'LGA A', 50),
        posting(2, 7, 1, 'LGA C', 20), posting(2, 8, 2, 'LGA A', 50),
      ];

      const { movesApplied } = equalizeWorkload(assignments, model, tiers, 'lga_based', true, false);

      expect(movesApplied).toBe(1);
      const lightAreas = (visit) => new Set(assignments.filter((a) => a.supervisor_id === 2 && a.visit_number === visit).map((a) => a.lga));
      expect(lightAreas(1).size).toBe(1);
      expect(lightAreas(2).size).toBe(1);
      expect(assignments.filter((a) => a.cluster_break)).toHaveLength(0);
    });
  });

  describe('reshuffle', () => {
    const config = SCENARIOS[0][1];
    const run = (shuffleSalt) => {
      const { supervisors, slots } = makeScenario(config);
      return runAutoPostingAlgorithm(supervisors, slots, config.visits, 'random', false, { shuffleSalt });
    };
    const whoGoesWhere = (result) => result.assignments.map((a) => `${a.supervisor_id}-${a.school_id}-${a.group_number}-${a.visit_number}`).sort();

    it('draws a different plan for a different salt', () => {
      expect(whoGoesWhere(run(1))).not.toEqual(whoGoesWhere(run(0)));
    });

    it('repeats the same plan for the same salt, so Preview and Execute agree', () => {
      expect(whoGoesWhere(run(3))).toEqual(whoGoesWhere(run(3)));
    });

    it('treats no salt as salt 0', () => {
      expect(whoGoesWhere(run(undefined))).toEqual(whoGoesWhere(run(0)));
    });
  });

  describe('more areas than supervisors, one of them dominant', () => {
    // Shaped like a real session: 86 LGAs a visit for 51 supervisors, one LGA
    // holding 236 of the 547 slots and dozens holding one or two.
    const AREA_SIZES = [236, 31, 30, 19, 19, 13, 12, 11, 10, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4, 3, 3, 3, 3, 3,
      ...new Array(18).fill(2), ...new Array(40).fill(1)];
    const VISITS = 3;

    const build = () => {
      const supervisors = Array.from({ length: 51 }, (_, i) => ({
        id: i + 1,
        name: `Supervisor ${String(i + 1).padStart(3, '0')}`,
        rank_code: 'SL',
        priority_number: 1 + (i % 4),
        current_postings: 0,
        remaining_slots: 100,
      }));
      const slots = [];
      let schoolId = 0;
      AREA_SIZES.forEach((size, area) => {
        for (let s = 0; s < size; s++) {
          schoolId++;
          for (let visit = 1; visit <= VISITS; visit++) {
            slots.push({
              id: `${schoolId}-1-${visit}`,
              school_id: schoolId,
              school_name: `School ${String(schoolId).padStart(4, '0')}`,
              group_number: 1,
              visit_number: visit,
              route_id: 1,
              route_name: 'Route 1',
              lga: `LGA ${String(area + 1).padStart(2, '0')}`,
              distance_km: 5 + ((area * 13 + s) % 120),
            });
          }
        }
      });
      return { supervisors, slots };
    };

    it.each([false, true])('still mixes every supervisor across the visits (priority=%s)', (priorityEnabled) => {
      const { supervisors, slots } = build();
      const result = runAutoPostingAlgorithm(supervisors, slots, VISITS, 'lga_based', priorityEnabled, {});

      assertValidSolution(result.assignments, supervisors, slots, VISITS, Infinity, result.statistics);
      expect(result.assignments).toHaveLength(slots.length);
      expect(result.statistics.visit_spread.supervisors_on_single_visit).toBe(0);

      const counts = visitCountsBySupervisor(result.assignments, VISITS);
      expect(counts.size).toBe(supervisors.length);
      for (const perVisit of counts.values()) {
        expect(Math.min(...perVisit)).toBeGreaterThan(0);
        // Without tiers every supervisor's visits come out level. With them a
        // small tier can be pinned to a small area on one visit, which
        // cohesion is allowed to cost.
        if (!priorityEnabled) expect(Math.max(...perVisit) - Math.min(...perVisit)).toBeLessThanOrEqual(4);
      }

      // 35 more areas than supervisors, so second areas are unavoidable - about
      // one posting in six here - but only the small areas travel: the dominant
      // one must not be scattered.
      const outOfArea = result.assignments.filter((a) => a.cluster_break).length;
      expect(outOfArea).toBeLessThan(slots.length * 0.2);
    }, 120000);
  });

  describe('at the size of a large session', () => {
    it('plans 499 supervisors over six visits in a few seconds, not minutes', () => {
      const supervisors = Array.from({ length: 499 }, (_, i) => ({
        id: i + 1, name: `Supervisor ${String(i + 1).padStart(3, '0')}`, rank_code: 'SL',
        priority_number: 1 + (i % 6), current_postings: 0, remaining_slots: 15,
      }));
      const slots = [];
      for (let school = 1; school <= 124; school++) {
        for (let visit = 1; visit <= 6; visit++) {
          slots.push({
            id: `${school}-1-${visit}`, school_id: school, school_name: `School ${String(school).padStart(3, '0')}`,
            group_number: 1, visit_number: visit, route_id: 1 + (school % 9), route_name: `Route ${1 + (school % 9)}`,
            lga: `LGA ${1 + (school % 17)}`, distance_km: 5 + ((school * 37) % 150),
          });
        }
      }

      for (const postingType of POSTING_TYPES) {
        const started = Date.now();
        const result = runAutoPostingAlgorithm(supervisors, slots, 6, postingType, true, {});

        expect(result.assignments).toHaveLength(slots.length);
        expect(result.statistics.optimization.budget_exhausted).toBe(false);
        // The web server gives a request 90 seconds; this used to take 30-60
        expect(Date.now() - started).toBeLessThan(15000);
      }
    }, 60000);
  });

  describe('priority inversion repair', () => {
    it('never sends a supervisor out of area or onto one visit to soften an inversion', () => {
      // 7 tiers over 28 uneven areas; area 19's distances wrap around, so its
      // tier averages nearer than the tier below it - an inversion to repair
      const supervisors = [];
      [2, 3, 5, 10, 15, 15, 20].forEach((count, tierIndex) => {
        for (let i = 0; i < count; i++) {
          const id = supervisors.length + 1;
          supervisors.push({ id, name: `Supervisor ${String(id).padStart(3, '0')}`, rank_code: `R${tierIndex + 1}`, priority_number: tierIndex + 1, current_postings: 0, remaining_slots: 20 });
        }
      });
      const slots = [];
      let schoolId = 0;
      for (let area = 0; schoolId < 263; area++) {
        for (let s = 0; s < 2 + (area % 19); s++) {
          schoolId++;
          for (let visit = 1; visit <= 2; visit++) {
            slots.push({ id: `${schoolId}-1-${visit}`, school_id: schoolId, school_name: `School ${String(schoolId).padStart(3, '0')}`, group_number: 1, visit_number: visit, route_id: area + 1, route_name: `Route ${area + 1}`, lga: `LGA ${area + 1}`, distance_km: 5 + (schoolId % 200) });
          }
        }
      }

      const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 2, 'lga_based', true, {});
      const before = statistics.optimization.objective_before;
      const after = statistics.optimization.objective_after;

      expect(after.crossLgaAssignmentCount).toBeLessThanOrEqual(before.crossLgaAssignmentCount);
      expect(after.singleVisitCount).toBeLessThanOrEqual(before.singleVisitCount);
      // ...while still improving the inversion it set out to repair
      expect(after.priorityInversionSeverity).toBeLessThan(before.priorityInversionSeverity);
    }, 30000);
  });

  describe('candidate solutions', () => {
    it('compares genuinely different plans, not five copies of one', () => {
      const config = SCENARIOS[2][1];
      const { supervisors, slots } = makeScenario(config);
      const { statistics } = runAutoPostingAlgorithm(supervisors, slots, config.visits, 'lga_based', true, {});

      const candidates = statistics.optimization.candidate_solutions;
      expect(candidates.length).toBeGreaterThan(1);
      expect(new Set(candidates.map((c) => c.strategy)).size).toBe(candidates.length);
      expect(new Set(candidates.map((c) => c.fingerprint)).size).toBeGreaterThan(1);
    });
  });
});
