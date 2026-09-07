/**
 * Rate limiter identity tests.
 *
 * tpms never called app.set('trust proxy'), so req.ip was the nginx address
 * for every request and every IP-keyed bucket collapsed into one global
 * bucket. Demonstrated on staging: ten password resets by ten DIFFERENT users
 * exhausted sensitiveRateLimiter and the eleventh user got a 429.
 *
 * apiRateLimiter was also imported but never mounted, so there was no general
 * API protection at all - which is how one student managed 9,023 requests to
 * /api/portal/documents/evaluation_form in a single day.
 */

const {
  createRateLimiter,
  getClientIP,
  apiRateLimiter,
  ipCeilingRateLimiter,
  sensitiveRateLimiter,
} = require('../../src/middleware/rateLimiter');

const makeReq = ({ ip = '1.2.3.4', token, headers = {}, user } = {}) => ({
  ip,
  headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers,
  },
  socket: { remoteAddress: ip },
  path: '/api/test',
  user,
  body: {},
});

const hit = (mw, req) => {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
    on() {},
    send(b) { return b; },
  };
  let passed = false;
  mw(req, res, () => { passed = true; });
  return passed;
};

describe('getClientIP', () => {
  test('prefers the Cloudflare header, which the edge overwrites', () => {
    expect(getClientIP(makeReq({
      ip: '127.0.0.1',
      headers: { 'cf-connecting-ip': '105.112.124.235' },
    }))).toBe('105.112.124.235');
  });

  test('falls back to the first X-Forwarded-For entry', () => {
    expect(getClientIP(makeReq({
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '102.91.4.192, 172.16.0.1' },
    }))).toBe('102.91.4.192');
  });

  test('normalises IPv4-mapped IPv6', () => {
    expect(getClientIP(makeReq({ ip: '::ffff:105.112.1.1' }))).toBe('105.112.1.1');
  });
});

describe('sensitiveRateLimiter', () => {
  test('separates callers by real client IP rather than one global bucket', () => {
    const cf = (ip) => makeReq({ ip: '127.0.0.1', headers: { 'cf-connecting-ip': ip } });

    let blocked = false;
    for (let i = 0; i < 12; i++) {
      if (!hit(sensitiveRateLimiter, cf('197.211.0.1'))) blocked = true;
    }
    expect(blocked).toBe(true);

    // A different person, arriving through the same nginx, must not be locked
    // out by the first person's attempts.
    expect(hit(sensitiveRateLimiter, cf('197.211.0.2'))).toBe(true);
  });
});

describe('apiRateLimiter', () => {
  const cfToken = (ip, token) =>
    makeReq({ ip: '127.0.0.1', token, headers: { 'cf-connecting-ip': ip } });

  test('gives each logged-in session its own bucket behind a shared NAT', () => {
    let blocked = false;
    for (let i = 0; i < 70; i++) {
      if (!hit(apiRateLimiter, cfToken('105.112.9.9', 'token-A'))) blocked = true;
    }
    expect(blocked).toBe(true);
    expect(hit(apiRateLimiter, cfToken('105.112.9.9', 'token-B'))).toBe(true);
  });

  test('does not lump anonymous traffic from one IP into a single bucket', () => {
    // A campus NAT during a login rush: many people, no tokens yet. The
    // ceiling and the per-route auth/public limiters cover these instead.
    const anon = makeReq({ ip: '127.0.0.1', headers: { 'cf-connecting-ip': '105.112.7.7' } });

    let blocked = false;
    for (let i = 0; i < 200; i++) {
      if (!hit(apiRateLimiter, anon)) blocked = true;
    }
    expect(blocked).toBe(false);
  });

  test('still caps a single session', () => {
    let allowed = 0;
    for (let i = 0; i < 80; i++) {
      if (hit(apiRateLimiter, cfToken('105.112.9.10', 'token-solo'))) allowed++;
    }
    expect(allowed).toBeLessThanOrEqual(60);
  });
});

describe('ipCeilingRateLimiter', () => {
  const cfToken = (ip, token) =>
    makeReq({ ip: '127.0.0.1', token, headers: { 'cf-connecting-ip': ip } });

  test('stops a flood of rotating tokens from one IP', () => {
    let blocked = false;
    for (let i = 0; i < 700; i++) {
      if (!hit(ipCeilingRateLimiter, cfToken('203.0.113.9', `rot-${i}`))) blocked = true;
    }
    expect(blocked).toBe(true);
  });

  test('does not fire at ordinary shared-campus volumes', () => {
    let blocked = false;
    for (let i = 0; i < 200; i++) {
      if (!hit(ipCeilingRateLimiter, cfToken('203.0.113.10', `student-${i % 40}`))) blocked = true;
    }
    expect(blocked).toBe(false);
  });
});

describe('createRateLimiter options', () => {
  test('honours an explicit maxRequests of 0 rather than falling back', () => {
    const mw = createRateLimiter({ maxRequests: 0, windowMs: 60000, keyGenerator: () => 'zero' });
    expect(hit(mw, makeReq())).toBe(false);
  });
});
