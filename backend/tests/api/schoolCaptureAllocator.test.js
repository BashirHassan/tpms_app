/**
 * School Capture Allocator Tests
 *
 * Pure unit tests - no database, no HTTP.
 */

const { allocate, computeTargets } = require('../../src/services/schoolCaptureAllocator');

const makeSupervisors = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Supervisor ${i + 1}` }));

/** clusters: [{ state, lga, count }] */
const makeSchools = (clusters) => {
  const schools = [];
  let id = 0;
  clusters.forEach(({ state, lga, count }) => {
    for (let i = 0; i < count; i++) {
      id += 1;
      schools.push({ id, name: `School ${id}`, state, lga, ward: `Ward ${i % 3}` });
    }
  });
  return schools;
};

const countsBySupervisor = (result) => {
  const counts = new Map();
  result.assignments.forEach((a) => counts.set(a.supervisor_id, (counts.get(a.supervisor_id) || 0) + 1));
  return counts;
};

describe('computeTargets', () => {
  it('splits evenly with the remainder spread one apiece', () => {
    expect(computeTargets(3, 10, [Infinity, Infinity, Infinity])).toEqual([4, 3, 3]);
  });

  it('respects capacity and hands the overflow to supervisors with room', () => {
    expect(computeTargets(3, 12, [2, Infinity, Infinity])).toEqual([2, 5, 5]);
  });

  it('leaves schools unplaced when everyone is full', () => {
    const targets = computeTargets(2, 10, [3, 3]);
    expect(targets).toEqual([3, 3]);
  });
});

describe('allocate - invariants', () => {
  const supervisors = makeSupervisors(4);
  const schools = makeSchools([
    { state: 'Gombe', lga: 'Akko', count: 9 },
    { state: 'Gombe', lga: 'Balanga', count: 6 },
    { state: 'Gombe', lga: 'Kaltungo', count: 5 },
  ]);

  it.each(['lga', 'random'])('%s: assigns every school exactly once', (mode) => {
    const result = allocate(supervisors, schools, { mode });
    const ids = result.assignments.map((a) => a.school_id);
    expect(ids).toHaveLength(schools.length);
    expect(new Set(ids).size).toBe(schools.length);
    expect(result.unassigned).toEqual([]);
  });

  it.each(['lga', 'random'])('%s: keeps the workload within one school of even', (mode) => {
    const result = allocate(supervisors, schools, { mode });
    const counts = [...countsBySupervisor(result).values()];
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('is deterministic for the same salt and different for another', () => {
    const a = allocate(supervisors, schools, { mode: 'random', shuffleSalt: 7 });
    const b = allocate(supervisors, schools, { mode: 'random', shuffleSalt: 7 });
    const c = allocate(supervisors, schools, { mode: 'random', shuffleSalt: 8 });
    expect(a.planHash).toBe(b.planHash);
    expect(a.planHash).not.toBe(c.planHash);
  });

  it('the plan hash does not depend on assignment order', () => {
    const result = allocate(supervisors, schools, { mode: 'lga' });
    const reversed = { ...result, assignments: [...result.assignments].reverse() };
    const { planFingerprint } = require('../../src/services/schoolCaptureAllocator');
    expect(planFingerprint(reversed.assignments)).toBe(result.planHash);
  });

  it('rejects an unknown mode', () => {
    expect(() => allocate(supervisors, schools, { mode: 'nonsense' })).toThrow(/Unknown allocation mode/);
  });
});

describe('allocate - lga mode keeps LGAs together', () => {
  it('splits at most (supervisors - 1) LGAs across supervisors', () => {
    const supervisors = makeSupervisors(3);
    const schools = makeSchools([
      { state: 'Gombe', lga: 'Akko', count: 7 },
      { state: 'Gombe', lga: 'Balanga', count: 7 },
      { state: 'Gombe', lga: 'Billiri', count: 7 },
    ]);
    const result = allocate(supervisors, schools, { mode: 'lga' });

    // 7/7/7 over three supervisors: each supervisor gets exactly one whole LGA
    result.perSupervisor.forEach((s) => {
      expect(s.count).toBe(7);
      expect(s.clusters).toHaveLength(1);
    });
  });

  it('never merges same-named LGAs from different states', () => {
    const supervisors = makeSupervisors(2);
    const schools = makeSchools([
      { state: 'Gombe', lga: 'Dukku', count: 3 },
      { state: 'Katsina', lga: 'Dukku', count: 3 },
    ]);
    const result = allocate(supervisors, schools, { mode: 'lga' });
    const clusterLabels = result.perSupervisor.flatMap((s) => s.clusters).sort();
    expect(clusterLabels).toEqual(['Dukku, Gombe', 'Dukku, Katsina']);
  });

  it('groups schools with no state/LGA together and warns', () => {
    const supervisors = makeSupervisors(1);
    const schools = [
      { id: 1, name: 'A', state: null, lga: null },
      { id: 2, name: 'B', state: '', lga: '  ' },
    ];
    const result = allocate(supervisors, schools, { mode: 'lga' });
    expect(result.assignments).toHaveLength(2);
    expect(result.warnings.join(' ')).toMatch(/no state\/LGA/);
  });
});

describe('allocate - capacity', () => {
  it('honours max per supervisor and reports what could not be placed', () => {
    const supervisors = makeSupervisors(2);
    const schools = makeSchools([{ state: 'Gombe', lga: 'Akko', count: 10 }]);
    const result = allocate(supervisors, schools, { mode: 'lga', maxPerSupervisor: 3 });

    expect(result.assignments).toHaveLength(6);
    expect(result.unassigned).toHaveLength(4);
    expect(result.warnings.join(' ')).toMatch(/limit of 3/);
    countsBySupervisor(result).forEach((c) => expect(c).toBeLessThanOrEqual(3));
  });

  it('counts assignments a supervisor already holds against the cap', () => {
    const supervisors = makeSupervisors(2);
    const schools = makeSchools([{ state: 'Gombe', lga: 'Akko', count: 6 }]);
    const existingLoad = new Map([[1, 4]]);
    const result = allocate(supervisors, schools, { mode: 'random', maxPerSupervisor: 5, existingLoad });

    const counts = countsBySupervisor(result);
    expect(counts.get(1) || 0).toBeLessThanOrEqual(1); // 5 - 4 already held
    expect(counts.get(2)).toBe(5);
    expect(result.unassigned).toHaveLength(0);
  });
});

describe('allocate - edge cases', () => {
  it('returns a warning and nothing assigned when there are no supervisors', () => {
    const result = allocate([], makeSchools([{ state: 'Gombe', lga: 'Akko', count: 2 }]));
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toHaveLength(2);
    expect(result.warnings).toContain('No eligible supervisors available');
  });

  it('returns a warning when there are no schools to capture', () => {
    const result = allocate(makeSupervisors(2), []);
    expect(result.assignments).toEqual([]);
    expect(result.warnings).toContain('No schools need capturing');
  });

  it('does not mutate its inputs', () => {
    const supervisors = makeSupervisors(2);
    const schools = makeSchools([{ state: 'Gombe', lga: 'Akko', count: 4 }]);
    const supCopy = JSON.stringify(supervisors);
    const schoolCopy = JSON.stringify(schools);
    allocate(supervisors, schools, { mode: 'lga', shuffleSalt: 3 });
    expect(JSON.stringify(supervisors)).toBe(supCopy);
    expect(JSON.stringify(schools)).toBe(schoolCopy);
  });
});
