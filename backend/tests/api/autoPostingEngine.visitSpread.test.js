/**
 * Auto-Posting Engine - visit spread
 *
 * A supervisor's postings must be mixed across the visits a run covers, under
 * every posting distribution type. Regression cover for supervisors who ended
 * up with e.g. six postings that were all 1st visit.
 */

const { runAutoPostingAlgorithm } = require('../../src/services/autoPostingEngine');
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
});
