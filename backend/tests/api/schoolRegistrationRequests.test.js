/**
 * School Registration Request Controller Tests
 *
 * Covers the student edit/resubmit flow: a pending or rejected request can be
 * corrected (rejected goes back to pending, remembering the rejection reason),
 * an approved one cannot, nobody can edit someone else's request, and a
 * reviewer is told when the student edited a request after they opened it.
 */

jest.mock('../../src/db/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  transaction: jest.fn(),
}));

const { query, queryOne, transaction } = require('../../src/db/database');
const controller = require('../../src/controllers/schoolRegistrationRequestController');
const { ValidationError, NotFoundError, ConflictError } = require('../../src/utils/errors');

const STUDENT = { id: 10, institution_id: 1 };

const VALID_BODY = {
  name: 'government secondary school  wudil',
  official_code: null,
  school_type: 'senior',
  category: 'public',
  state: 'Kano',
  lga: 'Wudil',
  ward: null,
  address: '12 School Road, Wudil',
};

function makeReq({ params = { id: '7' }, body = VALID_BODY } = {}) {
  return { student: STUDENT, params, body, ip: '127.0.0.1' };
}

function makeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

const existingRow = (overrides = {}) => ({
  id: 7,
  session_id: 3,
  student_id: STUDENT.id,
  institution_id: STUDENT.institution_id,
  name: 'GSS WUDIL',
  official_code: null,
  school_type: 'senior',
  category: 'public',
  state: 'KANO',
  lga: 'WUDIL',
  ward: null,
  address: 'School Road',
  status: 'rejected',
  rejection_reason: 'Address is incomplete',
  previous_rejection_reason: null,
  resubmit_count: 0,
  ...overrides,
});

// Runs updateRequest against a mocked transaction whose locked SELECT returns `row`.
async function runUpdate(row, reqOverrides, { currentSessionId = 3, otherLiveRequest = null, insertError = null } = {}) {
  const conn = {
    execute: jest.fn((sql) => {
      if (sql.includes('FOR UPDATE')) return Promise.resolve([row ? [row] : []]);
      if (sql.includes('FROM academic_sessions')) {
        return Promise.resolve([currentSessionId ? [{ id: currentSessionId }] : []]);
      }
      if (sql.includes('id <> ?')) return Promise.resolve([otherLiveRequest ? [otherLiveRequest] : []]);
      if (insertError && sql.includes('UPDATE school_registration_requests')) return Promise.reject(insertError);
      return Promise.resolve([{}]);
    }),
  };
  transaction.mockImplementation(async (fn) => fn(conn));
  queryOne.mockResolvedValue({ id: 7, status: 'pending' });

  const req = makeReq(reqOverrides);
  const res = makeRes();
  const next = jest.fn();
  await controller.updateRequest(req, res, next);
  return { conn, res, next };
}

const callMatching = (conn, text) => conn.execute.mock.calls.find(([sql]) => sql.includes(text));

