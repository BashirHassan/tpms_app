/**
 * Auto-Posting Engine - Lexicographic Objective & Validation
 *
 * Dedicated coverage for scoreCandidate/compareObjectives/candidate-selection
 * determinism (spec §17/§23/§37, Case 17) and validateSolution's authoritative
 * recompute + duplicate-input handling (spec §31/§46, Case 20).
 */

const {
  runAutoPostingAlgorithm,
  scoreCandidate,
  compareObjectives,
  validateSolution,
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

const makeFlatSlots = ({ schools, visits, distanceBase = 10 }) => {
  const slots = [];
  for (let school = 1; school <= schools; school++) {
    for (let visit = 1; visit <= visits; visit++) {
      slots.push({
        id: `${school}-1-${visit}`,
        school_id: school,
        school_name: `School ${school}`,
        group_number: 1,
        visit_number: visit,
        route_id: null,
        route_name: null,
        lga: 'unknown',
        distance_km: distanceBase * school,
      });
    }
  }
  return slots;
};

// ============================================================================
// compareObjectives - strict lexicographic ordering
// ============================================================================

describe('compareObjectives', () => {
  const base = {
    unassignedCount: 0,
    hardViolationCount: 0,
    priorityInversionCount: 0,
    priorityInversionSeverity: 0,
    crossLgaAssignmentCount: 0,
    lgaFragmentation: 0,
    repeatCount: 0,
    workloadImbalance: 0,
    travelImbalance: 0,
  };

  it('an earlier field always dominates every later field combined', () => {
    const a = { ...base, unassignedCount: 1, travelImbalance: 0 };
    const b = { ...base, unassignedCount: 0, travelImbalance: 1000 };
    // b has fewer unassigned (better on position 1) despite much worse travel
    expect(compareObjectives(b, a)).toBeLessThan(0);
  });

  it('falls through to later fields only when earlier ones tie', () => {
    const a = { ...base, repeatCount: 2 };
    const b = { ...base, repeatCount: 1 };
    expect(compareObjectives(b, a)).toBeLessThan(0);
  });

  it('returns 0 for identical vectors', () => {
    expect(compareObjectives(base, { ...base })).toBe(0);
  });
});

// ============================================================================
// DETERMINISTIC TIE-BREAKING (Case 17)
// ============================================================================

describe('deterministic strategy selection', () => {
  it('produces byte-identical assignments across repeated runs of the same input', () => {
    const supervisors = makeSupervisors(4, { remainingSlots: 4, priorities: [1, 1, 2, 2] });
    const slots = makeFlatSlots({ schools: 16, visits: 1, distanceBase: 7 });

    const results = Array.from({ length: 5 }, () =>
      runAutoPostingAlgorithm(
        supervisors.map((s) => ({ ...s })),
        slots.map((s) => ({ ...s })),
        1,
        'random',
        true
      )
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i].assignments).toEqual(results[0].assignments);
      expect(results[i].statistics.optimization.strategy).toBe(results[0].statistics.optimization.strategy);
    }
  });

  it('reports the winning strategy name and every candidate solution considered', () => {
    const supervisors = makeSupervisors(3, { remainingSlots: 5, priorities: [1, 2, 3] });
    const slots = makeFlatSlots({ schools: 9, visits: 1, distanceBase: 10 });

    const { statistics } = runAutoPostingAlgorithm(supervisors, slots, 1, 'lga_based', true);

    expect(typeof statistics.optimization.strategy).toBe('string');
    expect(statistics.optimization.candidate_solutions.length).toBeGreaterThanOrEqual(1);
    for (const candidate of statistics.optimization.candidate_solutions) {
      expect(candidate).toHaveProperty('strategy');
      expect(candidate).toHaveProperty('objective');
    }
  });
});

// ============================================================================
// validateSolution - authoritative recompute (spec §46)
// ============================================================================

