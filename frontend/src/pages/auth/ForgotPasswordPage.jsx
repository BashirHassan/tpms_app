/**
 * Forgot Password Page
 * Request password reset via email
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthShellHeader } from '../../components/auth/AuthShellHeader';
import authApi from '../../api/auth';
import { IconAlertCircle, IconMailForward, IconArrowLeft, IconCheck, IconMail } from '@tabler/icons-react';

function ForgotPasswordPage() {
  const { branding, loading: brandingLoading } = useInstitution();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Loading state
  if (brandingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-200 rounded-2xl mb-4"></div>
          <div className="h-6 w-48 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 w-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      await authApi.forgotPassword(email);
      setSubmitted(true);
      toast.success('Password reset link sent!');
    } catch (err) {
      // Always show success message (security: don't reveal if email exists)
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  // Success state after submission
  if (submitted) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-100/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secondary-100/60 blur-3xl" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative w-full max-w-md"
        >
          <AuthShellHeader branding={branding} />

          {/* Success Card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/60">
            <div className="text-center">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <IconCheck className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">Check Your Email</h2>
              <p className="mb-6 text-gray-500">
                If an account with <strong className="text-gray-700">{email}</strong> exists,
                we&apos;ve sent you a password reset link.
              </p>
              <p className="mb-6 text-sm text-gray-400">
                The link will expire in 30 minutes. Don&apos;t forget to check your spam folder.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full gap-2">
                  <IconArrowLeft className="h-4 w-4" />
                  Back to Login
                </Button>
              </Link>
            </div>
          </div>

          {/* Resend option */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Didn&apos;t receive the email?{' '}
              <Button
                variant="link"
                onClick={() => setSubmitted(false)}
                className="h-auto p-0 font-medium text-primary-600 hover:underline"
              >
                Try again
              </Button>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secondary-100/60 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        <AuthShellHeader branding={branding} />

        {/* Forgot Password Form */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/60">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
              <IconMailForward className="h-6 w-6 text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Forgot Password?</h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <IconAlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              type="email"
              label={
                <span className="flex items-center gap-1.5">
                  <IconMail className="h-3.5 w-3.5 text-gray-400" />
                  Email Address
                </span>
              }
              placeholder="youremail@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              className="text-base"
              required
              autoFocus
            />

            <Button
              type="submit"
              className="w-full text-base font-semibold shadow-sm shadow-primary-600/20 transition-transform hover:-translate-y-0.5"
              loading={loading}
            >
              Send Reset Link
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <IconArrowLeft className="h-4 w-4" />
              Back to Login
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          Powered by{' '}
          <a
            href="https://sitsng.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary-600 hover:underline"
          >
            SI Solutions
          </a>
        </p>
      </motion.div>
    </div>
  );
}

export default ForgotPasswordPage;
