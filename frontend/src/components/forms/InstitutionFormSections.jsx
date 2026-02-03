/**
 * Institution Form Sections
 * Reusable form components for institution settings and creation
 * 
 * Used by:
 * - EditInstitutionPage (super admin editing any institution)
 * - CreateInstitutionPage (creating new institution with stepper)
 */

import { useState, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { SecureSensitiveInput } from '../ui/SecureSensitiveInput';
import { AlertDialog } from '../ui/AlertDialog';
import { institutionsApi } from '../../api/institutions';
import { formatFileSize } from '../../utils/helpers';
import { getStates } from '../../data/nigeria';
import {
  IconBuilding,
  IconPalette,
  IconMail,
  IconCreditCard,
  IconSettings,
  IconUser,
  IconPhone,
  IconMapPin,
  IconAlertCircle,
  IconInfoCircle,
  IconShieldCheck,
  IconEye,
  IconEyeOff,
  IconUpload,
  IconPhoto,
  IconX,
  IconCheck,
  IconLoader2,
} from '@tabler/icons-react';

// ============================================================================
// CONSTANTS
// ============================================================================

export const INSTITUTION_TYPES = [
  { value: 'college_of_education', label: 'College of Education' },
  { value: 'university', label: 'University' },
  { value: 'polytechnic', label: 'Polytechnic' },
  { value: 'other', label: 'Other' },
];



// Simple Switch component
export const Switch = ({ checked, onCheckedChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => !disabled && onCheckedChange?.(!checked)}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
      checked ? 'bg-primary-600' : 'bg-gray-200'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

// Simple Textarea component
export const Textarea = ({ className = '', ...props }) => (
  <textarea
    className={`flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

// ============================================================================
// INSTITUTION INFO FORM
// ============================================================================

/**
 * Institution Information Form Section
 * @param {Object} data - Form data object
 * @param {Function} onChange - Change handler (field, value)
 * @param {Object} errors - Form errors object
 * @param {boolean} isEditing - If true, code field is disabled
 */
export function InstitutionInfoForm({ 
  data, 
  onChange, 
  errors = {}, 
  isEditing = false,
}) {
  const [locationAlert, setLocationAlert] = useState({
    isOpen: false,
    message: '',
  });

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          onChange('latitude', position.coords.latitude);
          onChange('longitude', position.coords.longitude);
        },
        (error) => {
          console.error('Geolocation error:', error);
          setLocationAlert({
            isOpen: true,
            message: 'Unable to get current location. Please enter coordinates manually.',
          });
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLocationAlert({
        isOpen: true,
        message: 'Geolocation is not supported by this browser.',
      });
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconBuilding className="w-5 h-5 text-gray-400" />
          <CardTitle>Institution Information</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Institution Name *"
              value={data.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="e.g., Federal University of Technology"
              error={errors.name}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Input
                label="Institution Code *"
                value={data.code || ''}
                onChange={(e) => onChange('code', e.target.value.toUpperCase())}
                placeholder="e.g., FUT"
                maxLength={20}
                disabled={isEditing}
                error={errors.code}
              />
              {errors.code && <p className="mt-1 text-sm text-red-600">{errors.code}</p>}
              {!isEditing && (
                <p className="mt-1 text-xs text-gray-500">
                  Unique code (letters, numbers, hyphens, underscores only)
                </p>
              )}
            </div>
            <div>
              <Input
                label="Subdomain"
                value={data.subdomain || ''}
                onChange={(e) => onChange('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g., fcezaria"
                disabled={isEditing}
                error={errors.subdomain}
              />
              {errors.subdomain && <p className="mt-1 text-sm text-red-600">{errors.subdomain}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Institution Type *
            </label>
            <Select
              value={data.institution_type || 'college_of_education'}
              onChange={(e) => onChange('institution_type', e.target.value)}
              className="w-full"
            >
              {INSTITUTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
            {errors.institution_type && (
              <p className="mt-1 text-sm text-red-600">{errors.institution_type}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <Select
              value={data.state || ''}
              onChange={(e) => onChange('state', e.target.value)}
              className="w-full"
            >
              <option value="">Select state...</option>
              {getStates().map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address {!isEditing && '*'}
            </label>
            <div className="relative">
              <IconMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="email"
                value={data.email || ''}
                onChange={(e) => onChange('email', e.target.value)}
                className="pl-10"
                placeholder="info@institution.edu.ng"
                error={errors.email}
              />
            </div>
            {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <div className="relative">
              <IconPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="tel"
                value={data.phone || ''}
                onChange={(e) => onChange('phone', e.target.value)}
                className="pl-10"
                placeholder="+234 800 000 0000"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Address
          </label>
          <div className="relative">
            <IconMapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Textarea
              value={data.address || ''}
              onChange={(e) => onChange('address', e.target.value)}
              className="pl-10"
              rows={2}
              placeholder="Institution address..."
            />
          </div>
        </div>

        {/* TP Unit Name */}
        <div>
          <Input
            label="TP Unit Name"
            value={data.tp_unit_name || ''}
            onChange={(e) => onChange('tp_unit_name', e.target.value)}
            placeholder="e.g., Teaching Practice Coordination Unit"
          />
          <p className="mt-1 text-xs text-gray-500">
            Name of the Teaching Practice unit displayed on documents. Defaults to &quot;Teaching Practice Coordination Unit&quot;.
          </p>
        </div>

        {/* GPS Location Section */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-sm font-medium text-gray-700">GPS Location</h4>
              <p className="text-xs text-gray-500">Used to calculate distances to schools for inside/outside classification</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleGetLocation}
              className="text-xs gap-1"
            >
              <IconMapPin className="w-3.5 h-3.5" />
              Get Current Location
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                label="Latitude"
                type="number"
                step="any"
                value={data.latitude ?? ''}
                onChange={(e) => onChange('latitude', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="e.g., 9.0820"
                min={-90}
                max={90}
              />
            </div>
            <div>
              <Input
                label="Longitude"
                type="number"
                step="any"
                value={data.longitude ?? ''}
                onChange={(e) => onChange('longitude', e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="e.g., 8.6753"
                min={-180}
                max={180}
              />
            </div>
          </div>
          {data.latitude && data.longitude && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-green-600 flex items-center gap-1">
                <IconMapPin className="w-3.5 h-3.5" />
                Location set: {parseFloat(data.latitude).toFixed(6)}, {parseFloat(data.longitude).toFixed(6)}
              </span>
              <a
                href={`https://www.google.com/maps?q=${data.latitude},${data.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:underline"
              >
                View on Google Maps
              </a>
            </div>
          )}
        </div>

      </CardContent>
    </Card>

    {/* Location Alert Dialog */}
    <AlertDialog
      isOpen={locationAlert.isOpen}
      onClose={() => setLocationAlert({ isOpen: false, message: '' })}
      title="Location Error"
      message={locationAlert.message}
      variant="warning"
    />
    </>
  );
}

