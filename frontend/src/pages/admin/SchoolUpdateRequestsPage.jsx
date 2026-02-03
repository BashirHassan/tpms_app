/**
 * School Update Requests Page
 * Admin page for reviewing school principal and location update requests
 * Uses tabs to switch between principal and location requests
 */

import { useState, useEffect, useMemo } from 'react';
import {
  IconUser,
  IconMapPin,
  IconCheck,
  IconX,
  IconEye,
  IconRefresh,
  IconExternalLink,
  IconClock,
  IconFilter,
} from '@tabler/icons-react';
import { schoolUpdateRequestsApi } from '../../api/schoolUpdateRequestsApi';
import { sessionsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';

// Status badge variant mapping
const getStatusVariant = (status) => {
  const variants = {
    pending: 'warning',
    approved: 'success',
    rejected: 'error',
  };
  return variants[status] || 'default';
};

// Tab button component
function TabButton({ active, onClick, icon: Icon, label, count }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 rounded-none border-b-2 font-medium text-xs sm:text-sm transition-colors whitespace-nowrap ${
        active
          ? 'border-primary-500 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{label.split(' ')[0]}</span>
      {count !== undefined && count > 0 && (
        <span className={`px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs rounded-full ${active ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'}`}>
          {count}
        </span>
      )}
    </Button>
  );
}

export default function SchoolUpdateRequestsPage() {
  const { toast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState('principal');
  const [requests, setRequests] = useState([]);
  const [statistics, setStatistics] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Approve confirmation
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [approvingRequest, setApprovingRequest] = useState(null);

  // Filters
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

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Load data when tab or filters change
  useEffect(() => {
    loadRequests();
    loadStatistics();
  }, [activeTab, filters.session_id, filters.status, pagination.page]);

  const loadSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      
      // Select current session by default
      const currentSession = sessionsData.find(s => s.is_current);
      if (currentSession) {
        setFilters(prev => ({ ...prev, session_id: currentSession.id.toString() }));
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

      const response = activeTab === 'principal'
        ? await schoolUpdateRequestsApi.getPrincipalRequests(params)
        : await schoolUpdateRequestsApi.getLocationRequests(params);

      setRequests(response.data.data || response.data || []);
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
      const sessionId = filters.session_id || null;
      const response = activeTab === 'principal'
        ? await schoolUpdateRequestsApi.getPrincipalStatistics(sessionId)
        : await schoolUpdateRequestsApi.getLocationStatistics(sessionId);

      const stats = response.data.data || response.data || { pending: 0, approved: 0, rejected: 0 };
      setStatistics(stats);
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
      if (activeTab === 'principal') {
        await schoolUpdateRequestsApi.approvePrincipalRequest(approvingRequest.id);
      } else {
        await schoolUpdateRequestsApi.approveLocationRequest(approvingRequest.id);
      }
      toast.success('Request approved successfully');
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
      if (activeTab === 'principal') {
        await schoolUpdateRequestsApi.rejectPrincipalRequest(rejectingRequest.id, rejectionReason);
      } else {
        await schoolUpdateRequestsApi.rejectLocationRequest(rejectingRequest.id, rejectionReason);
      }
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

  const getGoogleMapsUrl = (lat, lng) => {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  // Column definitions for principal requests
  const principalColumns = useMemo(() => [
    {
      accessor: 'school_name',
      header: 'School',
      render: (value, row) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          {(row.ward || row.lga || row.state) && (
            <div className="text-sm text-gray-500">
              {[row.ward, row.lga, row.state].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      ),
    },
    {
      accessor: 'proposed_principal_name',
      header: 'Proposed Name',
      render: (value) => <span className="text-sm text-gray-900">{value}</span>,
    },
    {
      accessor: 'proposed_principal_phone',
      header: 'Proposed Phone',
      render: (value) => <span className="text-sm text-gray-500">{value}</span>,
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
        </div>
      ),
    },
  ], []);

  // Column definitions for location requests
  const locationColumns = useMemo(() => [
    {
      accessor: 'school_name',
      header: 'School',
      render: (value, row) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          {(row.ward || row.lga || row.state) && (
            <div className="text-sm text-gray-500">
              {[row.ward, row.lga, row.state].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      ),
    },
    {
      accessor: 'proposed_latitude',
      header: 'Proposed Location',
      render: (_, row) => (
        <a
          href={getGoogleMapsUrl(row.proposed_latitude, row.proposed_longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
          onClick={(e) => e.stopPropagation()}
        >
          <IconMapPin className="w-4 h-4 mr-1" />
          View Location
        </a>
      ),
      exportFormatter: (_, row) => `${row.proposed_latitude}, ${row.proposed_longitude}`,
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

  // Get current columns based on active tab
  const columns = activeTab === 'principal' ? principalColumns : locationColumns;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">School Update Requests</h1>
          <p className="text-xs sm:text-sm text-gray-600 truncate">Review and manage public submissions</p>
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

      {/* Tabs */}
      <div className="border-b border-gray-200 -mx-2 px-2 sm:mx-0 sm:px-0 overflow-x-auto">
        <div className="flex gap-1 sm:gap-4">
          <TabButton
            active={activeTab === 'principal'}
            onClick={() => {
              setActiveTab('principal');
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            icon={IconUser}
            label="Principal Updates"
          />
          <TabButton
            active={activeTab === 'location'}
            onClick={() => {
              setActiveTab('location');
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            icon={IconMapPin}
            label="Location Updates"
          />
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <IconFilter className="w-5 h-5 text-gray-400 hidden sm:block" />
            <Input
              placeholder="Search by school name..."
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
            exportFilename={`${activeTab}-update-requests`}
            emptyTitle={`No ${activeTab} update requests found`}
            emptyDescription="Try adjusting your filters or check back later"
            pagination={{
              page: pagination.page,
              limit: pagination.limit,
              total: pagination.total,
              onPageChange: (page) => setPagination((p) => ({ ...p, page })),
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
        title={`${activeTab === 'principal' ? 'Principal' : 'Location'} Update Request`}
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
            {/* School Info */}
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">School</h3>
              <p className="font-medium text-gray-900">{selectedRequest.school_name}</p>
              {(selectedRequest.ward || selectedRequest.lga || selectedRequest.state) && (
                <p className="text-sm text-gray-500">
                  {[selectedRequest.ward, selectedRequest.lga, selectedRequest.state].filter(Boolean).join(', ')}
                </p>
              )}
            </div>

            {/* Comparison Table */}
            {activeTab === 'principal' ? (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Comparison</h3>
                <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Field</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Current</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Proposed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600">Name</td>
                      <td className="px-4 py-2 text-sm">{selectedRequest.previous_principal_name || '-'}</td>
                      <td className="px-4 py-2 text-sm font-medium text-primary-600">
                        {selectedRequest.proposed_principal_name}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm text-gray-600">Phone</td>
                      <td className="px-4 py-2 text-sm">{selectedRequest.previous_principal_phone || '-'}</td>
                      <td className="px-4 py-2 text-sm font-medium text-primary-600">
                        {selectedRequest.proposed_principal_phone}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Location Comparison</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">Current</p>
                    {selectedRequest.previous_latitude && selectedRequest.previous_longitude ? (
                      <>
                        <p className="font-medium text-sm">
                          {selectedRequest.previous_latitude}, {selectedRequest.previous_longitude}
                        </p>
                        <a
                          href={getGoogleMapsUrl(selectedRequest.previous_latitude, selectedRequest.previous_longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs text-primary-600 mt-1"
                        >
                          <IconExternalLink className="w-3 h-3 mr-1" />
                          Open in Maps
                        </a>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400">Not recorded</p>
                    )}
                  </div>
                  <div className="bg-primary-50 rounded-lg p-4">
                    <p className="text-xs text-primary-600 mb-1">Proposed</p>
                    <p className="font-medium text-sm">
                      {selectedRequest.proposed_latitude}, {selectedRequest.proposed_longitude}
                    </p>
                    <a
                      href={getGoogleMapsUrl(selectedRequest.proposed_latitude, selectedRequest.proposed_longitude)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-primary-600 mt-1"
                    >
                      <IconExternalLink className="w-3 h-3 mr-1" />
                      Open in Maps
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Contributor Info */}
            {(selectedRequest.contributor_name || selectedRequest.contributor_phone) && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-2">Submitted By</h3>
                <div className="bg-gray-50 rounded-lg p-4 text-sm">
                  {selectedRequest.contributor_name && (
                    <p><strong>Name:</strong> {selectedRequest.contributor_name}</p>
                  )}
                  {selectedRequest.contributor_phone && (
                    <p><strong>Phone:</strong> {selectedRequest.contributor_phone}</p>
                  )}
                </div>
              </div>
            )}

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
        title="Approve Update Request"
        message={`Are you sure you want to approve this ${activeTab === 'principal' ? 'principal' : 'location'} update for ${approvingRequest?.school_name}? This will update the school record.`}
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
            Please provide a reason for rejecting this {activeTab === 'principal' ? 'principal update' : 'location update'} request.
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
