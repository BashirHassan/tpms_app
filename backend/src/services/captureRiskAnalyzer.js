/**
 * Capture Risk Analyzer
 *
 * Pure, deterministic checks on ONE supervisor-submitted school location, built
 * to catch the two ways a paid field capture goes wrong: coordinates that were
 * typed or faked instead of recorded on site, and honest mistakes (wrong state,
 * swapped latitude/longitude, wrong school).
 *
 * Nothing here blocks a submission. Every finding is a flag with a severity, and
 * the highest severity becomes the request's `risk_level`. High-risk requests are
 * kept out of bulk approval so a human has to look at them, one by one.
 *
 * Still a web app trusting navigator.geolocation - this catches careless and
 * common spoofing, not a determined attacker replaying pre-recorded, jittered
 * coordinates. The timeline's job is to make that pattern visible over many
 * submissions (same device, impossible travel, identical points).
 *
 * Severities: 'high' = very likely wrong/faked, 'medium' = needs a look.
 */

const { distanceMeters } = require('../utils/geo');
const { detectZeroJitter } = require('../utils/gpsSignals');

// Nigeria's bounding box, with a small margin
const NIGERIA = { minLat: 4.0, maxLat: 14.0, minLng: 2.6, maxLng: 14.8 };

const THRESHOLDS = {
  minSamples: 3, // fewer GPS readings than this is weak evidence of being on site
  sampleMatchM: 15, // submitted point must sit within this of a recorded reading
  staleReadingMs: 5 * 60 * 1000, // newest reading older than this => not recorded just now
  futureSkewMs: 2 * 60 * 1000, // readings from the future => device clock tampered with
  clientDriftMs: 5 * 60 * 1000, // device clock vs server clock
  farFromRecordMediumM: 1000,
  farFromRecordHighM: 10000,
  exactDuplicateM: 3, // same spot to within GPS rounding, but a different school
  nearOtherSchoolM: 30, // adjacent schools exist, so this is only a "look"
  travelMinDistanceM: 300, // ignore short hops
  travelMaxSpeedKmh: 100, // faster than this between two captures is not driveable
};

const inNigeria = (lat, lng) =>
  lat >= NIGERIA.minLat && lat <= NIGERIA.maxLat && lng >= NIGERIA.minLng && lng <= NIGERIA.maxLng;

const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

const flag = (code, severity, message, details) => ({ code, severity, message, ...(details ? { details } : {}) });

/**
 * @param {object} input
 * @param {number} input.latitude
 * @param {number} input.longitude
 * @param {'gps'|'manual'} input.method
 * @param {number|null} [input.accuracy]
 * @param {Array<{latitude:number,longitude:number,accuracy_meters?:number,timestamp?:string}>} [input.samples]
 * @param {string|Date|null} [input.clientTimestamp]
 * @param {Date} [input.now]
 * @param {{latitude:number|null,longitude:number|null}|null} [input.record] school's coordinates on file
 * @param {{latitude:number,longitude:number,at:Date|string}|null} [input.previousCapture] this supervisor's latest earlier capture
 * @param {Array<{school_name?:string,latitude:number,longitude:number}>} [input.sameSpotElsewhere] other schools' captures at (almost) this exact point
 * @param {Array<{school_name?:string,latitude:number,longitude:number}>} [input.nearbySchools] other schools registered within a few metres
 * @returns {{flags:Array, level:'none'|'medium'|'high', distance_from_record_m:number|null, sample_count:number}}
 */
