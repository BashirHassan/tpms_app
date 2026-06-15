/**
 * Pagination helpers
 *
 * Guards list endpoints against unbounded result sets / negative offsets that
 * could exhaust memory or bandwidth. Returns clamped integers.
 */

const DEFAULT_MAX_LIMIT = 200;

/**
 * Clamp a requested page size to [1, max].
 * @param {*} value - raw query value
 * @param {number} fallback - used when value is missing/invalid
 * @param {number} max - hard upper bound
 */
function clampLimit(value, fallback = 100, max = DEFAULT_MAX_LIMIT) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return Math.min(fallback, max);
  return Math.min(n, max);
}

/**
 * Clamp a requested offset to a non-negative integer.
 */
function clampOffset(value) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

module.exports = { clampLimit, clampOffset, DEFAULT_MAX_LIMIT };
