/**
 * Field Capture Panel
 *
 * The "Field Capture" tab of the School Update Requests page. The Head of TP assigns
 * supervisors to schools that lack a verified location / principal, tracks progress per
 * supervisor and per school, reassigns or cancels individual assignments, and rolls back
 * whole batches. The supervisors' submissions themselves arrive in the Principal and
 * Location tabs as ordinary pending requests.
 *
 * Also exports RequestSourceBadges, used by the request tables/detail modal to flag rows
 * that a supervisor captured in the field.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IconWand,
  IconHandClick,
  IconRefresh,
  IconArrowsExchange,
  IconTrash,
  IconArrowBackUp,
  IconHistory,
  IconClipboardCheck,
  IconUsers,
  IconTimeline,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { schoolCaptureApi } from '../../api/schoolCapture';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DataTable } from '../ui/DataTable';
import AssignSchoolCaptureDialog from './AssignSchoolCaptureDialog';
import CaptureTimelineDialog from './CaptureTimelineDialog';
import RiskBadge from './RiskBadge';
import { riskLabel } from './captureConstants';

const formatKm = (value) =>
  value === null || value === undefined || value === '' ? '-' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`;

const STATUS_LABELS = {
  not_started: 'Not started',
  not_required: 'Not required',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const PROGRESS_LABELS = {
  not_started: 'Not started',
  in_progress: 'In progress',
  pending: 'Pending review',
  rejected: 'Rejected',
  completed: 'Completed',
};

const statusVariant = (status) =>
  ({ approved: 'success', pending: 'warning', rejected: 'error', not_started: 'default', not_required: 'default' })[status] || 'default';

const progressVariant = (progress) =>
  ({ completed: 'success', pending: 'warning', rejected: 'error', in_progress: 'info', not_started: 'default' })[progress] || 'default';

const EVENT_TYPE_LABELS = {
  assigned: 'Assigned',
  reassigned: 'Reassigned',
  cancelled: 'Cancelled',
  rolled_back: 'Rolled back',
  location_submitted: 'Location submitted',
  principal_submitted: 'Principal submitted',
  request_approved: 'Approved',
  request_rejected: 'Rejected',
};

const ACTIVITY_PAGE_SIZE = 20;

const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

/** "Captured by supervisor" / "Manual entry" / accuracy badges for a request row. */
export function RequestSourceBadges({ row, showAccuracy = false }) {
  if (!row) return null;
  const captured = row.source === 'supervisor';
  const manual = row.capture_method === 'manual';
  const accuracy = showAccuracy && row.accuracy_meters != null && row.accuracy_meters !== '';
  if (!captured && !manual && !accuracy) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {captured && (
        <Badge variant="info">
          Captured by supervisor{row.submitted_by_name ? `: ${row.submitted_by_name}` : ''}
        </Badge>
      )}
      {captured && row.risk_level && <RiskBadge level={row.risk_level} flags={row.risk_flags} />}
      {manual && <Badge variant="warning">Manual entry</Badge>}
      {accuracy && <Badge variant="default">Accuracy: {Math.round(Number(row.accuracy_meters))} m</Badge>}
    </div>
  );
}

function SummaryCell({ pending, approved }) {
  return (
    <span className="text-sm whitespace-nowrap">
      <span className="text-yellow-700">{pending || 0}</span>
      <span className="text-gray-400"> / </span>
      <span className="text-green-700">{approved || 0}</span>
    </span>
  );
}

/**
 * @param {Object} props
 * @param {string|number} props.sessionId - the page's session filter
 * @param {Array} props.sessions - sessions for the selector
 * @param {function} props.onSessionChange - called with the new session id
 */
