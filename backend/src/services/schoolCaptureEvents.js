/**
 * School Capture Events
 *
 * Append-only timeline of supervisor school data capture. Supervisors are paid
 * per captured school, so who did what, when, from where, and what the system
 * made of it must be reconstructable. Application code only ever INSERTs here.
 *
 * Writing an event must never take down the action it describes, so the
 * non-transactional helper swallows (and logs) its own failures. Inside a
 * transaction use `insertEvents(conn, ...)` so the event commits or rolls back
 * with the change itself.
 */

const { query } = require('../db/database');

const COLUMNS = [
  'institution_id', 'session_id', 'assignment_id', 'institution_school_id', 'supervisor_id',
  'actor_user_id', 'actor_type', 'event_type', 'request_type', 'request_id',
  'summary', 'metadata', 'ip_address', 'user_agent',
];

const EVENT_TYPES = [
  'assigned', 'reassigned', 'cancelled', 'rolled_back',
  'location_submitted', 'principal_submitted',
  'request_approved', 'request_rejected',
];

const toRow = (e) => [
  e.institutionId,
  e.sessionId,
  e.assignmentId ?? null,
  e.institutionSchoolId ?? null,
  e.supervisorId ?? null,
  e.actorUserId ?? null,
  e.actorType || 'system',
  e.eventType,
  e.requestType ?? null,
  e.requestId ?? null,
  e.summary ? String(e.summary).slice(0, 300) : null,
  e.metadata ? JSON.stringify(e.metadata) : null,
  e.ip ?? null,
  e.userAgent ? String(e.userAgent).slice(0, 255) : null,
];

/** Insert many events using a transaction connection (throws on failure). */
async function insertEvents(conn, events) {
  if (!events || events.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    await conn.query(
      `INSERT INTO school_capture_events (${COLUMNS.join(', ')}) VALUES ?`,
      [events.slice(i, i + CHUNK).map(toRow)]
    );
  }
}

/** Best-effort single event outside a transaction - never throws. */
async function recordEvent(event) {
  try {
    await query(
      `INSERT INTO school_capture_events (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
      toRow(event)
    );
  } catch (error) {
    console.error('[school-capture] failed to record event:', error.message);
  }
}

/** Request context -> the ip/user-agent pair stored on an event. */
const requestContext = (req) => ({ ip: req.ip || null, userAgent: req.get ? req.get('user-agent') : null });

module.exports = { insertEvents, recordEvent, requestContext, EVENT_TYPES };
