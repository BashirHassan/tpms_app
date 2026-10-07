const mockQuery = jest.fn();

jest.mock('../../src/db/database', () => ({
  query: mockQuery,
  queryOne: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../../src/services/emailQueueService', () => ({
  queueHighPriority: jest.fn(),
  enqueue: jest.fn(),
}));

const authController = require('../../src/controllers/authController');
const dashboardController = require('../../src/controllers/dashboardController');
const monitoringController = require('../../src/controllers/monitoringController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue([]);
});

describe('authController.register - field monitor institution', () => {
  it('files the new user under the URL institution, ignoring institution_id in the body', async () => {
    mockQuery
      .mockResolvedValueOnce([]) // email not taken
      .mockResolvedValueOnce({ insertId: 77 }); // insert

    const res = createResponse();
    const next = jest.fn();
    await authController.register(
      {
        params: { institutionId: '3' },
        // 1928 is what parseInt() makes of a public_id like '1928d577...'
        body: { name: 'MONITOR ONE', email: 'monitor@example.com', role: 'field_monitor', institution_id: 1928 },
        user: { id: 1, role: 'super_admin' },
        headers: {},
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toContain('INSERT INTO users');
    expect(params[0]).toBe(3);
    expect(params[5]).toBe('field_monitor');
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('dashboardController.getSupervisorStats - field monitor', () => {
  it('only queries columns that exist on the monitoring tables', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5, name: '2025/2026' }]); // current session

    const res = createResponse();
    const next = jest.fn();
    await dashboardController.getSupervisorStats(
      { params: { institutionId: '3' }, user: { id: 9, role: 'field_monitor' } },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    const sql = mockQuery.mock.calls.map(([s]) => s).join('\n');
    for (const column of ['priority', 'assigned_at', 'ma.notes', 'visit_date', 'overall_rating', 'students_observed', 'supervisor_present', 'mr.status', "'in_progress'", "'draft'"]) {
      expect(sql).not.toContain(column);
    }
    expect(res.json.mock.calls[0][0].data.role).toBe('field_monitor');
  });
});

describe('monitoringController - field monitor ownership', () => {
  it("rejects reading another monitor's assignment", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 4, monitor_id: 50 }]);

    const next = jest.fn();
    await monitoringController.getAssignment(
      { params: { institutionId: '3', id: '4' }, user: { id: 9, role: 'field_monitor' } },
      createResponse(),
      next
    );

    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it("rejects reading another monitor's report", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 4, monitor_id: 50 }]);

    const next = jest.fn();
    await monitoringController.getReport(
      { params: { institutionId: '3', id: '4' }, user: { id: 9, role: 'field_monitor' } },
      createResponse(),
      next
    );

    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
});

describe('monitoringController.getUnassignedSchools', () => {
  const request = { params: { institutionId: '3' }, query: { session_id: '5', monitoring_type: 'school_evaluation' } };

  it('leaves out schools that already have a monitor or have no students', async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, name: 'ASSIGNABLE', student_count: '4', is_assigned: 0 },
      { id: 2, name: 'HAS MONITOR', student_count: 6, is_assigned: 1 },
      { id: 3, name: 'NO STUDENTS', student_count: 0, is_assigned: 0 },
      { id: 4, name: 'HAS MONITOR, NO STUDENTS', student_count: 0, is_assigned: 1 },
    ]);

    const res = createResponse();
    const next = jest.fn();
    await monitoringController.getUnassignedSchools(request, res, next);

    expect(next).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.data).toEqual([{ id: 1, name: 'ASSIGNABLE', student_count: 4 }]);
    expect(body.meta).toEqual({ already_assigned: 2, no_students: 1 });
  });

  it('scopes the lookup to the institution, session and monitoring type', async () => {
    const res = createResponse();
    await monitoringController.getUnassignedSchools(request, res, jest.fn());

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("ma.status <> 'cancelled'");
    expect(sql).not.toMatch(/LIMIT/i);
    expect(params).toEqual([3, 5, 'school_evaluation', 3, 5, 3]);
  });
});
