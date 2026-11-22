/**
 * Capture Risk Analyzer Tests - pure, no DB.
 *
 * Supervisors are paid per captured school, so each way of faking or botching a
 * location has a test that proves it is flagged - and an honest capture is not.
 */

const { analyzeLocationSubmission, summariseSamples } = require('../../src/services/captureRiskAnalyzer');
const { detectZeroJitter } = require('../../src/utils/gpsSignals');

const NOW = new Date('2026-11-22T10:00:00.000Z');
// Gombe town
const BASE = { latitude: 10.2897, longitude: 11.1671 };

/** n readings jittering a few metres around a point, taken seconds before NOW */
const jittered = (n = 5, around = BASE) =>
  Array.from({ length: n }, (_, i) => ({
    latitude: around.latitude + (i % 2 ? 0.00001 : -0.00001) * (i + 1),
    longitude: around.longitude + (i % 2 ? -0.00001 : 0.00001) * (i + 1),
    accuracy_meters: 12 - i,
    timestamp: new Date(NOW.getTime() - (n - i) * 1000).toISOString(),
  }));

const honest = (over = {}) => {
  const samples = jittered(5);
  return {
    latitude: samples[4].latitude,
    longitude: samples[4].longitude,
    method: 'gps',
    accuracy: 8,
    samples,
    clientTimestamp: new Date(NOW.getTime() - 1000),
    now: NOW,
    ...over,
  };
};

const codes = (result) => result.flags.map((f) => f.code);

describe('an honest on-site GPS capture', () => {
  it('raises nothing', () => {
    const result = analyzeLocationSubmission(honest());
    expect(result.flags).toEqual([]);
    expect(result.level).toBe('none');
    expect(result.sample_count).toBe(5);
  });

  it('stays clean when the point is near the one on file', () => {
    const input = honest();
    const result = analyzeLocationSubmission({
      ...input,
      record: { latitude: input.latitude + 0.0005, longitude: input.longitude },
    });
    expect(result.level).toBe('none');
    expect(result.distance_from_record_m).toBeGreaterThan(0);
    expect(result.distance_from_record_m).toBeLessThan(100);
  });
});

describe('typed or edited coordinates', () => {
  it('flags manual entry as medium', () => {
    const result = analyzeLocationSubmission({ latitude: 10.29, longitude: 11.16, method: 'manual', now: NOW });
    expect(codes(result)).toContain('manual_entry');
    expect(result.level).toBe('medium');
  });

  it('flags a GPS submission that carries no readings as high', () => {
    const result = analyzeLocationSubmission({ ...honest(), samples: [] });
    expect(codes(result)).toContain('no_samples');
    expect(result.level).toBe('high');
  });

  it('flags a point that is not one of the recorded readings (edited after recording)', () => {
    const result = analyzeLocationSubmission(honest({ latitude: BASE.latitude + 0.01 })); // ~1.1 km away
    expect(codes(result)).toContain('sample_mismatch');
    expect(result.level).toBe('high');
  });

  it('does not flag a point within a few metres of a reading', () => {
    const input = honest();
    const result = analyzeLocationSubmission({ ...input, latitude: input.latitude + 0.00004 }); // ~4 m
    expect(codes(result)).not.toContain('sample_mismatch');
  });

  it('flags too few readings as medium', () => {
    const samples = jittered(2);
    const result = analyzeLocationSubmission(honest({ samples, latitude: samples[1].latitude, longitude: samples[1].longitude }));
    expect(codes(result)).toContain('few_samples');
    expect(result.level).toBe('medium');
  });
});

describe('mock-location / fake GPS tells', () => {
  it('flags readings that are identical to the last digit', () => {
    const same = Array.from({ length: 6 }, (_, i) => ({
      ...BASE,
      accuracy_meters: 5,
      timestamp: new Date(NOW.getTime() - (6 - i) * 1000).toISOString(),
    }));
    const result = analyzeLocationSubmission(honest({ samples: same, ...BASE }));
    expect(codes(result)).toContain('zero_jitter');
    expect(result.level).toBe('high');
  });

  it('flags stale readings (recorded long before submitting)', () => {
    const old = jittered(5).map((s) => ({ ...s, timestamp: new Date(NOW.getTime() - 20 * 60000).toISOString() }));
    const result = analyzeLocationSubmission(honest({ samples: old, latitude: old[4].latitude, longitude: old[4].longitude }));
    expect(codes(result)).toContain('stale_readings');
  });

  it('flags readings stamped in the future (device clock changed)', () => {
    const future = jittered(5).map((s) => ({ ...s, timestamp: new Date(NOW.getTime() + 30 * 60000).toISOString() }));
    const result = analyzeLocationSubmission(honest({ samples: future, latitude: future[4].latitude, longitude: future[4].longitude }));
    expect(codes(result)).toContain('clock_in_future');
  });

  it('flags a device clock far from the server clock', () => {
    const result = analyzeLocationSubmission(honest({ clientTimestamp: new Date(NOW.getTime() - 3 * 3600000) }));
    expect(codes(result)).toContain('clock_drift');
  });
});

