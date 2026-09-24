const mockDb = require('../mocks/database');

jest.mock('../../src/db/database', () => mockDb);

const postingController = require('../../src/controllers/postingController');
const { distanceMeters } = require('../../src/utils/geo');

const makeReqRes = () => ({
  req: { params: { institutionId: '3' }, user: { id: 557 } },
  res: { json: jest.fn() },
  next: jest.fn(),
});

describe('postingController.getFieldMap', () => {
  afterEach(() => {
    mockDb.resetMocks();
  });

  it('returns an empty map with has_postings false when there is no active session', async () => {
    mockDb.setMockResult('FROM academic_sessions', []);

    const { req, res, next } = makeReqRes();
    await postingController.getFieldMap(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        has_postings: false,
        data: expect.objectContaining({ schools: [], unlocated: [], optimized_order: [] }),
      })
    );
  });

  it('returns an empty map with has_postings false when the supervisor has no active postings', async () => {
    mockDb.setMockResult('FROM academic_sessions', [{ id: 10, name: '2025/2026', tp_end_date: '2020-01-01' }]);
    mockDb.setMockResult('sp.institution_school_id, sp.group_number, sp.visit_number', []);

    const { req, res, next } = makeReqRes();
    await postingController.getFieldMap(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, has_postings: false })
    );
  });

  it('groups postings by school, computes visit status, splits unlocated schools, and orders the route', async () => {
    // Session already ended, so any school short of its required visits is overdue.
    mockDb.setMockResult('FROM academic_sessions', [{ id: 10, name: '2025/2026', tp_end_date: '2020-01-01' }]);

    // School 100 needs 2 visits (rows for visit_number 1 and 2), school 200 needs 1, school 300 needs 1.
    mockDb.setMockResult('sp.institution_school_id, sp.group_number, sp.visit_number', [
      { institution_school_id: 100, group_number: 1, visit_number: 1 },
      { institution_school_id: 100, group_number: 1, visit_number: 2 },
      { institution_school_id: 200, group_number: 1, visit_number: 1 },
      { institution_school_id: 300, group_number: 2, visit_number: 1 },
    ]);

    mockDb.setMockResult('FROM institutions WHERE id = ?', [
      { id: 3, name: 'Demo Institution', latitude: 0, longitude: 0 },
    ]);

    // School 100 is farther along the same meridian than school 200; school 300 has no GPS point yet.
    mockDb.setMockResult('FROM institution_schools isv', [
      {
        institution_school_id: 100, distance_km: '5.00', location_category: 'inside',
        school_name: 'School A', school_address: 'Addr A', principal_name: 'Mr A', principal_phone: '111',
        latitude: 0, longitude: 2, route_name: 'Route 1',
      },
      {
        institution_school_id: 200, distance_km: '1.00', location_category: 'inside',
        school_name: 'School B', school_address: 'Addr B', principal_name: 'Mr B', principal_phone: '222',
        latitude: 0, longitude: 1, route_name: null,
      },
      {
        institution_school_id: 300, distance_km: '9.00', location_category: 'outside',
        school_name: 'School C', school_address: 'Addr C', principal_name: null, principal_phone: null,
        latitude: null, longitude: null, route_name: null,
      },
    ]);

    // School 100 has both required visits validated; school 200 and 300 have none.
    mockDb.setMockResult('FROM supervision_location_logs', [
      { institution_school_id: 100, visits_completed: 2 },
    ]);

    mockDb.setMockResult('GROUP BY sa.institution_school_id', [
      { institution_school_id: 100, student_count: 8 },
      { institution_school_id: 200, student_count: 5 },
      { institution_school_id: 300, student_count: 3 },
    ]);

    const { req, res, next } = makeReqRes();
    await postingController.getFieldMap(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledTimes(1);
    const { data } = res.json.mock.calls[0][0];

    expect(data.institution).toEqual({ id: 3, name: 'Demo Institution', latitude: 0, longitude: 0 });

    expect(data.schools.map((s) => s.institution_school_id)).toEqual([100, 200]);
    expect(data.unlocated.map((s) => s.institution_school_id)).toEqual([300]);

    const schoolA = data.schools.find((s) => s.institution_school_id === 100);
    expect(schoolA).toMatchObject({ visits_required: 2, visits_completed: 2, visit_status: 'visited', student_count: 8 });

    const schoolB = data.schools.find((s) => s.institution_school_id === 200);
    expect(schoolB).toMatchObject({ visits_required: 1, visits_completed: 0, visit_status: 'overdue', student_count: 5 });

    const schoolC = data.unlocated[0];
    expect(schoolC).toMatchObject({ visits_required: 1, visits_completed: 0, visit_status: 'overdue', student_count: 3 });

    // Nearest-neighbor from (0,0): school 200 (lng 1) is closer than school 100 (lng 2).
    expect(data.optimized_order).toEqual([200, 100]);
    const expectedTotalKm =
      Math.round(((distanceMeters(0, 0, 0, 1) + distanceMeters(0, 1, 0, 2)) / 1000) * 100) / 100;
    expect(data.total_distance_km).toBeCloseTo(expectedTotalKm, 2);
    expect(data.route_available).toBe(true);

    const expectedLeg1Km = Math.round((distanceMeters(0, 0, 0, 1) / 1000) * 100) / 100;
    const expectedLeg2Km = Math.round((distanceMeters(0, 1, 0, 2) / 1000) * 100) / 100;
    expect(schoolB.distance_from_previous_km).toBeCloseTo(expectedLeg1Km, 2);
    expect(schoolA.distance_from_previous_km).toBeCloseTo(expectedLeg2Km, 2);

    expect(data.statistics).toEqual({
      total_schools: 3,
      total_students: 16,
      total_distance_km: expectedTotalKm,
    });
  });

  it('disables routing but still lists schools when the institution has no GPS point set', async () => {
    mockDb.setMockResult('FROM academic_sessions', [{ id: 10, name: '2025/2026', tp_end_date: '2099-01-01' }]);
    mockDb.setMockResult('sp.institution_school_id, sp.group_number, sp.visit_number', [
      { institution_school_id: 200, group_number: 1, visit_number: 1 },
    ]);
    mockDb.setMockResult('FROM institutions WHERE id = ?', [
      { id: 3, name: 'Demo Institution', latitude: null, longitude: null },
    ]);
    mockDb.setMockResult('FROM institution_schools isv', [
      {
        institution_school_id: 200, distance_km: '1.00', location_category: 'inside',
        school_name: 'School B', school_address: 'Addr B', principal_name: 'Mr B', principal_phone: '222',
        latitude: 0, longitude: 1, route_name: null,
      },
    ]);
    mockDb.setMockResult('FROM supervision_location_logs', []);
    mockDb.setMockResult('GROUP BY sa.institution_school_id', [
      { institution_school_id: 200, student_count: 5 },
    ]);

    const { req, res, next } = makeReqRes();
    await postingController.getFieldMap(req, res, next);

    const { data } = res.json.mock.calls[0][0];
    expect(data.schools).toHaveLength(1);
    expect(data.schools[0].visit_status).toBe('pending'); // session not yet ended
    expect(data.optimized_order).toEqual([]);
    expect(data.route_available).toBe(false);
  });
});
