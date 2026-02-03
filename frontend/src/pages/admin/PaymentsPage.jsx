/**
 * Payments Management Page (Admin)
 * View, monitor, and verify student payments
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { paymentsApi, sessionsApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDateTime } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import {
  IconCreditCard,
  IconCheck,
  IconClock,
  IconTrendingUp,
  IconUsers,
  IconUserX,
  IconShieldCheck,
  IconX,
  IconAlertTriangle,
  IconRefresh,
  IconSearch,
  IconEye,
  IconReceipt,
  IconUser,
  IconSchool,
  IconCalendar,
  IconDeviceMobile,
  IconWorld,
} from '@tabler/icons-react';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';

function PaymentsPage() {
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [payments, setPayments] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });
  
  // Filter state
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  
  // Verification state
  const [verifyModal, setVerifyModal] = useState({ open: false, payment: null });
  const [cancelModal, setCancelModal] = useState({ open: false, payment: null });
  const [lookupModal, setLookupModal] = useState({ open: false, reference: '', result: null });
  const [viewModal, setViewModal] = useState({ open: false, payment: null });
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch data
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch when session or page changes (immediate)
  useEffect(() => {
    if (selectedSession) {
      fetchPayments();
      fetchStatistics();
    }
  }, [selectedSession, pagination.page]);

  // Debounce search and status filter changes
  useEffect(() => {
    if (!selectedSession) return;
    const timer = setTimeout(() => {
      fetchPayments();
      fetchStatistics();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedStatus]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessions = response.data.data || response.data || [];
      setSessions(sessions);
      if (sessions.length > 0) {
        const current = sessions.find((s) => s.is_current) || sessions[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const response = await paymentsApi.getAll({
        session_id: selectedSession,
        page: pagination.page,
        limit: pagination.limit,
        search: search || undefined,
        status: selectedStatus || undefined,
      });
      setPayments(response.data.data || response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (err) {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await paymentsApi.getStats({ 
        session_id: selectedSession,
        search: search || undefined,
        status: selectedStatus || undefined,
      });
      const data = response.data.data || response.data || {};
      setStatistics(data.summary);
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };



  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
      refunded: 'bg-gray-100 text-gray-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  // Handle verify payment
  const handleVerifyPayment = useCallback(async () => {
    if (!verifyModal.payment) return;
    
    setActionLoading(true);
    try {
      const reference = verifyModal.payment.reference || verifyModal.payment.paystack_reference;
      if (!reference) {
        toast.error('No payment reference found');
        return;
      }

      const response = await paymentsApi.verifyPaystack(reference);
      
      if (response.data.success) {
        toast.success('Payment verified successfully!');
        setVerifyModal({ open: false, payment: null });
        fetchPayments();
        fetchStatistics();
      } else {
        toast.warning(response.data.message || 'Payment verification failed - payment may not have been completed');
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to verify payment';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  }, [verifyModal.payment, toast]);

  // Handle cancel payment
  const handleCancelPayment = useCallback(async () => {
    if (!cancelModal.payment) return;
    
    setActionLoading(true);
    try {
      await paymentsApi.cancelPayment(cancelModal.payment.id);
      toast.success('Payment cancelled successfully');
      setCancelModal({ open: false, payment: null });
      fetchPayments();
      fetchStatistics();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to cancel payment';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  }, [cancelModal.payment, toast]);

  // Handle lookup by reference - for recovering payments where callback failed
  const handleLookupVerify = useCallback(async () => {
    if (!lookupModal.reference.trim()) {
      toast.warning('Please enter a payment reference');
      return;
    }
    
    setActionLoading(true);
    setLookupModal(prev => ({ ...prev, result: null }));
    
    try {
      const response = await paymentsApi.verifyPaystack(lookupModal.reference.trim());
      
      if (response.data.success) {
        const data = response.data.data || {};
        setLookupModal(prev => ({ ...prev, result: { success: true, ...response.data, ...data } }));
        // Refresh the table to show the new/updated payment
        fetchPayments();
        fetchStatistics();
      } else {
        setLookupModal(prev => ({ 
          ...prev, 
          result: { success: false, message: response.data.message || 'Verification failed' } 
        }));
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to verify reference';
      setLookupModal(prev => ({ ...prev, result: { success: false, message } }));
    } finally {
      setActionLoading(false);
    }
  }, [lookupModal.reference, toast]);

  // Column definitions for DataTable
  const paymentsColumns = useMemo(() => [
    {
      accessor: 'reference',
      header: 'Reference',
      render: (value) => <span className="font-mono text-sm">{value || 'N/A'}</span>,
    },
    {
      accessor: 'student_name',
      header: 'Student',
      render: (value, row) => (
        <div>
          <p className="font-medium">{value || 'Unknown'}</p>
          <p className="text-sm text-gray-500">{row?.registration_number || ''}</p>
        </div>
      ),
    },
    {
      accessor: 'amount',
      header: 'Amount',
      render: (value, row) => (
        <span className="font-medium">{formatCurrency(parseFloat(value) || 0, row?.currency)}</span>
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(value)}`}>
          {value || 'unknown'}
        </span>
      ),
    },
    {
      accessor: 'channel',
      header: 'Channel',
      render: (value) => <span className="text-gray-600">{value || 'N/A'}</span>,
    },
    {
      accessor: 'created_at',
      header: 'Date',
      render: (value) => (
        <span className="text-sm text-gray-500">{formatDateTime(value)}</span>
      ),
      exportFormatter: (value) => formatDateTime(value),
    },
    {
      accessor: 'session_name',
      header: 'Session',
      render: (value) => <span className="text-gray-600">{value || 'N/A'}</span>,
    },
    {
      accessor: 'actions',
      header: 'Actions',
      sortable: false,
      exportable: false,
      render: (_, row) => {
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setViewModal({ open: true, payment: row })}
              className="text-blue-600 hover:bg-blue-50"
              title="View payment details"
            >
              <IconEye className="w-4 h-4" />
            </Button>
            {row.status === 'pending' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setVerifyModal({ open: true, payment: row })}
                  className="text-green-600 hover:bg-green-50"
                  title="Verify payment with Paystack"
                >
                  <IconShieldCheck className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCancelModal({ open: true, payment: row })}
                  className="text-red-600 hover:bg-red-50"
                  title="Cancel pending payment"
                >
                  <IconX className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ], []);

  // Toolbar with filters (same pattern as StudentsPage)
  const tableToolbar = (
    <div className="flex flex-col gap-2">
      {/* Filters - grid on mobile, flex on desktop */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2">
        <div className="relative w-full sm:w-auto col-span-3">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            placeholder="Search name, reg no, or reference..."
            className="pl-9 pr-3 py-2 w-full md:w-80"
          />
        </div>
        <Select
          value={selectedSession}
          onChange={(e) => setSelectedSession(e.target.value)}
          className="text-sm w-full md:w-60"
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.name} {session.is_current && '(Current)'}
            </option>
          ))}
        </Select>
        <Select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          className="text-sm w-full md:w-60"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        <Button 
          variant="outline" 
          onClick={() => { 
            setSearch(''); 
            setSelectedStatus(''); 
            setPagination(p => ({ ...p, page: 1 })); 
          }} 
          className="active:scale-95 flex-shrink-0 w-12"
          title="Clear filters"
        >
          <IconRefresh className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            View and manage payments across all institutions
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
           variant="outline"
           onClick={() => {
              fetchPayments()
              fetchStatistics()
            }}
            disabled={loading}
          >
            <IconRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            variant="outline"
            onClick={() =>
              setLookupModal({ open: true, reference: '', result: null })
            }
          >
            <IconReceipt className="w-4 h-4 sm:mr-2" />
            Verify Reference
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconCreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_payments}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">
                    Transactions
                  </p>
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
                  <p className="text-lg sm:text-2xl font-bold">{statistics.students_paid}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Paid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <IconClock className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.pending_payments || 0}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <IconUserX className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.students_not_paid}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Not Paid</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-primary-50 border-primary-200 col-span-2 lg:col-span-1">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <IconTrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base sm:text-2xl font-bold text-primary-700 truncate">
                    {formatCurrency(statistics.total_collected)}
                  </p>
                  <p className="text-[10px] sm:text-sm text-primary-600 truncate">Collected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Payments Alert */}
      {statistics && statistics.pending_payments > 0 && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <IconAlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-800">
              {statistics.pending_payments} pending payment{statistics.pending_payments > 1 ? 's' : ''} require attention
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              Click the verify button (<IconShieldCheck className="w-3.5 h-3.5 inline" />) on pending payments to check their status with Paystack. 
              If a student was debited but the payment shows as pending, verification will update the status.
            </p>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={payments}
            columns={paymentsColumns}
            keyField="id"
            loading={loading}
            sortable
            exportable
            exportFilename="payments"
            toolbar={tableToolbar}
            emptyIcon={IconCreditCard}
            emptyTitle="No transactions found"
            emptyDescription="Adjust your filters or check back later"
            pagination={{
              page: pagination.page,
              limit: pagination.limit,
              total: pagination.total,
              onPageChange: (page) => setPagination((prev) => ({ ...prev, page })),
            }}
          />
        </CardContent>
      </Card>

      {/* Verify Payment Dialog */}
      <Dialog
        isOpen={verifyModal.open}
        onClose={() => !actionLoading && setVerifyModal({ open: false, payment: null })}
        title="Verify Payment"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <IconShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-800">Verify with Paystack</p>
              <p className="text-blue-700 mt-1">
                This will check the payment status directly with Paystack. If the payment was successful, the status will be updated automatically.
              </p>
            </div>
          </div>

          {verifyModal.payment && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Student:</span>
                <span className="font-medium">{verifyModal.payment.student_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reg. Number:</span>
                <span className="font-mono">{verifyModal.payment.registration_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount:</span>
                <span className="font-medium">{formatCurrency(verifyModal.payment.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reference:</span>
                <span className="font-mono text-xs">{verifyModal.payment.reference}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date:</span>
                <span>{formatDateTime(verifyModal.payment.created_at)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setVerifyModal({ open: false, payment: null })}
              disabled={actionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerifyPayment}
              loading={actionLoading}
              className="bg-green-600 hover:bg-green-700"
            >
              <IconShieldCheck className="w-4 h-4 mr-2" />
              Verify Payment
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel Payment Dialog */}
      <Dialog
        isOpen={cancelModal.open}
        onClose={() => !actionLoading && setCancelModal({ open: false, payment: null })}
        title="Cancel Payment"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <IconAlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-red-800">Are you sure?</p>
              <p className="text-red-700 mt-1">
                This will cancel the pending payment. Only cancel if you are certain the payment was not completed. 
                If the student was debited, verify the payment instead.
              </p>
            </div>
          </div>

          {cancelModal.payment && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Student:</span>
                <span className="font-medium">{cancelModal.payment.student_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Amount:</span>
                <span className="font-medium">{formatCurrency(cancelModal.payment.amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reference:</span>
                <span className="font-mono text-xs">{cancelModal.payment.reference}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => setCancelModal({ open: false, payment: null })}
              disabled={actionLoading}
            >
              Keep Payment
            </Button>
            <Button
              variant="danger"
              onClick={handleCancelPayment}
              loading={actionLoading}
            >
              <IconX className="w-4 h-4 mr-2" />
              Cancel Payment
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Verify by Reference Dialog */}
      <Dialog
        isOpen={lookupModal.open}
        onClose={() => !actionLoading && setLookupModal({ open: false, reference: '', result: null })}
        title="Verify Payment by Reference"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <IconSearch className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-800">Recover Missing Payment</p>
              <p className="text-blue-700 mt-1">
                If a student was debited but no payment record exists (callback failure), 
                enter the Paystack reference to verify and recover the payment.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Paystack Reference
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g., DTP-M4ABCD-1234EFGH"
                value={lookupModal.reference}
                onChange={(e) => setLookupModal(prev => ({ ...prev, reference: e.target.value, result: null }))}
                className="flex-1 font-mono text-sm"
                disabled={actionLoading}
              />
              <Button
                onClick={handleLookupVerify}
                loading={actionLoading}
                disabled={!lookupModal.reference.trim()}
              >
                Verify
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              The reference is usually sent to the student's email or can be found in Paystack dashboard.
            </p>
          </div>

          {/* Result display */}
          {lookupModal.result && (
            <div className={`p-4 rounded-lg ${
              lookupModal.result.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {lookupModal.result.success ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-green-800 font-medium">
                    <IconCheck className="w-5 h-5" />
                    {lookupModal.result.message}
                  </div>
                  {lookupModal.result.student_name && (
                    <div className="text-sm text-green-700">
                      <span className="font-medium">Student:</span> {lookupModal.result.student_name}
                    </div>
                  )}
                  {lookupModal.result.amount && (
                    <div className="text-sm text-green-700">
                      <span className="font-medium">Amount:</span> {formatCurrency(lookupModal.result.amount)}
                    </div>
                  )}
                  {lookupModal.result.session_name && (
                    <div className="text-sm text-green-700">
                      <span className="font-medium">Session:</span> {lookupModal.result.session_name}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-800">
                  <IconAlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>{lookupModal.result.message}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setLookupModal({ open: false, reference: '', result: null })}
              disabled={actionLoading}
            >
              Close
            </Button>
          </div>
        </div>
      </Dialog>

      {/* View Payment Details Dialog */}
      <Dialog
        isOpen={viewModal.open}
        onClose={() => setViewModal({ open: false, payment: null })}
        title="Payment Details"
        width="3xl"
      >
        {viewModal.payment && (
          <div className="space-y-4">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  viewModal.payment.status === 'success' ? 'bg-green-100' :
                  viewModal.payment.status === 'pending' ? 'bg-yellow-100' :
                  viewModal.payment.status === 'failed' ? 'bg-red-100' : 'bg-gray-100'
                }`}>
                  <IconReceipt className={`w-6 h-6 ${
                    viewModal.payment.status === 'success' ? 'text-green-600' :
                    viewModal.payment.status === 'pending' ? 'text-yellow-600' :
                    viewModal.payment.status === 'failed' ? 'text-red-600' : 'text-gray-600'
                  }`} />
                </div>
                <div>
                  <p className="text-xl font-bold">{formatCurrency(viewModal.payment.amount, viewModal.payment.currency)}</p>
                  <Badge variant={viewModal.payment.status === 'success' ? 'success' : 
                    viewModal.payment.status === 'pending' ? 'warning' : 
                    viewModal.payment.status === 'failed' ? 'error' : 'default'}>
                    {viewModal.payment.status?.toUpperCase()}
                  </Badge>
                </div>
              </div>
              {viewModal.payment.status === 'pending' && (
                <Button
                  onClick={() => {
                    setViewModal({ open: false, payment: null });
                    setVerifyModal({ open: true, payment: viewModal.payment });
                  }}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <IconShieldCheck className="w-4 h-4 mr-1" />
                  Verify
                </Button>
              )}
            </div>

            {/* Transaction Reference */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Reference</p>
              <p className="font-mono text-sm text-gray-900 break-all">{viewModal.payment.reference}</p>
              {viewModal.payment.paystack_reference && viewModal.payment.paystack_reference !== viewModal.payment.reference && (
                <>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 mt-3">Paystack Reference</p>
                  <p className="font-mono text-sm text-gray-900 break-all">{viewModal.payment.paystack_reference}</p>
                </>
              )}
            </div>

            {/* Student Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <IconUser className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">Student Information</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Name:</span>
                    <span className="font-medium text-gray-900">{viewModal.payment.student_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Reg. Number:</span>
                    <span className="font-mono text-gray-900">{viewModal.payment.registration_number || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Program:</span>
                    <span className="text-gray-900">{viewModal.payment.program_name || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <IconSchool className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">Session & Payment Info</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Session:</span>
                    <span className="text-gray-900">{viewModal.payment.session_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type:</span>
                    <span className="text-gray-900 capitalize">{viewModal.payment.payment_type || 'full'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Channel:</span>
                    <span className="text-gray-900 capitalize">{viewModal.payment.channel || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <IconCreditCard className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">Card/Bank Details</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Card Type:</span>
                    <span className="text-gray-900 capitalize">{viewModal.payment.card_type || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Bank:</span>
                    <span className="text-gray-900">{viewModal.payment.bank || 'N/A'}</span>
                  </div>
                  {viewModal.payment.authorization_code && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Auth Code:</span>
                      <span className="font-mono text-xs text-gray-900">{viewModal.payment.authorization_code}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <IconCalendar className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">Timestamps</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Created:</span>
                    <span className="text-gray-900">{formatDateTime(viewModal.payment.created_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Verified:</span>
                    <span className="text-gray-900">{formatDateTime(viewModal.payment.verified_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Updated:</span>
                    <span className="text-gray-900">{formatDateTime(viewModal.payment.updated_at)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Technical Details (collapsible) */}
            {(viewModal.payment.ip_address || viewModal.payment.user_agent || viewModal.payment.metadata) && (
              <details className="p-4 border border-gray-200 rounded-lg">
                <summary className="flex items-center gap-2 cursor-pointer">
                  <IconDeviceMobile className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">Technical Details</p>
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  {viewModal.payment.ip_address && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">IP Address:</span>
                      <span className="font-mono text-gray-900">{viewModal.payment.ip_address}</span>
                    </div>
                  )}
                  {viewModal.payment.user_agent && (
                    <div>
                      <span className="text-gray-500">User Agent:</span>
                      <p className="font-mono text-xs text-gray-700 mt-1 break-all">{viewModal.payment.user_agent}</p>
                    </div>
                  )}
                  {viewModal.payment.metadata && (
                    <div>
                      <span className="text-gray-500">Metadata:</span>
                      <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                        {(() => {
                          try {
                            const parsed = typeof viewModal.payment.metadata === 'string' 
                              ? JSON.parse(viewModal.payment.metadata) 
                              : viewModal.payment.metadata;
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return viewModal.payment.metadata;
                          }
                        })()}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setViewModal({ open: false, payment: null })}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default PaymentsPage;