describe('honest mistakes', () => {
  it('flags a point outside Nigeria', () => {
    const result = analyzeLocationSubmission({ latitude: 51.5, longitude: -0.12, method: 'manual', now: NOW });
    expect(codes(result)).toContain('outside_nigeria');
    expect(result.level).toBe('high');
  });

  it('flags swapped latitude/longitude and says so', () => {
    // Real point: lat 6.5244, lng 3.3792 (Lagos). Swapped -> lat 3.3792 (outside box), lng 6.5244.
    const result = analyzeLocationSubmission({ latitude: 3.3792, longitude: 6.5244, method: 'manual', now: NOW });
    expect(codes(result)).toContain('swapped_coordinates');
  });

  it('flags a point far from the location already on file for the school', () => {
    const medium = analyzeLocationSubmission({
      ...honest(),
      record: { latitude: BASE.latitude + 0.02, longitude: BASE.longitude }, // ~2.2 km
    });
    const far = analyzeLocationSubmission({
      ...honest(),
      record: { latitude: BASE.latitude + 0.2, longitude: BASE.longitude }, // ~22 km
    });
    expect(medium.flags.find((f) => f.code === 'far_from_record').severity).toBe('medium');
    expect(far.flags.find((f) => f.code === 'far_from_record').severity).toBe('high');
    expect(far.distance_from_record_m).toBeGreaterThan(10000);
  });
});

describe('copy-paste and cross-school signals', () => {
  it('flags the identical point already used for a different school as high', () => {
    const input = honest();
    const result = analyzeLocationSubmission({
      ...input,
      sameSpotElsewhere: [{ school_name: 'GGSS Akko', latitude: input.latitude, longitude: input.longitude }],
    });
    expect(codes(result)).toContain('same_point_as_other_school');
    expect(result.level).toBe('high');
  });

  it('only calls it a "look" when another school is merely close (shared compounds exist)', () => {
    const input = honest();
    const result = analyzeLocationSubmission({
      ...input,
      nearbySchools: [{ school_name: 'Primary School', latitude: input.latitude + 0.0002, longitude: input.longitude }], // ~22 m
    });
    expect(codes(result)).toContain('near_other_school');
    expect(codes(result)).not.toContain('same_point_as_other_school');
    expect(result.level).toBe('medium');
  });
});

describe('impossible travel', () => {
  it('flags two captures too far apart for the time between them', () => {
    const result = analyzeLocationSubmission({
      ...honest(),
      previousCapture: { latitude: BASE.latitude + 0.5, longitude: BASE.longitude, at: new Date(NOW.getTime() - 5 * 60000) }, // ~55 km in 5 min
    });
    expect(codes(result)).toContain('impossible_travel');
    expect(result.level).toBe('high');
  });

  it('accepts a normal drive between schools', () => {
    const result = analyzeLocationSubmission({
      ...honest(),
      previousCapture: { latitude: BASE.latitude + 0.05, longitude: BASE.longitude, at: new Date(NOW.getTime() - 60 * 60000) }, // ~5.5 km in an hour
    });
    expect(codes(result)).not.toContain('impossible_travel');
  });

  it('ignores short hops inside one compound', () => {
    const result = analyzeLocationSubmission({
      ...honest(),
      previousCapture: { latitude: BASE.latitude + 0.001, longitude: BASE.longitude, at: new Date(NOW.getTime() - 10 * 1000) },
    });
    expect(codes(result)).not.toContain('impossible_travel');
  });
});

describe('level is the worst flag', () => {
  it('is high when any flag is high, even alongside medium ones', () => {
    const result = analyzeLocationSubmission({ latitude: 51.5, longitude: -0.12, method: 'manual', now: NOW });
    expect(codes(result)).toEqual(expect.arrayContaining(['manual_entry', 'outside_nigeria']));
    expect(result.level).toBe('high');
  });
});

describe('summariseSamples', () => {
  it('reports count, spread and best accuracy', () => {
    const s = summariseSamples(jittered(5));
    expect(s.count).toBe(5);
    expect(s.spread_m).toBeGreaterThan(0);
    expect(s.best_accuracy_m).toBe(8);
  });

  it('copes with nothing', () => {
    expect(summariseSamples(null)).toEqual({ count: 0, spread_m: null, best_accuracy_m: null });
  });
});

describe('detectZeroJitter (shared with supervisor check-in)', () => {
  it('needs at least 4 identical readings', () => {
    const p = { latitude: 1, longitude: 2 };
    expect(detectZeroJitter([p, p, p])).toBe(false);
    expect(detectZeroJitter([p, p, p, p])).toBe(true);
    expect(detectZeroJitter([p, p, p, { latitude: 1.0000001, longitude: 2 }])).toBe(false);
  });
});