describe('schoolRegistrationRequestController.updateRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resets a rejected request to pending and remembers the rejection reason', async () => {
    const { conn, res, next } = await runUpdate(existingRow());

    expect(next).not.toHaveBeenCalled();
    const [sql, params] = callMatching(conn, 'UPDATE school_registration_requests');
    expect(sql).toContain("status = 'pending'");
    expect(sql).toContain('rejection_reason = NULL');
    expect(sql).toContain('resubmit_count = resubmit_count + 1');
    // previous_rejection_reason param is the old rejection reason
    expect(params).toContain('Address is incomplete');
    // name and location are stored in the registry's upper-case, single-spaced form
    expect(params).toContain('GOVERNMENT SECONDARY SCHOOL WUDIL');
    expect(params).toContain('KANO');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 7, status: 'pending' } });
  });

  it('writes an audit row holding the old reason and values', async () => {
    const { conn } = await runUpdate(existingRow());

    const [, params] = callMatching(conn, 'INSERT INTO audit_logs');
    const details = JSON.parse(params[3]);
    expect(details.previous_status).toBe('rejected');
    expect(details.previous_rejection_reason).toBe('Address is incomplete');
    expect(details.previous_values.address).toBe('School Road');
  });

  it('keeps the saved previous reason when a pending request is edited again', async () => {
    const row = existingRow({
      status: 'pending',
      rejection_reason: null,
      previous_rejection_reason: 'Address is incomplete',
    });
    const { conn, next } = await runUpdate(row);

    expect(next).not.toHaveBeenCalled();
    const [, params] = callMatching(conn, 'UPDATE school_registration_requests');
    expect(params).toContain('Address is incomplete');
  });

  it('leaves previous_rejection_reason empty for a never-rejected pending request', async () => {
    const row = existingRow({ status: 'pending', rejection_reason: null });
    const { conn, next } = await runUpdate(row);

    expect(next).not.toHaveBeenCalled();
    const [, params] = callMatching(conn, 'UPDATE school_registration_requests');
    // previous_rejection_reason is bound just before the request id
    expect(params[params.length - 2]).toBeNull();
  });

  it('refuses to edit an approved request', async () => {
    const { conn, next, res } = await runUpdate(existingRow({ status: 'approved', rejection_reason: null }));

    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(callMatching(conn, 'UPDATE school_registration_requests')).toBeUndefined();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('refuses to edit a request from a previous session', async () => {
    const { conn, next } = await runUpdate(existingRow({ session_id: 2 }));

    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(callMatching(conn, 'UPDATE school_registration_requests')).toBeUndefined();
  });

  it('refuses to revive a rejected request when another live request exists', async () => {
    const { conn, next } = await runUpdate(existingRow(), undefined, {
      otherLiveRequest: { id: 9 },
    });

    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(callMatching(conn, 'UPDATE school_registration_requests')).toBeUndefined();
  });

  it('turns the one-live-request unique key violation into a conflict', async () => {
    const dup = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    const { next, res } = await runUpdate(existingRow(), undefined, { insertError: dup });

    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(res.json).not.toHaveBeenCalled();
  });

  it("returns not found for another student's request", async () => {
    // the locked SELECT is scoped by student_id, so a mismatch yields no row
    const { conn, next } = await runUpdate(null);

    const [, params] = callMatching(conn, 'FOR UPDATE');
    expect(params).toEqual([7, STUDENT.id, STUDENT.institution_id]);
    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });

  it('rejects an invalid school type at the schema level', () => {
    const result = controller.schemas.update.safeParse({ body: { ...VALID_BODY, school_type: 'university' } });
    expect(result.success).toBe(false);
  });
});

describe('schoolRegistrationRequestController.submitRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('still blocks a second request while one is pending', async () => {
    queryOne
      .mockResolvedValueOnce({ id: 3 }) // current session
      .mockResolvedValueOnce({ id: 7, status: 'pending' }); // existing request

    const req = makeReq({ params: {} });
    const res = makeRes();
    const next = jest.fn();

    await controller.submitRequest(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    expect(query).not.toHaveBeenCalled();
  });
});

// Runs approve/reject against a mocked transaction whose locked SELECT returns `row`.
async function runReview(handler, row, body) {
  const conn = {
    execute: jest.fn((sql) => {
      if (sql.includes('FOR UPDATE')) return Promise.resolve([[row]]);
      if (sql.includes('FROM master_schools')) return Promise.resolve([[]]);
      if (sql.includes('FROM institution_schools')) return Promise.resolve([[]]);
      if (sql.includes('INSERT INTO')) return Promise.resolve([{ insertId: 50 }]);
      return Promise.resolve([{ affectedRows: 1 }]);
    }),
  };
  transaction.mockImplementation(async (fn) => fn(conn));
  queryOne.mockResolvedValue({ id: 7 });

  const req = { params: { id: '7' }, body, user: { id: 1 } };
  const res = makeRes();
  const next = jest.fn();
  await handler(req, res, next);
  return { conn, res, next };
}

describe('review guard against edits made after the reviewer opened the request', () => {
  const pendingRow = existingRow({ status: 'pending', rejection_reason: null, resubmit_count: 2 });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reject fails with a conflict when the student edited since the reviewer loaded it', async () => {
    const { conn, next } = await runReview(controller.reject, pendingRow, {
      rejection_reason: 'Address is incomplete',
      expected_resubmit_count: 1,
    });

    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(callMatching(conn, "SET status = 'rejected'")).toBeUndefined();
  });

  it('reject goes through when the count matches', async () => {
    const { conn, next } = await runReview(controller.reject, pendingRow, {
      rejection_reason: 'Address is incomplete',
      expected_resubmit_count: 2,
    });

    expect(next).not.toHaveBeenCalled();
    expect(callMatching(conn, "SET status = 'rejected'")).toBeDefined();
  });

  it('approve fails with a conflict before creating anything when the count is stale', async () => {
    const { conn, next } = await runReview(controller.approve, pendingRow, { expected_resubmit_count: 0 });

    expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    expect(callMatching(conn, 'INSERT INTO master_schools')).toBeUndefined();
  });

  it('callers that send no count are not checked', async () => {
    const { next } = await runReview(controller.reject, pendingRow, { rejection_reason: 'Address is incomplete' });

    expect(next).not.toHaveBeenCalled();
  });
});
