/**
 * School Capture Route Guard + Rule Tests
 *
 * Like autoPosting.routes.test.js, these inspect the router directly rather than
 * going over HTTP (authenticate reloads the user from the database, so an HTTP
 * role test would only reflect whatever user happens to exist locally).
 *
 * Also covers the pure helpers that decide what a school still needs and how
 * far along an assignment is.
 */

const { isHeadOfTP, isSupervisor } = require('../../src/middleware/rbac');
const { authenticate } = require('../../src/middleware/auth');
const router = require('../../src/routes/schoolCapture');
const controller = require('../../src/controllers/schoolCaptureController');

const ADMIN_ROUTES = [
  { path: '/:institutionId/school-capture/options', method: 'get' },
  { path: '/:institutionId/school-capture/eligible-schools', method: 'get' },
  { path: '/:institutionId/school-capture/preview', method: 'post' },
  { path: '/:institutionId/school-capture/execute', method: 'post' },
  { path: '/:institutionId/school-capture/assignments/bulk', method: 'post' },
  { path: '/:institutionId/school-capture/assignments', method: 'get' },
  { path: '/:institutionId/school-capture/assignments/:id', method: 'patch' },
  { path: '/:institutionId/school-capture/assignments/:id/timeline', method: 'get' },
  { path: '/:institutionId/school-capture/activity', method: 'get' },
  { path: '/:institutionId/school-capture/assignments/:id', method: 'delete' },
  { path: '/:institutionId/school-capture/batches', method: 'get' },
  { path: '/:institutionId/school-capture/batches/:batchId/rollback', method: 'post' },
];

const SUPERVISOR_ROUTES = [
  { path: '/:institutionId/school-capture/my-schools', method: 'get' },
  { path: '/:institutionId/school-capture/my-schools/:assignmentId/location', method: 'post' },
  { path: '/:institutionId/school-capture/my-schools/:assignmentId/principal', method: 'post' },
];

const layerFor = ({ path, method }) =>
  router.stack.find((layer) => layer.route && layer.route.path === path && layer.route.methods[method]);

const handlersFor = (route) => layerFor(route).route.stack.map((s) => s.handle);

/** requireFeature() returns a fresh closure; find it by the 3-arg middleware shape + toggling a fake request. */
async function featureGuardRejects(handlers) {
  // The feature guard is the only async middleware with a (req,res,next) signature that
  // answers 401 when no institution context is present - call each until one does.
  for (const handler of handlers) {
    if (handler === authenticate || handler === isHeadOfTP || handler === isSupervisor) continue;
    let status = null;
    let body = null;
    const res = {
      status(code) { status = code; return this; },
      json(payload) { body = payload; return this; },
    };
    try {
      await handler({ params: {}, user: {}, body: {}, query: {} }, res, () => {});
    } catch {
      /* not the feature guard */
    }
    if (status === 401 && body?.errorCode === 'NO_INSTITUTION_CONTEXT') return true;
  }
  return false;
}

describe('school-capture routes: access control', () => {
  it.each(ADMIN_ROUTES)('admin $method $path requires Head of TP', (route) => {
    const handlers = handlersFor(route);
    expect(layerFor(route)).toBeDefined();
    expect(handlers).toContain(authenticate);
    expect(handlers).toContain(isHeadOfTP);
    // A weaker guard would let supervisors assign/inspect other supervisors' work
    expect(handlers).not.toContain(isSupervisor);
  });

  it.each(SUPERVISOR_ROUTES)('supervisor $method $path requires a supervisor-level role', (route) => {
    const handlers = handlersFor(route);
    expect(layerFor(route)).toBeDefined();
    expect(handlers).toContain(authenticate);
    expect(handlers).toContain(isSupervisor);
  });

  it('covers every route the module registers', () => {
    const registered = router.stack.filter((layer) => layer.route).length;
    expect(registered).toBe(ADMIN_ROUTES.length + SUPERVISOR_ROUTES.length);
  });

  it.each([...ADMIN_ROUTES, ...SUPERVISOR_ROUTES])(
    '$method $path sits behind the school_data_capture feature toggle',
    async (route) => {
      expect(await featureGuardRejects(handlersFor(route))).toBe(true);
    }
  );
});

describe('school-capture routes: validation is wired to the write endpoints', () => {
  it.each([
    { path: '/:institutionId/school-capture/preview', method: 'post' },
    { path: '/:institutionId/school-capture/execute', method: 'post' },
    { path: '/:institutionId/school-capture/assignments/bulk', method: 'post' },
    { path: '/:institutionId/school-capture/assignments/:id', method: 'patch' },
    { path: '/:institutionId/school-capture/my-schools/:assignmentId/location', method: 'post' },
    { path: '/:institutionId/school-capture/my-schools/:assignmentId/principal', method: 'post' },
  ])('$method $path has a validate() step before its handler', (route) => {
    const stack = layerFor(route).route.stack;
    // [..guards.., validate, handler]  -> the layer before the handler is the validator
    expect(stack.length).toBeGreaterThanOrEqual(6);
    expect(stack[stack.length - 2].handle.constructor.name).toBe('AsyncFunction');
  });
});

