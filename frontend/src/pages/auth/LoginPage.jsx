/**
 * Staff Login Page
 * Institution-branded login with dynamic theming
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { useBiometricLogin } from '../../hooks/useBiometricLogin';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  IconSchool,
  IconAlertCircle,
  IconBuilding,
  IconFingerprint,
  IconMail,
  IconLock,
} from '@tabler/icons-react';

function LoginPage() {
  const navigate = useNavigate();
  const { login, loginWithBiometric } = useAuth();
  const { branding, loading: brandingLoading, error: brandingError, isSuperAdminPortal } = useInstitution();
  const { toast } = useToast();
  const {
    status: biometricStatus,
    errorMessage: biometricError,
    hasLocalHint,
    loginWithFingerprint,
  } = useBiometricLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showBiometricButton, setShowBiometricButton] = useState(false);

  useEffect(() => {
    setShowBiometricButton(hasLocalHint());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBiometricLogin = async () => {
    setError('');
    const loginData = await loginWithFingerprint();
    // On failure, the hook's own `biometricError` state (rendered below)
    // already reflects why - nothing more to do here.
    if (!loginData) return;

    try {
      await loginWithBiometric(loginData);
      toast.success('Login successful!');
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please use your password.');
    }
  };

  // Show institution not found error (only if we have a subdomain and it's invalid)
  if (brandingError && !isSuperAdminPortal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 mb-4">
            <IconBuilding className="w-10 h-10 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Institution Not Found</h1>
          <p className="text-gray-500 mb-6">
            The institution you&apos;re looking for doesn&apos;t exist or is no longer active.
          </p>
          <p className="text-sm text-gray-400">
            Please check the URL and try again.
          </p>
        </div>
      </div>
    );
  }

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

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      await login(email, password);
      toast.success('Login successful!');
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-50 flex items-center justify-center px-4 py-12">
      {/* Soft decorative backdrop */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-secondary-100/60 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        {/* Institution Logo/Branding */}
        <div className="mb-4 text-center">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.name}
              className="mx-auto mb-2 h-20 w-20 rounded-2xl object-contain ring-gray-100"
            />
          ) : (
            <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 shadow-md">
              <IconSchool className="h-10 w-10 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{branding.name}</h1>
          <p className="text-gray-500">{branding.tagline || 'Teaching Practice Management System'}</p>
        </div>

        {/* Login Form */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/60">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">Welcome back</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in to your staff account to continue</p>
          </div>

          {showBiometricButton && (
            <div className="mb-6">
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 gap-2 rounded-xl border-gray-200 hover:border-primary-300 hover:bg-primary-50"
                onClick={handleBiometricLogin}
                loading={biometricStatus === 'authenticating'}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                  <IconFingerprint className="h-3.5 w-3.5" />
                </span>
                Login with Fingerprint
              </Button>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-medium tracking-wide text-gray-400">OR CONTINUE WITH PASSWORD</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || biometricError) && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <IconAlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error || biometricError}</span>
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
              placeholder="you@institution.edu.ng"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              className="text-base"
              required
            />

            <Input
              type="password"
              label={
                <span className="flex w-full items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <IconLock className="h-3.5 w-3.5 text-gray-400" />
                    Password
                  </span>
                  <Link to="/forgot-password" className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline">
                    Forgot password?
                  </Link>
                </span>
              }
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              className="text-base"
              required
            />

            <Button
              type="submit"
              className="w-full text-base font-semibold shadow-sm shadow-primary-600/20 transition-transform hover:-translate-y-0.5"
              loading={loading}
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              Are you a student?{' '}
              <Link to="/student/login" className="font-medium text-primary-600 hover:text-primary-700 hover:underline">
                Student Login
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-4 text-center text-xs text-gray-400">
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

export default LoginPage;
