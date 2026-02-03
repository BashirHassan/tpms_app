/**
 * Student Payment Page
 * Modern, beautiful design following JEI patterns
 * - Server-side initialization with access_code
 * - Server-side verification (never trust frontend callbacks)
 * - Payment available during acceptance period (uses acceptance start/end dates from session)
 * - Real-time status updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentsApi, portalApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePaystackInline } from '../../hooks';
import { cn, formatCurrency, formatDate } from '../../utils/helpers';
import { Button } from '../../components/ui/Button';
import {
  IconCreditCard,
  IconCheck,
  IconAlertCircle,
  IconClock,
  IconReceipt,
  IconChevronRight,
  IconLock,
  IconCalendar,
  IconRefresh,
  IconShieldCheck,
  IconWallet,
  IconArrowRight,
  IconCircleCheck,
  IconLoader2,
  IconCurrencyNaira,
  IconSparkles,
  IconBuildingBank,
  IconDownload,
  IconFileText,
} from '@tabler/icons-react';

// Payment states following JEI pattern
const PAYMENT_STATES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  PROCESSING: 'processing',
  VERIFYING: 'verifying',
  SUCCESS: 'success',
  FAILED: 'failed',
};

// Animated circular progress component
const CircularProgress = ({ percentage, size = 120, strokeWidth = 8 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          className="text-gray-100"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className="text-primary-500 transition-all duration-1000 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-gray-900">{Math.round(percentage)}%</span>
      </div>
    </div>
  );
};

// Modern stat card component
const StatCard = ({ icon: Icon, label, value, variant = 'default', className }) => {
  const variants = {
    default: 'bg-white border border-gray-100',
    success: 'bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-100',
    warning: 'bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-100',
    primary: 'bg-gradient-to-br from-primary-50 to-blue-50 border border-primary-100',
  };

  const iconVariants = {
    default: 'bg-gray-100 text-gray-600',
    success: 'bg-emerald-100 text-emerald-600',
    warning: 'bg-amber-100 text-amber-600',
    primary: 'bg-primary-100 text-primary-600',
  };

  return (
    <div
      className={cn(
        'rounded-xl p-4 transition-all duration-300 hover:shadow-md',
        variants[variant],
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-lg', iconVariants[variant])}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
};

function PaymentPage() {
  const navigate = useNavigate();
  const { user, institution } = useAuth();
  const { toast } = useToast();
  const { resumeTransaction } = usePaystackInline();
  const contentRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  // State
  const [loading, setLoading] = useState(true);
  const [paymentState, setPaymentState] = useState(PAYMENT_STATES.IDLE);
  const [session, setSession] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [windowStatus, setWindowStatus] = useState(null);
  const [acceptanceStatus, setAcceptanceStatus] = useState(null);
  const [postingLetterStatus, setPostingLetterStatus] = useState(null);
  const [postingLetterWindow, setPostingLetterWindow] = useState(null);
  const [error, setError] = useState(null);
  // Store payment info for retry/verification
  const [pendingPayment, setPendingPayment] = useState(null);

  // Animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Fetch payment status and portal status
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Get portal status which includes session and payment info
      const portalRes = await portalApi.getStatus();
      const portal = portalRes.data.data;
      
      if (!portal.active_session) {
        setSession(null);
        setPaymentStatus(null);
        setLoading(false);
        return;
      }

      setSession(portal.session);
      setWindowStatus(portal.windows?.payment);
      setAcceptanceStatus(portal.acceptance);
      setPostingLetterStatus(portal.posting_letter);
      setPostingLetterWindow(portal.windows?.posting_letter);

      // Get detailed payment status from payments API
      if (portal.session?.id) {
        try {
          const statusRes = await paymentsApi.getStudentStatus(portal.session.id);
          setPaymentStatus(statusRes.data.data);
        } catch (err) {
          // Use portal payment data as fallback
          setPaymentStatus({
            required: portal.payment.required,
            status: portal.payment.status,
            amount: portal.payment.amount,
            paid: portal.payment.paid,
            remaining: portal.payment.remaining,
            can_pay: portal.payment.can_pay,
            payments: [],
          });
        }
      }
    } catch (err) {
      if (err.response?.status === 401) {
        // Auth error - let the auth handler deal with it
        return;
      }
      setError('Failed to load payment status');
      toast.error('Failed to load payment status');
    } finally {
      setLoading(false);
    }
  };

  // Server-side payment verification (NEVER trust frontend callbacks)
  const verifyPaymentOnServer = async (reference) => {
    setPaymentState(PAYMENT_STATES.VERIFYING);
    try {
      const verifyResult = await paymentsApi.verifyPayment(reference);
      
      if (verifyResult.data.data?.status === 'success') {
        setPaymentState(PAYMENT_STATES.SUCCESS);
        toast.success('Payment successful!');
        setPendingPayment(null);
        // Refresh payment status after verification
        fetchData();
        return true;
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (verifyErr) {
      console.error('Verification error:', verifyErr);
      setPaymentState(PAYMENT_STATES.FAILED);
      setError('Payment verification failed. If debited, please contact support.');
      toast.error('Payment verification failed');
      return false;
    }
  };

  // Initialize and process payment following JEI Paystack pattern
  const handlePayment = useCallback(async () => {
    if (!session || !paymentStatus?.remaining) return;

    setPaymentState(PAYMENT_STATES.INITIALIZING);
    setError(null);

    try {
      // Step 1: Initialize payment on server (get Paystack access code)
      const result = await paymentsApi.initializePayment(session.id);
      const { paystack } = result.data.data;

      if (!paystack || !paystack.accessCode) {
        throw new Error('Invalid payment initialization response');
      }

      // Store payment info for potential retry
      setPendingPayment({
        reference: paystack.reference,
        accessCode: paystack.accessCode,
      });

      setPaymentState(PAYMENT_STATES.PROCESSING);

      // Step 2: Open Paystack popup using access_code (JEI pattern)
      resumeTransaction({
        accessCode: paystack.accessCode,
        onSuccess: async (response) => {
          // CRITICAL: Verify payment server-side (JEI pattern)
          // Never trust frontend callback - always verify with backend
          console.log('Paystack popup closed with response:', response);
          await verifyPaymentOnServer(paystack.reference);
        },
        onCancel: () => {
          setPaymentState(PAYMENT_STATES.IDLE);
          toast.warning('Payment cancelled. Click "Pay Now" when ready.');
        },
        onError: (err) => {
          console.error('Paystack popup error:', err);
          setPaymentState(PAYMENT_STATES.FAILED);
          setError('Payment popup error. Please try again.');
          toast.error('Payment error. Please try again.');
        },
      });
    } catch (err) {
      console.error('Payment error:', err);
      setPaymentState(PAYMENT_STATES.FAILED);
      const message = err.response?.data?.message || err.message || 'Failed to initialize payment';
      setError(message);
      toast.error(message);
    }
  }, [session, paymentStatus, toast, resumeTransaction]);



  // Reset payment state
  const resetPayment = () => {
    setPaymentState(PAYMENT_STATES.IDLE);
    setError(null);
    fetchData();
  };

  // Loading state with skeleton
  if (loading) {
    return (
      <div className="min-h-[500px] flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary-100 rounded-full animate-pulse"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-500 font-medium">Loading payment details...</p>
        </div>
      </div>
    );
  }

  // No active session - Beautiful empty state
  if (!session) {
    return (
      <div
        className={cn(
          'transition-all duration-500',
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        )}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Payment</h1>
          <p className="text-gray-500 mt-1">Manage your teaching practice fees</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-2xl p-8 border border-amber-100">
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <IconAlertCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Session</h3>
            <p className="text-gray-600">
              There is no active teaching practice session at this time. Payment options will
              appear when a new session is available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Payment not required - Success state
  if (!paymentStatus?.required) {
    return (
      <div
        className={cn(
          'transition-all duration-500',
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        )}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Payment</h1>
          <p className="text-gray-500 mt-1">Manage your teaching practice fees</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 rounded-2xl p-8 border border-emerald-100">
          <div className="text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <IconCircleCheck className="w-8 h-8 text-emerald-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Payment Required</h3>
            <p className="text-gray-600">
              Payment is not required for this session, or has already been completed. You're all
              set!
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isCompleted = paymentStatus.status === 'completed';
  const isPartial = paymentStatus.status === 'partial';
  const canPay = paymentStatus.remaining > 0 && windowStatus?.is_open !== false;
  const progressPercentage =
    paymentStatus.amount > 0 ? (paymentStatus.paid / paymentStatus.amount) * 100 : 0;

  return (
    <div
      ref={contentRef}
      className={cn(
        'space-y-4 transition-all duration-500',
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment</h1>
          <p className="text-gray-500">Manage your teaching practice fees</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resetPayment}
          className="text-gray-500 hover:text-gray-700"
        >
          <IconRefresh className="w-5 h-5" />
          <span className="hidden md:block ml-2">Refresh</span>
        </Button>
      </div>

      {/* Session Banner */}
      <div className="bg-gradient-to-r from-primary-500 via-primary-600 to-primary-700 rounded-2xl p-6 text-white relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <IconCalendar className="w-6 h-6" />
            </div>
            <div>
              <p className="text-primary-100 text-sm font-medium">Current Session</p>
              <h2 className="text-lg font-bold">{session.name}</h2>
            </div>
          </div>

          {windowStatus && (
            <div className="hidden md:flex items-center gap-2">
              {windowStatus.is_open ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-white/20 rounded-full backdrop-blur-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                  </span>
                  <span className="text-sm font-medium">Acceptance Preriod Open</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-500/30 rounded-full backdrop-blur-sm">
                  <IconLock className="w-4 h-4" />
                  <span className="text-sm font-medium">Window Closed</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Payment Deadline */}
        {windowStatus?.ends_at && windowStatus.is_open && (
          <div className="relative mt-4 pt-4 border-t border-white/20">
            <div className="flex items-center gap-2 text-sm text-primary-100">
              <IconClock className="w-4 h-4" />
              <span>
                Acceptance ends:{' '}
                <span className="font-semibold text-white">{formatDate(windowStatus.ends_at)}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Payment Status & Actions */}
        <div className="lg:col-span-2 space-y-4">
          {/* Payment Overview Card */}
          <div className="rounded-2xl p-6 border transition-all duration-300 bg-white border-gray-100 shadow-sm hover:shadow-lg" >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'p-2.5 rounded-xl',
                    isCompleted ? 'bg-emerald-100' : 'bg-primary-100'
                  )}
                >
                  <IconWallet
                    className={cn('w-5 h-5', isCompleted ? 'text-emerald-600' : 'text-primary-600')}
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Payment Overview</h3>
                  <p className="text-sm text-gray-500">Your fee payment status</p>
                </div>
              </div>

              {/* Status Badge */}
              <div
                className={cn(
                  'px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-2',
                  isCompleted
                    ? 'bg-emerald-100 text-emerald-700'
                    : isPartial
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                )}
              >
                {isCompleted ? (
                  <IconCircleCheck className="w-4 h-4" />
                ) : (
                  <IconClock className="w-4 h-4" />
                )}
                <span className="hidden md:block">
                  {isCompleted ? 'Completed' : isPartial ? 'Partial Payment' : 'Pending'}
                </span>
              </div>
            </div>

            {/* Progress Section */}
            <div className="flex flex-col md:flex-row items-center gap-8 mb-6">
              {/* Circular Progress */}
              <div className="flex-shrink-0">
                <CircularProgress percentage={progressPercentage} />
              </div>

              {/* Amount Details */}
              <div className="flex-1 w-full space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <StatCard
                    icon={IconCurrencyNaira}
                    label="Total Amount"
                    value={formatCurrency(paymentStatus.amount, paymentStatus.currency)}
                    variant="default"
                  />
                  <StatCard
                    icon={IconCircleCheck}
                    label="Amount Paid"
                    value={formatCurrency(paymentStatus.paid, paymentStatus.currency)}
                    variant="success"
                  />
                </div>

                {paymentStatus.remaining > 0 && (
                  <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-4 border border-primary-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-primary-600 uppercase tracking-wide">
                          Balance Due
                        </p>
                        <p className="text-2xl font-bold text-primary-700">
                          {formatCurrency(paymentStatus.remaining, paymentStatus.currency)}
                        </p>
                      </div>
                      <IconArrowRight className="w-6 h-6 text-primary-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Linear Progress Bar */}
            <div className="mb-6">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-1000 ease-out',
                    isCompleted
                      ? 'bg-gradient-to-r from-emerald-400 to-green-500'
                      : 'bg-gradient-to-r from-primary-400 to-blue-500'
                  )}
                  style={{ width: `${Math.min(100, progressPercentage)}%` }}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-1.5 bg-red-100 rounded-lg flex-shrink-0">
                    <IconAlertCircle className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-800">Payment Error</p>
                    <p className="text-sm text-red-600 mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Action */}
            {!isCompleted && (
              <div>
                {canPay ? (
                  <div className="space-y-4">
                    <div className="text-end">
                      <Button
                        onClick={handlePayment}
                        disabled={paymentState !== PAYMENT_STATES.IDLE}
                        className={cn(
                          'h-14 px-10 text-base font-semibold rounded-xl transition-all duration-300',
                          paymentState === PAYMENT_STATES.SUCCESS
                            ? 'bg-emerald-500 hover:bg-emerald-600'
                            : 'bg-primary-600 hover:bg-primary-800 shadow-lg shadow-primary-500/25 hover:shadow-xl hover:shadow-primary-500/30'
                        )}
                        size="lg"
                      >
                        {paymentState === PAYMENT_STATES.IDLE && (
                          <>
                            <IconCreditCard className="w-5 h-5 mr-2" />
                            Pay {formatCurrency(paymentStatus.remaining, paymentStatus.currency)}
                            <IconChevronRight className="w-5 h-5 ml-2" />
                          </>
                        )}
                        {paymentState === PAYMENT_STATES.INITIALIZING && (
                          <>
                            <IconLoader2 className="w-5 h-5 mr-2 animate-spin" />
                            Initializing Payment...
                          </>
                        )}
                        {paymentState === PAYMENT_STATES.PROCESSING && (
                          <>
                            <IconLoader2 className="w-5 h-5 mr-2 animate-spin" />
                            Processing...
                          </>
                        )}
                        {paymentState === PAYMENT_STATES.VERIFYING && (
                          <>
                            <IconShieldCheck className="w-5 h-5 mr-2 animate-pulse" />
                            Verifying Payment...
                          </>
                        )}
                        {paymentState === PAYMENT_STATES.FAILED && (
                          <>
                            <IconRefresh className="w-5 h-5 mr-2" />
                            Try Again
                          </>
                        )}
                        {paymentState === PAYMENT_STATES.SUCCESS && (
                          <>
                            <IconCheck className="w-5 h-5 mr-2" />
                            Payment Successful!
                          </>
                        )}
                      </Button>
                    </div>

                    {paymentStatus.allow_partial && (
                      <p className="text-sm text-center text-gray-500">
                        <IconSparkles className="w-4 h-4 inline mr-1 text-amber-500" />
                        Partial payment allowed (minimum {paymentStatus.minimum_percentage}%)
                      </p>
                    )}

                    {/* Security Badge */}
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <IconShieldCheck className="w-4 h-4" />
                        <span>Secured by Paystack</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-6 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                      <IconLock className="w-6 h-6 text-gray-400" />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">Acceptance Period Closed</h4>
                    <p className="text-sm text-gray-500">
                      {windowStatus?.message || 'Payment is only available during the acceptance period. Please contact the TP office for assistance.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Completed Success Message */}
            {isCompleted && (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-2xl mb-4">
                  <IconCircleCheck className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-emerald-900 mb-2">Payment Complete!</h3>
                <p className="text-emerald-700 mb-4">
                  Thank you for your payment.
                </p>
                
                {/* Next Step - Acceptance Form */}
                {acceptanceStatus && !acceptanceStatus.submitted && (
                  <button
                    onClick={() => navigate('/student/acceptance')}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg shadow-primary-500/25 hover:shadow-xl transition-all duration-300"
                  >
                    <IconBuildingBank className="w-5 h-5" />
                    Submit Acceptance Form
                    <IconChevronRight className="w-5 h-5" />
                  </button>
                )}
                {acceptanceStatus?.submitted && (
                  <div className="space-y-3">
                    <button
                      onClick={() => navigate('/student/posting-letter')}
                      disabled={!postingLetterStatus?.can_download}
                      className={cn(
                        'inline-flex items-center gap-2 px-6 py-3 font-semibold rounded-xl transition-all duration-300',
                        postingLetterStatus?.can_download
                          ? 'bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 text-white shadow-lg shadow-primary-500/25 hover:shadow-xl'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      <IconDownload className="w-5 h-5" />
                      {postingLetterStatus?.can_download ? 'Download Posting Letter' : 'Posting Letter Not Ready'}
                      <IconChevronRight className="w-5 h-5" />
                    </button>
                    {!postingLetterStatus?.can_download && postingLetterWindow?.starts_at && (
                      <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5">
                        <IconClock className="w-4 h-4" />
                        Available from:{' '}
                        {new Date(postingLetterWindow.starts_at).toLocaleDateString('en-NG', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Right Column - Payment History */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-6">
            <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <IconReceipt className="w-5 h-5 text-gray-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Payment History</h3>
              </div>
            </div>

            <div className="p-4">
              {paymentStatus.payments?.length > 0 ? (
                <div className="space-y-3">
                  {paymentStatus.payments.map((payment, index) => (
                    <div
                      key={payment.id}
                      className={cn(
                        'p-4 rounded-xl border transition-all duration-200 hover:shadow-md',
                        payment.status === 'success'
                          ? 'bg-emerald-50/50 border-emerald-100'
                          : payment.status === 'pending'
                          ? 'bg-amber-50/50 border-amber-100'
                          : 'bg-red-50/50 border-red-100'
                      )}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <code className="text-xs font-mono bg-white px-2 py-1 rounded border text-gray-600">
                          {payment.reference}
                        </code>
                        <span
                          className={cn(
                            'text-xs font-semibold px-2 py-0.5 rounded-full',
                            payment.status === 'success'
                              ? 'bg-emerald-100 text-emerald-700'
                              : payment.status === 'pending'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          )}
                        >
                          {payment.status === 'success'
                            ? 'Paid'
                            : payment.status === 'pending'
                            ? 'Pending'
                            : 'Failed'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                          {new Date(payment.created_at).toLocaleDateString('en-NG', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="font-bold text-gray-900">
                          {formatCurrency(payment.amount, paymentStatus.currency)}
                        </p>
                      </div>
                      {payment.status !== 'success' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-3 text-xs"
                          onClick={() => verifyPaymentOnServer(payment.reference)}
                          disabled={paymentState === PAYMENT_STATES.VERIFYING}
                        >
                          {paymentState === PAYMENT_STATES.VERIFYING ? (
                            <>
                              <IconLoader2 className="w-3 h-3 mr-1.5 animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              <IconShieldCheck className="w-3 h-3 mr-1.5" />
                              Verify Payment
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <IconReceipt className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">No payment records yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;
