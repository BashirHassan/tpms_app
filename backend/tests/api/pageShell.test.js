/**
 * Page shell - the index.html served to browsers and link-preview crawlers, with
 * the title and Open Graph tags filled in for the institution on that subdomain.
 */

const {
  buildPageMeta,
  renderPageShell,
  socialImageUrl,
  PLATFORM_META,
} = require('../../src/services/pageShellService');

const fuk = {
  name: 'Federal University of Kashere',
  subdomain: 'fuk',
  logo_url: 'https://res.cloudinary.com/demo/image/upload/v1775209471/digitaltp/logos/FUK/logo.png',
  primary_color: '#1d5a38',
  tp_unit_name: 'Teaching Practice Coordination Unit',
};

const SHELL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="description" content="DigitalTP - Teaching Practice Management System for Tertiary Institutions" />
    <meta property="og:title" content="DigitalTP" />
    <meta name="twitter:card" content="summary" />
    <title>DigitalTP - Teaching Practice Management System</title>
    <script type="module" src="/assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('buildPageMeta', () => {
  it('describes the institution on the subdomain', () => {
    const meta = buildPageMeta(fuk, { url: 'https://fuk.sitpms.com/login' });

    expect(meta.title).toBe('Federal University of Kashere - Teaching Practice Coordination Unit');
    expect(meta.description).toContain('Federal University of Kashere');
    expect(meta.siteName).toBe('Federal University of Kashere');
    expect(meta.url).toBe('https://fuk.sitpms.com/login');
    expect(meta.image).toContain('res.cloudinary.com');
  });

  it('falls back to a plain teaching practice title when no unit name is set', () => {
    const meta = buildPageMeta({ ...fuk, tp_unit_name: null }, { url: 'https://fuk.sitpms.com/' });
    expect(meta.title).toBe('Federal University of Kashere - Teaching Practice Portal');
  });

  it('uses the platform details when there is no institution', () => {
    const meta = buildPageMeta(null, { url: 'https://sitpms.com/' });

    expect(meta.title).toBe(PLATFORM_META.title);
    expect(meta.description).toBe(PLATFORM_META.description);
    expect(meta.image).toBeNull();
  });
});

