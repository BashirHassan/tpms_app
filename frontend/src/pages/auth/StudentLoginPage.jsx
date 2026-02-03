/**
 * Student Login Page
 * Institution-branded student login with dynamic theming
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { IconSchool, IconAlertCircle, IconBuilding } from '@tabler/icons-react';

function StudentLoginPage() {
  const navigate = useNavigate();
  const { studentLogin } = useAuth();
  const { branding, institution, loading: brandingLoading, error: brandingError, isSuperAdminPortal } = useInstitution();
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Institution Logo/Branding */}
        <div className="text-center mb-8">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt={branding.name}
              className="w-16 h-16 mx-auto mb-4 object-contain rounded-2xl"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-600 mb-4">
              <IconSchool className="w-10 h-10 text-white" />
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{branding.name}</h1>
          <p className="text-gray-500 mt-1">Student Portal</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Student Login</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <IconAlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Input
              type="text"
              label="Registration Number"
              placeholder="e.g., NCE/2024/MATH/001"
              value={registrationNumber}
              onChange={(e) => {
                setRegistrationNumber(e.target.value.toUpperCase());
                setError('');
              }}
              required
            />

            <Input
              type="password"
              label="PIN"
              placeholder="10-digit PIN"
              maxLength={10}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              required
            />

            <Button type="submit" className="w-full" loading={loading}>
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              Are you staff?{' '}
              <Link to="/login" className="text-primary-600 hover:underline font-medium">
                Staff Login
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-sm text-gray-400">
          <p>Powered by DigitalTP</p>
        </div>
      </div>
    </div>
  );
}

export default StudentLoginPage;
