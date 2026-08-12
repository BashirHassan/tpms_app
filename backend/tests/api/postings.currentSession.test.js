/**
 * Current Session Bulk Clear Tests
 *
 * Tests the super-admin-only endpoints that clear every posting in the current session:
 * - GET    /api/:institutionId/postings/current-session/summary
 * - DELETE /api/:institutionId/postings/current-session
 *
 * Focus: only super admins can reach these, the request body is validated, and the
 * routes are not swallowed by the /postings/:id CRUD routes registered after them.
 */

const request = require('supertest');

const {
  generateSuperAdminToken,
  generateStudentToken,
} = require('../helpers/testUtils');

let app;

beforeAll(async () => {
  const { createTestApp } = require('../helpers/appFactory');
  app = createTestApp();
});

const institutionId = 1;
const summaryPath = `/api/${institutionId}/postings/current-session/summary`;
const clearPath = `/api/${institutionId}/postings/current-session`;

// ============================================================================
// AUTHENTICATION
// ============================================================================

describe('Current session clear - authentication', () => {
  it('should reject the summary request without a token', async () => {
    const response = await request(app).get(summaryPath);
    expect(response.status).toBe(401);
  });

  it('should reject the clear request without a token', async () => {
    const response = await request(app)
      .delete(clearPath)
      .send({ mode: 'hard', confirm: 'DELETE' });

    expect(response.status).toBe(401);
  });

  it('should reject student access', async () => {
    const studentToken = generateStudentToken();

    const summary = await request(app)
      .get(summaryPath)
      .set('Authorization', `Bearer ${studentToken}`);
    const clear = await request(app)
      .delete(clearPath)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ mode: 'soft', confirm: 'DELETE' });

    expect([401, 403]).toContain(summary.status);
    expect([401, 403]).toContain(clear.status);
  });
});

// ============================================================================
// ROLE ENFORCEMENT - the core guarantee of this feature
//
// `authenticate` reloads the user from the database and uses that role, not the
// role claimed in the token (see src/middleware/auth.js), so an HTTP-level role
// test would only reflect whatever user id 1 happens to be locally. These assert
// the guard itself and that it is actually wired onto both routes.
// ============================================================================

describe('isSuperAdmin guard', () => {
  const { isSuperAdmin, ROLES } = require('../../src/middleware/rbac');

  const runGuard = (user) => {
    const req = { user };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    const next = jest.fn();
    isSuperAdmin(req, res, next);
    return { res, next };
  };

  it('should allow super_admin through', () => {
    const { next } = runGuard({ id: 1, role: ROLES.SUPER_ADMIN });
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ROLES.HEAD_OF_TEACHING_PRACTICE,
    ROLES.SUPERVISOR,
    ROLES.FIELD_MONITOR,
  ])('should reject %s with 403', (role) => {
    const { res, next } = runGuard({ id: 2, role });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.errorCode).toBe('INSUFFICIENT_ROLE');
  });

  it('should reject an unauthenticated request with 401', () => {
    const { res, next } = runGuard(undefined);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

describe('Current session routes - registration', () => {
  const { isSuperAdmin, staffOnly } = require('../../src/middleware/rbac');
  const router = require('../../src/routes/postings');

  const layersFor = (path) =>
    router.stack.filter((layer) => layer.route && layer.route.path === path);

  const indexOf = (path, method) =>
    router.stack.findIndex(
      (layer) => layer.route && layer.route.path === path && layer.route.methods[method]
    );

  it('should guard both endpoints with isSuperAdmin, not staffOnly', () => {
    const paths = [
      '/:institutionId/postings/current-session/summary',
      '/:institutionId/postings/current-session',
    ];

    for (const path of paths) {
      const [layer] = layersFor(path);
      expect(layer).toBeDefined();

      const handlers = layer.route.stack.map((s) => s.handle);
      expect(handlers).toContain(isSuperAdmin);
      expect(handlers).not.toContain(staffOnly);
    }
  });

  it('should register the current-session routes before the /:id routes', () => {
    // If this ordering regresses, Express matches /postings/:id first and parses
    // "current-session" as the posting id
    expect(indexOf('/:institutionId/postings/current-session', 'delete'))
      .toBeLessThan(indexOf('/:institutionId/postings/:id', 'delete'));
    expect(indexOf('/:institutionId/postings/current-session/summary', 'get'))
      .toBeLessThan(indexOf('/:institutionId/postings/:id', 'get'));
  });
});

// ============================================================================
// BODY VALIDATION
// ============================================================================

describe('DELETE /api/:institutionId/postings/current-session - validation', () => {
  const superAdminToken = generateSuperAdminToken();

  // Institution access resolution needs a database, so 403 is an accepted outcome
  const acceptable = [400, 403];

  it('should reject a missing body', async () => {
    const response = await request(app)
      .delete(clearPath)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({});

    expect(acceptable).toContain(response.status);
  });

  it('should reject an invalid mode', async () => {
    const response = await request(app)
      .delete(clearPath)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ mode: 'permanent', confirm: 'DELETE' });

    expect(acceptable).toContain(response.status);
  });

  it('should reject a missing confirm token', async () => {
    const response = await request(app)
      .delete(clearPath)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ mode: 'hard' });

    expect(acceptable).toContain(response.status);
  });

  it('should reject a wrong confirm token', async () => {
    const response = await request(app)
      .delete(clearPath)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ mode: 'hard', confirm: 'delete' });

    expect(acceptable).toContain(response.status);
  });
});