describe('validateSolution', () => {
  const supervisors = new Map([
    [1, { totalCapacity: 2 }],
    [2, { totalCapacity: 1 }],
  ]);
  const slots = [
    { school_id: 1, group_number: 1, visit_number: 1 },
    { school_id: 2, group_number: 1, visit_number: 1 },
    { school_id: 3, group_number: 1, visit_number: 1 },
  ];

  it('flags a duplicate slot assignment', () => {
    const assignments = [
      { supervisor_id: 1, school_id: 1, group_number: 1, visit_number: 1 },
      { supervisor_id: 2, school_id: 1, group_number: 1, visit_number: 1 },
    ];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, Infinity);
    expect(valid).toBe(false);
    expect(violations.some((v) => v.type === 'duplicate_slot')).toBe(true);
  });

  it('flags an assignment referencing a slot that was never supplied', () => {
    const assignments = [{ supervisor_id: 1, school_id: 99, group_number: 1, visit_number: 1 }];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, Infinity);
    expect(valid).toBe(false);
    expect(violations.some((v) => v.type === 'invalid_slot_reference')).toBe(true);
  });

  it('flags an assignment referencing a supervisor that was never supplied', () => {
    const assignments = [{ supervisor_id: 999, school_id: 1, group_number: 1, visit_number: 1 }];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, Infinity);
    expect(valid).toBe(false);
    expect(violations.some((v) => v.type === 'invalid_supervisor_reference')).toBe(true);
  });

  it('flags a supervisor over their capacity', () => {
    const assignments = [
      { supervisor_id: 2, school_id: 1, group_number: 1, visit_number: 1 },
      { supervisor_id: 2, school_id: 2, group_number: 1, visit_number: 1 },
    ];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, Infinity);
    expect(valid).toBe(false);
    expect(violations.some((v) => v.type === 'over_capacity')).toBe(true);
  });

  it('flags a visit number beyond numberOfPostings', () => {
    const assignments = [{ supervisor_id: 1, school_id: 1, group_number: 1, visit_number: 5 }];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, Infinity);
    expect(valid).toBe(false);
    expect(violations.some((v) => v.type === 'visit_out_of_range')).toBe(true);
  });

  it('flags a total exceeding the dean ceiling', () => {
    const assignments = [
      { supervisor_id: 1, school_id: 1, group_number: 1, visit_number: 1 },
      { supervisor_id: 1, school_id: 2, group_number: 1, visit_number: 1 },
    ];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, 1);
    expect(valid).toBe(false);
    expect(violations.some((v) => v.type === 'over_dean_ceiling')).toBe(true);
  });

  it('is valid for a clean, in-bounds solution', () => {
    const assignments = [
      { supervisor_id: 1, school_id: 1, group_number: 1, visit_number: 1 },
      { supervisor_id: 2, school_id: 2, group_number: 1, visit_number: 1 },
    ];
    const { valid, violations } = validateSolution(assignments, supervisors, slots, 1, Infinity);
    expect(valid).toBe(true);
    expect(violations).toHaveLength(0);
  });
});

// ============================================================================
// DUPLICATE INPUT SLOTS (Case 20) - end to end
// ============================================================================

describe('duplicate input slot handling', () => {
  it('deduplicates duplicate input slots and flags it, never double-assigning', () => {
    const supervisors = makeSupervisors(2, { remainingSlots: 5 });
    const slots = makeFlatSlots({ schools: 2, visits: 1 });
    const duplicated = [...slots, { ...slots[0] }]; // exact duplicate of the first slot

    const { assignments, warnings } = runAutoPostingAlgorithm(supervisors, duplicated, 1, 'random', false);

    // Only 2 distinct slots exist even though 3 were supplied
    expect(assignments).toHaveLength(2);
    const seen = new Set(assignments.map((a) => `${a.school_id}-${a.group_number}-${a.visit_number}`));
    expect(seen.size).toBe(2);
    expect(warnings.some((w) => w.toLowerCase().includes('duplicate'))).toBe(true);
  });
});
