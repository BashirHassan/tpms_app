/**
 * Auto-posting run planning - the controller-side rules applied around the engine:
 * sharing a supervisor's posting limit across visits on a partial run, and
 * refusing to save a plan that differs from the one that was previewed.
 */

const mockDb = require('../mocks/database');

jest.mock('../../src/db/database', () => mockDb);

const {
  visitsInRun,
  shareLimitAcrossVisits,
  assertPlanUnchanged,
} = require('../../src/controllers/autoPostingController');
const { planFingerprint } = require('../../src/services/autoPostingEngine');
const { ConflictError } = require('../../src/utils/errors');

const supervisor = (id, remaining) => ({ id, name: `Supervisor ${id}`, current_postings: 6 - remaining, remaining_slots: remaining });
const held = (entries) => new Map(entries.map(([id, byVisit]) => [id, new Map(Object.entries(byVisit).map(([v, n]) => [Number(v), n]))]));

describe('visitsInRun', () => {
  it('uses the explicit selection when one is given', () => {
    expect(visitsInRun([5, 2], 6)).toEqual([2, 5]);
  });

  it('falls back to visits 1 through N', () => {
    expect(visitsInRun([], 3)).toEqual([1, 2, 3]);
  });
});

describe('shareLimitAcrossVisits', () => {
  it('leaves supervisors untouched when the run covers every visit', () => {
    const supervisors = [supervisor(1, 6)];
    expect(shareLimitAcrossVisits(supervisors, new Map(), [1, 2, 3], 3, 6)).toEqual(supervisors);
  });

  it('caps a one-visit run at that visit\'s share of the limit', () => {
    const [capped] = shareLimitAcrossVisits([supervisor(1, 6)], new Map(), [1], 3, 6);
    expect(capped.remaining_slots).toBe(2);
  });

  it('scales the share with the number of visits in the run', () => {
    const [capped] = shareLimitAcrossVisits([supervisor(1, 12)], new Map(), [2, 5], 6, 12);
    expect(capped.remaining_slots).toBe(4);
  });

  it('rounds the share up so a small limit is still usable', () => {
    const [capped] = shareLimitAcrossVisits([supervisor(1, 4)], new Map(), [1], 3, 4);
    expect(capped.remaining_slots).toBe(2);
  });

  it('counts primary postings already held in the visits being run', () => {
    const [capped] = shareLimitAcrossVisits([supervisor(1, 5)], held([[1, { 1: 1 }]]), [1], 3, 6);
    expect(capped.remaining_slots).toBe(1);
  });

  it('ignores postings held in visits outside the run', () => {
    const [capped] = shareLimitAcrossVisits([supervisor(1, 4)], held([[1, { 2: 2 }]]), [1], 3, 6);
    expect(capped.remaining_slots).toBe(2);
  });

  it('never raises a supervisor above their real remaining limit', () => {
    const [capped] = shareLimitAcrossVisits([supervisor(1, 1)], new Map(), [1, 2], 3, 6);
    expect(capped.remaining_slots).toBe(1);
  });

  it('drops supervisors whose share of these visits is already used', () => {
    const result = shareLimitAcrossVisits(
      [supervisor(1, 4), supervisor(2, 6)],
      held([[1, { 1: 2 }]]),
      [1],
      3,
      6
    );
    expect(result.map((s) => s.id)).toEqual([2]);
  });

  it('does not mutate the supervisors it was given', () => {
    const original = supervisor(1, 6);
    shareLimitAcrossVisits([original], new Map(), [1], 3, 6);
    expect(original.remaining_slots).toBe(6);
  });
});

describe('plan fingerprint', () => {
  const a = { supervisor_id: 1, school_id: 10, group_number: 1, visit_number: 1 };
  const b = { supervisor_id: 2, school_id: 11, group_number: 1, visit_number: 2 };

  it('is the same whatever order the assignments are in', () => {
    expect(planFingerprint([a, b])).toBe(planFingerprint([b, a]));
  });

  it('changes when a slot goes to a different supervisor', () => {
    expect(planFingerprint([a, b])).not.toBe(planFingerprint([a, { ...b, supervisor_id: 3 }]));
  });

  it('changes when an assignment is missing', () => {
    expect(planFingerprint([a, b])).not.toBe(planFingerprint([a]));
  });
});

describe('assertPlanUnchanged', () => {
  it('accepts a matching fingerprint', () => {
    expect(() => assertPlanUnchanged('abc', 'abc')).not.toThrow();
  });

  it('accepts a caller that did not preview first', () => {
    expect(() => assertPlanUnchanged(undefined, 'abc')).not.toThrow();
  });

  it('rejects a plan that differs from the previewed one', () => {
    expect(() => assertPlanUnchanged('abc', 'xyz')).toThrow(ConflictError);
  });
});
