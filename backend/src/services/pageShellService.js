/**
 * Page Shell Service
 *
 * Link previews (WhatsApp, Facebook, X, LinkedIn) are built by crawlers that
 * read the HTML and never run the app, so one static index.html gives every
 * institution the same generic preview. This fills the built index.html's
 * title, description and Open Graph / Twitter tags for the institution whose
 * subdomain the page was requested on.
 *
 * Pure string work apart from loadShellTemplate(), which reads the build.
 */

const fs = require('fs');
const path = require('path');

const PLATFORM_META = {
  siteName: 'DigitalTP',
  title: 'DigitalTP - Teaching Practice Management System',
  description: 'DigitalTP - Teaching Practice Management System for Tertiary Institutions',
};

const DEFAULT_CARD_COLOR = '1d4ed8';
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Text for a Cloudinary overlay: commas and slashes are its own separators. */
function overlayText(text) {
  return encodeURIComponent(text).replace(/%2C/g, '%252C').replace(/%2F/g, '%252F');
}

/**
 * The image a link preview shows. Previews want a wide 1200x630 picture and
 * logos are small and square, so a Cloudinary logo is composed on the fly into
 * a card: the logo above the institution's name, framed in its primary colour.
 * Nothing is uploaded or stored - it is all in the URL.
 */
function socialImageUrl(institution) {
  const logoUrl = institution?.logo_url;
  if (!logoUrl || !/^https:\/\//i.test(logoUrl)) return null;

  const match = logoUrl.match(CLOUDINARY_UPLOAD);
  if (!match) return logoUrl;

  const color = /^#?[0-9a-f]{6}$/i.test(institution.primary_color || '')
    ? institution.primary_color.replace('#', '').toLowerCase()
    : DEFAULT_CARD_COLOR;

  const card = [
    'c_fit,w_460,h_280', // the logo itself
    'c_lpad,w_1152,h_380,b_white', // centred in the upper part of the card
    'c_lpad,w_1152,h_582,g_north,b_white', // room underneath for the name
    `l_text:Arial_46_bold_center:${overlayText(institution.name)},co_rgb:111827,c_fit,w_1040`,
    'fl_layer_apply,g_south,y_56',
    `bo_24px_solid_rgb:${color}`, // 1152x582 + 24px frame = 1200x630
    'f_jpg,q_auto',
  ].join('/');

  return `${match[1]}${card}/${match[2]}`;
}

/**
 * @param {Object|null} institution - the institution on this subdomain, if any
 * @param {Object} context
 * @param {string} context.url - the address the page was requested at
 */
function buildPageMeta(institution, { url }) {
  if (!institution) {
    return { ...PLATFORM_META, url, image: null };
  }

  const unit = (institution.tp_unit_name || '').trim() || 'Teaching Practice Portal';

  return {
    siteName: institution.name,
    title: `${institution.name} - ${unit}`,
    description: `The teaching practice portal of ${institution.name}. Students submit acceptance forms and view their postings; supervisors and staff manage school postings, supervision visits and results.`,
    url,
    image: socialImageUrl(institution),
  };
}

/** Fill the built index.html's head with `meta`. Everything else is untouched. */
function renderPageShell(html, meta) {
  const tag = (attribute, key, content) => `    <meta ${attribute}="${key}" content="${escapeHtml(content)}" />`;

  const tags = [
    tag('name', 'description', meta.description),
    tag('property', 'og:type', 'website'),
    tag('property', 'og:site_name', meta.siteName),
    tag('property', 'og:title', meta.title),
    tag('property', 'og:description', meta.description),
    tag('property', 'og:url', meta.url),
    ...(meta.image
      ? [
          tag('property', 'og:image', meta.image),
          tag('property', 'og:image:width', '1200'),
          tag('property', 'og:image:height', '630'),
          tag('property', 'og:image:alt', meta.siteName),
        ]
      : []),
    tag('name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary'),
    tag('name', 'twitter:title', meta.title),
    tag('name', 'twitter:description', meta.description),
    ...(meta.image ? [tag('name', 'twitter:image', meta.image)] : []),
  ].join('\n');

  return html
    // Whatever the static build shipped for these is replaced, not added to
    .replace(/[ \t]*<meta\s+(?:name="description"|property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*\n?/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(meta.title)}</title>\n${tags}`);
}

// The built index.html, re-read only when a deploy replaces it
const SHELL_PATH = path.join(__dirname, '../../../frontend/dist/index.html');
let cachedShell = { mtimeMs: 0, html: null };

/** @returns {string|null} the built index.html, or null when there is no build */
function loadShellTemplate(shellPath = SHELL_PATH) {
  try {
    const { mtimeMs } = fs.statSync(shellPath);
    if (mtimeMs !== cachedShell.mtimeMs || cachedShell.html === null) {
      cachedShell = { mtimeMs, html: fs.readFileSync(shellPath, 'utf8') };
    }
    return cachedShell.html;
  } catch {
    return null;
  }
}

module.exports = {
  PLATFORM_META,
  buildPageMeta,
  renderPageShell,
  socialImageUrl,
  loadShellTemplate,
};