function analyzeLocationSubmission(input) {
  const {
    latitude,
    longitude,
    method,
    samples = [],
    clientTimestamp = null,
    now = new Date(),
    record = null,
    previousCapture = null,
    sameSpotElsewhere = [],
    nearbySchools = [],
  } = input;

  const flags = [];
  const goodSamples = (Array.isArray(samples) ? samples : []).filter(
    (s) => num(s?.latitude) !== null && num(s?.longitude) !== null
  );

  // ---- Where is it? --------------------------------------------------------
  if (!inNigeria(latitude, longitude)) {
    if (inNigeria(longitude, latitude)) {
      flags.push(
        flag(
          'swapped_coordinates',
          'high',
          'Latitude and longitude look swapped - the point is outside Nigeria but flipping them lands inside it'
        )
      );
    } else {
      flags.push(flag('outside_nigeria', 'high', 'The point is outside Nigeria'));
    }
  }

  // ---- How was it obtained? ------------------------------------------------
  if (method === 'manual') {
    flags.push(flag('manual_entry', 'medium', 'Coordinates were typed in, not recorded by the device GPS'));
  } else {
    if (goodSamples.length === 0) {
      flags.push(flag('no_samples', 'high', 'Submitted as GPS but no GPS readings came with it'));
    } else {
      if (goodSamples.length < THRESHOLDS.minSamples) {
        flags.push(
          flag('few_samples', 'medium', `Only ${goodSamples.length} GPS reading(s) - too few to show the device was on site`, {
            sample_count: goodSamples.length,
          })
        );
      }
      if (detectZeroJitter(goodSamples)) {
        flags.push(
          flag(
            'zero_jitter',
            'high',
            'Every GPS reading is identical to the last digit. Real GPS drifts slightly; mock-location tools often do not'
          )
        );
      }

      // The submitted point must be one the device actually reported
      const nearestM = Math.min(
        ...goodSamples.map((s) => distanceMeters(latitude, longitude, Number(s.latitude), Number(s.longitude)) ?? Infinity)
      );
      if (nearestM > THRESHOLDS.sampleMatchM) {
        flags.push(
          flag(
            'sample_mismatch',
            'high',
            `The submitted point is ${Math.round(nearestM)} m from the nearest GPS reading - it was edited after recording`,
            { nearest_sample_m: Math.round(nearestM) }
          )
        );
      }

      // Were the readings taken just now, on a sane clock?
      const times = goodSamples.map((s) => (s.timestamp ? new Date(s.timestamp).getTime() : NaN)).filter(Number.isFinite);
      if (times.length > 0) {
        const newest = Math.max(...times);
        if (newest - now.getTime() > THRESHOLDS.futureSkewMs) {
          flags.push(flag('clock_in_future', 'medium', 'GPS reading timestamps are in the future - the device clock was changed'));
        } else if (now.getTime() - newest > THRESHOLDS.staleReadingMs) {
          flags.push(
            flag('stale_readings', 'medium', 'The GPS readings are more than 5 minutes older than the submission', {
              minutes_old: Math.round((now.getTime() - newest) / 60000),
            })
          );
        }
      }
    }
  }

  if (clientTimestamp) {
    const t = new Date(clientTimestamp).getTime();
    if (Number.isFinite(t) && Math.abs(now.getTime() - t) > THRESHOLDS.clientDriftMs) {
      flags.push(
        flag('clock_drift', 'medium', 'The device clock is more than 5 minutes off the server clock', {
          drift_seconds: Math.round((now.getTime() - t) / 1000),
        })
      );
    }
  }

  // ---- Does it make sense for THIS school? ---------------------------------
  const recLat = num(record?.latitude);
  const recLng = num(record?.longitude);
  let distanceFromRecord = null;
  if (recLat !== null && recLng !== null) {
    distanceFromRecord = distanceMeters(recLat, recLng, latitude, longitude);
    if (distanceFromRecord !== null) {
      distanceFromRecord = Math.round(distanceFromRecord);
      if (distanceFromRecord > THRESHOLDS.farFromRecordHighM) {
        flags.push(
          flag(
            'far_from_record',
            'high',
            `${(distanceFromRecord / 1000).toFixed(1)} km from the location already on file for this school`,
            { distance_m: distanceFromRecord }
          )
        );
      } else if (distanceFromRecord > THRESHOLDS.farFromRecordMediumM) {
        flags.push(
          flag(
            'far_from_record',
            'medium',
            `${(distanceFromRecord / 1000).toFixed(1)} km from the location already on file for this school`,
            { distance_m: distanceFromRecord }
          )
        );
      }
    }
  }

  // The same spot reported for a different school is the signature of copy-paste
  const duplicates = sameSpotElsewhere.filter(
    (o) => (distanceMeters(latitude, longitude, Number(o.latitude), Number(o.longitude)) ?? Infinity) <= THRESHOLDS.exactDuplicateM
  );
  if (duplicates.length > 0) {
    flags.push(
      flag(
        'same_point_as_other_school',
        'high',
        `Identical point already submitted for ${duplicates
          .slice(0, 3)
          .map((d) => d.school_name || 'another school')
          .join(', ')}`,
        { schools: duplicates.slice(0, 5).map((d) => d.school_name || null) }
      )
    );
  } else {
    const near = nearbySchools.filter(
      (o) => (distanceMeters(latitude, longitude, Number(o.latitude), Number(o.longitude)) ?? Infinity) <= THRESHOLDS.nearOtherSchoolM
    );
    if (near.length > 0) {
      flags.push(
        flag(
          'near_other_school',
          'medium',
          `Within ${THRESHOLDS.nearOtherSchoolM} m of ${near
            .slice(0, 3)
            .map((d) => d.school_name || 'another school')
            .join(', ')} - could be the wrong school`,
          { schools: near.slice(0, 5).map((d) => d.school_name || null) }
        )
      );
    }
  }

  // ---- Could the supervisor have got there from the last one? --------------
  if (previousCapture && num(previousCapture.latitude) !== null && previousCapture.at) {
    const moved = distanceMeters(
      Number(previousCapture.latitude),
      Number(previousCapture.longitude),
      latitude,
      longitude
    );
    const elapsedMs = now.getTime() - new Date(previousCapture.at).getTime();
    if (moved !== null && moved > THRESHOLDS.travelMinDistanceM && elapsedMs >= 0) {
      const hours = Math.max(elapsedMs, 1000) / 3600000;
      const speed = moved / 1000 / hours;
      if (speed > THRESHOLDS.travelMaxSpeedKmh) {
        flags.push(
          flag(
            'impossible_travel',
            'high',
            `${(moved / 1000).toFixed(1)} km from this supervisor's previous capture, ${Math.max(1, Math.round(elapsedMs / 60000))} min earlier`,
            { distance_m: Math.round(moved), minutes: Math.round(elapsedMs / 60000), speed_kmh: Math.round(speed) }
          )
        );
      }
    }
  }

  const level = flags.some((f) => f.severity === 'high') ? 'high' : flags.length > 0 ? 'medium' : 'none';

  return {
    flags,
    level,
    distance_from_record_m: distanceFromRecord,
    sample_count: goodSamples.length,
  };
}

/** A compact, human description of the GPS evidence for display in the timeline. */
function summariseSamples(samples) {
  const good = (Array.isArray(samples) ? samples : []).filter((s) => num(s?.latitude) !== null && num(s?.longitude) !== null);
  if (good.length === 0) return { count: 0, spread_m: null, best_accuracy_m: null };

  let spread = 0;
  for (let i = 0; i < good.length; i++) {
    for (let j = i + 1; j < good.length; j++) {
      const d = distanceMeters(Number(good[i].latitude), Number(good[i].longitude), Number(good[j].latitude), Number(good[j].longitude));
      if (d !== null && d > spread) spread = d;
    }
  }
  const accuracies = good.map((s) => num(s.accuracy_meters)).filter((a) => a !== null);
  return {
    count: good.length,
    spread_m: Math.round(spread * 10) / 10,
    best_accuracy_m: accuracies.length ? Math.round(Math.min(...accuracies) * 10) / 10 : null,
  };
}

module.exports = { analyzeLocationSubmission, summariseSamples, THRESHOLDS, NIGERIA };