describe('socialImageUrl', () => {
  it('builds a 1200x630 card from a Cloudinary logo, framed in the institution colour', () => {
    const url = socialImageUrl(fuk);

    expect(url.startsWith('https://res.cloudinary.com/demo/image/upload/')).toBe(true);
    expect(url.endsWith('/v1775209471/digitaltp/logos/FUK/logo.png')).toBe(true);
    expect(url).toContain('bo_24px_solid_rgb:1d5a38');
    expect(url).toContain('w_1152');
    expect(url).toContain('f_jpg');
  });

  it('escapes commas and slashes in the name, which would otherwise end the overlay', () => {
    const url = socialImageUrl({ ...fuk, name: 'College of Arts, Science/Tech (Gombe)' });
    const overlay = url.split('/').find((part) => part.startsWith('l_text:'));

    expect(overlay).toContain('College%20of%20Arts%252C%20Science%252FTech');
    expect(overlay.split(',')).toHaveLength(4); // text, colour, crop, width - no stray commas
  });

  it('ignores a colour that is not a plain hex value', () => {
    expect(socialImageUrl({ ...fuk, primary_color: 'red;}' })).toContain('bo_24px_solid_rgb:1d4ed8');
  });

  it('returns a non-Cloudinary logo as it is', () => {
    expect(socialImageUrl({ ...fuk, logo_url: 'https://example.edu/logo.png' })).toBe('https://example.edu/logo.png');
  });

  it('returns nothing without a usable logo', () => {
    expect(socialImageUrl({ ...fuk, logo_url: null })).toBeNull();
    expect(socialImageUrl({ ...fuk, logo_url: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('renderPageShell', () => {
  const html = renderPageShell(SHELL, buildPageMeta(fuk, { url: 'https://fuk.sitpms.com/' }));

  it('replaces the title and description', () => {
    expect(html).toContain('<title>Federal University of Kashere - Teaching Practice Coordination Unit</title>');
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
    expect(html).not.toContain('Teaching Practice Management System for Tertiary Institutions');
  });

  it('writes one set of Open Graph and Twitter tags', () => {
    expect(html).toContain('<meta property="og:title" content="Federal University of Kashere - Teaching Practice Coordination Unit" />');
    expect(html).toContain('<meta property="og:url" content="https://fuk.sitpms.com/" />');
    expect(html).toContain('<meta property="og:site_name" content="Federal University of Kashere" />');
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(html.match(/name="twitter:card"/g)).toHaveLength(1);
  });

  it('leaves the rest of the page alone', () => {
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
    expect(html).toContain('<div id="root"></div>');
  });

  it('escapes institution text so it cannot break out of a tag', () => {
    const hostile = renderPageShell(
      SHELL,
      buildPageMeta({ ...fuk, name: 'Evil"><script>alert(1)</script>', logo_url: null }, { url: 'https://x.sitpms.com/?a="><b>' })
    );

    expect(hostile).not.toContain('<script>alert(1)</script>');
    expect(hostile).not.toContain('"><b>');
    expect(hostile).toContain('Evil&quot;&gt;&lt;script&gt;');
  });

  it('omits the image tags and uses the small card when there is no image', () => {
    const plain = renderPageShell(SHELL, buildPageMeta(null, { url: 'https://sitpms.com/' }));

    expect(plain).not.toContain('og:image');
    expect(plain).toContain('<meta name="twitter:card" content="summary" />');
  });
});

describe('GET /public/page-shell', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');

  const callWith = ({ headers, institution = null, shell = SHELL }) => {
    jest.resetModules();
    const shellPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shell-')), 'index.html');
    if (shell !== null) fs.writeFileSync(shellPath, shell);

    jest.doMock('../../src/db/database', () => require('../mocks/database'));
    jest.doMock('../../src/services/pageShellService', () => {
      const actual = jest.requireActual('../../src/services/pageShellService');
      return { ...actual, loadShellTemplate: () => actual.loadShellTemplate(shellPath) };
    });
    const { getPageShell } = require('../../src/controllers/publicController');

    const res = {
      statusCode: 200,
      headers: { 'Content-Security-Policy': "default-src 'self'", 'X-Frame-Options': 'DENY' },
      body: null,
      status(code) { this.statusCode = code; return this; },
      type(value) { this.headers['Content-Type'] = value; return this; },
      set(name, value) { this.headers[name] = value; return this; },
      removeHeader(name) { delete this.headers[name]; },
      send(body) { this.body = body; return this; },
    };
    getPageShell({ headers, subdomainInstitution: institution }, res);
    return res;
  };

  it('serves the institution page for the address that was requested', () => {
    const res = callWith({
      headers: { host: 'fuk.sitpms.com', 'x-original-uri': '/student/login?next=%2Fportal' },
      institution: fuk,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('html');
    expect(res.body).toContain('<meta property="og:url" content="https://fuk.sitpms.com/student/login" />');
    expect(res.body).toContain('Federal University of Kashere');
  });

  it('drops the API-only security headers that would break the app page', () => {
    const res = callWith({ headers: { host: 'fuk.sitpms.com' }, institution: fuk });

    expect(res.headers['Content-Security-Policy']).toBeUndefined();
    expect(res.headers['X-Frame-Options']).toBeUndefined();
    expect(res.headers['Cache-Control']).toBe('no-cache');
  });

  it('keeps one-off tokens in the query string out of the shared address', () => {
    const res = callWith({
      headers: { host: 'fuk.sitpms.com', 'x-original-uri': '/reset-password?token=secret123' },
      institution: fuk,
    });

    expect(res.body).not.toContain('secret123');
  });

  it('does not reflect a forged host or path into the page', () => {
    const res = callWith({
      headers: { host: 'evil.com"><script>', 'x-original-uri': '/"><script>alert(1)</script>' },
    });

    expect(res.body).not.toContain('<script>alert');
    expect(res.body).toContain('<meta property="og:url" content="https://sitpms.com/" />');
  });

  it('serves the platform page when the subdomain is not an institution', () => {
    const res = callWith({ headers: { host: 'sitpms.com' } });
    expect(res.body).toContain('<title>DigitalTP - Teaching Practice Management System</title>');
  });

  it('answers 503 when there is no build, so nginx serves the static page instead', () => {
    const res = callWith({ headers: { host: 'fuk.sitpms.com' }, institution: fuk, shell: null });
    expect(res.statusCode).toBe(503);
  });
});
