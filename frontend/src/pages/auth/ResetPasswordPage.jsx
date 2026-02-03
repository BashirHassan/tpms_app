/**
 * Reset Password Page
 * Complete password reset with token from email
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useInstitution } from '../../context/InstitutionContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import authApi from '../../api/auth';
import { 
  IconSchool, 
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
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Password Reset Successful!</h2>
              <p className="text-gray-500 mb-6">
                Your password has been changed successfully. You can now log in with your new password.
              </p>
              <Link to="/login">
                <Button className="w-full">
                  Continue to Login
                </Button>
              </Link>
            </div>
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

        {/* Reset Password Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-100 mb-3">
              <IconLock className="w-6 h-6 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Create New Password</h2>
            <p className="text-sm text-gray-500 mt-1">
              Enter a strong password for your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                <IconAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <span>{error}</span>
                  {error.includes('expired') && (
                    <Link to="/forgot-password" className="block mt-1 text-red-600 hover:underline font-medium">
                      Request new reset link →
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                label="New Password"
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <IconEyeOff className="w-5 h-5" /> : <IconEye className="w-5 h-5" />}
              </Button>
            </div>

            {/* Password strength indicator */}
            {password && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 mb-2">Password requirements:</p>
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
              label="Confirm Password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError('');
              }}
              required
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
              className="w-full" 
              loading={loading}
              disabled={!allRulesPassed || !passwordsMatch}
            >
              Reset Password
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

export default ResetPasswordPage;
