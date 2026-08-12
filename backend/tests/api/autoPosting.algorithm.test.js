/**
 * Auto-Posting Algorithm Tests
 *
 * Pure unit tests for the slot allocation logic - no database, no HTTP.
 * Focus: a supervisor must not be sent back to a school they already cover
 * unless there is genuinely no alternative supervisor with capacity.
 */

jest.mock('../../src/db/database', () => require('../mocks/database'));

const { runAutoPostingAlgorithm } = require('../../src/controllers/autoPostingController');

// ============================================================================
// FIXTURES
// ============================================================================

const makeSupervisors = (count, remainingSlots = 3) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Supervisor ${i + 1}`,
    rank_code: 'SL',
    priority_number: 1,
    current_postings: 0,
    remaining_slots: remainingSlots,
  }));

/**
 * Build school+group+visit slots the same shape getAvailableSlots() returns
 */
const makeSlots = ({ schools, visits, groupsPerSchool = 1 }) => {
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
          route_id: 1,
          route_name: 'Route 1',
          lga: 'Test LGA',
          distance_km: school * 10,
        });
      }
    }
  }
  return slots;
};

/** Count how many (supervisor, school) pairs appear more than once */
const countRepeatPairs = (assignments) => {
  const seen = new Map();
  let repeats = 0;
  for (const a of assignments) {
    const key = `${a.supervisor_id}-${a.school_id}`;
    if (seen.has(key)) repeats++;
    seen.set(key, true);
  }
  return repeats;
};

const postingCounts = (assignments) => {
  const counts = new Map();
  for (const a of assignments) {
    counts.set(a.supervisor_id, (counts.get(a.supervisor_id) || 0) + 1);
  }
  return [...counts.values()];
};

// ============================================================================
// TESTS
// ============================================================================

describe('runAutoPostingAlgorithm - school variety', () => {
  it('does not give a supervisor the same school on a later visit', () => {
    // 4 supervisors and 4 slots per visit is the aligned case (slots % supervisors === 0)
    // that previously handed every supervisor the identical school on every visit
    const supervisors = makeSupervisors(4);
    const slots = makeSlots({ schools: 4, visits: 3 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 2, 'random', true);

    expect(assignments).toHaveLength(8);
    expect(countRepeatPairs(assignments)).toBe(0);
    expect(assignments.every(a => a.repeat_school === false)).toBe(true);
  });

  it('respects schools the supervisor is already posted to in the database', () => {
    const supervisors = makeSupervisors(4);
    const slots = makeSlots({ schools: 4, visits: 3 });
    const schoolHistory = new Map([[1, new Set([1, 2])]]);

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 2, 'random', true, {
      schoolHistory,
    });

    const supervisorOneSchools = assignments
      .filter(a => a.supervisor_id === 1)
      .map(a => a.school_id);

    expect(supervisorOneSchools).not.toContain(1);
    expect(supervisorOneSchools).not.toContain(2);
    expect(countRepeatPairs(assignments)).toBe(0);
  });

  it('does not mutate the caller school history map', () => {
    const supervisors = makeSupervisors(2);
    const slots = makeSlots({ schools: 3, visits: 2 });
    const schoolHistory = new Map([[1, new Set([1])]]);

    runAutoPostingAlgorithm(supervisors, slots, 2, 'random', true, { schoolHistory });

    expect([...schoolHistory.get(1)]).toEqual([1]);
  });

  it('still fills the slot but flags it when a repeat is unavoidable', () => {
    // One supervisor, one school, three visits - every extra visit must repeat
    const supervisors = makeSupervisors(1);
    const slots = makeSlots({ schools: 1, visits: 3 });

    const { assignments, statistics, warnings } = runAutoPostingAlgorithm(
      supervisors, slots, 3, 'random', true
    );

    expect(assignments).toHaveLength(3);
    expect(assignments.filter(a => a.repeat_school)).toHaveLength(2);
    expect(statistics.repeat_school_assignments).toBe(2);
    expect(statistics.repeat_school_details).toEqual([
      expect.objectContaining({
        supervisor_id: 1,
        school_id: 1,
        visit_numbers: [2, 3],
      }),
    ]);
    expect(warnings.some(w => w.includes('reuse a school'))).toBe(true);
  });

  it('counts an existing database posting as the first visit to that school', () => {
    const supervisors = makeSupervisors(1);
    const slots = makeSlots({ schools: 1, visits: 1 });
    const schoolHistory = new Map([[1, new Set([1])]]);

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 1, 'random', true, { schoolHistory }
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0].repeat_school).toBe(true);
    expect(statistics.repeat_school_assignments).toBe(1);
  });

  it('stops penalising repeats when the option is disabled', () => {
    // The toggle controls whether repeating a school carries a cost - it does not
    // force repeats to happen. The engine's load and travel balancing may still
    // spread supervisors across distinct schools on its own.
    const supervisors = makeSupervisors(1);
    const slots = makeSlots({ schools: 3, visits: 1 });
    const schoolHistory = new Map([[1, new Set([1, 2, 3])]]);

    const { assignments, statistics, warnings } = runAutoPostingAlgorithm(
      supervisors, slots, 1, 'random', true, { avoidRepeatSchools: false, schoolHistory }
    );

    // Every available school is already covered, so with the penalty on these
    // would all be flagged; with it off they are assigned without complaint
    expect(assignments).toHaveLength(3);
    expect(statistics.repeat_school_assignments).toBe(0);
    expect(assignments.every(a => a.repeat_school === false)).toBe(true);
    expect(warnings.some(w => w.includes('reuse a school'))).toBe(false);
  });
});

describe('runAutoPostingAlgorithm - fair distribution', () => {
  it('keeps postings balanced across supervisors while avoiding repeats', () => {
    const supervisors = makeSupervisors(5, 4);
    const slots = makeSlots({ schools: 10, visits: 3 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 2, 'random', true);

    const counts = postingCounts(assignments);
    expect(assignments).toHaveLength(20);
    expect(counts).toHaveLength(5);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(countRepeatPairs(assignments)).toBe(0);
  });

  it('never exceeds a supervisor remaining_slots', () => {
    const supervisors = makeSupervisors(3, 2);
    const slots = makeSlots({ schools: 8, visits: 3 });

    const { assignments } = runAutoPostingAlgorithm(supervisors, slots, 3, 'random', true);

    expect(assignments).toHaveLength(6); // 3 supervisors x 2 slots each
    for (const count of postingCounts(assignments)) {
      expect(count).toBeLessThanOrEqual(2);
    }
  });

  it('assigns each slot only once', () => {
    const supervisors = makeSupervisors(4, 5);
    const slots = makeSlots({ schools: 5, visits: 2, groupsPerSchool: 2 });

    const { assignments, statistics } = runAutoPostingAlgorithm(
      supervisors, slots, 2, 'random', true
    );

    const slotKeys = assignments.map(a => `${a.school_id}-${a.group_number}-${a.visit_number}`);
    expect(new Set(slotKeys).size).toBe(slotKeys.length);
    expect(statistics.duplicate_errors).toBeUndefined();
  });
});
