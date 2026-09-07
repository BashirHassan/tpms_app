/**
 * Image format allowlists - single source of truth.
 *
 * Kept in one place because three layers each check the same thing and
 * disagreeing is what broke student form uploads (ported from siwesms, Sep 2026):
 * the browser check and multer both passed a WebP labelled image/jpeg, then
 * Cloudinary rejected it on the real bytes with a masked 500.
 *
 *   1. the browser (frontend FileInput accept + type check)
 *   2. multer's fileFilter, which only sees the browser-supplied mimetype
 *   3. Cloudinary, which sees the actual bytes
 */

/** Cloudinary format names accepted on upload. */
const ACCEPTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif'];

/**
 * Mimetypes multer will accept.
 *
 * Deliberately wider than the formats above: phone file pickers mislabel
 * images constantly (a HEIC arriving as image/jpeg, a WebP as
 * application/octet-stream, or no type at all). The real gate is the
 * magic-byte check in detectImageMime - rejecting here on an unreliable
 * header only blocks legitimate students.
 */
const ACCEPTED_IMAGE_MIMETYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/avif',
  // Android sometimes supplies no usable type for a gallery image.
  'application/octet-stream',
  '',
];

/**
 * multer fileFilter for image uploads.
 * @param {boolean} allowPdf - also accept application/pdf
 */
const imageFileFilter = (allowPdf = false) => (req, file, cb) => {
  const allowed = allowPdf
    ? [...ACCEPTED_IMAGE_MIMETYPES, 'application/pdf']
    : ACCEPTED_IMAGE_MIMETYPES;

  if (allowed.includes((file.mimetype || '').toLowerCase())) {
    return cb(null, true);
  }
  return cb(new Error('Invalid file type. Please upload a JPG or PNG image.'), false);
};

module.exports = {
  ACCEPTED_IMAGE_FORMATS,
  ACCEPTED_IMAGE_MIMETYPES,
  imageFileFilter,
};
