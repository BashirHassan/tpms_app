/**
 * Create Institution Page
 * Multi-step form for creating new institutions with full provisioning
 * 
 * Steps mirror the Institution Settings tabs:
 * 1. Institution Information
 * 2. Branding
 * 3. SMTP Email
 * 4. Payment
 * 5. General Settings
 * 6. Summary (Review & Create)
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/helpers';
import { institutionsApi } from '../../api/institutions';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Stepper, Step, StepContent, StepActions } from '../../components/ui/Stepper';
import {
  InstitutionInfoForm,
  BrandingForm,
  SmtpForm,
  PaymentForm,
  GeneralForm,
  INSTITUTION_TYPES,
} from '../../components/forms/InstitutionFormSections';
import {
  IconBuilding,
  IconPalette,
  IconMail,
  IconCreditCard,
  IconSettings,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconArrowLeft,
  IconRocket,
} from '@tabler/icons-react';

// Form steps configuration - mirrors EditInstitutionPage tabs + Admin + Summary
const STEPS = [
  { id: 1, title: 'Institution', description: 'Basic info', icon: IconBuilding },
  { id: 2, title: 'Branding', description: 'Logo & colors', icon: IconPalette },
  { id: 3, title: 'Email', description: 'SMTP config', icon: IconMail },
  { id: 4, title: 'Payment', description: 'Paystack', icon: IconCreditCard },
  { id: 5, title: 'General', description: 'Settings', icon: IconSettings },
  { id: 6, title: 'Summary', description: 'Review', icon: IconCheck },
];

// Default form data for all sections
const DEFAULT_FORM_DATA = {
  // Institution Info
  name: '',
  code: '',
  subdomain: '',
  institution_type: 'college_of_education',
  email: '',
  phone: '',
  address: '',
  state: '',
  // Branding
  logo_url: '',
  primary_color: '#1a5f2a',
  secondary_color: '#8b4513',
  // SMTP
  smtp_host: '',
  smtp_port: 465,
  smtp_secure: true,
  smtp_user: '',
  smtp_password: '',
  smtp_from_name: '',
  smtp_from_email: '',
  // Payment
  payment_type: 'per_student',
  base_amount: 0,
  currency: 'NGN',
  allow_partial_payment: false,
  minimum_payment_percentage: 100,
  program_pricing: {},
  paystack_public_key: '',
  paystack_secret_key: '',
  paystack_split_code: '',
  // General
  maintenance_mode: false,
  maintenance_message: '',
  allow_student_portal: true,
  require_pin_change: true,
  session_timeout_minutes: 1440,
};

export default function CreateInstitutionPage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [formErrors, setFormErrors] = useState({});

  // Handle form input change
  const handleInputChange = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error on change
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }));
    }
  }, [formErrors]);

  // Validate step before proceeding
  const validateStep = (step) => {
    const errors = {};

    switch (step) {
      case 0: // Institution Info
        if (!formData.name?.trim()) {
          errors.name = 'Institution name is required';
        }
        if (!formData.code?.trim()) {
          errors.code = 'Institution code is required';
        } else if (!/^[A-Z0-9_-]+$/i.test(formData.code)) {
          errors.code = 'Code must contain only letters, numbers, hyphens, and underscores';
        }
        if (!formData.email?.trim()) {
          errors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          errors.email = 'Invalid email format';
        }
        break;

      case 1: // Branding - optional
        if (formData.primary_color && !/^#[0-9A-Fa-f]{6}$/.test(formData.primary_color)) {
          errors.primary_color = 'Invalid color format (use #RRGGBB)';
        }
        if (formData.secondary_color && !/^#[0-9A-Fa-f]{6}$/.test(formData.secondary_color)) {
          errors.secondary_color = 'Invalid color format (use #RRGGBB)';
        }
        break;

      case 2: // SMTP - optional
        // No required fields, but validate email format if provided
        if (formData.smtp_from_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.smtp_from_email)) {
          errors.smtp_from_email = 'Invalid from email format';
        }
        break;

      case 3: // Payment - optional
        // No required fields
        break;

      case 4: // General - optional
        // No required fields
        break;

      case 5: // Summary - no validation needed
        break;

      default:
        break;
    }

    setFormErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the errors before proceeding');
      return false;
    }
    
    return true;
  };

  // Handle step navigation
  const goToStep = (step) => {
    if (step < currentStep || validateStep(currentStep)) {
      setCurrentStep(step);
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // Get step status for stepper
  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentStep) return 'complete';
    if (stepIndex === currentStep) return 'current';
    return 'upcoming';
  };



  // Handle form submission
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await institutionsApi.provision({
        // Institution data
        name: formData.name.trim(),
        code: formData.code.toUpperCase().trim(),
        subdomain: formData.subdomain?.toLowerCase().trim() || null,
        institution_type: formData.institution_type,
        email: formData.email.trim(),
        phone: formData.phone?.trim() || null,
        address: formData.address?.trim() || null,
        state: formData.state || null,
        logo_url: formData.logo_url?.trim() || null,
        primary_color: formData.primary_color,
        secondary_color: formData.secondary_color,
        // SMTP data
        smtp_host: formData.smtp_host?.trim() || null,
        smtp_port: formData.smtp_port || 465,
        smtp_secure: formData.smtp_secure,
        smtp_user: formData.smtp_user?.trim() || null,
        smtp_password: formData.smtp_password || null,
        smtp_from_name: formData.smtp_from_name?.trim() || null,
        smtp_from_email: formData.smtp_from_email?.trim() || null,
        // Payment data
        payment_type: formData.payment_type,
        base_amount: parseFloat(formData.base_amount) || 0,
        currency: formData.currency,
        allow_partial_payment: formData.allow_partial_payment,
        minimum_payment_percentage: parseFloat(formData.minimum_payment_percentage) || 100,
        paystack_public_key: formData.paystack_public_key?.trim() || null,
        paystack_secret_key: formData.paystack_secret_key?.trim() || null,
        paystack_split_code: formData.paystack_split_code?.trim() || null,
        // General data
        maintenance_mode: formData.maintenance_mode,
        maintenance_message: formData.maintenance_message?.trim() || null,
        allow_student_portal: formData.allow_student_portal,
        require_pin_change: formData.require_pin_change,
        session_timeout_minutes: formData.session_timeout_minutes || 1440,
      });

      toast.success('Institution created successfully!');
      navigate('/admin/institutions');
    } catch (err) {
      console.error('Failed to create institution:', err);
      const message = err.response?.data?.message || 'Failed to create institution';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Access check
  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <IconBuilding className="w-16 h-16 mx-auto text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">Only Super Admin can create institutions.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            <IconArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3 sm:space-y-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/institutions')} className="active:scale-95">
          <IconArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Back to Institutions</span>
        </Button>
      </div>

      <div className="text-center">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
          Create New Institution
        </h1>
        <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-gray-600">
          Complete all steps to provision a new institution
        </p>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-4 md:p-6 overflow-x-auto">
        <Stepper currentStep={currentStep}>
          {STEPS.map((step, index) => (
            <Step
              key={step.id}
              step={step.id}
              title={step.title}
              description={step.description}
              status={getStepStatus(index)}
              isLast={index === STEPS.length - 1}
              onClick={() => goToStep(index)}
              disabled={index > currentStep}
            />
          ))}
        </Stepper>
      </div>

      {/* Step Content */}
      <Card className="shadow-lg">
        <CardContent className="p-6">
          {/* Step 1: Institution Info */}
          <StepContent isActive={currentStep === 0}>
            <InstitutionInfoForm
              data={formData}
              onChange={handleInputChange}
              errors={formErrors}
              isEditing={false}
            />
          </StepContent>

          {/* Step 2: Branding */}
          <StepContent isActive={currentStep === 1}>
            <BrandingForm
              data={formData}
              onChange={handleInputChange}
              errors={formErrors}
              institutionCode={formData.code}
            />
          </StepContent>

          {/* Step 3: SMTP */}
          <StepContent isActive={currentStep === 2}>
            <SmtpForm
              data={formData}
              onChange={handleInputChange}
            />
          </StepContent>

          {/* Step 4: Payment */}
          <StepContent isActive={currentStep === 3}>
            <PaymentForm
              data={formData}
              onChange={handleInputChange}
              formatCurrency={formatCurrency}
            />
          </StepContent>

          {/* Step 5: General */}
          <StepContent isActive={currentStep === 4}>
            <GeneralForm
              data={formData}
              onChange={handleInputChange}
            />
          </StepContent>

          {/* Step 6: Summary */}
          <StepContent isActive={currentStep === 5}>
            <SummaryStep formData={formData} formatCurrency={formatCurrency} />
          </StepContent>

          {/* Navigation */}
          <StepActions>
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="gap-2"
            >
              <IconChevronLeft className="w-4 h-4" />
              Previous
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep} className="gap-2">
                Next
                <IconChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                loading={submitting}
                className="gap-2 min-w-[180px]"
              >
                <IconRocket className="w-4 h-4" />
                Create Institution
              </Button>
            )}
          </StepActions>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Summary Step Component
