/**
 * Auto-Posting Route Guard Tests
 *
 * Auto-posting creates postings in bulk across a whole institution, so every one
 * of its endpoints is restricted to super_admin.
 *
 * `authenticate` reloads the user from the database and uses that role rather
 * than the one claimed in the token (see src/middleware/auth.js), so an HTTP-level
 * role test would only reflect whatever user id 1 happens to be in the local
 * database. These inspect the router directly instead, which is deterministic.
 */

const { isSuperAdmin, isHeadOfTP, staffOnly } = require('../../src/middleware/rbac');

const router = require('../../src/routes/autoPosting');

const AUTO_POSTING_PATHS = [
  { path: '/:institutionId/auto-posting/options', method: 'get' },
  { path: '/:institutionId/auto-posting/preview', method: 'post' },
  { path: '/:institutionId/auto-posting/execute', method: 'post' },
  { path: '/:institutionId/auto-posting/history', method: 'get' },
  { path: '/:institutionId/auto-posting/:batchId/rollback', method: 'post' },
];

const layerFor = ({ path, method }) =>
  router.stack.find((layer) => layer.route && layer.route.path === path && layer.route.methods[method]);

describe('auto-posting routes are super admin only', () => {
  it.each(AUTO_POSTING_PATHS)('$method $path is guarded by isSuperAdmin', (route) => {
    const layer = layerFor(route);
    expect(layer).toBeDefined();

    const handlers = layer.route.stack.map((s) => s.handle);
    expect(handlers).toContain(isSuperAdmin);
  });

  it.each(AUTO_POSTING_PATHS)('$method $path does not fall back to a weaker guard', (route) => {
    const handlers = layerFor(route).route.stack.map((s) => s.handle);

    // A weaker guard anywhere in the chain would let heads of TP or deans through
    expect(handlers).not.toContain(isHeadOfTP);
    expect(handlers).not.toContain(staffOnly);
  });

  it('covers every route the module registers', () => {
    const registered = router.stack.filter((layer) => layer.route).length;
    expect(registered).toBe(AUTO_POSTING_PATHS.length);
  });
});
