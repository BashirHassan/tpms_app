/**
 * Image types the browser will hand to an upload.
 *
 * Mirrors ACCEPTED_IMAGE_MIMETYPES in backend/src/utils/imageFormats.js and is
 * deliberately permissive. Phone file pickers mislabel images routinely - a
 * HEIC reported as image/jpeg, a WebP as application/octet-stream, or no type
 * at all - so rejecting on this header only blocks legitimate students. Every
 * upload path re-encodes to JPEG via compressImageFile, and the server checks
 * the real magic bytes.
 */
export const ACCEPTED_PHOTO_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/avif',
  'application/octet-stream',
  '',
];

/** `accept` attribute for a file input - let the OS picker offer any image. */
export const PHOTO_ACCEPT_ATTR = 'image/*';