// =============================================================================

function SummaryStep({ formData, formatCurrency }) {
  const getInstitutionTypeLabel = (value) => {
    return INSTITUTION_TYPES.find((t) => t.value === value)?.label || value;
  };

  const Section = ({ icon: Icon, title, children }) => (
    <div className="bg-gray-50 rounded-lg p-4">
      <h4 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" />
        {title}
      </h4>
      {children}
    </div>
  );

  const Field = ({ label, value, className = '' }) => (
    <div className={className}>
      <span className="text-gray-500">{label}:</span>
      <span className="ml-2 font-medium text-gray-900">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
          <IconCheck className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Review & Create</h3>
          <p className="text-sm text-gray-500">
            Review all information before creating the institution
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
        <IconRocket className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-green-800">
          <p className="font-medium">Ready to provision</p>
          <p className="mt-1">
            This will create the institution, configure all settings, enable default features,
            and initialize an academic session. You can add admin users from the Users page after creation.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Institution Details */}
        <Section icon={IconBuilding} title="Institution Details">
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Field label="Name" value={formData.name} />
            <Field label="Code" value={formData.code?.toUpperCase()} />
            <Field label="Type" value={getInstitutionTypeLabel(formData.institution_type)} />
            <Field label="State" value={formData.state} />
            <Field label="Email" value={formData.email} />
            <Field label="Phone" value={formData.phone} />
            <Field label="Address" value={formData.address} className="md:col-span-2" />
          </div>
        </Section>

        {/* Branding */}
        <Section icon={IconPalette} title="Branding">
          <div className="space-y-3">
            {formData.logo_url && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Logo:</span>
                <img
                  src={formData.logo_url}
                  alt="Logo"
                  className="h-10 object-contain"
                  onError={(e) => (e.target.style.display = 'none')}
                />
              </div>
            )}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">Colors:</span>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded border border-gray-200"
                  style={{ backgroundColor: formData.primary_color }}
                />
                <span className="text-xs text-gray-500">{formData.primary_color}</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded border border-gray-200"
                  style={{ backgroundColor: formData.secondary_color }}
                />
                <span className="text-xs text-gray-500">{formData.secondary_color}</span>
              </div>
            </div>
          </div>
        </Section>

        {/* SMTP */}
        <Section icon={IconMail} title="Email (SMTP)">
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Field label="Host" value={formData.smtp_host} />
            <Field label="Port" value={formData.smtp_port} />
            <Field label="Username" value={formData.smtp_user} />
            <Field label="Secure" value={formData.smtp_secure ? 'Yes (SSL/TLS)' : 'No'} />
            <Field label="From Name" value={formData.smtp_from_name} />
            <Field label="From Email" value={formData.smtp_from_email} />
          </div>
        </Section>

        {/* Payment */}
        <Section icon={IconCreditCard} title="Payment">
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Field 
              label="Type" 
              value={formData.payment_type === 'per_student' ? 'Per Student' : 'Per Session (Bulk)'} 
            />
            {formData.payment_type === 'per_student' && (
              <>
                <Field label="Base Amount" value={formatCurrency(formData.base_amount, formData.currency)} />
                <Field label="Currency" value={formData.currency} />
                <Field label="Allow Partial" value={formData.allow_partial_payment ? 'Yes' : 'No'} />
                {formData.allow_partial_payment && (
                  <Field label="Min. Percentage" value={`${formData.minimum_payment_percentage}%`} />
                )}
                <Field label="Paystack Public" value={formData.paystack_public_key ? '••••••••' : 'Not configured'} />
                <Field label="Paystack Secret" value={formData.paystack_secret_key ? '••••••••' : 'Not configured'} />
              </>
            )}
          </div>
        </Section>

        {/* General */}
        <Section icon={IconSettings} title="General Settings">
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <Field label="Maintenance Mode" value={formData.maintenance_mode ? 'Enabled' : 'Disabled'} />
            <Field label="Student Portal" value={formData.allow_student_portal ? 'Enabled' : 'Disabled'} />
            <Field label="Require PIN Change" value={formData.require_pin_change ? 'Yes' : 'No'} />
            <Field label="Session Timeout" value={`${formData.session_timeout_minutes} minutes`} />
          </div>
        </Section>
      </div>
    </div>
  );
}
