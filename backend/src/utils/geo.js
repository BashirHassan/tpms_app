/**
 * Geo helpers
 *
 * Shared coordinate maths. Kept in one place so the student-facing proximity
 * guard and the admin-facing "another institution moved this point" warning
 * measure distance the same way.
 */

const EARTH_RADIUS_M = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance in metres between two coordinate pairs.
 * Returns null when either pair is incomplete.
 */
function distanceMeters(lat1, lng1, lat2, lng2) {
  const coords = [lat1, lng1, lat2, lng2].map(Number);
  if (coords.some((value) => !Number.isFinite(value))) return null;

  const [aLat, aLng, bLat, bLng] = coords;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

module.exports = { distanceMeters, EARTH_RADIUS_M };
