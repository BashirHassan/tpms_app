import { ACCEPTED_PHOTO_TYPES } from './imageFormats';
import { formatFileSize } from './helpers';

/**
 * Client-side image compression using the Canvas API.
 * No external dependency - draws the image at decreasing quality/dimensions
 * until it fits under the target size.
 */

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('IMAGE_DECODE_FAILED'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('IMAGE_DECODE_FAILED'))),
      'image/jpeg',
      quality
    );
  });
}

function renameToJpeg(filename) {
  const base = filename.replace(/\.[^./\\]+$/, '');
  return `${base}.jpg`;
}

/**
 * Compress an image file down to under `maxSizeBytes`, iteratively reducing
 * quality first, then dimensions, until it fits or attempts are exhausted.
 * @param {File} file
 * @param {object} [options]
 * @returns {Promise<File>} the compressed file (always image/jpeg)
 */
export async function compressImageFile(file, options = {}) {
  const {
    maxSizeBytes = 1 * 1024 * 1024,
    initialQuality = 0.85,
    qualityStep = 0.1,
    minQuality = 0.5,
    maxDimension = 1920,
    dimensionStep = 0.85,
    minDimension = 640,
    maxIterations = 10,
  } = options;

  const img = await loadImage(file);

  const initialScale = Math.min(1, maxDimension / Math.max(img.width, img.height));
  let width = Math.round(img.width * initialScale);
  let height = Math.round(img.height * initialScale);
  let quality = initialQuality;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let lastBlob = null;

  for (let i = 0; i < maxIterations; i++) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Deliberately sequential: each pass lowers quality based on the size the
    // previous one produced, so the iterations cannot be parallelised.
    const blob = await canvasToBlob(canvas, quality);
    lastBlob = blob;

    if (blob.size <= maxSizeBytes) {
      return new File([blob], renameToJpeg(file.name), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
    }

    if (quality > minQuality) {
      quality = Math.max(minQuality, quality - qualityStep);
    } else if (width > minDimension || height > minDimension) {
      width = Math.max(minDimension, Math.round(width * dimensionStep));
      height = Math.max(minDimension, Math.round(height * dimensionStep));
      quality = initialQuality;
    } else {
      break;
    }
  }

  if (lastBlob && lastBlob.size <= maxSizeBytes) {
    return new File([lastBlob], renameToJpeg(file.name), {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  }

  throw new Error('COMPRESSION_FAILED');
}

/**
 * Validate and normalise a user-picked image before upload.
 *
 * The single place this decision is made. It used to be copy-pasted into every
 * upload page with slightly different rules, which is how the biodata form
 * ended up as the only one NOT re-encoding and collected 168 failed student
 * submissions ("Image file format webp not allowed").
 *
 * Always re-encodes rather than only when oversized: phone galleries serve
 * WebP (Android) and HEIC (iPhone), routinely mislabelled image/jpeg by the
 * file picker, and Cloudinary judges on the real bytes. compressImageFile
 * always emits image/jpeg, and it also brings a 4MB camera shot under the
 * limit so students no longer resize by hand.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {number} [options.maxSizeBytes] target size (default 1MB)
 * @param {number} [options.hardLimitBytes] refuse outright above this (default 5MB)
 * @returns {Promise<{file?: File, error?: string, code?: string}>}
 */
export async function prepareImageForUpload(file, options = {}) {
  const {
    maxSizeBytes = 1 * 1024 * 1024,
    hardLimitBytes = 5 * 1024 * 1024,
  } = options;

  if (!file) {
    return { error: 'No file selected.', code: 'NO_FILE' };
  }

  if (!ACCEPTED_PHOTO_TYPES.includes((file.type || '').toLowerCase())) {
    return {
      error: 'That file is not an image. Please choose a photo from your gallery or camera.',
      code: 'NOT_IMAGE',
    };
  }

  // Beyond this the browser is being asked to decode something huge on a phone.
  if (file.size >= hardLimitBytes) {
    return {
      error: `That image is too large (${formatFileSize(file.size)}). Please use one under 5MB.`,
      code: 'TOO_LARGE',
    };
  }

  try {
    return { file: await compressImageFile(file, { maxSizeBytes }) };
  } catch {
    // Android Chrome cannot decode HEIC. If it is already small enough, send
    // the original and let the server convert it rather than dead-ending the
    // student here.
    if (file.size <= maxSizeBytes) {
      return { file };
    }
    return {
      error: 'Could not process that photo. Please take a new one with your camera and try again.',
      code: 'DECODE_FAILED',
    };
  }
}
