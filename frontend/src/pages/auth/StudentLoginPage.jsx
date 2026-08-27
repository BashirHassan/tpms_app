/**
 * Student Login Page
 * Institution-branded student login with dynamic theming
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { IconSchool, IconAlertCircle, IconBuilding, IconId, IconLock } from '@tabler/icons-react';

function StudentLoginPage() {
  const navigate = useNavigate();
  const { studentLogin } = useAuth();
  const { branding, loading: brandingLoading, error: brandingError, isSuperAdminPortal } = useInstitution();
  const { toast } = useToast();

  const [registrationNumber, setRegistrationNumber] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

    if (!registrationNumber || !pin) {
      setError('Please fill in all fields');
      return;
    }

    if (pin.length !== 10) {
      setError('PIN must be 10 digits');
      return;
    }

    setLoading(true);

    try {
      await studentLogin(registrationNumber, pin);
      toast.success('Login successful!');
      navigate('/student/dashboard');
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
              className="mx-auto mb-4 h-20 w-20 rounded-2xl bg-white object-contain p-2 shadow-md ring-1 ring-gray-100"
            />
          ) : (
            <div className="mx-auto mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-primary-600 shadow-md">
              <IconSchool className="h-10 w-10 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{branding.name}</h1>
          <p className="mt-1 text-gray-500">Student Portal</p>
        </div>

        {/* Login Form */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 sm:p-8 shadow-xl shadow-gray-200/60">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900">Student Login</h2>
            <p className="mt-1 text-sm text-gray-500">Sign in with your registration number and PIN</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <IconAlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              type="text"
              label={
                <span className="flex items-center gap-1.5">
                  <IconId className="h-3.5 w-3.5 text-gray-400" />
                  Registration Number
                </span>
              }
              placeholder="e.g., NCE/2024/MATH/001"
              value={registrationNumber}
              onChange={(e) => {
                setRegistrationNumber(e.target.value.toUpperCase());
                setError('');
              }}
              className="text-base"
              required
            />

            <Input
              type="password"
              label={
                <span className="flex items-center gap-1.5">
                  <IconLock className="h-3.5 w-3.5 text-gray-400" />
                  PIN
                </span>
              }
              placeholder="10-digit PIN"
              maxLength={10}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
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
              Are you staff?{' '}
              <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700 hover:underline">
                Staff Login
              </Link>
            </p>
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

export default StudentLoginPage;
