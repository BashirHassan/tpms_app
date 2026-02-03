/**
 * Student Dashboard Page
 * Real-time portal status with session-aware features
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate, formatGreetingName } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  IconSchool,
  IconCreditCard,
  IconFileText,
  IconBuildingBank,
  IconCalendar,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconDownload,
  IconChevronRight,
  IconRefresh,
} from '@tabler/icons-react';

function StudentDashboard() {
  const navigate = useNavigate();
  const { user, institution } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [portalStatus, setPortalStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchPortalStatus();
  }, []);

  const fetchPortalStatus = async () => {
    try {
      const response = await portalApi.getStatus();
      setPortalStatus(response.data.data || response.data || null);
    } catch (err) {
      if (err.response?.status !== 401) {
        toast.error('Failed to load portal status');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPortalStatus();
  };



  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'not_required':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getAcceptanceStatusColor = (status) => {
    switch (status) {
      case 'approved':
      case 'pending':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // No active session
  if (!portalStatus?.active_session) {
    return (
      <div className="space-y-4 px-1">
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-4 sm:p-6 text-white">
          <h1 className="text-xl sm:text-2xl font-bold">Welcome, {formatGreetingName(user?.name)}!</h1>
          <p className="text-primary-100 mt-1 text-sm sm:text-base">{user?.registration_number}</p>
          <p className="text-primary-200 text-xs sm:text-sm mt-2">{institution?.name}</p>
        </div>

        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
              <IconAlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <h3 className="font-semibold text-yellow-900 text-sm sm:text-base">No Active Session</h3>
                <p className="text-yellow-700 text-sm sm:text-base">
                  There is no active teaching practice session at this time. 
                  Please check back later or contact your coordinator.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { session, windows, payment, acceptance, posting_letter } = portalStatus;

  return (
    <div className="space-y-3 sm:space-y-4 px-1">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl p-4 sm:p-6 text-white">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold truncate">Welcome, {formatGreetingName(portalStatus.student?.name || user?.name)}!</h2>
            <p className="text-gray-50 text-xs sm:text-sm truncate">{portalStatus.student?.registration_number || user?.registration_number}</p>
            <p className="text-gray-50 text-xs sm:text-sm truncate">{institution?.name}</p>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 sm:p-2.5 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
            title="Refresh status"
          >
            <IconRefresh className={`w-4 h-4 sm:w-5 sm:h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {session && (
          <div className="mt-2 pt-1 border-t border-primary-500/30">
            <p className="text-primary-100 text-xs sm:text-sm">Current Session</p>
            <p className="font-medium text-xs sm:text-sm">{session.name}</p>
          </div>
        )}
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Program */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <IconSchool className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-500">Program</p>
                <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                  {portalStatus.student?.program || user?.program || 'Not Assigned'}
                </p>
                {portalStatus.student?.department && (
                  <p className="text-xs sm:text-sm text-gray-500 truncate">{portalStatus.student.department}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Status */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                payment.status === 'completed' ? 'bg-green-100' : 
                payment.status === 'partial' ? 'bg-blue-100' : 'bg-yellow-100'
              }`}>
                <IconCreditCard className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  payment.status === 'completed' ? 'text-green-600' : 
                  payment.status === 'partial' ? 'text-blue-600' : 'text-yellow-600'
                }`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-500">Payment Status</p>
                <span className={`inline-block px-2 py-0.5 sm:py-1 text-xs sm:text-sm rounded-full ${getPaymentStatusColor(payment.status)}`}>
                  {payment.status === 'completed' ? 'Paid' : 
                   payment.status === 'partial' ? 'Partial' : 
                   payment.status === 'not_required' ? 'Not Required' : 'Pending'}
                </span>
                {payment.required && payment.remaining > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Balance: {formatCurrency(payment.remaining)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Acceptance Status */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                acceptance.submitted ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <IconFileText className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  acceptance.submitted ? 'text-green-600' : 'text-gray-400'
                }`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm text-gray-500">Acceptance Status</p>
                <span className={`inline-block px-2 py-0.5 sm:py-1 text-xs sm:text-sm rounded-full ${getAcceptanceStatusColor(acceptance.status)}`}>
                  {acceptance.submitted ? 'Submitted' : 'Not Submitted'}
                </span>
                {acceptance.school_name && (
                  <p className="text-xs text-gray-500 mt-1 truncate">{acceptance.school_name}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-3">
            <div className="space-y-2 sm:space-y-3">
              {/* Payment Action */}
              {payment.required && payment.status !== 'completed' && (
                <button
                  onClick={() => navigate('/student/payment')}
                  disabled={!payment.can_pay}
                  className={`w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border transition-colors text-left active:scale-[0.99] ${
                    payment.can_pay
                      ? 'border-green-200 bg-green-50 hover:bg-green-100 active:bg-green-100'
                      : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <IconCreditCard className={`w-5 h-5 flex-shrink-0 ${payment.can_pay ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-sm sm:text-base ${payment.can_pay ? 'text-green-900' : 'text-gray-500'}`}>
                      Make Payment
                    </p>
                    <p className={`text-xs sm:text-sm truncate ${payment.can_pay ? 'text-green-700' : 'text-gray-400'}`}>
                      {payment.can_pay 
                        ? `Pay ${formatCurrency(payment.remaining)} TP fee`
                        : windows.acceptance?.message || 'Acceptance period closed'}
                    </p>
                  </div>
                  {payment.can_pay && <IconChevronRight className="w-5 h-5 text-green-600 flex-shrink-0" />}
                </button>
              )}

              {/* Payment Completed Badge */}
              {payment.status === 'completed' && (
                <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border border-green-200 bg-green-50">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-green-900 text-sm sm:text-base">Payment Completed</p>
                    <p className="text-xs sm:text-sm text-green-700">
                      You have paid {formatCurrency(payment.paid)}
                    </p>
                  </div>
                </div>
              )}

              {/* Acceptance Form Action */}
              <button
                onClick={() => navigate('/student/acceptance')}
                disabled={!acceptance.can_submit && !acceptance.submitted}
                className={`w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border transition-colors text-left active:scale-[0.99] ${
                  acceptance.can_submit
                    ? 'border-primary-200 bg-primary-50 hover:bg-primary-100 active:bg-primary-100'
                    : acceptance.submitted
                    ? 'border-green-200 bg-green-50'
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                }`}
              >
                <IconBuildingBank className={`w-5 h-5 flex-shrink-0 ${
                  acceptance.can_submit ? 'text-primary-600' : 
                  acceptance.submitted ? 'text-green-600' : 'text-gray-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm sm:text-base ${
                    acceptance.can_submit ? 'text-primary-900' : 
                    acceptance.submitted ? 'text-green-900' : 'text-gray-500'
                  }`}>
                    {acceptance.submitted ? 'View Acceptance' : 'Submit Acceptance Form'}
                  </p>
                  <p className={`text-xs sm:text-sm truncate ${
                    acceptance.can_submit ? 'text-primary-700' : 
                    acceptance.submitted ? 'text-green-700' : 'text-gray-400'
                  }`}>
                    {acceptance.submitted
                      ? `${acceptance.school_name}`
                      : acceptance.can_submit 
                      ? 'Choose your preferred school'
                      : !windows.acceptance?.is_open 
                      ? windows.acceptance?.message || 'Window closed'
                      : payment.status === 'pending' 
                      ? 'Complete payment first' 
                      : 'Not available'}
                  </p>
                </div>
                {(acceptance.can_submit || acceptance.submitted) && (
                  <IconChevronRight className={`w-5 h-5 flex-shrink-0 ${
                    acceptance.submitted ? 'text-green-600' : 'text-primary-600'
                  }`} />
                )}
              </button>

              {/* Posting Letter Action */}
              <button
                onClick={() => navigate('/student/posting-letter')}
                disabled={!posting_letter.can_download}
                className={`w-full flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border transition-colors text-left active:scale-[0.99] ${
                  posting_letter.can_download
                    ? 'border-blue-200 bg-blue-50 hover:bg-blue-100 active:bg-blue-100'
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                }`}
              >
                <IconDownload className={`w-5 h-5 flex-shrink-0 ${posting_letter.can_download ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm sm:text-base ${posting_letter.can_download ? 'text-blue-900' : 'text-gray-500'}`}>
                    Download Posting Letter
                  </p>
                  <p className={`text-xs sm:text-sm truncate ${posting_letter.can_download ? 'text-blue-700' : 'text-gray-400'}`}>
                    {posting_letter.can_download 
                      ? 'Your posting letter is ready'
                      : !posting_letter.available 
                      ? windows.posting_letter?.message || 'Not yet available'
                      : 'Complete acceptance first'}
                  </p>
                </div>
                {posting_letter.can_download && <IconChevronRight className="w-5 h-5 text-blue-600 flex-shrink-0" />}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Important Dates */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <IconCalendar className="w-4 h-4 sm:w-5 sm:h-5" />
              Important Dates
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-2 sm:pt-3">
            <div className="space-y-3 sm:space-y-4">
              {/* Acceptance & Payment Window */}
              <div className="flex items-center gap-2 sm:gap-4">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  windows.acceptance?.is_open ? 'bg-green-100' : 'bg-gray-100'
                }`}>
                  <IconFileText className={`w-4 h-4 sm:w-5 sm:h-5 ${
                    windows.acceptance?.is_open ? 'text-green-600' : 'text-gray-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500">Acceptance & Payment Period</p>
                  {windows.acceptance?.starts_at || windows.acceptance?.ends_at ? (
                    <p className="font-medium text-gray-900 text-xs sm:text-sm md:text-base">
                      {formatDate(windows.acceptance.starts_at)} - {formatDate(windows.acceptance.ends_at)}
                    </p>
                  ) : (
                    <p className="font-medium text-gray-900 text-sm sm:text-base">Dates to be announced</p>
                  )}
                </div>
                {windows.acceptance?.is_open ? (
                  <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-500 flex-shrink-0" />
                ) : (
                  <IconClock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                )}
              </div>

              {/* Posting Letters Available Date */}
              <div className="flex items-center gap-2 sm:gap-4">
                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  windows.posting_letter?.is_open ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <IconDownload className={`w-4 h-4 sm:w-5 sm:h-5 ${
                    windows.posting_letter?.is_open ? 'text-blue-600' : 'text-gray-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500">Posting Letters Available</p>
                  <p className="font-medium text-gray-900 text-sm sm:text-base">
                    {windows.posting_letter?.starts_at 
                      ? formatDate(windows.posting_letter.starts_at)
                      : 'Date to be announced'
                    }
                  </p>
                </div>
                {windows.posting_letter?.is_open ? (
                  <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0" />
                ) : (
                  <IconClock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                )}
              </div>

              {/* Teaching Practice Period */}
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <IconCalendar className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500">Teaching Practice Period</p>
                  <p className="font-medium text-gray-900 text-xs sm:text-sm md:text-base">
                    {session?.tp_start_date 
                      ? `${formatDate(session.tp_start_date)} - ${formatDate(session.tp_end_date)}`
                      : 'Dates to be announced'
                    }
                  </p>
                </div>
                {session?.tp_start_date && new Date() >= new Date(session.tp_start_date) && new Date() <= new Date(session.tp_end_date) ? (
                  <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-primary-500 flex-shrink-0" />
                ) : (
                  <IconClock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Session Locked Warning */}
      {windows.session?.is_locked == 1 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start sm:items-center gap-2 sm:gap-3">
              <IconAlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0 mt-0.5 sm:mt-0" />
              <p className="text-amber-800 text-sm sm:text-base">
                This session is locked. Some features may be restricted.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default StudentDashboard;
