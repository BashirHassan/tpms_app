/**
 * Forgot Password Page
 * Request password reset via email
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import authApi from '../../api/auth';
import { IconSchool, IconAlertCircle, IconMailForward, IconArrowLeft, IconCheck } from '@tabler/icons-react';

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md">
          {/* Institution Logo/Branding */}
          <div className="text-center mb-8">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.name}
                className="w-20 h-20 mx-auto mb-4 object-contain rounded-2xl"
              />
            ) : (
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
                <IconSchool className="w-10 h-10 text-white" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-gray-900">{branding.name}</h1>
          </div>

          {/* Success Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                <IconCheck className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Check Your Email</h2>
              <p className="text-gray-500 mb-6">
                If an account with <strong className="text-gray-700">{email}</strong> exists, 
                we&apos;ve sent you a password reset link.
              </p>
              <p className="text-sm text-gray-400 mb-6">
                The link will expire in 30 minutes. Don&apos;t forget to check your spam folder.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  <IconArrowLeft className="w-4 h-4 mr-2" />
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
                className="text-primary-600 hover:underline font-medium p-0 h-auto"
              >
                Try again
              </Button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Institution Logo/Branding */}
        <div className="text-center mb-8">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.name}
              className="w-20 h-20 mx-auto mb-4 object-contain rounded-2xl"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
              <IconSchool className="w-10 h-10 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{branding.name}</h1>
          <p className="text-gray-500 mt-1">Teaching Practice Management System</p>
        </div>

        {/* Forgot Password Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 mb-3">
              <IconMailForward className="w-6 h-6 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Forgot Password?</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <IconAlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              type="email"
              label="Email Address"
              placeholder="you@institution.edu.ng"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              required
              autoFocus
            />

            <Button type="submit" className="w-full" loading={loading}>
              Send Reset Link
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
              <IconArrowLeft className="w-4 h-4 inline mr-1" />
              Back to Login
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-400">
          <p>Powered by DigitalTP</p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