export default function FieldCapturePanel({ sessionId, sessions = [], onSessionChange }) {
  const { toast } = useToast();

  const [assignments, setAssignments] = useState([]);
  const [supervisorSummary, setSupervisorSummary] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [filters, setFilters] = useState({ supervisor: '', state: '', lga: '', progress: '', risk: '' });

  const [dialogMode, setDialogMode] = useState(null); // null | 'auto' | 'manual'
  const [reassigning, setReassigning] = useState(null);
  const [newSupervisorId, setNewSupervisorId] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [rollingBack, setRollingBack] = useState(null);
  const [busy, setBusy] = useState(false);
  const [allSupervisors, setAllSupervisors] = useState([]);
  const [timelineId, setTimelineId] = useState(null);

  // Activity log
  const [showActivity, setShowActivity] = useState(false);
  const [activity, setActivity] = useState([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPagination, setActivityPagination] = useState(null);
  const [activityFilters, setActivityFilters] = useState({ supervisor_id: '', event_type: '', flaggedOnly: false });
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(null);

  const sessionName = useMemo(
    () => sessions.find((s) => String(s.id) === String(sessionId))?.name,
    [sessions, sessionId]
  );

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [assignmentsRes, batchesRes] = await Promise.all([
        schoolCaptureApi.getAssignments({ session_id: sessionId, limit: 'all' }),
        schoolCaptureApi.getBatches({ session_id: sessionId }),
      ]);
      setAssignments(assignmentsRes.data?.data || []);
      setSupervisorSummary(assignmentsRes.data?.supervisors || []);
      setBatches(batchesRes.data?.data || []);
    } catch (error) {
      setLoadError(errorMessage(error, 'Failed to load field capture assignments'));
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Every active supervisor can receive a reassignment, not only those already holding schools
  useEffect(() => {
    if (!reassigning) return;
    schoolCaptureApi
      .getOptions({ session_id: sessionId })
      .then((res) => setAllSupervisors(res.data?.data?.supervisors || []))
      .catch(() => setAllSupervisors([]));
  }, [reassigning, sessionId]);

  // ---- Filters ----
  const filterOptions = useMemo(() => {
    const states = [...new Set(assignments.map((a) => a.state).filter(Boolean))].sort();
    const lgas = [...new Set(
      assignments.filter((a) => !filters.state || a.state === filters.state).map((a) => a.lga).filter(Boolean)
    )].sort();
    return { states, lgas };
  }, [assignments, filters.state]);

  const filteredRows = useMemo(
    () =>
      assignments.filter(
        (a) =>
          (!filters.supervisor || String(a.supervisor_id) === filters.supervisor) &&
          (!filters.state || a.state === filters.state) &&
          (!filters.lga || a.lga === filters.lga) &&
          (!filters.progress || a.progress === filters.progress) &&
          (!filters.risk ||
            (filters.risk === 'high' ? a.risk_level === 'high' : a.risk_level === 'high' || a.risk_level === 'medium'))
      ),
    [assignments, filters]
  );

  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value, ...(key === 'state' ? { lga: '' } : {}) }));

  // ---- Activity log ----
  const loadActivity = useCallback(async () => {
    if (!sessionId || !showActivity) return;
    setActivityLoading(true);
    setActivityError(null);
    try {
      const params = { session_id: sessionId, page: activityPage, limit: ACTIVITY_PAGE_SIZE };
      if (activityFilters.supervisor_id) params.supervisor_id = activityFilters.supervisor_id;
      if (activityFilters.event_type) params.event_type = activityFilters.event_type;
      if (activityFilters.flaggedOnly) params.risk = 'flagged';
      const res = await schoolCaptureApi.getActivityLog(params);
      setActivity(res.data?.data || []);
      setActivityPagination(res.data?.pagination || null);
    } catch (error) {
      setActivityError(errorMessage(error, 'Failed to load the activity log'));
    } finally {
      setActivityLoading(false);
    }
  }, [sessionId, showActivity, activityPage, activityFilters]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const setActivityFilter = (key, value) => {
    setActivityPage(1);
    setActivityFilters((prev) => ({ ...prev, [key]: value }));
  };

  // ---- Mutations ----
  const handleReassign = async () => {
    setBusy(true);
    try {
      await schoolCaptureApi.reassign(reassigning.id, Number(newSupervisorId));
      toast.success('Assignment reassigned');
      setReassigning(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to reassign'));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      await schoolCaptureApi.cancel(cancelling.id);
      toast.success('Assignment cancelled');
      setCancelling(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to cancel assignment'));
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async () => {
    setBusy(true);
    try {
      await schoolCaptureApi.rollbackBatch(rollingBack.id);
      toast.success('Batch rolled back');
      setRollingBack(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to roll back batch'));
    } finally {
      setBusy(false);
    }
  };

  // ---- Columns ----
  const columns = useMemo(
    () => [
      {
        accessor: 'supervisor_name',
        header: 'Supervisor',
        render: (value) => <span className="font-medium text-gray-900">{value}</span>,
      },
      {
        accessor: 'supervisor_email',
        header: 'Supervisor email',
        hideOnMobile: true,
        render: (value) => <span className="text-sm text-gray-500">{value || '-'}</span>,
      },
      {
        accessor: 'supervisor_phone',
        header: 'Supervisor phone',
        hideOnMobile: true,
        render: (value) => <span className="text-sm text-gray-500">{value || '-'}</span>,
      },
      {
        accessor: 'school_name',
        header: 'School',
        render: (value) => <span className="text-gray-900">{value}</span>,
      },
      { accessor: 'school_code', header: 'Code', render: (value) => <span className="text-sm text-gray-500">{value || '-'}</span> },
      { accessor: 'state', header: 'State' },
      { accessor: 'lga', header: 'LGA' },
      { accessor: 'ward', header: 'Ward', hideOnMobile: true },
      {
        accessor: 'distance_km',
        header: 'Distance from institution (km)',
        render: (value) => <span className="text-sm text-gray-700">{formatKm(value)}</span>,
        exportFormatter: (value) => (value === null || value === undefined ? '' : Number(value)),
      },
      {
        accessor: 'captured_vs_record_m',
        header: 'Captured vs on-file location (m)',
        hideOnMobile: true,
        render: (value) => <span className="text-sm text-gray-500">{value === null || value === undefined ? '-' : `${Number(value).toLocaleString()} m`}</span>,
        exportFormatter: (value) => (value === null || value === undefined ? '' : Number(value)),
      },
      {
        accessor: 'assigned_at',
        header: 'Assigned on',
        render: (value) => <span className="text-sm text-gray-500">{formatDate(value, '-')}</span>,
        exportFormatter: (value) => formatDate(value, ''),
      },
      {
        accessor: 'location_status',
        header: 'Location status',
        render: (value) => <Badge variant={statusVariant(value)}>{STATUS_LABELS[value] || value}</Badge>,
        exportFormatter: (value) => STATUS_LABELS[value] || value || '',
      },
      {
        accessor: 'principal_status',
        header: 'Principal status',
        render: (value) => <Badge variant={statusVariant(value)}>{STATUS_LABELS[value] || value}</Badge>,
        exportFormatter: (value) => STATUS_LABELS[value] || value || '',
      },
      {
        accessor: 'progress',
        header: 'Progress',
        render: (value) => <Badge variant={progressVariant(value)}>{PROGRESS_LABELS[value] || value}</Badge>,
        exportFormatter: (value) => PROGRESS_LABELS[value] || value || '',
      },
      {
        accessor: 'risk_level',
        header: 'Risk',
        render: (value) => <RiskBadge level={value} placeholder />,
        exportFormatter: (value) => riskLabel(value),
      },
      {
        accessor: 'actions',
        header: 'Actions',
        exportable: false,
        sortable: false,
        render: (_, row) => (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              title="Timeline"
              onClick={(e) => {
                e.stopPropagation();
                setTimelineId(row.id);
              }}
            >
              <IconTimeline className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Reassign"
              onClick={(e) => {
                e.stopPropagation();
                setReassigning(row);
                setNewSupervisorId('');
              }}
            >
              <IconArrowsExchange className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Cancel assignment"
              className="hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                setCancelling(row);
              }}
            >
              <IconTrash className="w-5 h-5" />
            </Button>
          </div>
        ),
      },
    ],
    []
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.supervisor} onChange={(e) => setFilter('supervisor', e.target.value)} className="w-auto" aria-label="Supervisor">
        <option value="">All supervisors</option>
        {supervisorSummary.map((s) => (
          <option key={s.supervisor_id} value={s.supervisor_id}>{s.supervisor_name}</option>
        ))}
      </Select>
      <Select value={filters.state} onChange={(e) => setFilter('state', e.target.value)} className="w-auto" aria-label="State">
        <option value="">All states</option>
        {filterOptions.states.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Select value={filters.lga} onChange={(e) => setFilter('lga', e.target.value)} className="w-auto" aria-label="LGA">
        <option value="">All LGAs</option>
        {filterOptions.lgas.map((l) => <option key={l} value={l}>{l}</option>)}
      </Select>
      <Select value={filters.progress} onChange={(e) => setFilter('progress', e.target.value)} className="w-auto" aria-label="Progress">
        <option value="">All progress</option>
        {Object.entries(PROGRESS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <Select value={filters.risk} onChange={(e) => setFilter('risk', e.target.value)} className="w-auto" aria-label="Risk">
        <option value="">All risk levels</option>
        <option value="flagged">Flagged (review + high)</option>
        <option value="high">High risk</option>
      </Select>
    </div>
  );

  const reassignOptions = allSupervisors.filter((s) => s.id !== reassigning?.supervisor_id);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={sessionId || ''}
            onChange={(e) => onSessionChange?.(e.target.value)}
            className="w-auto"
            aria-label="Session"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.is_current && '(Current)'}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <IconRefresh className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialogMode('auto')} disabled={!sessionId}>
            <IconWand className="w-4 h-4 mr-2" />
            Auto Assign
          </Button>
          <Button variant="outline" onClick={() => setDialogMode('manual')} disabled={!sessionId}>
            <IconHandClick className="w-4 h-4 mr-2" />
            Manual Assign
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={load}>Retry</Button>
        </div>
      )}

      {/* Per-supervisor summary */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <IconUsers className="w-4 h-4 text-gray-500" />
            Supervisor progress
            <span className="text-xs font-normal text-gray-500">(location and principal shown as pending / approved)</span>
          </h3>
          {supervisorSummary.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              {loading ? 'Loading…' : 'No supervisors have been assigned schools for this session yet.'}
            </p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="px-2 py-2 font-medium">Supervisor</th>
                    <th className="px-2 py-2 font-medium text-right">Schools</th>
                    <th className="px-2 py-2 font-medium">Location</th>
                    <th className="px-2 py-2 font-medium">Principal</th>
                    <th className="px-2 py-2 font-medium text-right">Completed</th>
                    <th className="px-2 py-2 font-medium text-right">Flagged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {supervisorSummary.map((s) => (
                    <tr key={s.supervisor_id}>
                      <td className="px-2 py-2 font-medium text-gray-900">{s.supervisor_name}</td>
                      <td className="px-2 py-2 text-right">{s.schools}</td>
                      <td className="px-2 py-2"><SummaryCell pending={s.location_pending} approved={s.location_approved} /></td>
                      <td className="px-2 py-2"><SummaryCell pending={s.principal_pending} approved={s.principal_approved} /></td>
                      <td className="px-2 py-2 text-right">
                        <span className="text-green-700 font-medium">{s.completed || 0}</span>
                        <span className="text-gray-400"> / {s.schools}</span>
                      </td>
                      <td className="px-2 py-2 text-right">
                        {s.flagged > 0 ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline"
                            title="Show this supervisor's flagged assignments"
                            onClick={() => setFilters((prev) => ({ ...prev, supervisor: String(s.supervisor_id), risk: 'flagged' }))}
                          >
                            <span className="text-amber-700 font-medium">{s.flagged}</span>
                            {s.flagged_high > 0 && (
                              <span className="rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">{s.flagged_high} high</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All assignments */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">All Assignments</h3>
        <DataTable
          data={filteredRows}
          columns={columns}
          keyField="id"
          loading={loading}
          mobileCards
          clientPagination
          sortable
          searchable
          searchPlaceholder="Search supervisor, school, code, LGA…"
          exportable
          exportFilename="school_capture_assignments"
          toolbar={toolbar}
          emptyIcon={IconClipboardCheck}
          emptyTitle="No assignments found"
          emptyDescription="Use Auto Assign or Manual Assign to send supervisors to schools that need data captured"
        />
      </div>

      {/* Batch history */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <IconHistory className="w-4 h-4 text-gray-500" />
            Batch history
          </h3>
          {batches.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No batches yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {batches.map((b) => {
                const canRollback = b.status === 'completed' && b.active_count > 0;
                return (
                  <div key={b.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 flex flex-wrap items-center gap-2">
                        Batch #{b.id}
                        <Badge variant="default">{b.mode}</Badge>
                        <Badge variant={b.status === 'completed' ? 'success' : 'default'}>{b.status}</Badge>
                      </div>
                      <div className="text-xs text-gray-500">
                        {b.school_count} schools, {b.supervisor_count} supervisors, {b.active_count} still active
                        {' · '}
                        {formatDateTime(b.created_at, '-')}
                        {b.created_by_name ? ` · ${b.created_by_name}` : ''}
                      </div>
                    </div>
                    {canRollback && (
                      <Button variant="outline" size="sm" onClick={() => setRollingBack(b)}>
                        <IconArrowBackUp className="w-4 h-4 mr-1.5" />
                        Rollback
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity log */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <IconAlertTriangle className="w-4 h-4 text-gray-500" />
              Activity log
            </h3>
            <Button variant="outline" size="sm" onClick={() => setShowActivity((v) => !v)}>
              {showActivity ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showActivity && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={activityFilters.supervisor_id}
                  onChange={(e) => setActivityFilter('supervisor_id', e.target.value)}
                  className="w-auto"
                  aria-label="Activity supervisor"
                >
                  <option value="">All supervisors</option>
                  {supervisorSummary.map((s) => (
                    <option key={s.supervisor_id} value={s.supervisor_id}>{s.supervisor_name}</option>
                  ))}
                </Select>
                <Select
                  value={activityFilters.event_type}
                  onChange={(e) => setActivityFilter('event_type', e.target.value)}
                  className="w-auto"
                  aria-label="Event type"
                >
                  <option value="">All events</option>
                  {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={activityFilters.flaggedOnly}
                    onChange={(e) => setActivityFilter('flaggedOnly', e.target.checked)}
                  />
                  Flagged only
                </label>
                <Button variant="outline" size="sm" onClick={loadActivity} disabled={activityLoading}>
                  <IconRefresh className="w-4 h-4" />
                </Button>
              </div>

              {activityError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{activityError}</div>
              )}

              {activity.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">{activityLoading ? 'Loading…' : 'No activity found.'}</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activity.map((ev) => (
                    <div key={ev.id} className="py-2.5 flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 flex flex-wrap items-center gap-2">
                          <span className="font-medium">{ev.supervisor_name || ev.actor_name || '-'}</span>
                          <span className="text-gray-500">{ev.school_name}</span>
                          {ev.event_type === 'location_submitted' && <RiskBadge level={ev.metadata?.risk_level} flags={ev.metadata?.risk_flags} />}
                        </div>
                        <div className="text-sm text-gray-600">{ev.summary || EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</div>
                        <div className="text-xs text-gray-500">{formatDateTime(ev.created_at, '-')}</div>
                      </div>
                      {ev.assignment_id && (
                        <Button variant="ghost" size="sm" onClick={() => setTimelineId(ev.assignment_id)}>
                          <IconTimeline className="w-4 h-4 mr-1.5" />
                          Timeline
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activityPagination && activityPagination.totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>
                    Page {activityPagination.page} of {activityPagination.totalPages} ({activityPagination.total} events)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={activityPage <= 1 || activityLoading} onClick={() => setActivityPage((p) => p - 1)}>
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={activityPage >= activityPagination.totalPages || activityLoading}
                      onClick={() => setActivityPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <CaptureTimelineDialog isOpen={!!timelineId} onClose={() => setTimelineId(null)} assignmentId={timelineId} />

      <AssignSchoolCaptureDialog
        open={dialogMode !== null}
        initialMode={dialogMode || 'auto'}
        onClose={() => setDialogMode(null)}
        sessionId={sessionId}
        sessionName={sessionName}
        onComplete={load}
      />

      {/* Reassign */}
      <Dialog
        isOpen={!!reassigning}
        onClose={() => !busy && setReassigning(null)}
        title="Reassign school"
        width="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReassigning(null)} disabled={busy}>Cancel</Button>
            <Button onClick={handleReassign} loading={busy} disabled={!newSupervisorId}>Reassign</Button>
          </>
        }
      >
        {reassigning && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{reassigning.school_name}</span> is currently assigned to{' '}
              {reassigning.supervisor_name}.
            </p>
            <Select value={newSupervisorId} onChange={(e) => setNewSupervisorId(e.target.value)} aria-label="New supervisor">
              <option value="">Select a supervisor…</option>
              {reassignOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        isOpen={!!cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={handleCancel}
        title="Cancel assignment"
        message={`Cancel ${cancelling?.supervisor_name}'s assignment to ${cancelling?.school_name}? Anything they already submitted stays in the review queue.`}
        confirmText="Cancel assignment"
        variant="danger"
        loading={busy}
      />

      <ConfirmDialog
        isOpen={!!rollingBack}
        onClose={() => setRollingBack(null)}
        onConfirm={handleRollback}
        title="Roll back batch"
        message={`Roll back Batch #${rollingBack?.id}? ${rollingBack?.active_count} active assignment(s) from this batch will be removed.`}
        confirmText="Roll back"
        variant="danger"
        loading={busy}
      />
    </div>
  );
}
