/**
 * School Registration Requests Page
 * Super admin page for reviewing student-submitted requests to register a
 * brand-new school in the central registry.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  IconCheck,
  IconX,
  IconEye,
  IconRefresh,
  IconClock,
  IconFilter,
  IconSchool,
  IconUser,
  IconBuilding,
  IconSearch,
  IconShieldCheck,
  IconShieldOff,
  IconUsers,
} from '@tabler/icons-react';
import { schoolRegistrationRequestsApi } from '../../api/schoolRegistrationRequests';
import { masterSchoolsApi } from '../../api/masterSchools';
import { sessionsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { createExportAllHandler } from '../../utils/exportAll';
import { Card, CardContent } from '../../components/ui/Card';
import { StatsCard } from '../../components/ui/StatsCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';

const getStatusVariant = (status) => {
  const variants = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
  };
  return variants[status] || 'default';
};

const SCHOOL_TYPE_LABELS = {
  primary: 'Primary',
  junior: 'Junior Secondary',
  senior: 'Senior Secondary',
  both: 'Junior & Senior',
};

const CATEGORY_LABELS = {
  public: 'Public',
  private: 'Private',
  others: 'Others',
};

export default function SchoolRegistrationRequestsPage() {
  const { toast } = useToast();

  const [requests, setRequests] = useState([]);
  const [statistics, setStatistics] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(null);

  // Synchronous in-flight guards — block re-entrant submits from a burst of
  // clicks before React commits the `processing`/disabled state to the DOM.
  const approveInFlightRef = useRef(false);
  const rejectInFlightRef = useRef(false);

  // Master school search (informational — check registry before approving)
  const [masterSearchTerm, setMasterSearchTerm] = useState('');
  const [masterSearchResults, setMasterSearchResults] = useState([]);
  const [loadingMasterSearch, setLoadingMasterSearch] = useState(false);

  const [filters, setFilters] = useState({
    session_id: '',
    status: 'pending',
    search: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const loadSessions = useCallback(async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);

      const currentSession = sessionsData.find((s) => s.is_current);
      if (currentSession) {
        setFilters((prev) => ({ ...prev, session_id: currentSession.id.toString() }));
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      };
      const response = await schoolRegistrationRequestsApi.getAll(params);
      setRequests(response.data.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
        totalPages: response.data.pagination?.totalPages || 0,
      }));
    } catch (err) {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit, toast]);

  const loadStatistics = useCallback(async () => {
    try {
      const params = filters.session_id ? { session_id: filters.session_id } : {};
      const response = await schoolRegistrationRequestsApi.getStats(params);
      setStatistics(response.data.data || { pending: 0, approved: 0, rejected: 0 });
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  }, [filters.session_id]);

  // Export every matching request, not just the loaded page
  const handleExportAll = useMemo(
    () => createExportAllHandler(
      async (page, limit) => {
        const response = await schoolRegistrationRequestsApi.getAll({ ...filters, page, limit });
        return {
          rows: response.data.data || [],
          total: response.data.pagination?.total,
        };
      },
      { onError: () => toast.error('Could not load all pages — exported the current page instead') }
    ),
    [filters, toast]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadRequests();
    loadStatistics();
  }, [loadRequests, loadStatistics]);

  const handleApprove = (request) => {
    setApprovingRequest(request);
    setShowDetailModal(false);
    setShowApproveConfirm(true);
  };

  const confirmApprove = async () => {
    if (!approvingRequest || approveInFlightRef.current) return;
    approveInFlightRef.current = true;
    try {
      setProcessing(true);
      await schoolRegistrationRequestsApi.approve(approvingRequest.id);
      toast.success('Request approved — school added to the central registry');
      loadRequests();
      loadStatistics();
      setShowDetailModal(false);
      setShowApproveConfirm(false);
      setApprovingRequest(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve request');
    } finally {
      setProcessing(false);
      approveInFlightRef.current = false;
    }
  };

  const handleReject = (request) => {
    setRejectingRequest(request);
    setRejectionReason('');
    setShowDetailModal(false);
    setShowRejectModal(true);
  };

  const submitRejection = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
    if (rejectInFlightRef.current) return;
    rejectInFlightRef.current = true;
    try {
      setProcessing(true);
      await schoolRegistrationRequestsApi.reject(rejectingRequest.id, rejectionReason);
      toast.success('Request rejected');
      loadRequests();
      loadStatistics();
      setShowDetailModal(false);
      setShowRejectModal(false);
      setRejectingRequest(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reject request');
    } finally {
      setProcessing(false);
      rejectInFlightRef.current = false;
    }
  };

  const handleMasterSearch = useCallback(async (term) => {
    setMasterSearchTerm(term);
    if (term.trim().length < 2) {
      setMasterSearchResults([]);
      return;
    }
    setLoadingMasterSearch(true);
    try {
      const res = await masterSchoolsApi.getAll({ search: term.trim(), limit: 10 });
      setMasterSearchResults(res.data.data || res.data || []);
    } catch {
      toast.error('Failed to search master schools');
    } finally {
      setLoadingMasterSearch(false);
    }
  }, [toast]);

  const openDetailModal = useCallback((request) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
    handleMasterSearch(request?.name || '');
  }, [handleMasterSearch]);

  const columns = useMemo(() => [
    {
      accessor: null,
      header: '#',
      sortable: false,
      width: 50,
      render: (_, __, index) => (pagination.page - 1) * pagination.limit + index + 1,
    },
    {
      accessor: 'student_name',
      header: 'Student',
      render: (value, row) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{row.registration_number}</div>
        </div>
      ),
    },
    {
      accessor: 'institution_name',
      header: 'Institution',
      render: (value) => <span className="text-sm text-gray-700">{value}</span>,
    },
    {
      accessor: 'name',
      header: 'Requested School',
      render: (value, row) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">
            {[row.ward, row.lga, row.state].filter(Boolean).join(', ')}
          </div>
        </div>
      ),
    },
    {
      accessor: 'session_name',
      header: 'Session',
      render: (value) => <span className="text-sm text-gray-700">{value}</span>,
    },
    {
      accessor: 'created_at',
      header: 'Submitted',
      render: (value) => <span className="text-sm text-gray-500">{formatDateTime(value, '-')}</span>,
    },
    {
      accessor: 'status',
      header: 'Status',
      type: 'status',
    },
    {
      accessor: 'actions',
      header: 'Actions',
      exportable: false,
      render: (_, row) => (
        <div className="flex items-center text-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              openDetailModal(row);
            }}
            title="View Details"
          >
            <IconEye className="w-5 h-5" />
          </Button>
          {row.status === 'pending' && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleApprove(row);
                }}
                title="Approve"
                className="hover:text-green-600"
              >
                <IconCheck className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReject(row);
                }}
                title="Reject"
                className="hover:text-red-600"
              >
                <IconX className="w-5 h-5" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ], [pagination.page, pagination.limit, openDetailModal]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">School Registration Requests</h1>
          <p className="text-xs sm:text-sm text-gray-600 truncate">Review student requests to add new schools to the central registry</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            loadRequests();
            loadStatistics();
          }}
          size="sm"
          className="active:scale-95 flex-shrink-0"
        >
          <IconRefresh className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatsCard title="Pending" value={statistics.pending} icon={IconClock} tone="yellow" />
        <StatsCard title="Approved" value={statistics.approved} icon={IconCheck} tone="green" />
        <StatsCard title="Rejected" value={statistics.rejected} icon={IconX} tone="red" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <IconFilter className="w-5 h-5 text-gray-400 hidden sm:block" />
            <Input
              placeholder="Search by student, reg. number, or school name..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && loadRequests()}
              className="flex-1 text-sm"
            />
            <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-4">
              <Select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="text-sm sm:w-40"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </Select>
              <Select
                value={filters.session_id}
                onChange={(e) => {
                  setFilters({ ...filters, session_id: e.target.value });
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="text-sm sm:w-48"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} {session.is_current && '(Current)'}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={requests}
            columns={columns}
            keyField="id"
            loading={loading}
            sortable
            exportable
            onServerExport={handleExportAll}
            exportFilename="school-registration-requests"
            emptyTitle="No school registration requests found"
            emptyDescription="Try adjusting your filters or check back later"
            pagination={{
              page: pagination.page,
              limit: pagination.limit,
              total: pagination.total,
              onPageChange: (page) => setPagination((p) => ({ ...p, page })),
              onLimitChange: (limit) => setPagination((p) => ({ ...p, limit, page: 1 })),
            }}
            onRowClick={(row) => openDetailModal(row)}
          />
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="School Registration Request"
        width="2xl"
        footer={
          selectedRequest?.status === 'pending' && (
            <>
              <Button variant="outline" onClick={() => setShowDetailModal(false)} className="w-full sm:w-auto">
                Close
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleReject(selectedRequest)}
                disabled={processing}
              >
                Reject
              </Button>
              <Button
                onClick={() => handleApprove(selectedRequest)}
                loading={processing}
              >
                Approve
              </Button>
            </>
          )
        }
      >
        {selectedRequest && (
          <div className="space-y-4 text-sm">
            {/* Master Registry Check — inline at top for quick duplicate validation */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <IconSearch className="w-4 h-4 text-blue-600" />
                <h3 className="font-medium text-blue-900">Check Master Registry</h3>
              </div>
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name, code, ward, or LGA…"
                  value={masterSearchTerm}
                  onChange={(e) => handleMasterSearch(e.target.value)}
                  className="pl-10 bg-white"
                />
              </div>

              {loadingMasterSearch && (
                <div className="flex items-center justify-center py-3 text-gray-500 text-sm">
                  <IconRefresh className="w-4 h-4 animate-spin mr-2" /> Searching…
                </div>
              )}

              {!loadingMasterSearch && masterSearchTerm.trim().length >= 2 && masterSearchResults.length === 0 && (
                <p className="text-sm text-gray-500 py-3 text-center">No matching schools found in the registry</p>
              )}

              {masterSearchTerm.trim().length > 0 && masterSearchTerm.trim().length < 2 && (
                <p className="text-sm text-gray-400 text-center py-2">Type at least 2 characters to search</p>
              )}

              {masterSearchResults.length > 0 && (
                <div className="mt-2 border rounded-lg divide-y bg-white max-h-52 overflow-y-auto">
                  {masterSearchResults.map((school) => (
                    <div key={school.id} className="p-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{school.name}</span>
                        {school.is_verified ? (
                          <IconShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" title="Verified" />
                        ) : (
                          <IconShieldOff className="w-4 h-4 text-gray-400 flex-shrink-0" title="Unverified" />
                        )}
                        {school.official_code && (
                          <span className="font-mono text-xs text-blue-600">{school.official_code}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">{school.ward ? `${school.ward}, ` : ''}{school.lga}, {school.state}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><IconBuilding className="w-3.5 h-3.5" /> {school.linked_institutions_count || 0} institutions</span>
                        <span className="flex items-center gap-1"><IconUsers className="w-3.5 h-3.5" /> {school.current_session_students ?? 0} students</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Student & Institution */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <IconUser className="w-4 h-4 text-gray-500" />
                  <h3 className="font-medium text-gray-700">Student</h3>
                </div>
                <p className="font-semibold text-gray-900">{selectedRequest.student_name}</p>
                <p className="text-gray-500 text-xs">{selectedRequest.registration_number}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <IconSchool className="w-4 h-4 text-gray-500" />
                  <h3 className="font-medium text-gray-700">Institution</h3>
                </div>
                <p className="font-semibold text-gray-900">{selectedRequest.institution_name}</p>
                <p className="text-gray-500 text-xs">Session: {selectedRequest.session_name}</p>
              </div>
            </div>

            {/* Proposed School */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <IconSchool className="w-4 h-4 text-gray-500" />
                <h3 className="font-medium text-gray-700">Proposed School</h3>
              </div>
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-3 py-2 text-gray-500 bg-gray-50 w-36 font-medium">Name</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{selectedRequest.name}</td>
                  </tr>
                  {selectedRequest.official_code && (
                    <tr>
                      <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">Official Code</td>
                      <td className="px-3 py-2">{selectedRequest.official_code}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">Type</td>
                    <td className="px-3 py-2">{SCHOOL_TYPE_LABELS[selectedRequest.school_type] || selectedRequest.school_type}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">Category</td>
                    <td className="px-3 py-2">{CATEGORY_LABELS[selectedRequest.category] || selectedRequest.category}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">State</td>
                    <td className="px-3 py-2">{selectedRequest.state}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">LGA</td>
                    <td className="px-3 py-2">{selectedRequest.lga}</td>
                  </tr>
                  {selectedRequest.ward && (
                    <tr>
                      <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">Ward</td>
                      <td className="px-3 py-2">{selectedRequest.ward}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-3 py-2 text-gray-500 bg-gray-50 font-medium">Address</td>
                    <td className="px-3 py-2">{selectedRequest.address || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Approved outcome */}
            {selectedRequest.status === 'approved' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-green-800 font-medium text-xs">
                  Added to the central registry (master school #{selectedRequest.created_master_school_id}) and linked to {selectedRequest.institution_name} (institution school #{selectedRequest.created_institution_school_id}).
                </p>
              </div>
            )}

            {/* Rejection Reason */}
            {selectedRequest.status === 'rejected' && selectedRequest.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 font-medium text-xs mb-1">Rejection Reason:</p>
                <p className="text-red-700 text-sm">{selectedRequest.rejection_reason}</p>
              </div>
            )}

            {/* Meta */}
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span>Submitted: {formatDateTime(selectedRequest.created_at, '-')}</span>
              <Badge variant={getStatusVariant(selectedRequest.status)}>
                {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
              </Badge>
            </div>
          </div>
        )}
      </Dialog>

      {/* Approve Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showApproveConfirm}
        onClose={() => {
          setShowApproveConfirm(false);
          setApprovingRequest(null);
        }}
        onConfirm={confirmApprove}
        title="Approve Registration Request"
        message={`Approve the request to register "${approvingRequest?.name}" (${approvingRequest?.state})? This will create a new school in the central registry and link it to ${approvingRequest?.institution_name}.`}
        confirmText="Approve"
        confirmVariant="primary"
        loading={processing}
      />

      {/* Rejection Modal */}
      <Dialog
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectingRequest(null);
          setRejectionReason('');
        }}
        title="Reject Request"
        width="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectModal(false);
                setRejectingRequest(null);
                setRejectionReason('');
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitRejection}
              loading={processing}
              disabled={!rejectionReason.trim()}
            >
              Reject Request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Please provide a reason for rejecting this school registration request.
          </p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="Enter rejection reason..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            rows={4}
          />
        </div>
      </Dialog>
    </div>
  );
}