// ============================================================================
// BRANDING FORM
// ============================================================================

/**
 * Branding Form Section
 * @param {Object} data - Form data object with logo_url, primary_color, secondary_color
 * @param {Function} onChange - Change handler (field, value)
 * @param {Object} errors - Form errors object
 * @param {string} institutionCode - Institution code for Cloudinary folder (optional)
 */
export function BrandingForm({ data, onChange, errors = {}, institutionCode }) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.');
      e.target.value = '';
      return;
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError(`File too large (${formatFileSize(file.size)}). Maximum size is 2MB.`);
      e.target.value = '';
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      // Pass old logo URL for cleanup when replacing
      const oldLogoUrl = data.logo_url || null;
      const response = await institutionsApi.uploadLogo(
        file, 
        institutionCode || data.code || 'NEW',
        oldLogoUrl
      );
      const responseData = response.data.data || response.data || {};
      const { url } = responseData;
      onChange('logo_url', url);
    } catch (err) {
      console.error('Logo upload failed:', err);
      setUploadError(err.response?.data?.message || 'Failed to upload logo. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [onChange, institutionCode, data.code]);

  const handleClearLogo = () => {
    onChange('logo_url', '');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconPalette className="w-5 h-5 text-gray-400" />
          <CardTitle>Branding</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Logo Upload Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Institution Logo
          </label>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".jpg,.jpeg,.png,.gif,.webp,.svg"
            className="hidden"
          />

          {data.logo_url ? (
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white shadow-sm">
              {/* Header bar */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/80 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs font-medium text-gray-600">Logo uploaded</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearLogo}
                  className="text-xs text-gray-400 hover:text-red-500 gap-1"
                  title="Remove logo"
                >
                  <IconX className="w-3.5 h-3.5" />
                  Remove
                </Button>
              </div>
              
              {/* Logo preview area */}
              <div className="p-6 flex flex-col items-center gap-4">
                <div className="relative group">
                  {/* Decorative background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary-100/50 to-secondary-100/50 rounded-2xl blur-xl opacity-60"></div>
                  
                  {/* Logo container */}
                  <div className="relative bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <img
                      src={data.logo_url}
                      alt="Institution Logo"
                      className="h-20 max-w-[240px] object-contain"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '';
                        e.target.alt = 'Failed to load image';
                      }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <>
                        <IconLoader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <IconUpload className="w-4 h-4" />
                        Replace Logo
                      </>
                    )}
                  </Button>
                </div>

                {/* File info */}
                <p className="text-xs text-gray-400">
                  Accepts JPG, PNG, GIF, WebP, SVG • Max 2MB
                </p>
              </div>
            </div>

          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full h-auto p-0 relative overflow-hidden rounded-xl border-2 border-dashed border-gray-200 hover:border-primary-400 bg-gradient-to-br from-gray-50/50 to-white transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Decorative gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              
              <div className="relative py-8 px-6 flex flex-col items-center gap-4 w-full">
                {uploading ? (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-primary-100 flex items-center justify-center shadow-sm">
                      <IconLoader2 className="w-8 h-8 text-primary-600 animate-spin" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-primary-700">Uploading your logo...</p>
                      <p className="text-xs text-gray-500 mt-1">Please wait</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 group-hover:bg-primary-100 flex items-center justify-center shadow-sm group-hover:shadow transition-all group-hover:scale-105">
                      <IconPhoto className="w-8 h-8 text-gray-400 group-hover:text-primary-600 transition-colors" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-gray-700 group-hover:text-primary-700 transition-colors">
                        Upload Institution Logo
                      </p>
                      <p className="text-xs text-gray-400 mt-1.5">
                        Drag and drop or click to browse
                      </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100/80 group-hover:bg-primary-100/80 rounded-full transition-colors">
                      <IconUpload className="w-3.5 h-3.5 text-gray-500 group-hover:text-primary-600" />
                      <span className="text-xs font-medium text-gray-600 group-hover:text-primary-700">
                        JPG, PNG, GIF, WebP, SVG • Max 2MB
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Button>
          )}

          {uploadError && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
              <IconAlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Manual URL Input (fallback) */}
          <div className="mt-3">
            <details className="group">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                Or enter logo URL manually
              </summary>
              <div className="mt-2">
                <Input
                  value={data.logo_url || ''}
                  onChange={(e) => onChange('logo_url', e.target.value)}
                  placeholder="https://your-domain.com/logo.png"
                  className="text-sm"
                />
              </div>
            </details>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Primary Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={data.primary_color || '#1a5f2a'}
                onChange={(e) => onChange('primary_color', e.target.value)}
                className="w-12 h-10 rounded cursor-pointer border border-gray-300"
              />
              <Input
                value={data.primary_color || '#1a5f2a'}
                onChange={(e) => onChange('primary_color', e.target.value)}
                placeholder="#1a5f2a"
                maxLength={7}
              />
            </div>
            {errors.primary_color && (
              <p className="mt-1 text-sm text-red-600">{errors.primary_color}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Secondary Color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={data.secondary_color || '#8b4513'}
                onChange={(e) => onChange('secondary_color', e.target.value)}
                className="w-12 h-10 rounded cursor-pointer border border-gray-300"
              />
              <Input
                value={data.secondary_color || '#8b4513'}
                onChange={(e) => onChange('secondary_color', e.target.value)}
                placeholder="#8b4513"
                maxLength={7}
              />
            </div>
            {errors.secondary_color && (
              <p className="mt-1 text-sm text-red-600">{errors.secondary_color}</p>
            )}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Color Preview</p>
          <div className="flex gap-4">
            <div
              className="w-24 h-12 rounded-lg flex items-center justify-center text-sm font-medium shadow-sm text-white"
              style={{ backgroundColor: data.primary_color || '#1a5f2a' }}
            >
              Primary
            </div>
            <div
              className="w-24 h-12 rounded-lg flex items-center justify-center text-sm font-medium shadow-sm text-white"
              style={{ backgroundColor: data.secondary_color || '#8b4513' }}
            >
              Secondary
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// SMTP FORM
// ============================================================================

/**
 * SMTP Email Configuration Form Section
 * @param {Object} data - Form data object
 * @param {Function} onChange - Change handler (field, value)
 * @param {Function} onTest - Test SMTP connection handler (testEmail) => void (optional)
 * @param {boolean} testing - If SMTP test is in progress
 * @param {string} testResult - Result message from SMTP test (optional)
 * @param {string} testResultType - 'success' or 'error' (optional)
 */
export function SmtpForm({ data, onChange, onTest, testing = false, testResult, testResultType }) {
  const [showTestInput, setShowTestInput] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  const handleTestClick = () => {
    if (!showTestInput) {
      setShowTestInput(true);
      return;
    }
    
    if (testEmail && onTest) {
      onTest(testEmail);
    }
  };

  const handleCancelTest = () => {
    setShowTestInput(false);
    setTestEmail('');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconMail className="w-5 h-5 text-gray-400" />
          <CardTitle>SMTP Email Configuration</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Configure your SMTP server to enable email notifications,
            password resets, and posting letters. Common providers: Gmail, SendGrid, Mailgun.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="SMTP Host"
            value={data.smtp_host || ''}
            onChange={(e) => onChange('smtp_host', e.target.value)}
            placeholder="smtp.example.com"
          />
          <div>
            <Input
              label="Port"
              type="number"
              value={data.smtp_port || 465}
              onChange={(e) => onChange('smtp_port', parseInt(e.target.value) || 465)}
              placeholder="465"
            />
            <p className="text-xs text-gray-500 mt-1">
              Common ports: 465 (SSL), 587 (TLS), 25
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div>
            <p className="font-medium">Use SSL/TLS</p>
            <p className="text-sm text-gray-500">
              Enable secure connection (recommended for port 465)
            </p>
          </div>
          <Switch
            checked={data.smtp_secure !== false}
            onCheckedChange={(checked) => onChange('smtp_secure', checked)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="SMTP Username"
            value={data.smtp_user || ''}
            onChange={(e) => onChange('smtp_user', e.target.value)}
            placeholder="your@email.com"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              SMTP Password
            </label>
            <SecureSensitiveInput
              value={data.smtp_password || ''}
              onChange={(value) => onChange('smtp_password', value)}
              placeholder="Enter SMTP password"
              preventCopy
            />
            <p className="text-xs text-gray-500 mt-1">
              Your SMTP password is encrypted at rest.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="From Name"
            value={data.smtp_from_name || ''}
            onChange={(e) => onChange('smtp_from_name', e.target.value)}
            placeholder="DigitalTP"
          />
          <Input
            label="From Email"
            type="email"
            value={data.smtp_from_email || ''}
            onChange={(e) => onChange('smtp_from_email', e.target.value)}
            placeholder="noreply@institution.edu.ng"
          />
        </div>

        {onTest && (
          <div className="pt-4 border-t">
            {showTestInput ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Send test email to:
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="flex-1"
                      disabled={testing}
                    />
                    <Button
                      type="button"
                      onClick={handleTestClick}
                      disabled={testing || !testEmail}
                      variant="primary"
                      className="whitespace-nowrap"
                    >
                      {testing ? (
                        <>
                          <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <IconMail className="w-4 h-4 mr-2" />
                          Send Test
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleCancelTest}
                      variant="outline"
                      disabled={testing}
                    >
                      <IconX className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    A test email will be sent using the <strong>saved</strong> SMTP settings. Save your settings first if you made changes.
                  </p>
                </div>
                
                {/* Test result message */}
                {testResult && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg ${
                    testResultType === 'success' 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    {testResultType === 'success' ? (
                      <IconCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <IconAlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <p className={`text-sm ${
                      testResultType === 'success' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {testResult}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={handleTestClick}
                disabled={testing || !data.smtp_host || !data.smtp_user}
              >
                <IconMail className="w-4 h-4 mr-2" />
                Test SMTP Connection
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// PAYMENT FORM
// ============================================================================

/**
 * Payment Configuration Form Section
 * @param {Object} data - Payment config data
 * @param {Function} onChange - Change handler (field, value)
 * @param {Function} onProgramPricingChange - Handler for program pricing (programId, value)
 * @param {Array} programs - List of programs for program-specific pricing
 * @param {Function} onTest - Test Paystack connection handler (optional)
 * @param {boolean} testing - If Paystack test is in progress
 * @param {Function} formatCurrency - Currency formatter function
 */
export function PaymentForm({
  data,
  onChange,
  onProgramPricingChange,
  programs = [],
  onTest,
  testing = false,
  formatCurrency = (amount) => `₦${amount?.toLocaleString() || 0}`,
}) {
  return (
    <div className="space-y-4">
      {/* Payment Type Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <IconCreditCard className="w-5 h-5 text-gray-400" />
            <CardTitle>Payment Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Type</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => onChange('payment_type', 'per_student')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  data.payment_type === 'per_student'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium">Per Student</p>
                <p className="text-sm text-gray-500">Each student pays individually</p>
              </div>
              <div
                onClick={() => onChange('payment_type', 'per_session')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  data.payment_type === 'per_session'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-medium">Per Session (Bulk)</p>
                <p className="text-sm text-gray-500">Institution pays in bulk, students not charged</p>
              </div>
            </div>
          </div>

          {data.payment_type === 'per_session' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <IconAlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Institution Pays Per Session</p>
                  <p className="text-sm text-blue-600">
                    When this is selected, students will not be charged any fees. The institution
                    handles payment in bulk. Payment buttons will be hidden from students.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Amount Settings - only for per_student */}
      {data.payment_type === 'per_student' && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Amounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Amount</label>
                <Input
                  type="number"
                  value={data.base_amount || 0}
                  onChange={(e) => onChange('base_amount', parseFloat(e.target.value) || 0)}
                  min="0"
                  step="100"
                />
                <p className="text-xs text-gray-500 mt-1">Default fee for all students</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                <Select
                  value={data.currency || 'NGN'}
                  onChange={(e) => onChange('currency', e.target.value)}
                  className="w-full"
                >
                  <option value="NGN">NGN - Nigerian Naira</option>
                  <option value="USD">USD - US Dollar</option>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="allow_partial"
                checked={data.allow_partial_payment || false}
                onChange={(e) => onChange('allow_partial_payment', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <label htmlFor="allow_partial" className="text-sm font-medium text-gray-700">
                Allow Partial Payment
              </label>
            </div>

            {data.allow_partial_payment && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Payment Percentage
                </label>
                <Input
                  type="number"
                  value={data.minimum_payment_percentage || 100}
                  onChange={(e) =>
                    onChange('minimum_payment_percentage', parseFloat(e.target.value) || 0)
                  }
                  min="0"
                  max="100"
                  step="5"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum percentage of total amount students must pay initially (e.g., 50%)
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Program-Specific Pricing */}
      {data.payment_type === 'per_student' && programs.length > 0 && onProgramPricingChange && (
        <Card>
          <CardHeader>
            <CardTitle>Program-Specific Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500 mb-4">
              Override the base amount for specific programs. Leave empty to use the base amount (
              {formatCurrency(data.base_amount || 0)}).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {programs.map((program) => (
                <div key={program.id} className="flex items-center gap-2">
                  <label className="flex-1 text-sm text-gray-700">{program.name}</label>
                  <Input
                    type="number"
                    value={data.program_pricing?.[program.id] || ''}
                    onChange={(e) => onProgramPricingChange(program.id, e.target.value)}
                    placeholder={(data.base_amount || 0).toString()}
                    className="w-32"
                    min="0"
                    step="100"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paystack Integration - only for per_student */}
      {data.payment_type === 'per_student' && (
        <Card>
          <CardHeader>
            <CardTitle>Paystack Integration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-800">
                <strong>Security:</strong> API keys are encrypted and partially displayed. Leave
                empty to keep existing keys, or enter new values to replace them.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Public Key</label>
              <SecureSensitiveInput
                value={data.paystack_public_key || ''}
                onChange={(value) => onChange('paystack_public_key', value)}
                placeholder="pk_live_... or pk_test_..."
              />
              <p className="text-xs text-gray-500 mt-1">
                Get your public key from{' '}
                <a
                  href="https://dashboard.paystack.com/#/settings/developer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  Paystack Dashboard
                </a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key</label>
              <SecureSensitiveInput
                value={data.paystack_secret_key || ''}
                onChange={(value) => onChange('paystack_secret_key', value)}
                placeholder="sk_live_... or sk_test_..."
                preventCopy
              />
              <p className="text-xs text-gray-500 mt-1">Never share your secret key publicly.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Split Code (Optional)
              </label>
              <Input
                type="text"
                value={data.paystack_split_code || ''}
                onChange={(e) => onChange('paystack_split_code', e.target.value.trim())}
                placeholder="SPL_xxxxxxxxxx"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Enter a Paystack split code to automatically split payments between
                accounts.
              </p>
            </div>

            {onTest && (
              <div className="pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onTest}
                  disabled={testing}
                >
                  {testing ? 'Testing...' : 'Test Paystack Connection'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// GENERAL SETTINGS FORM
// ============================================================================

/**
 * General Settings Form Section
 * @param {Object} data - Form data object
 * @param {Function} onChange - Change handler (field, value)
 */
export function GeneralForm({ data, onChange }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconSettings className="w-5 h-5 text-gray-400" />
          <CardTitle>General Settings</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
          <div>
            <p className="font-medium text-red-700">Maintenance Mode</p>
            <p className="text-sm text-red-600">
              When enabled, the portal shows a maintenance message
            </p>
          </div>
          <Switch
            checked={data.maintenance_mode || false}
            onCheckedChange={(checked) => onChange('maintenance_mode', checked)}
          />
        </div>

        {data.maintenance_mode && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maintenance Message
            </label>
            <Textarea
              value={data.maintenance_message || ''}
              onChange={(e) => onChange('maintenance_message', e.target.value)}
              rows={3}
              placeholder="We are currently performing scheduled maintenance..."
            />
          </div>
        )}

        <div className="border-t pt-4 space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Allow Student Portal</p>
              <p className="text-sm text-gray-500">Enable student portal access</p>
            </div>
            <Switch
              checked={data.allow_student_portal !== false}
              onCheckedChange={(checked) => onChange('allow_student_portal', checked)}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium">Require PIN Change on First Login</p>
              <p className="text-sm text-gray-500">
                Students must change their PIN after first login
              </p>
            </div>
            <Switch
              checked={data.require_pin_change !== false}
              onCheckedChange={(checked) => onChange('require_pin_change', checked)}
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <Input
            label="Session Timeout (minutes)"
            type="number"
            value={data.session_timeout_minutes || 1440}
            onChange={(e) => onChange('session_timeout_minutes', parseInt(e.target.value) || 1440)}
            min={5}
            max={43200}
          />
          <p className="text-xs text-gray-500 mt-1">Default: 1440 (24 hours)</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// ADMIN USER FORM (for creating new institution)
// ============================================================================

/**
 * Admin User Form Section (for institution creation)
 * @param {Object} data - Form data object
 * @param {Function} onChange - Change handler (field, value)
 * @param {Object} errors - Form errors object
 * @param {boolean} showPassword - Whether to show password
 * @param {Function} onTogglePassword - Toggle password visibility
 */
export function AdminUserForm({ data, onChange, errors = {}, showPassword = false, onTogglePassword }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconShieldCheck className="w-5 h-5 text-gray-400" />
          <CardTitle>Admin User (Head of Teaching Practice)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <IconInfoCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Administrator account</p>
            <p className="mt-1">
              This user will be the Head of Teaching Practice for this institution and will have
              full administrative access. They can create additional staff accounts as needed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <IconUser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={data.admin_name || ''}
                onChange={(e) => onChange('admin_name', e.target.value)}
                className="pl-10"
                placeholder="Dr. John Doe"
                error={errors.admin_name}
              />
            </div>
            {errors.admin_name && (
              <p className="mt-1 text-sm text-red-600">{errors.admin_name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <IconMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="email"
                value={data.admin_email || ''}
                onChange={(e) => onChange('admin_email', e.target.value)}
                className="pl-10"
                placeholder="admin@institution.edu.ng"
                error={errors.admin_email}
              />
            </div>
            {errors.admin_email && (
              <p className="mt-1 text-sm text-red-600">{errors.admin_email}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">This email will be used for login</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <div className="relative">
              <IconPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="tel"
                value={data.admin_phone || ''}
                onChange={(e) => onChange('admin_phone', e.target.value)}
                className="pl-10"
                placeholder="+234 800 000 0000"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={data.admin_password || ''}
                onChange={(e) => onChange('admin_password', e.target.value)}
                placeholder="Enter a strong password"
                className="pr-10"
                error={errors.admin_password}
              />
              {onTogglePassword && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onTogglePassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <IconEyeOff className="w-4 h-4" />
                  ) : (
                    <IconEye className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
            {errors.admin_password && (
              <p className="mt-1 text-sm text-red-600">{errors.admin_password}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Minimum 8 characters. The admin should change this after first login.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <IconAlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Security reminder</p>
            <p className="mt-1">
              Share the login credentials securely with the admin. They should change their
              password immediately after first login.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
