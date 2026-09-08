/**
 * The error log line is the only signal the nightly error digest has, and it
 * has to say what the client actually got. Without a statusCode the digest
 * cannot tell a real defect (5xx) from ordinary user error (4xx) - and this
 * log is dominated by the latter: 6,466 "Invalid registration number or PIN"
 * entries in one production window.
 *
 * The status must be the FINAL one, after the MySQL/JWT mappings below it,
 * not `err.statusCode` as it arrived.
 */

const { errorHandler } = require('../../src/middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../../src/utils/errors');

const makeReq = () => ({
  path: '/api/portal/acceptance/submit',
  method: 'POST',
  requestId: 'req-1',
});

const makeRes = () => {
  const res = { statusCode: null, body: null };
  res.status = jest.fn((c) => { res.statusCode = c; return res; });
  res.json = jest.fn((b) => { res.body = b; return res; });
  return res;
};

let logged;
let spy;

beforeEach(() => {
  logged = [];
  spy = jest.spyOn(console, 'error').mockImplementation((...args) => { logged.push(args); });
});

afterEach(() => spy.mockRestore());

/** The object the handler logs alongside the 'Error:' label. */
const loggedPayload = () => {
  const entry = logged.find((a) => a[0] === 'Error:' && typeof a[1] === 'object');
  return entry ? entry[1] : null;
};

describe('errorHandler logging', () => {
  test('records the status the client received for a validation error', () => {
    const res = makeRes();
    errorHandler(new ValidationError('Name is required'), makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(loggedPayload()).toMatchObject({ statusCode: 400 });
  });

  test('records 500 for an unmapped error', () => {
    const res = makeRes();
    errorHandler(new Error('kaboom'), makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(loggedPayload()).toMatchObject({ statusCode: 500 });
  });

  test('records the MAPPED status, not the raw one, for a MySQL duplicate', () => {
    const err = new Error('ER_DUP_ENTRY: duplicate');
    err.code = 'ER_DUP_ENTRY';
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());

    // Mapped to 409 below the log site; logging before the mapping would say 500.
    expect(res.status).toHaveBeenCalledWith(409);
    expect(loggedPayload()).toMatchObject({ statusCode: 409 });
  });

  test('records the mapped status for an expired token', () => {
    const err = new Error('jwt expired');
    err.name = 'TokenExpiredError';
    const res = makeRes();
    errorHandler(err, makeReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(loggedPayload()).toMatchObject({ statusCode: 401 });
  });

  test('keeps the existing context fields', () => {
    const res = makeRes();
    errorHandler(new NotFoundError('Student not found'), makeReq(), res, jest.fn());

    expect(loggedPayload()).toMatchObject({
      message: 'Student not found',
      path: '/api/portal/acceptance/submit',
      method: 'POST',
      requestId: 'req-1',
      statusCode: 404,
    });
  });
});
