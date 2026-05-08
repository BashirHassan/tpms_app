const mockDb = require('../mocks/database');

jest.mock('../../src/db/database', () => mockDb);

const postingController = require('../../src/controllers/postingController');

describe('postingController.getSchoolsWithGroups', () => {
  afterEach(() => {
    mockDb.resetMocks();
  });

  it('returns schools with group availability and avoids the reserved groups SQL alias', async () => {
    mockDb.setMockResult('SELECT max_supervision_visits', [{ max_supervision_visits: 2 }]);
    mockDb.setMockResult('GROUP_CONCAT', [
      {
        school_id: 10,
        school_name: 'Central Primary School',
        category: 'public',
        location_category: 'inside',
        distance_km: '4.50',
        address: '1 School Road',
        state: 'Kogi',
        lga: 'Lokoja',
        ward: 'A',
        route_id: 2,
        route_name: 'Route A',
        group_numbers: '1,2',
        total_students: 12,
      },
    ]);
    mockDb.setMockResult('FROM supervisor_postings', [
      { school_id: 10, group_number: 1, visit_number: 1 },
    ]);

    const req = {
      params: { institutionId: '2' },
      query: { session_id: '2' },
    };
    const res = {
      json: jest.fn(),
    };
    const next = jest.fn();

    await postingController.getSchoolsWithGroups(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          school_id: 10,
          groups: [1, 2],
          group_details: [
            {
              group_number: 1,
              assigned_visits: [1],
              available_visits: [2],
            },
            {
              group_number: 2,
              assigned_visits: [],
              available_visits: [1, 2],
            },
          ],
          total_available_slots: 3,
        }),
      ],
      meta: {
        max_visits: 2,
        total_schools: 1,
        available_schools: 1,
      },
    });

    const schoolsQuery = mockDb.getQueriesMatching('GROUP_CONCAT')[0].sql;
    expect(schoolsQuery).toContain('as group_numbers');
    expect(schoolsQuery).toContain('HAVING group_numbers IS NOT NULL');
    expect(schoolsQuery).not.toContain('as groups');
    expect(schoolsQuery).not.toContain('HAVING groups');
  });

  it('requires session_id', async () => {
    const req = {
      params: { institutionId: '2' },
      query: {},
    };
    const res = {
      json: jest.fn(),
    };
    const next = jest.fn();

    await postingController.getSchoolsWithGroups(req, res, next);

    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Session ID is required',
    }));
  });
});
