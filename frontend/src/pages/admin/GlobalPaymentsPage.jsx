/**
 * Global Payments Page
 * 
 * Platform-wide payment management for super_admin only.
 * Shows all payments across institutions with stats and filters.
 * Accessible from admin.digitaltipi.com subdomain.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  IconCreditCard, 
  IconSearch, 
  IconRefresh,
  IconBuilding,
  IconCheck,
  IconX,
  IconClock,
  IconCurrencyNaira,
  IconExternalLink,
  IconChecks,
  IconBan,
  IconReceipt,
  IconEye,
  IconUser,
  IconSchool,
  IconCalendar,
  IconDeviceMobile,
  IconShieldCheck,
} from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Dialog } from '../../components/ui/Dialog';
import { DataTable, columnHelpers } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import api from '../../api/client';
import { authApi } from '../../api/auth';
import { getInstitutionUrl } from '../../hooks/useSubdomain';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDateTime } from '../../utils/helpers';

const getStatusVariant = (status) => {
  const variants = {
    success: 'success',
    completed: 'success',
    pending: 'warning',
    failed: 'error',
    refunded: 'info',
    cancelled: 'default',
  };
  return variants[status] || 'default';
};

const getStatusIcon = (status) => {
  switch (status) {
    case 'success':
    case 'completed':
      return <IconCheck className="w-3 h-3" />;
    case 'pending':
      return <IconClock className="w-3 h-3" />;
    case 'failed':
    case 'cancelled':
      return <IconX className="w-3 h-3" />;
    default:
      return null;
  }
};

function GlobalPaymentsPage() {
  const { toast } = useToast();
  
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({
    total_payments: 0,
    completed_count: 0,
    pending_count: 0,
    failed_count: 0,
    total_completed_amount: 0,
    total_pending_amount: 0,
    by_institution: [],
  });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [institutions, setInstitutions] = useState([]);

  // Verify/Cancel modals
  const [verifyModal, setVerifyModal] = useState({ open: false, payment: null });
  const [cancelModal, setCancelModal] = useState({ open: false, payment: null });
  const [viewModal, setViewModal] = useState({ open: false, payment: null });
  const [processing, setProcessing] = useState(false);

  // Lookup modal for manual reference verification
  const [lookupModal, setLookupModal] = useState(false);
  const [lookupReference, setLookupReference] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Fetch institutions for filter dropdown
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await api.get('/global/institutions');
        setInstitutions(response.data.data || []);
      } catch (err) {
        console.error('Failed to load institutions:', err);
      }
    };
    fetchInstitutions();
  }, []);

  const fetchPayments = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('limit', pagination.limit);
      if (search) params.set('search', search);
      if (selectedStatus) params.set('status', selectedStatus);
      if (selectedInstitution) params.set('institution_id', selectedInstitution);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);

      const response = await api.get(`/global/payments?${params}`);
      const data = response.data.data;
      
      setPayments(data.payments || []);
      setStats(data.stats || {
        total_payments: 0,
        completed_count: 0,
        pending_count: 0,
        failed_count: 0,
        total_completed_amount: 0,
        total_pending_amount: 0,
        by_institution: [],
      });
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
    } catch (err) {
      console.error('Failed to load payments:', err);
      setError(err.response?.data?.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [search, selectedStatus, selectedInstitution, startDate, endDate, pagination.limit]);

  useEffect(() => {
    fetchPayments(1);
  }, []);

  // Refetch when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPayments(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selectedStatus, selectedInstitution, startDate, endDate]);

  const handlePageChange = (newPage) => {
    fetchPayments(newPage);
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedStatus('');
    setSelectedInstitution('');
    setStartDate('');
    setEndDate('');
  };

  // Verify payment via Paystack
  const handleVerifyPayment = async () => {
    if (!verifyModal.payment) return;
    setProcessing(true);
    try {
      const response = await api.post(`/global/payments/${verifyModal.payment.id}/verify`);
      toast.success(response.data.message || 'Payment verified successfully');
      setVerifyModal({ open: false, payment: null });
      fetchPayments(pagination.page);
    } catch (err) {
      console.error('Failed to verify payment:', err);
      toast.error(err.response?.data?.message || 'Failed to verify payment');
    } finally {
      setProcessing(false);
    }
  };

  // Cancel pending payment
  const handleCancelPayment = async () => {
    if (!cancelModal.payment) return;
    setProcessing(true);
    try {
      await api.post(`/global/payments/${cancelModal.payment.id}/cancel`);
      toast.success('Payment cancelled successfully');
      setCancelModal({ open: false, payment: null });
      fetchPayments(pagination.page);
    } catch (err) {
      console.error('Failed to cancel payment:', err);
      toast.error(err.response?.data?.message || 'Failed to cancel payment');
    } finally {
      setProcessing(false);
    }
  };

  // Lookup payment by reference
  const handleLookupReference = async (e) => {
    e.preventDefault();
    if (!lookupReference.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const response = await api.post('/global/payments/verify-reference', { reference: lookupReference.trim() });
      setLookupResult(response.data.data);
      toast.success(response.data.message || 'Payment verified');
      fetchPayments(pagination.page);
    } catch (err) {
      console.error('Failed to verify reference:', err);
      toast.error(err.response?.data?.message || 'Failed to verify reference');
    } finally {
      setLookupLoading(false);
    }
  };

  // DataTable columns
  const columns = useMemo(() => [
    {
      accessor: 'reference',
      header: 'Reference',
      render: (value) => (
        <span className="font-mono text-sm text-gray-700">{value}</span>
      ),
    },
    {
      accessor: 'student_name',
      header: 'Student',
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-900">{value || 'N/A'}</p>
          <p className="text-xs text-gray-500">{row.registration_number}</p>
        </div>
      ),
    },
    {
      accessor: 'institution_code',
      header: 'Institution',
      render: (value) => (
        <span className="font-semibold text-gray-700">{value}</span>
      ),
    },
    {
      accessor: 'amount',
      header: 'Amount',
      align: 'right',
      render: (value, row) => (
        <span className="font-semibold text-gray-900">
          {formatCurrency(value, row.currency)}
        </span>
      ),
      exportFormatter: (value, row) => formatCurrency(value, row.currency),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (value) => (
        <Badge variant={getStatusVariant(value)} className="capitalize">
          {getStatusIcon(value)}
          <span className="ml-1">{value}</span>
        </Badge>
      ),
      exportFormatter: (value) => value,
    },
    {
      accessor: 'payment_type',
      header: 'Type',
      render: (value) => (
        <span className="text-sm text-gray-600 capitalize">{value}</span>
      ),
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
      render: (value) => (
        <span className="text-sm text-gray-600 capitalize">{value}</span>
      ),
    },
    columnHelpers.actions((_, row) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setViewModal({ open: true, payment: row });
          }}
          title="View payment details"
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
        >
          <IconEye className="w-4 h-4" />
        </Button>
        {row.status === 'pending' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setVerifyModal({ open: true, payment: row });
              }}
              title="Verify payment"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              <IconChecks className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setCancelModal({ open: true, payment: row });
              }}
              title="Cancel payment"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <IconBan className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>
    ), { header: 'Actions' }),
  ], []);

  // Toolbar with filters (same pattern as StudentsPage)
  const tableToolbar = (
    <div className="flex flex-col gap-2">
      {/* Filters - grid on mobile, flex on desktop */}
      <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2">
        <div className="relative w-full sm:w-auto col-span-2">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, reg no, or reference..."
            className="pl-9 py-2 border border-gray-300 text-sm w-full md:w-72"
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Select
            value={selectedInstitution}
            onChange={(e) => setSelectedInstitution(e.target.value)}
            className="text-sm w-full md:w-72"
          >
            <option value="">All Institutions</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.code} - {inst.name}
              </option>
            ))}
          </Select>
        </div>
        <Select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="text-sm"
        >
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </Select>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder="Start Date"
          className="text-sm"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder="End Date"
          className="text-sm"
        />
        <Button 
          variant="outline"
          onClick={clearFilters} 
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Global Payments</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            View and manage payments across all institutions
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => fetchPayments(pagination.page)} variant="outline">
            <IconRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={() => setLookupModal(true)} variant="outline">
            <IconReceipt className="w-4 h-4 sm:mr-2" />
            Verify Reference
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <IconCreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.total_payments}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">Total Payments</p>
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
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.completed_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">Successful</p>
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
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.pending_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">Pending</p>
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
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{stats.failed_count}</p>
                <p className="text-[10px] sm:text-xs text-gray-500 truncate">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="col-span-2 md:col-span-1">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <IconCurrencyNaira className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base sm:text-lg font-bold text-gray-900 truncate">{formatCurrency(stats.total_completed_amount)}</p>
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate">Completed Amount</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payments Table - Using DataTable with toolbar */}
      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="text-center py-12">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => fetchPayments(1)} variant="outline" className="mt-4">
                Try Again
              </Button>
            </div>
          ) : (
            <DataTable
              data={payments}
              columns={columns}
              keyField="id"
              loading={loading}
              sortable
              exportable
              exportFilename="global_payments"
              toolbar={tableToolbar}
              emptyIcon={IconCreditCard}
              emptyTitle="No payments found"
              emptyDescription="Adjust your filters or check back later"
              pagination={{
                page: pagination.page,
                limit: pagination.limit,
                total: pagination.total,
                onPageChange: handlePageChange,
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Verify Payment Modal */}
      <Dialog
        isOpen={verifyModal.open}
        onClose={() => !processing && setVerifyModal({ open: false, payment: null })}
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
                <span className="text-gray-500">Institution:</span>
                <span className="font-medium">{verifyModal.payment.institution_code}</span>
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
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerifyPayment}
              loading={processing}
              className="bg-green-600 hover:bg-green-700"
            >
              <IconShieldCheck className="w-4 h-4 mr-2" />
              Verify Payment
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Cancel Payment Modal */}
      <Dialog
        isOpen={cancelModal.open}
        onClose={() => !processing && setCancelModal({ open: false, payment: null })}
        title="Cancel Payment"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <IconBan className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
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
                <span className="text-gray-500">Institution:</span>
                <span className="font-medium">{cancelModal.payment.institution_code}</span>
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
              disabled={processing}
            >
              Keep Payment
            </Button>
            <Button
              variant="danger"
              onClick={handleCancelPayment}
              loading={processing}
            >
              <IconBan className="w-4 h-4 mr-2" />
              Cancel Payment
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Lookup by Reference Modal */}
      <Dialog
        isOpen={lookupModal}
        onClose={() => { setLookupModal(false); setLookupReference(''); setLookupResult(null); }}
        title="Verify Payment by Reference"
      >
        <form onSubmit={handleLookupReference} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Reference
            </label>
            <Input
              value={lookupReference}
              onChange={(e) => setLookupReference(e.target.value)}
              placeholder="Enter Paystack reference..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Use this to verify a payment that may have succeeded but didn't update in the system.
            </p>
          </div>

          {lookupResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-medium flex items-center gap-2">
                <IconCheck className="w-4 h-4" />
                Payment Verified Successfully
              </p>
              <div className="mt-2 text-sm text-green-700 space-y-1">
                <p><span className="font-medium">Amount:</span> {formatCurrency(lookupResult.amount / 100)}</p>
                <p><span className="font-medium">Status:</span> {lookupResult.status}</p>
                <p><span className="font-medium">Paid At:</span> {formatDateTime(lookupResult.paid_at)}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setLookupModal(false); setLookupReference(''); setLookupResult(null); }}>
              Close
            </Button>
            <Button type="submit" disabled={lookupLoading || !lookupReference.trim()}>
              {lookupLoading ? 'Verifying...' : 'Verify'}
            </Button>
          </div>
        </form>
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

            {/* Student & Institution Info */}
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
                  <IconBuilding className="w-4 h-4 text-gray-500" />
                  <p className="text-sm font-medium text-gray-700">Institution & Session</p>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Institution:</span>
                    <span className="text-gray-900">{viewModal.payment.institution_code || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Session:</span>
                    <span className="text-gray-900">{viewModal.payment.session_name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type:</span>
                    <span className="text-gray-900 capitalize">{viewModal.payment.payment_type || 'full'}</span>
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
                    <span className="text-gray-500">Channel:</span>
                    <span className="text-gray-900 capitalize">{viewModal.payment.channel || 'N/A'}</span>
                  </div>
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

export default GlobalPaymentsPage;
