/**
 * Capture Timeline Dialog
 *
 * Everything that happened on one school capture assignment, oldest first: assignment,
 * reassignment, each supervisor submission (with GPS evidence and risk flags) and how
 * the Head of TP reviewed it. Used from the Field Capture tab and the request detail modal.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  IconExternalLink,
  IconChevronDown,
  IconAlertTriangle,
  IconShieldCheck,
  IconRefresh,
} from '@tabler/icons-react';
import { schoolCaptureApi } from '../../api/schoolCapture';
import { formatDateTime } from '../../utils/helpers';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import RiskBadge from './RiskBadge';

const EVENT_STYLES = {
  assigned: { dot: 'bg-blue-500', label: 'Assigned' },
  reassigned: { dot: 'bg-indigo-500', label: 'Reassigned' },
  cancelled: { dot: 'bg-gray-400', label: 'Cancelled' },
  rolled_back: { dot: 'bg-gray-400', label: 'Rolled back' },
  location_submitted: { dot: 'bg-teal-500', label: 'Location submitted' },
  principal_submitted: { dot: 'bg-purple-500', label: 'Principal submitted' },
  request_approved: { dot: 'bg-green-500', label: 'Approved' },
  request_rejected: { dot: 'bg-red-500', label: 'Rejected' },
};

const PROGRESS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  pending: 'Pending review',
  rejected: 'Rejected',
  completed: 'Completed',
};

const REQUEST_STATUS_VARIANT = { pending: 'warning', approved: 'success', rejected: 'error' };

const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

function relativeTime(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const abs = Math.abs(diff);
  const units = [
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    for (const [unit, ms] of units) {
      if (abs >= ms) return rtf.format(-Math.round(diff / ms), unit);
    }
    return rtf.format(0, 'second');
  } catch {
    return '';
  }
}

const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

const shortAgent = (ua) => {
  if (!ua) return '';
  const m = ua.match(/\(([^)]+)\)/);
  const browser = ua.match(/(Edg|Chrome|Firefox|Safari|OPR)\/[\d.]+/);
  const text = [m && m[1], browser && browser[0]].filter(Boolean).join(' · ') || ua;
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
};

const fmtNum = (n, digits = 0) => (n == null || n === '' || Number.isNaN(Number(n)) ? '-' : Number(n).toFixed(digits));

function Coords({ lat, lng }) {
  if (lat == null || lng == null) return <span>-</span>;
  return (
    <a
      href={mapsLink(lat, lng)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary-600 hover:underline break-all"
    >
      {Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}
      <IconExternalLink className="w-3.5 h-3.5 shrink-0" />
    </a>
  );
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{children}</dd>
    </div>
  );
}

function FlagChip({ flag }) {
  const high = flag.severity === 'high';
  return (
    <span
      className={`inline-flex items-start gap-1.5 rounded-md border px-2 py-1 text-xs ${
        high ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <IconAlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
      <span>{flag.message || flag.code}</span>
    </span>
  );
}

function Details({ summary, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        aria-expanded={open}
      >
        <IconChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        {summary}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function GpsReadings({ samples }) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  return (
    <Details summary={`GPS readings (${samples.length})`}>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">Time</th>
              <th className="px-2 py-1.5 text-left font-medium">Latitude</th>
              <th className="px-2 py-1.5 text-left font-medium">Longitude</th>
              <th className="px-2 py-1.5 text-right font-medium">Accuracy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {samples.map((s, i) => (
              <tr key={i}>
                <td className="px-2 py-1 whitespace-nowrap">
                  {s.timestamp ? new Date(s.timestamp).toLocaleTimeString(undefined, { hour12: false }) : '-'}
                </td>
                <td className="px-2 py-1 font-mono">{fmtNum(s.latitude, 6)}</td>
                <td className="px-2 py-1 font-mono">{fmtNum(s.longitude, 6)}</td>
                <td className="px-2 py-1 text-right">{s.accuracy_meters != null ? `±${fmtNum(s.accuracy_meters)} m` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Details>
  );
}

function RequestStanding({ request }) {
  if (!request) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
      <span>Request now:</span>
      <Badge variant={REQUEST_STATUS_VARIANT[request.status] || 'default'}>{request.status}</Badge>
      {request.reviewed_by_name && <span>by {request.reviewed_by_name}</span>}
      {request.reviewed_at && <span>on {formatDateTime(request.reviewed_at, '')}</span>}
      {request.status === 'rejected' && request.rejection_reason && (
        <span className="w-full text-red-700">Reason: {request.rejection_reason}</span>
      )}
      {request.admin_notes && <span className="w-full">Note: {request.admin_notes}</span>}
    </div>
  );
}

function LocationBody({ event }) {
  const m = event.metadata || {};
  const flags = Array.isArray(m.risk_flags) ? m.risk_flags : [];
  const isGps = m.capture_method === 'gps';
  const overAccuracy = m.max_gps_accuracy_meters != null && m.accuracy_meters != null
    && Number(m.accuracy_meters) > Number(m.max_gps_accuracy_meters);
  return (
    <div className="mt-2 space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="Coordinates"><Coords lat={m.latitude} lng={m.longitude} /></Fact>
        <Fact label="Method">
          {isGps ? 'GPS' : 'Typed manually'}
        </Fact>
        {isGps && (
          <Fact label="Accuracy">
            <span className={overAccuracy ? 'text-red-700 font-medium' : undefined}>
              ±{fmtNum(m.accuracy_meters)} m
            </span>
            {m.max_gps_accuracy_meters != null && (
              <span className="text-gray-500"> (limit {fmtNum(m.max_gps_accuracy_meters)} m)</span>
            )}
          </Fact>
        )}
        {isGps && m.samples && (
          <Fact label="GPS readings">
            {m.samples.count ?? 0} reading{m.samples.count === 1 ? '' : 's'}
            {m.samples.spread_m != null && <>, spread {fmtNum(m.samples.spread_m, 1)} m</>}
            {m.samples.best_accuracy_m != null && <>, best ±{fmtNum(m.samples.best_accuracy_m)} m</>}
          </Fact>
        )}
        <Fact label="Distance from location on file">
          {m.distance_from_record_m != null ? `${Math.round(m.distance_from_record_m).toLocaleString()} m` : 'No location on file'}
        </Fact>
        {m.previous_latitude != null && m.previous_longitude != null && (
          <Fact label="Previous coordinates"><Coords lat={m.previous_latitude} lng={m.previous_longitude} /></Fact>
        )}
        {m.had_note && <Fact label="Supervisor note">Included a note</Fact>}
      </dl>

      <div className="flex flex-wrap gap-1.5">
        {flags.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">
            <IconShieldCheck className="w-3.5 h-3.5" />
            No risk signals
          </span>
        ) : (
          flags.map((f, i) => <FlagChip key={`${f.code}-${i}`} flag={f} />)
        )}
      </div>

      <GpsReadings samples={event.request?.gps_samples} />
      <RequestStanding request={event.request} />
    </div>
  );
}

function PrincipalBody({ event }) {
  const m = event.metadata || {};
  return (
    <div className="mt-2 space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        <Fact label="Principal name">{m.principal_name || '-'}</Fact>
        <Fact label="Principal phone">{m.principal_phone || '-'}</Fact>
        {(m.previous_principal_name || m.previous_principal_phone) && (
          <Fact label="Previously on file">
            {[m.previous_principal_name, m.previous_principal_phone].filter(Boolean).join(' · ')}
          </Fact>
        )}
      </dl>
      {m.unchanged && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          <IconAlertTriangle className="w-3.5 h-3.5" />
          Same as already on file
        </span>
      )}
      <RequestStanding request={event.request} />
    </div>
  );
}

function ReviewBody({ event }) {
  const m = event.metadata || {};
  const note = m.rejection_reason || m.admin_notes;
  return (
    <div className="mt-1 space-y-1">
      {event.request_type && <p className="text-xs text-gray-500">On the {event.request_type} request</p>}
      {m.risk_level && m.risk_level !== 'none' && (
        <div className="flex items-center gap-1.5 text-xs text-gray-600">
          Risk at review: <RiskBadge level={m.risk_level} />
        </div>
      )}
      {note && <p className="text-sm text-gray-700">{note}</p>}
    </div>
  );
}

function TimelineEvent({ event, isLast }) {
  const style = EVENT_STYLES[event.event_type] || { dot: 'bg-gray-400', label: event.event_type };
  const m = event.metadata || {};
  let body = null;
  if (event.event_type === 'location_submitted') body = <LocationBody event={event} />;
  else if (event.event_type === 'principal_submitted') body = <PrincipalBody event={event} />;
  else if (event.event_type === 'request_approved' || event.event_type === 'request_rejected') body = <ReviewBody event={event} />;

  const highlight = event.event_type === 'location_submitted' && m.risk_level === 'high';

  return (
    <li className="relative pl-7 pb-5 last:pb-0">
      {!isLast && <span className="absolute left-[9px] top-5 bottom-0 w-px bg-gray-200" aria-hidden="true" />}
      <span className={`absolute left-1 top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${style.dot}`} aria-hidden="true" />
      <div className={`rounded-lg border p-3 ${highlight ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-gray-900">{style.label}</span>
          {event.event_type === 'location_submitted' && <RiskBadge level={m.risk_level} />}
          <span className="text-xs text-gray-500 sm:ml-auto" title={formatDateTime(event.created_at, '')}>
            {formatDateTime(event.created_at, '-')}
            {relativeTime(event.created_at) && ` (${relativeTime(event.created_at)})`}
          </span>
        </div>
        {event.summary && <p className="text-sm text-gray-700 mt-0.5">{event.summary}</p>}
        <p className="text-xs text-gray-500 mt-0.5">
          By {event.actor_name || event.supervisor_name || event.actor_type}
          {event.actor_type ? ` (${event.actor_type})` : ''}
        </p>
        {body}
        {(event.ip_address || event.user_agent) && (
          <Details summary="Device details">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {event.ip_address && <Fact label="IP address"><span className="font-mono">{event.ip_address}</span></Fact>}
              {event.user_agent && (
                <Fact label="Device"><span title={event.user_agent}>{shortAgent(event.user_agent)}</span></Fact>
              )}
              {m.device_clock && (
                <Fact label="Device clock">
                  <span className="break-all">{typeof m.device_clock === 'string' ? m.device_clock : JSON.stringify(m.device_clock)}</span>
                </Fact>
              )}
            </dl>
          </Details>
        )}
      </div>
    </li>
  );
}

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 * @param {number|string|null} props.assignmentId
 */
