/**
 * Admin Location Logs Page
 * 
 * Admin page to view and manage supervisor location verification logs.
 * Shows all location verifications with filtering and override capabilities.
 */

import { useState, useEffect, useMemo } from 'react';
import { locationApi, sessionsApi, usersApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import {
  IconMapPin,
  IconRefresh,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconFilter,
  IconEye,
  IconDeviceMobile,
  IconClock,
  IconUser,
  IconSchool,
  IconLoader2,
  IconChartBar,
  IconShieldCheck,
} from '@tabler/icons-react';
import { formatDate } from '../../utils/helpers';

function AdminLocationLogsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canOverride = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);

  // Filters
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [supervisors, setSupervisors] = useState([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);

  // Pagination
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);

  // Override dialog
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
    fetchSupervisors();
  }, []);

  // Fetch logs when filters change
  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [selectedSession, selectedSupervisor, selectedStatus, suspiciousOnly, pagination.page]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      if (sessionsData.length > 0) {
        const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchSupervisors = async () => {
    try {
      const response = await usersApi.getAll({ role: 'supervisor', limit: 500 });
      setSupervisors(response.data.data || []);
    } catch (err) {
      console.error('Failed to load supervisors:', err);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (selectedSession) params.session_id = selectedSession;
      if (selectedSupervisor) params.supervisor_id = selectedSupervisor;
      if (selectedStatus) params.status = selectedStatus;
      if (suspiciousOnly) params.suspicious_only = 'true';

      const response = await locationApi.getLocationLogs(params);
      setLogs(response.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (err) {
      console.error('Failed to load location logs:', err);
      toast.error('Failed to load location logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const params = selectedSession ? { session_id: selectedSession } : {};
      const response = await locationApi.getLocationStats(params);
      setStats(response.data.data || null);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleRefresh = () => {
    fetchLogs();
    fetchStats();
  };

  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setDetailDialogOpen(true);
  };

  const handleOpenOverride = (log) => {
    setSelectedLog(log);
    setOverrideReason('');
    setOverrideDialogOpen(true);
  };

  const handleOverride = async (approve) => {
    if (!selectedLog || !overrideReason || overrideReason.length < 10) {
      toast.error('Please provide a reason (at least 10 characters)');
      return;
    }

    setOverriding(true);
    try {
      await locationApi.overrideLocationValidation(selectedLog.id, {
        approve,
        reason: overrideReason,
      });
      toast.success(approve ? 'Location verification approved' : 'Location verification rejected');
      setOverrideDialogOpen(false);
      fetchLogs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to override validation');
    } finally {
      setOverriding(false);
    }
  };

  // Column definitions
  const columns = useMemo(
    () => [
      {
        accessor: 'sn',
        header: 'S/N',
        sortable: false,
        render: (_, __, index) => (pagination.page - 1) * pagination.limit + index + 1,
      },
      {
        accessor: 'supervisor_name',
        header: 'Supervisor',
        render: (value) => (
          <div className="flex items-center gap-2">
            <IconUser className="h-4 w-4 text-gray-400" />
            <span className="font-medium">{value}</span>
          </div>
        ),
      },
      {
        accessor: 'school_name',
        header: 'School',
        render: (value) => (
          <div className="flex items-center gap-2">
            <IconSchool className="h-4 w-4 text-gray-400" />
            <span>{value}</span>
          </div>
        ),
      },
      {
        accessor: 'visit_number',
        header: 'Visit',
        render: (value) => <Badge variant="outline">Visit {value}</Badge>,
      },
      {
        accessor: 'distance_from_school_m',
        header: 'Distance',
        render: (value, row) => (
          <div className="text-sm">
            <span className={row.is_within_geofence ? 'text-green-600' : 'text-red-600'}>
              {Math.round(value)}m
            </span>
            <span className="text-gray-400"> / {row.geofence_radius_m}m</span>
          </div>
        ),
      },
      {
        accessor: 'validation_status',
        header: 'Status',
        render: (value, row) => {
          const isSuspicious = row.validation_message?.includes('ALERT');
          if (value === 'validated') {
            return (
              <Badge variant="success" className="flex items-center gap-1">
                <IconCheck className="h-3 w-3" />
                Validated
              </Badge>
            );
          } else if (value === 'overridden') {
            return (
              <Badge variant="primary" className="flex items-center gap-1">
                <IconShieldCheck className="h-3 w-3" />
                Overridden
              </Badge>
            );
          } else {
            return (
              <Badge
                variant={isSuspicious ? 'danger' : 'warning'}
                className="flex items-center gap-1"
              >
                {isSuspicious ? (
                  <IconAlertTriangle className="h-3 w-3" />
                ) : (
                  <IconClock className="h-3 w-3" />
                )}
                {isSuspicious ? 'Suspicious' : 'Pending'}
              </Badge>
            );
          }
        },
      },
      {
        accessor: 'created_at',
        header: 'Recorded At',
        render: (value) => (
          <span className="text-sm text-gray-500">{formatDate(value, 'datetime')}</span>
        ),
      },
      {
        accessor: 'actions',
        header: 'Actions',
        sortable: false,
        exportable: false,
        render: (_, row) => (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => handleViewDetails(row)} title="View Details">
              <IconEye className="h-4 w-4" />
            </Button>
            {canOverride && row.validation_status === 'pending' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleOpenOverride(row)}
                title="Override"
              >
                <IconShieldCheck className="h-4 w-4 text-primary-600" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [pagination.page, pagination.limit, canOverride]
  );

  // Session options
  const sessionOptions = sessions.map((s) => ({
    value: s.id.toString(),
    label: s.name + (s.is_current ? ' (Current)' : ''),
  }));

  // Supervisor options
  const supervisorOptions = supervisors.map((s) => ({
    value: s.id.toString(),
    label: s.name,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Location Verification Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and manage supervisor location verifications
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={loading}>
          <IconRefresh className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <IconMapPin className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_logs || 0}</p>
                  <p className="text-xs text-gray-500">Total Logs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <IconCheck className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.validated_count || 0}</p>
                  <p className="text-xs text-gray-500">Validated</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <IconClock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending_count || 0}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <IconAlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.suspicious_count || 0}</p>
                  <p className="text-xs text-gray-500">Suspicious</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:gap-4 flex-1">
              <Select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="col-span-2 sm:col-span-1 lg:w-48"
              >
                <option value="">All Sessions</option>
                {sessionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>

              <div className="col-span-2 sm:col-span-1 lg:w-48">
                <SearchableSelect
                  options={[{ value: 'all', label: 'All Supervisors' }, ...supervisorOptions]}
                  value={selectedSupervisor || 'all'}
                  onChange={(val) => setSelectedSupervisor(val === 'all' ? '' : val)}
                  placeholder="Select Supervisor"
                />
              </div>

              <Select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="lg:w-40"
              >
                <option value="">All Status</option>
                <option value="validated">Validated</option>
                <option value="pending">Pending</option>
                <option value="overridden">Overridden</option>
              </Select>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={suspiciousOnly}
                  onChange={(e) => setSuspiciousOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 whitespace-nowrap">Suspicious only</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconChartBar className="h-5 w-5 text-primary-600" />
            Location Logs ({pagination.total})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={logs}
            loading={loading}
            pagination={{
              page: pagination.page,
              limit: pagination.limit,
              total: pagination.total,
              onPageChange: (page) => setPagination((prev) => ({ ...prev, page })),
            }}
            emptyMessage="No location logs found"
          />
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        title="Location Log Details"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-4">
            {/* Supervisor & School Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500 uppercase">Supervisor</p>
                <p className="mt-1 font-medium text-gray-900">{selectedLog.supervisor_name}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500 uppercase">School</p>
                <p className="mt-1 font-medium text-gray-900">{selectedLog.school_name}</p>
              </div>
            </div>

            {/* Location Details */}
            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="font-medium text-gray-900 mb-3">Location Data</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Coordinates:</span>
                  <span className="ml-2 font-mono">
                    {selectedLog.latitude}, {selectedLog.longitude}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Accuracy:</span>
                  <span className="ml-2">±{selectedLog.accuracy_meters || 'N/A'}m</span>
                </div>
                <div>
                  <span className="text-gray-500">Distance from School:</span>
                  <span
                    className={`ml-2 font-medium ${
                      selectedLog.is_within_geofence ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {Math.round(selectedLog.distance_from_school_m)}m
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Geofence Radius:</span>
                  <span className="ml-2">{selectedLog.geofence_radius_m}m</span>
                </div>
              </div>
            </div>

            {/* Device Info */}
            <div className="rounded-lg border border-gray-200 p-4">
              <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                <IconDeviceMobile className="h-4 w-4" />
                Device Information
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Device ID:</span>
                  <span className="ml-2 font-mono text-xs">{selectedLog.device_id || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500">IP Address:</span>
                  <span className="ml-2 font-mono">{selectedLog.ip_address || 'N/A'}</span>
                </div>
                {selectedLog.device_info && (
                  <div className="col-span-2">
                    <span className="text-gray-500">Device Info:</span>
                    <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-auto">
                      {typeof selectedLog.device_info === 'string'
                        ? selectedLog.device_info
                        : JSON.stringify(selectedLog.device_info, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>

            {/* Validation Status */}
            {selectedLog.validation_message && (
              <div
                className={`rounded-lg p-3 ${
                  selectedLog.validation_message.includes('ALERT')
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-gray-50'
                }`}
              >
                <p className="text-sm">{selectedLog.validation_message}</p>
              </div>
            )}

            {/* Override Info */}
            {selectedLog.overridden_by && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <p className="text-sm font-medium text-blue-800">Override Information</p>
                <p className="mt-1 text-sm text-blue-700">
                  Overridden at: {formatDate(selectedLog.overridden_at, 'datetime')}
                </p>
                <p className="text-sm text-blue-700">Reason: {selectedLog.override_reason}</p>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Override Dialog */}
      <Dialog
        open={overrideDialogOpen}
        onClose={() => setOverrideDialogOpen(false)}
        title="Override Location Validation"
        size="md"
      >
        {selectedLog && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="font-medium text-gray-900">{selectedLog.supervisor_name}</p>
              <p className="text-sm text-gray-500">{selectedLog.school_name}</p>
            </div>

            {selectedLog.validation_message?.includes('ALERT') && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="flex items-start gap-2">
                  <IconAlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{selectedLog.validation_message}</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Override Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                placeholder="Provide a reason for this override (min 10 characters)..."
              />
              <p className="mt-1 text-xs text-gray-500">{overrideReason.length}/10 characters minimum</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setOverrideDialogOpen(false)}
                disabled={overriding}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleOverride(false)}
                disabled={overriding || overrideReason.length < 10}
              >
                {overriding ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reject
              </Button>
              <Button
                variant="primary"
                onClick={() => handleOverride(true)}
                disabled={overriding || overrideReason.length < 10}
              >
                {overriding ? <IconLoader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Approve
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default AdminLocationLogsPage;
