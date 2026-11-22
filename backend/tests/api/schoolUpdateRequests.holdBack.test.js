/**
 * Bulk approval hold-back for supervisor captures.
 *
 * Supervisors are paid per captured school, so anything a person should look at
 * must never be swept up by bulk approve / approve-all.
 */

const {
  needsIndividualReview,
  holdBackForReview,
  keepNewestPerSchool,
} = require('../../src/controllers/schoolUpdateRequestController');

const student = (over = {}) => ({ id: 1, submitted_by_user_id: null, risk_level: null, capture_method: null, ...over });
const supervisorGps = (over = {}) => ({ id: 2, submitted_by_user_id: 9, risk_level: 'none', capture_method: 'gps', ...over });

describe('needsIndividualReview', () => {
  it('lets student submissions through', () => {
    expect(needsIndividualReview(student())).toBeNull();
  });

  it('lets a clean supervisor GPS capture through', () => {
    expect(needsIndividualReview(supervisorGps())).toBeNull();
  });

  it('lets a medium-risk GPS capture through (flagged for reading, not for blocking)', () => {
    expect(needsIndividualReview(supervisorGps({ risk_level: 'medium' }))).toBeNull();
  });

  it('holds back a high-risk capture', () => {
    expect(needsIndividualReview(supervisorGps({ risk_level: 'high' }))).toMatch(/high-risk/);
  });

  it('holds back typed-in coordinates even when nothing else tripped (the manual-entry bypass)', () => {
    const reason = needsIndividualReview(supervisorGps({ capture_method: 'manual', risk_level: 'medium' }));
    expect(reason).toMatch(/typed in/);
  });

  it('does not treat a student row with a stray capture_method as a supervisor capture', () => {
    expect(needsIndividualReview(student({ capture_method: 'manual' }))).toBeNull();
  });
});

describe('holdBackForReview', () => {
  it('keeps the clear ones and reports why each other one was skipped', () => {
    const rows = [
      student({ id: 1 }),
      supervisorGps({ id: 2 }),
      supervisorGps({ id: 3, risk_level: 'high' }),
      supervisorGps({ id: 4, capture_method: 'manual', risk_level: 'medium' }),
    ];
    const skipped = [];
    const clear = holdBackForReview(rows, skipped);

    expect(clear.map((r) => r.id)).toEqual([1, 2]);
    expect(skipped.map((s) => s.id)).toEqual([3, 4]);
    expect(skipped.every((s) => typeof s.reason === 'string' && s.reason.length > 0)).toBe(true);
  });

  it('appends to an existing skipped list rather than replacing it', () => {
    const skipped = [{ id: 99, reason: 'superseded' }];
    holdBackForReview([supervisorGps({ id: 3, risk_level: 'high' })], skipped);
    expect(skipped.map((s) => s.id)).toEqual([99, 3]);
  });
});

describe('keepNewestPerSchool - schools with no institution link', () => {
  // Newest first, as the callers order them. Capturing a master school that the
  // institution has not linked leaves institution_school_id NULL; those must not all
  // be treated as "the same school".
  const unlinked = (id, master) => ({ id, institution_school_id: null, master_school_id: master });

  it('keeps one request per master school, not one for every unlinked school', () => {
    const { toApprove, skipped } = keepNewestPerSchool([unlinked(5, 100), unlinked(4, 200), unlinked(3, 300)]);
    expect(toApprove.map((r) => r.id)).toEqual([5, 4, 3]);
    expect(skipped).toEqual([]);
  });

  it('still keeps only the newest when the same master school has several requests', () => {
    const { toApprove, skipped } = keepNewestPerSchool([unlinked(9, 100), unlinked(8, 100), unlinked(7, 200)]);
    expect(toApprove.map((r) => r.id)).toEqual([9, 7]);
    expect(skipped.map((s) => s.id)).toEqual([8]);
  });

  it('falls back to the institution link for older rows that have no master id', () => {
    const legacy = (id, link) => ({ id, institution_school_id: link, master_school_id: null });
    const { toApprove, skipped } = keepNewestPerSchool([legacy(3, 11), legacy(2, 11), legacy(1, 12)]);
    expect(toApprove.map((r) => r.id)).toEqual([3, 1]);
    expect(skipped.map((s) => s.id)).toEqual([2]);
  });
});
