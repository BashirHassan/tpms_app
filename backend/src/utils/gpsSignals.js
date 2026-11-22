/**
 * GPS genuineness signals shared by supervisor check-in and school data capture.
 */

/**
 * Flag GPS captures where every sample is bit-for-bit identical. Real GPS
 * chips jitter slightly between readings even when stationary; several
 * mock-location tools return the exact same coordinate every time. A minimum
 * sample count is required so a single throttled duplicate-reading burst some
 * browsers produce doesn't false-positive.
 * @param {Array<{latitude: number, longitude: number}>} samples
 * @returns {boolean}
 */
function detectZeroJitter(samples) {
  if (!Array.isArray(samples) || samples.length < 4) return false;
  const first = samples[0];
  return samples.every((s) => s.latitude === first.latitude && s.longitude === first.longitude);
}

module.exports = { detectZeroJitter };
