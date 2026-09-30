const mockQuery = jest.fn();

jest.mock('../../src/db/database', () => ({
  query: mockQuery,
  transaction: jest.fn(),
}));

jest.mock('../../src/middleware/featureToggle', () => ({
  isFeatureEnabled: jest.fn(async () => false),
}));

const resultController = require('../../src/controllers/resultController');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

const baseResult = { student_id: 7, school_id: 3, group_number: 1, visit_number: 2 };

const makeReq = (results) => ({
  params: { institutionId: '1' },
  body: { results },
  user: { id: 9, role: 'supervisor' },
});

// Queue the lookups submitBulkResults makes for one result: session, student, existing row
const queueLookups = (existingRows = []) => {
  mockQuery
    .mockResolvedValueOnce([{ id: 5, status: 'active' }]) // current session
    .mockResolvedValueOnce([{ id: 7 }]) // student belongs to institution
    .mockResolvedValueOnce(existingRows); // existing result for student/visit
};

describe('resultController.submitBulkResults - absent students', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('inserts an absent student without a score as a placeholder 0', async () => {
    queueLookups([]);
    mockQuery.mockResolvedValueOnce({ insertId: 41 });

    const res = createResponse();
    const next = jest.fn();
    await resultController.submitBulkResults(
      makeReq([{ ...baseResult, is_absent: true, score_breakdown: { 1: 10 } }]),
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    const [sql, params] = mockQuery.mock.calls[3];
    expect(sql).toContain('INSERT INTO student_results');
    expect(sql).toContain('is_absent');
    // [..., scoring_type, total_score, is_absent, score_breakdown]
    expect(params.slice(-3)).toEqual([0, 1, null]);
    expect(res.json.mock.calls[0][0].data.failed).toEqual([]);
  });

  it('turns an existing score into an absent record', async () => {
    queueLookups([{ id: 30 }]);
    mockQuery.mockResolvedValueOnce({ affectedRows: 1 });

    const res = createResponse();
    await resultController.submitBulkResults(
      makeReq([{ ...baseResult, is_absent: true, total_score: 80 }]),
      res,
      jest.fn()
    );

    const [sql, params] = mockQuery.mock.calls[3];
    expect(sql).toContain('UPDATE student_results');
    expect(params).toEqual([9, 'basic', 0, 1, null, 30]);
  });

  it('clears the absent flag when a real score is saved afterwards', async () => {
    queueLookups([{ id: 30 }]);
    mockQuery.mockResolvedValueOnce({ affectedRows: 1 });

    await resultController.submitBulkResults(
      makeReq([{ ...baseResult, total_score: 72.5 }]),
      createResponse(),
      jest.fn()
    );

    expect(mockQuery.mock.calls[3][1]).toEqual([9, 'basic', 72.5, 0, null, 30]);
  });

  it('still requires a score for a present student', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 5, status: 'active' }]);

    const res = createResponse();
    await resultController.submitBulkResults(makeReq([{ ...baseResult }]), res, jest.fn());

    const { successful, failed } = res.json.mock.calls[0][0].data;
    expect(successful).toEqual([]);
    expect(failed[0].error).toBe('Missing required fields');
  });

  it('rejects a student that belongs to another institution', async () => {
    mockQuery
      .mockResolvedValueOnce([{ id: 5, status: 'active' }])
      .mockResolvedValueOnce([]); // student not found for this institution

    const res = createResponse();
    await resultController.submitBulkResults(
      makeReq([{ ...baseResult, is_absent: true }]),
      res,
      jest.fn()
    );

    const { successful, failed } = res.json.mock.calls[0][0].data;
    expect(successful).toEqual([]);
    expect(failed[0].error).toBe('Student not found');
    // No INSERT/UPDATE was attempted
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });
});