describe('schemas', () => {
  const { schemas } = controller;

  it('execute requires the previewed plan hash', () => {
    const base = { session_id: 1, mode: 'lga', scope: 'missing_any' };
    expect(schemas.execute.safeParse({ body: base }).success).toBe(false);
    expect(schemas.execute.safeParse({ body: { ...base, expected_plan_hash: '3-abc' } }).success).toBe(true);
  });

  it('preview defaults to an LGA run over schools missing data', () => {
    const parsed = schemas.preview.parse({ body: { session_id: '4' } });
    expect(parsed.body).toMatchObject({ session_id: 4, mode: 'lga', scope: 'missing_any', shuffle_salt: 0 });
  });

  it('rejects an unknown mode or scope', () => {
    expect(schemas.preview.safeParse({ body: { session_id: 1, mode: 'route_based' } }).success).toBe(false);
    expect(schemas.preview.safeParse({ body: { session_id: 1, scope: 'everything' } }).success).toBe(false);
  });

  it('location: validates ranges and defaults the method to gps', () => {
    const ok = schemas.submitLocation.safeParse({ body: { proposed_latitude: 10.29, proposed_longitude: 11.16 } });
    expect(ok.success).toBe(true);
    expect(ok.data.body.capture_method).toBe('gps');
    expect(schemas.submitLocation.safeParse({ body: { proposed_latitude: 91, proposed_longitude: 11 } }).success).toBe(false);
    expect(schemas.submitLocation.safeParse({ body: { proposed_latitude: 10, proposed_longitude: 181 } }).success).toBe(false);
    expect(
      schemas.submitLocation.safeParse({ body: { proposed_latitude: 10, proposed_longitude: 11, capture_method: 'telepathy' } }).success
    ).toBe(false);
  });

  it('principal: reuses the student rules (name length, Nigerian phone, upper-cased)', () => {
    const ok = schemas.submitPrincipal.safeParse({
      body: { proposed_principal_name: 'mrs a. bello', proposed_principal_phone: '08031234567' },
    });
    expect(ok.success).toBe(true);
    expect(ok.data.body.proposed_principal_name).toBe('MRS A. BELLO');
    expect(
      schemas.submitPrincipal.safeParse({ body: { proposed_principal_name: 'Bo', proposed_principal_phone: '08031234567' } }).success
    ).toBe(false);
    expect(
      schemas.submitPrincipal.safeParse({ body: { proposed_principal_name: 'Mrs Bello', proposed_principal_phone: '12345' } }).success
    ).toBe(false);
  });
});

describe('computeNeeds', () => {
  const row = (over = {}) => ({ loc_missing: 1, princ_missing: 1, loc_pending: 0, princ_pending: 0, ...over });

  it('missing_any flags whichever piece is missing', () => {
    expect(controller.computeNeeds(row(), 'missing_any')).toEqual({ needs_location: true, needs_principal: true });
    expect(controller.computeNeeds(row({ princ_missing: 0 }), 'missing_any')).toEqual({
      needs_location: true,
      needs_principal: false,
    });
  });

  it('treats a request already awaiting review as handled', () => {
    expect(controller.computeNeeds(row({ loc_pending: 1 }), 'missing_any')).toEqual({
      needs_location: false,
      needs_principal: true,
    });
  });

  it('single-piece scopes never flag the other piece', () => {
    expect(controller.computeNeeds(row(), 'missing_location')).toEqual({ needs_location: true, needs_principal: false });
    expect(controller.computeNeeds(row(), 'missing_principal')).toEqual({ needs_location: false, needs_principal: true });
  });

  it('"all" needs both regardless of what is on record', () => {
    expect(controller.computeNeeds(row({ loc_missing: 0, princ_missing: 0 }), 'all')).toEqual({
      needs_location: true,
      needs_principal: true,
    });
  });
});

describe('progress derivation', () => {
  it('uses the latest request status, else not_started / not_required', () => {
    expect(controller.deriveStatus('pending', true)).toBe('pending');
    expect(controller.deriveStatus(null, true)).toBe('not_started');
    expect(controller.deriveStatus(null, false)).toBe('not_required');
  });

  const a = (location_status, principal_status) => ({ location_status, principal_status });

  it.each([
    [a('approved', 'approved'), 'completed'],
    [a('approved', 'not_required'), 'completed'],
    [a('not_required', 'not_required'), 'completed'],
    [a('rejected', 'approved'), 'rejected'],
    [a('pending', 'not_started'), 'pending'],
    [a('approved', 'not_started'), 'in_progress'],
    [a('not_started', 'not_started'), 'not_started'],
  ])('%j -> %s', (assignment, expected) => {
    expect(controller.overallProgress(assignment)).toBe(expected);
  });
});
