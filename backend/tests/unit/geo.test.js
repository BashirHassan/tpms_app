/**
 * Geo Utility Tests
 * Pure unit tests for backend/src/utils/geo.js — no database required.
 */

const { nearestNeighborOrder, distanceMeters } = require('../../src/utils/geo');

describe('nearestNeighborOrder', () => {
  it('returns an empty result when there are no points', () => {
    const result = nearestNeighborOrder({ lat: 0, lng: 0 }, []);
    expect(result).toEqual({ order: [], legs: [], totalDistanceKm: 0 });
  });

  it('returns an empty result when the start point is invalid', () => {
    const result = nearestNeighborOrder({ lat: null, lng: null }, [
      { id: 1, lat: 1, lng: 1 },
    ]);
    expect(result).toEqual({ order: [], legs: [], totalDistanceKm: 0 });
  });

  it('filters out points with missing/invalid coordinates', () => {
    const result = nearestNeighborOrder({ lat: 0, lng: 0 }, [
      { id: 1, lat: null, lng: null },
      { id: 2, lat: 0, lng: 1 },
      { id: 3, lat: undefined, lng: 2 },
    ]);
    expect(result.order).toEqual([2]);
  });

  it('orders a single point correctly and totals its distance', () => {
    const result = nearestNeighborOrder({ lat: 0, lng: 0 }, [{ id: 'a', lat: 0, lng: 1 }]);
    const expectedKm = distanceMeters(0, 0, 0, 1) / 1000;

    expect(result.order).toEqual(['a']);
    expect(result.legs).toEqual([{ id: 'a', distanceKm: expectedKm }]);
    expect(result.totalDistanceKm).toBeCloseTo(expectedKm, 6);
  });

  it('greedily visits the nearest unvisited point at each step', () => {
    // Three points strung along the same meridian at lng 1, 2, 3.
    // Starting at lng 0, the nearest-neighbor order must be 1 -> 2 -> 3,
    // never jumping ahead to a farther point while a closer one remains.
    const start = { lat: 0, lng: 0 };
    const points = [
      { id: 'far', lat: 0, lng: 3 },
      { id: 'near', lat: 0, lng: 1 },
      { id: 'mid', lat: 0, lng: 2 },
    ];

    const result = nearestNeighborOrder(start, points);

    expect(result.order).toEqual(['near', 'mid', 'far']);
    expect(result.legs).toHaveLength(3);

    const expectedTotalKm =
      (distanceMeters(0, 0, 0, 1) + distanceMeters(0, 1, 0, 2) + distanceMeters(0, 2, 0, 3)) / 1000;
    expect(result.totalDistanceKm).toBeCloseTo(expectedTotalKm, 6);
  });

  it('does not mutate the input points array', () => {
    const points = [
      { id: 1, lat: 0, lng: 2 },
      { id: 2, lat: 0, lng: 1 },
    ];
    const snapshot = JSON.parse(JSON.stringify(points));

    nearestNeighborOrder({ lat: 0, lng: 0 }, points);

    expect(points).toEqual(snapshot);
  });
});
