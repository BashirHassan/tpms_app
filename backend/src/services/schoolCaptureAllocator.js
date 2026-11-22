/**
 * School Capture Allocator
 *
 * Pure, deterministic allocation of schools to supervisors for field capture of
 * GPS location and principal details. No database, no HTTP - the controller
 * loads eligible supervisors and schools and hands them in.
 *
 * Modes:
 *   lga    - schools are laid out cluster by cluster (state + LGA) and cut into
 *            consecutive, evenly sized runs, one per supervisor. A cluster stays
 *            whole unless a run boundary falls inside it, so at most
 *            (supervisors - 1) LGAs are ever split - minimal travel per supervisor.
 *   random - an even split over a seeded shuffle, no geographic grouping.
 *
 * LGA names repeat across Nigerian states, so a cluster is always the
 * (state, lga) pair, never a bare LGA name.
 *
 * `shuffleSalt` 0 gives the canonical plan; any other value re-draws it
 * ("Reshuffle"), reproducibly for the same salt.
 */

const { hashSeed, mulberry32 } = require('./autoPostingEngine');

const UNKNOWN = 'Unknown';

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : UNKNOWN);

const clusterKey = (school) => `${clean(school.state)}|${clean(school.lga)}`;

/** Deterministic in-place-free Fisher-Yates shuffle driven by a seed. */
function seededShuffle(items, seed) {
  const out = [...items];
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A short fingerprint of who goes where, independent of assignment order. */
function planFingerprint(assignments) {
  const keys = assignments.map((a) => `${a.supervisor_id}-${a.school_id}`).sort();
  return `${keys.length}-${hashSeed(keys).toString(16)}`;
}

/**
 * How many schools each supervisor takes: an even split (remainder spread one
 * apiece), clamped to each supervisor's remaining capacity, with whatever a
 * clamp frees up handed to supervisors that still have room.
 */
function computeTargets(supervisorCount, schoolCount, capacities) {
  const targets = new Array(supervisorCount).fill(0);
  if (supervisorCount === 0) return targets;

  let remaining = schoolCount;
  // Hand out one at a time, round-robin, to whoever still has room. O(n) and
  // always yields the most even split the capacities allow.
  const base = Math.floor(schoolCount / supervisorCount);
  const extra = schoolCount % supervisorCount;
  for (let i = 0; i < supervisorCount; i++) {
    const want = base + (i < extra ? 1 : 0);
    targets[i] = Math.min(want, capacities[i]);
    remaining -= targets[i];
  }
  // Redistribute what clamping released
  while (remaining > 0) {
    let placed = false;
    for (let i = 0; i < supervisorCount && remaining > 0; i++) {
      if (targets[i] < capacities[i]) {
        targets[i] += 1;
        remaining -= 1;
        placed = true;
      }
    }
    if (!placed) break; // everyone is full
  }
  return targets;
}

/**
 * @param {Array<{id:number,name?:string}>} supervisors
 * @param {Array<{id:number,state?:string,lga?:string,ward?:string,name?:string}>} schools
 * @param {object} [options]
 * @param {'lga'|'random'} [options.mode='lga']
 * @param {number|null} [options.maxPerSupervisor=null] cap on ACTIVE capture assignments per supervisor
 * @param {Map<number,number>} [options.existingLoad] active assignments already held this session
 * @param {number} [options.shuffleSalt=0]
 * @returns {{assignments:Array, perSupervisor:Array, unassigned:Array, warnings:string[], planHash:string}}
 */
function allocate(supervisors, schools, options = {}) {
  const { mode = 'lga', maxPerSupervisor = null, existingLoad = new Map(), shuffleSalt = 0 } = options;
  const warnings = [];

  if (!['lga', 'random'].includes(mode)) {
    throw new Error(`Unknown allocation mode: ${mode}`);
  }
  if (supervisors.length === 0) {
    return {
      assignments: [],
      perSupervisor: [],
      unassigned: schools.map((s) => s.id),
      warnings: ['No eligible supervisors available'],
      planHash: planFingerprint([]),
    };
  }
  if (schools.length === 0) {
    return {
      assignments: [],
      perSupervisor: supervisors.map((s) => ({ supervisor_id: s.id, name: s.name || null, count: 0, clusters: [] })),
      unassigned: [],
      warnings: ['No schools need capturing'],
      planHash: planFingerprint([]),
    };
  }

  const cap = Number.isFinite(maxPerSupervisor) && maxPerSupervisor > 0 ? maxPerSupervisor : Infinity;

  // Stable supervisor order (by id); a salt re-draws who gets the larger runs
  let orderedSupervisors = [...supervisors].sort((a, b) => a.id - b.id);
  if (shuffleSalt) {
    orderedSupervisors = seededShuffle(orderedSupervisors, hashSeed([shuffleSalt, 'supervisors']));
  }

  const capacities = orderedSupervisors.map((s) => Math.max(0, cap - (existingLoad.get(s.id) || 0)));
  const targets = computeTargets(orderedSupervisors.length, schools.length, capacities);

  // ---- Lay the schools out in the order they will be dealt ----
  let laidOut;
  if (mode === 'random') {
    const byId = [...schools].sort((a, b) => a.id - b.id);
    laidOut = seededShuffle(byId, hashSeed([shuffleSalt, 'schools']));
  } else {
    const clusters = new Map();
    for (const school of schools) {
      const key = clusterKey(school);
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(school);
    }
    let keys = [...clusters.keys()].sort((a, b) => a.localeCompare(b));
    if (shuffleSalt) keys = seededShuffle(keys, hashSeed([shuffleSalt, 'clusters']));
    laidOut = keys.flatMap((key) =>
      clusters
        .get(key)
        .sort(
          (a, b) =>
            clean(a.ward).localeCompare(clean(b.ward)) ||
            String(a.name || '').localeCompare(String(b.name || '')) ||
            a.id - b.id
        )
    );
  }

  // ---- Cut into consecutive runs sized by each supervisor's target ----
  const assignments = [];
  let cursor = 0;
  orderedSupervisors.forEach((supervisor, i) => {
    for (let n = 0; n < targets[i] && cursor < laidOut.length; n++, cursor++) {
      const school = laidOut[cursor];
      assignments.push({
        supervisor_id: supervisor.id,
        school_id: school.id,
        state: clean(school.state),
        lga: clean(school.lga),
      });
    }
  });

  const unassigned = laidOut.slice(cursor).map((s) => s.id);
  if (unassigned.length > 0) {
    warnings.push(
      `${unassigned.length} school(s) could not be assigned - every supervisor has reached the limit of ${cap} school(s)`
    );
  }

  const unknownGeo = schools.filter((s) => clean(s.state) === UNKNOWN || clean(s.lga) === UNKNOWN).length;
  if (mode === 'lga' && unknownGeo > 0) {
    warnings.push(`${unknownGeo} school(s) have no state/LGA on record and are grouped together as "${UNKNOWN}"`);
  }

  const perSupervisor = orderedSupervisors
    .map((supervisor) => {
      const mine = assignments.filter((a) => a.supervisor_id === supervisor.id);
      const clusters = [...new Set(mine.map((a) => `${a.lga}, ${a.state}`))];
      return { supervisor_id: supervisor.id, name: supervisor.name || null, count: mine.length, clusters };
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '') || a.supervisor_id - b.supervisor_id);

  return { assignments, perSupervisor, unassigned, warnings, planHash: planFingerprint(assignments) };
}

module.exports = { allocate, planFingerprint, computeTargets, clusterKey };
