/**
 * School Registration Requests Page
 * Super admin page for reviewing student-submitted requests to register a
 * brand-new school in the central registry.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  IconCheck,
  IconX,
  IconEye,
  IconRefresh,
  IconClock,
  IconFilter,
  IconSchool,
} from '@tabler/icons-react';
import { schoolRegistrationRequestsApi } from '../../api/schoolRegistrationRequests';
import { sessionsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { Card, CardContent } from '../../components/ui/Card';
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

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    loadRequests();
    loadStatistics();
  }, [filters.session_id, filters.status, pagination.page, pagination.limit]);

  const loadSessions = async () => {
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
  };

  const loadRequests = async () => {
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
  };

  const loadStatistics = async () => {
    try {
      const params = filters.session_id ? { session_id: filters.session_id } : {};
      const response = await schoolRegistrationRequestsApi.getStats(params);
      setStatistics(response.data.data || { pending: 0, approved: 0, rejected: 0 });
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };

  const handleApprove = (request) => {
    setApprovingRequest(request);
    setShowDetailModal(false);
    setShowApproveConfirm(true);
  };

  const confirmApprove = async () => {
    if (!approvingRequest) return;
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
    }
  };

  const handleReject = (request) => {
    setRejectingRequest(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const submitRejection = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }
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
    }
  };

  const columns = useMemo(() => [
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
              setSelectedRequest(row);
              setShowDetailModal(true);
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
  ], []);

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
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                <IconClock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold">{statistics.pending || 0}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold">{statistics.approved || 0}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Approved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                <IconX className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold">{statistics.rejected || 0}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
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
            onRowClick={(row) => {
              setSelectedRequest(row);
              setShowDetailModal(true);
            }}
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
          <div className="space-y-4">
            {/* Student & Institution */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Student</h3>
                <p className="font-medium text-gray-900">{selectedRequest.student_name}</p>
                <p className="text-sm text-gray-500">{selectedRequest.registration_number}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Institution</h3>
                <p className="font-medium text-gray-900">{selectedRequest.institution_name}</p>
                <p className="text-sm text-gray-500">{selectedRequest.session_name}</p>
              </div>
            </div>

            {/* Proposed School */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                <IconSchool className="w-4 h-4" /> Proposed School
              </h3>
              <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600 w-1/3">Name</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{selectedRequest.name}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">Official Code</td>
                    <td className="px-4 py-2 text-sm">{selectedRequest.official_code || '-'}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">Type</td>
                    <td className="px-4 py-2 text-sm">{SCHOOL_TYPE_LABELS[selectedRequest.school_type] || selectedRequest.school_type}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">Category</td>
                    <td className="px-4 py-2 text-sm">{CATEGORY_LABELS[selectedRequest.category] || selectedRequest.category}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">State</td>
                    <td className="px-4 py-2 text-sm">{selectedRequest.state}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">LGA</td>
                    <td className="px-4 py-2 text-sm">{selectedRequest.lga}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">Ward</td>
                    <td className="px-4 py-2 text-sm">{selectedRequest.ward || '-'}</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 text-sm text-gray-600">Address</td>
                    <td className="px-4 py-2 text-sm">{selectedRequest.address || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Status & Timestamps */}
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <IconClock className="w-4 h-4" />
                Submitted: {formatDateTime(selectedRequest.created_at, '-')}
              </div>
              <Badge variant={getStatusVariant(selectedRequest.status)}>
                {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
              </Badge>
            </div>

            {/* Approved outcome */}
            {selectedRequest.status === 'approved' && (
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-4 text-sm text-green-800">
                  <p>Added to the central registry (master school #{selectedRequest.created_master_school_id}) and linked to {selectedRequest.institution_name} (institution school #{selectedRequest.created_institution_school_id}).</p>
                </CardContent>
              </Card>
            )}

            {/* Rejection Reason */}
            {selectedRequest.status === 'rejected' && selectedRequest.rejection_reason && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-red-800">Rejection Reason:</p>
                  <p className="text-sm text-red-700">{selectedRequest.rejection_reason}</p>
                </CardContent>
              </Card>
            )}
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
