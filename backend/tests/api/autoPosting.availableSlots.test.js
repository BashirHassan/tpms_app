/**
 * getAvailableSlots() - the auto-posting slot generator
 *
 * Guards the core guarantee: only schools/groups with approved student
 * acceptances in the *current* session ever produce postable slots. A school
 * with no students this session must never reach the allocation engine.
 */

const mockDb = require('../mocks/database');

jest.mock('../../src/db/database', () => mockDb);

const { getAvailableSlots } = require('../../src/controllers/autoPostingController');

describe('autoPostingController.getAvailableSlots', () => {
  afterEach(() => {
    mockDb.resetMocks();
  });

  it('scopes the schools query to approved acceptances in the given session', async () => {
    mockDb.setMockResult('max_supervision_visits', [{ max_supervision_visits: 1 }]);
    mockDb.setMockResult('FROM institution_schools', []);
    mockDb.setMockResult('FROM supervisor_postings', []);

    await getAvailableSlots(5, 9);

    const [schoolsQuery] = mockDb.getQueriesMatching('FROM institution_schools');
    expect(schoolsQuery).toBeDefined();
    const { sql, params } = schoolsQuery;

    // Only approved acceptances for THIS session count toward eligibility - this
    // INNER JOIN is what keeps a school with no students this session out of the
    // pool entirely (it never appears in the result set, so no slots are ever
    // generated for it)
    expect(sql).toMatch(/JOIN student_acceptances sa[\s\S]*sa\.session_id = \?/);
    expect(sql).toContain("sa.status = 'approved'");
    expect(sql).not.toMatch(/LEFT JOIN student_acceptances/);

    // Secondary/merged groups are excluded - they get dependent postings automatically
    expect(sql).toContain('mg.id IS NULL');
    // Inactive schools are excluded regardless of student counts
    expect(sql).toContain("isv.status = 'active'");
    // Belt-and-suspenders guard, redundant with the INNER JOIN above but should
    // stay in place in case the join is ever loosened
    expect(sql).toContain('HAVING student_count > 0');

    // session_id is bound ahead of institution_id, matching the placeholder order in the SQL
    expect(params).toEqual([9, 5, 5]);
  });

  it('never produces slots for a school absent from the (already session-filtered) schools query', async () => {
    mockDb.setMockResult('max_supervision_visits', [{ max_supervision_visits: 2 }]);
    // Simulates what the real INNER JOIN returns: only school 10 has approved
    // acceptances this session, so a school with no students this session (e.g.
    // school 20) never appears here in the first place
    mockDb.setMockResult('FROM institution_schools', [
      {
        school_id: 10,
        school_name: 'Has Students Primary',
        lga: 'Lokoja',
        state: 'Kogi',
        route_id: 1,
        route_name: 'Route A',
        distance_km: '5.00',
        location_category: 'inside',
        group_number: 1,
        student_count: 12,
      },
    ]);
    mockDb.setMockResult('FROM supervisor_postings', []);

    const slots = await getAvailableSlots(5, 9);

    expect(slots.length).toBe(2); // visit 1 and visit 2 for school 10, group 1
    expect(slots.every((s) => s.school_id === 10)).toBe(true);
    expect(slots.some((s) => s.school_id === 20)).toBe(false);
  });

  it('excludes slots already covered by an existing posting', async () => {
    mockDb.setMockResult('max_supervision_visits', [{ max_supervision_visits: 2 }]);
    mockDb.setMockResult('FROM institution_schools', [
      {
        school_id: 10,
        school_name: 'Has Students Primary',
        lga: 'Lokoja',
        state: 'Kogi',
        route_id: 1,
        route_name: 'Route A',
        distance_km: '5.00',
        location_category: 'inside',
        group_number: 1,
        student_count: 12,
      },
    ]);
    mockDb.setMockResult('FROM supervisor_postings', [
      { institution_school_id: 10, group_number: 1, visit_number: 1 },
    ]);

    const slots = await getAvailableSlots(5, 9);

    expect(slots).toHaveLength(1);
    expect(slots[0].visit_number).toBe(2);
  });
});
