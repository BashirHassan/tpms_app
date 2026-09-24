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

/**
 * Greedy nearest-neighbor visit order starting from `start`.
 *
 * Points with missing/non-finite coordinates are ignored (callers surface
 * those separately as "location pending" rather than routing through them).
 * O(n^2) - fine for the small per-supervisor posting counts this is used for.
 *
 * @param {{lat: number, lng: number}} start
 * @param {Array<{id: any, lat: number, lng: number}>} points
 * @returns {{order: any[], legs: Array<{id: any, distanceKm: number}>, totalDistanceKm: number}}
 */
function nearestNeighborOrder(start, points) {
  const hasCoords = (lat, lng) =>
    lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  const startLat = Number(start?.lat);
  const startLng = Number(start?.lng);
  const remaining = (points || []).filter((p) => hasCoords(p.lat, p.lng));

  if (!hasCoords(start?.lat, start?.lng) || remaining.length === 0) {
    return { order: [], legs: [], totalDistanceKm: 0 };
  }

  const order = [];
  const legs = [];
  let currentLat = startLat;
  let currentLng = startLng;
  let totalMeters = 0;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestMeters = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const meters = distanceMeters(currentLat, currentLng, Number(remaining[i].lat), Number(remaining[i].lng));
      if (meters < nearestMeters) {
        nearestMeters = meters;
        nearestIndex = i;
      }
    }

    const next = remaining.splice(nearestIndex, 1)[0];
    order.push(next.id);
    legs.push({ id: next.id, distanceKm: nearestMeters / 1000 });
    totalMeters += nearestMeters;
    currentLat = Number(next.lat);
    currentLng = Number(next.lng);
  }

  return { order, legs, totalDistanceKm: totalMeters / 1000 };
}

module.exports = { distanceMeters, nearestNeighborOrder, EARTH_RADIUS_M };
