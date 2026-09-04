const mockDb = require('../mocks/database');

jest.mock('../../src/db/database', () => mockDb);

const acceptanceController = require('../../src/controllers/acceptanceController');

function makeRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

/**
 * The controller issues its four aggregates through Promise.all, and the mock
 * matches patterns in registration order, so each mock is keyed on a fragment
 * unique to one of them.
 */
function mockDistribution({ states = [], lgas = [], summary = {}, activeStudents = 0 } = {}) {
  mockDb.setMockResult('FROM academic_sessions', [{ id: 4, name: '2024/2025' }]);
  mockDb.setMockResult('GROUP BY ms.state\n', states);
  mockDb.setMockResult('GROUP BY ms.state, ms.lga', lgas);
  mockDb.setMockResult('AS placed_students', [summary]);
  mockDb.setMockResult('FROM students', [{ count: activeStudents }]);
}

describe('acceptanceController.getDistribution', () => {
  afterEach(() => {
    mockDb.resetMocks();
  });

  it('nests LGAs under their state and derives the unplaced count', async () => {
    mockDistribution({
      states: [
        { state: 'Kogi', student_count: 12, school_count: 3, lga_count: 2 },
        { state: 'Kwara', student_count: 5, school_count: 1, lga_count: 1 },
      ],
      lgas: [
        { state: 'Kogi', lga: 'Lokoja', student_count: 8, school_count: 2 },
        { state: 'Kogi', lga: 'Okene', student_count: 4, school_count: 1 },
        { state: 'Kwara', lga: 'Ilorin West', student_count: 5, school_count: 1 },
      ],
      summary: { placed_students: 17, states_covered: 2, lgas_covered: 3, schools_covered: 4 },
      activeStudents: 20,
    });

    const res = makeRes();
    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '4' } },
      res,
      jest.fn()
    );

    const { data } = res.json.mock.calls[0][0];
    expect(data.summary).toEqual({
      total_students: 20,
      placed_students: 17,
      unplaced_students: 3,
      states_covered: 2,
      lgas_covered: 3,
      schools_covered: 4,
    });
    expect(data.states[0]).toEqual({
      state: 'Kogi',
      student_count: 12,
      school_count: 3,
      lga_count: 2,
      lgas: [
        { lga: 'Lokoja', student_count: 8, school_count: 2 },
        { lga: 'Okene', student_count: 4, school_count: 1 },
      ],
    });
    expect(data.states[1].lgas).toEqual([{ lga: 'Ilorin West', student_count: 5, school_count: 1 }]);
  });

  it('scopes every aggregate to the institution and session', async () => {
    mockDistribution({});

    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '4' } },
      makeRes(),
      jest.fn()
    );

    const aggregates = mockDb
      .getQueryHistory()
      .filter((entry) => entry.sql.includes('student_acceptances'));
    expect(aggregates).toHaveLength(3);
    for (const entry of aggregates) {
      expect(entry.sql).toContain('sa.institution_id = ? AND sa.session_id = ?');
      expect(entry.params).toEqual([2, 4]);
    }
  });

  it('excludes inactive students and schools with no state recorded', async () => {
    mockDistribution({});

    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '4' } },
      makeRes(),
      jest.fn()
    );

    for (const entry of mockDb.getQueriesMatching('student_acceptances')) {
      expect(entry.sql).toContain("st.status = 'active'");
      expect(entry.sql).toContain("TRIM(COALESCE(ms.state, '')) <> ''");
    }
  });

  it('drops LGA rows with a blank name', async () => {
    mockDistribution({
      states: [{ state: 'Kogi', student_count: 3, school_count: 1, lga_count: 1 }],
      lgas: [
        { state: 'Kogi', lga: '   ', student_count: 1, school_count: 1 },
        { state: 'Kogi', lga: 'Lokoja', student_count: 2, school_count: 1 },
      ],
      summary: { placed_students: 3, states_covered: 1, lgas_covered: 1, schools_covered: 1 },
      activeStudents: 3,
    });

    const res = makeRes();
    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '4' } },
      res,
      jest.fn()
    );

    expect(res.json.mock.calls[0][0].data.states[0].lgas).toEqual([
      { lga: 'Lokoja', student_count: 2, school_count: 1 },
    ]);
  });

  it('never reports a negative unplaced count', async () => {
    mockDistribution({
      summary: { placed_students: 9, states_covered: 1, lgas_covered: 1, schools_covered: 1 },
      activeStudents: 4,
    });

    const res = makeRes();
    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '4' } },
      res,
      jest.fn()
    );

    expect(res.json.mock.calls[0][0].data.summary.unplaced_students).toBe(0);
  });

  it('returns an empty breakdown and zeroed summary when nothing is placed', async () => {
    mockDistribution({});

    const res = makeRes();
    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '4' } },
      res,
      jest.fn()
    );

    const { data } = res.json.mock.calls[0][0];
    expect(data.states).toEqual([]);
    expect(data.summary).toEqual({
      total_students: 0,
      placed_students: 0,
      unplaced_students: 0,
      states_covered: 0,
      lgas_covered: 0,
      schools_covered: 0,
    });
  });

  it('falls back to the current session when no session_id is given', async () => {
    mockDistribution({});

    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: {} },
      makeRes(),
      jest.fn()
    );

    const [sessionQuery] = mockDb.getQueriesMatching('FROM academic_sessions');
    expect(sessionQuery.sql).toContain('is_current = 1');
    expect(sessionQuery.params).toEqual([2]);
  });

  it('rejects a session id that does not belong to the institution', async () => {
    const next = jest.fn();
    await acceptanceController.getDistribution(
      { params: { institutionId: '2' }, query: { session_id: '999' } },
      makeRes(),
      next
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid session ID' }));
  });
});
