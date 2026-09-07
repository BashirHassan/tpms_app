/**
 * CORS origin policy.
 *
 * Production evidence (pm2-error.log, Sep 2026): 14 rejections of
 * "CORS blocked origin: https://sitpms.com". The apex serves our own landing
 * page, but only *.sitpms.com was ever allowed, so every API call from the
 * apex failed.
 */

const ORIGINAL_ENV = { ...process.env };

function loadCors({ nodeEnv = 'production', baseDomain, corsOrigin } = {}) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.JWT_SECRET = 'test-secret-key-for-jwt-signing-long-enough';
  process.env.DB_PASSWORD = 'x';
  if (baseDomain) process.env.BASE_DOMAIN = baseDomain;
  else delete process.env.BASE_DOMAIN;
  if (corsOrigin) process.env.CORS_ORIGIN = corsOrigin;
  else delete process.env.CORS_ORIGIN;

  return require('../../src/config').cors;
}

const allows = (cors, origin) => {
  let allowed = false;
  cors.origin(origin, (err, ok) => { allowed = !err && ok === true; });
  return allowed;
};

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

describe('CORS origin policy', () => {
  test('allows the apex domain, which serves our landing page', () => {
    const cors = loadCors();
    expect(allows(cors, 'https://sitpms.com')).toBe(true);
  });

  test('allows institution subdomains', () => {
    const cors = loadCors();
    expect(allows(cors, 'https://gsu.sitpms.com')).toBe(true);
    expect(allows(cors, 'https://demo.sitpms.com')).toBe(true);
  });

  test('still rejects unrelated origins', () => {
    const cors = loadCors();
    expect(allows(cors, 'https://dxxs3.com')).toBe(false);
    expect(allows(cors, 'https://evil.example.com')).toBe(false);
  });

  test('does not allow a lookalike that merely ends with the base domain', () => {
    const cors = loadCors();
    // "notsitpms.com" must not match via a bare endsWith on the base domain.
    expect(allows(cors, 'https://notsitpms.com')).toBe(false);
  });

  test('rejects plaintext http in production', () => {
    const cors = loadCors();
    expect(allows(cors, 'http://sitpms.com')).toBe(false);
    expect(allows(cors, 'http://gsu.sitpms.com')).toBe(false);
  });

  test('honours BASE_DOMAIN', () => {
    const cors = loadCors({ baseDomain: 'siwesms.com' });
    expect(allows(cors, 'https://siwesms.com')).toBe(true);
    expect(allows(cors, 'https://gsu.siwesms.com')).toBe(true);
    expect(allows(cors, 'https://sitpms.com')).toBe(false);
  });
});
