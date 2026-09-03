/**
 * Reset Password Page
 * Complete password reset with token from email
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthShellHeader } from '../../components/auth/AuthShellHeader';
import authApi from '../../api/auth';
import {
  IconAlertCircle,
  IconLock,
  IconArrowLeft,
  IconCheck,
  IconX,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';

// Password strength rules
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
];

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { branding, loading: brandingLoading } = useInstitution();
  const { toast } = useToast();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Get token from URL
  const token = searchParams.get('token');

  // Redirect if no token
  useEffect(() => {
    if (!token) {
      toast.error('Invalid reset link. Please request a new one.');
      navigate('/forgot-password');
    }
  }, [token, navigate, toast]);

  // Check password strength
  const passwordStrength = PASSWORD_RULES.map(rule => ({
    ...rule,
    passed: rule.test(password),
  }));
  const allRulesPassed = passwordStrength.every(r => r.passed);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

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

    if (!password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (!allRulesPassed) {
      setError('Password does not meet the security requirements');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await authApi.resetPassword({ token, password });
      setSuccess(true);
      toast.success('Password reset successfully!');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Password reset failed';
      setError(errorMessage);

      // If token is invalid/expired, suggest requesting new one
      if (errorMessage.toLowerCase().includes('invalid') || errorMessage.toLowerCase().includes('expired')) {
        setError('Your reset link has expired. Please request a new one.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (success) {
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
          <AuthShellHeader branding={branding} size="large" />

          {/* Success Card */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/60">
            <div className="text-center">
              <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <IconCheck className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-900">Password Reset Successful!</h2>
              <p className="mb-6 text-gray-500">
                Your password has been changed successfully. You can now log in with your new password.
              </p>
              <Link to="/login">
                <Button className="w-full text-base font-semibold shadow-sm shadow-primary-600/20">
                  Continue to Login
                </Button>
              </Link>
            </div>
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

        {/* Reset Password Form */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/60">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
              <IconLock className="h-6 w-6 text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Create New Password</h2>
            <p className="mt-1 text-sm text-gray-500">
              Enter a strong password for your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <IconAlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>
                  <span>{error}</span>
                  {error.includes('expired') && (
                    <Link to="/forgot-password" className="mt-1 block font-medium text-red-600 hover:underline">
                      Request new reset link →
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                label={
                  <span className="flex items-center gap-1.5">
                    <IconLock className="h-3.5 w-3.5 text-gray-400" />
                    New Password
                  </span>
                }
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                className="text-base"
                required
                disablePasswordToggle
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-9 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <IconEyeOff className="w-5 h-5" /> : <IconEye className="w-5 h-5" />}
              </Button>
            </div>

            {/* Password strength indicator */}
            {password && (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-gray-500">Password requirements:</p>
                <div className="space-y-1">
                  {passwordStrength.map((rule, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      {rule.passed ? (
                        <IconCheck className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <IconX className="w-3.5 h-3.5 text-gray-300" />
                      )}
                      <span className={rule.passed ? 'text-green-700' : 'text-gray-500'}>
                        {rule.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Input
              type={showPassword ? 'text' : 'password'}
              label={
                <span className="flex items-center gap-1.5">
                  <IconLock className="h-3.5 w-3.5 text-gray-400" />
                  Confirm Password
                </span>
              }
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              className="text-base"
              required
              disablePasswordToggle
            />

            {/* Match indicator */}
            {confirmPassword && (
              <div className={`flex items-center gap-2 text-xs ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                {passwordsMatch ? (
                  <>
                    <IconCheck className="w-3.5 h-3.5" />
                    <span>Passwords match</span>
                  </>
                ) : (
                  <>
                    <IconX className="w-3.5 h-3.5" />
                    <span>Passwords do not match</span>
                  </>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full text-base font-semibold shadow-sm shadow-primary-600/20 transition-transform hover:-translate-y-0.5"
              loading={loading}
              disabled={!allRulesPassed || !passwordsMatch}
            >
              Reset Password
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

export default ResetPasswordPage;