export default function CaptureTimelineDialog({ isOpen, onClose, assignmentId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!assignmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await schoolCaptureApi.getTimeline(assignmentId);
      setData(res.data?.data || null);
    } catch (err) {
      setData(null);
      setError(errorMessage(err, 'Failed to load the capture timeline'));
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    if (isOpen && assignmentId) {
      setData(null);
      load();
    }
  }, [isOpen, assignmentId, load]);

  const a = data?.assignment;
  const totals = data?.totals;
  const events = data?.events || [];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Capture timeline"
      width="3xl"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      {loading && !data && (
        <div className="py-12 text-center text-sm text-gray-500">Loading timeline…</div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={load}>
            <IconRefresh className="w-4 h-4 mr-1.5" />
            Retry
          </Button>
        </div>
      )}

      {a && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-3 sm:p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{a.school_name}</h3>
              {a.school_code && <span className="text-xs text-gray-500">{a.school_code}</span>}
              <Badge variant={a.assignment_status === 'active' ? 'success' : 'default'}>
                {a.assignment_status === 'active' ? 'Active' : 'Cancelled'}
              </Badge>
              <Badge variant="info">{PROGRESS_LABELS[a.progress] || a.progress}</Badge>
              {a.risk_level && <RiskBadge level={a.risk_level} />}
            </div>
            <p className="text-sm text-gray-600">{[a.ward, a.lga, a.state].filter(Boolean).join(', ')}</p>
            <p className="text-sm text-gray-700">
              Supervisor: <span className="font-medium">{a.supervisor_name}</span>
              {a.supervisor_phone && <span className="text-gray-500"> · {a.supervisor_phone}</span>}
            </p>
            {a.current_latitude != null && a.current_longitude != null && (
              <p className="text-sm text-gray-700">
                Location on file: <Coords lat={a.current_latitude} lng={a.current_longitude} />
              </p>
            )}

            {totals?.flagged > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <IconAlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {totals.flagged} of {totals.location_submissions} location submission{totals.location_submissions === 1 ? '' : 's'} flagged
                  {a.risk_level === 'high' ? '. The latest capture is high risk; review it before approving.' : '.'}
                </span>
              </div>
            ) : totals?.location_submissions > 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                <IconShieldCheck className="w-4 h-4 shrink-0" />
                No risk signals on {totals.location_submissions} location submission{totals.location_submissions === 1 ? '' : 's'}.
              </div>
            ) : null}
          </div>

          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">No activity recorded for this assignment yet.</p>
          ) : (
            <ol className="relative">
              {events.map((ev, i) => <TimelineEvent key={ev.id} event={ev} isLast={i === events.length - 1} />)}
            </ol>
          )}
        </div>
      )}
    </Dialog>
  );
}
