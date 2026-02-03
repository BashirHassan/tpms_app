/**
 * Student Acceptance Form Page
 * Modern multi-step form for submitting acceptance with:
 * - Step 1: Preview/Print documents (Introduction Letter, Acceptance Form)
 * - Step 2: Contact & School Selection (Contact info + school choice)
 * - Step 3: Upload signed acceptance form
 * - Step 4: Review & Submit
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { acceptancesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatFileSize } from '../../utils/helpers';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent,
} from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Stepper, Step, StepContent, StepActions } from '../../components/ui/Stepper';
import { useNavigate } from 'react-router-dom';
import {
  IconBuildingBank,
  IconUpload,
  IconCheck,
  IconAlertCircle,
  IconMapPin,
  IconUser,
  IconPhone,
  IconMail,
  IconFileText,
  IconSearch,
  IconDownload,
  IconChevronLeft,
  IconChevronRight,
  IconFileCheck,
  IconBuilding,
  IconClipboardCheck,
  IconInfoCircle,
  IconPhoto,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { cn } from '../../utils/helpers';

// Form steps configuration
const STEPS = [
  { id: 1, title: 'Documents', description: 'Print forms' },
  { id: 2, title: 'Contact & School', description: 'details' },
  { id: 3, title: 'Upload', description: 'Signed form' },
  { id: 4, title: 'Review', description: 'Confirm & submit' },
];

// Nigerian phone regex - supports formats: 08012345678, +2348012345678
const PHONE_REGEX = /^(\+?234|0)?[789][01]\d{8}$/;

function AcceptanceFormPage() {
  const { user, institution } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [status, setStatus] = useState(null);
  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);

  // Form state
  const [formData, setFormData] = useState({
    phone: user?.phone || '',
    email: user?.email || '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [signedForm, setSignedForm] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Fetch status and schools
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusRes, schoolsRes] = await Promise.all([
        acceptancesApi.getStudentStatus(),
        acceptancesApi.getAvailableSchools(),
      ]);

      setStatus(statusRes.data.data);
      setSchools(schoolsRes.data.data);
    } catch (err) {
      toast.error('Failed to load acceptance form data');
    } finally {
      setLoading(false);
    }
  };

  // Validate phone number
  const validatePhone = (phone) => {
    if (!phone) return 'Phone number is required';
    if (!PHONE_REGEX.test(phone.replace(/\s/g, ''))) {
      return 'Please enter a valid Nigerian phone number';
    }
    return null;
  };

  // Validate step before proceeding
  const validateStep = (step) => {
    const errors = {};

    switch (step) {
      case 0: // Documents - no validation needed
        break;

      case 1: // Contact Info & School Selection
        const phoneError = validatePhone(formData.phone);
        if (phoneError) errors.phone = phoneError;

        if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
          errors.email = 'Please enter a valid email address';
        }

        if (!selectedSchool) {
          toast.warning('Please select a school');
          return false;
        }
        break;

      case 2: // Upload
        if (!signedForm) {
          toast.warning('Please upload your signed acceptance form');
          return false;
        }
        break;

      default:
        break;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
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

  // Handle file change
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - only images
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Only JPEG and PNG images are allowed.');
      e.target.value = '';
      return;
    }

    // Validate file size (1MB max like legacy)
    const maxSize = 1 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large (${formatFileSize(file.size)}). Maximum size is 1MB.`);
      e.target.value = '';
      return;
    }

    setSignedForm(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  // Handle form input change
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    // Clear error on change
    if (formErrors[field]) {
      setFormErrors((prev) => ({
        ...prev,
        [field]: null,
      }));
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append('school_id', selectedSchool.id);
      data.append('phone', formData.phone);
      if (formData.email) data.append('email', formData.email);
      data.append('signed_form', signedForm);

      await acceptancesApi.submit(data);
      toast.success('Acceptance form submitted successfully!');
      fetchData();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to submit acceptance form';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter schools by search
  const filteredSchools = schools.filter(
    (school) =>
      school.available &&
      (school.name.toLowerCase().includes(search.toLowerCase()) ||
        school.ward?.toLowerCase().includes(search.toLowerCase()) ||
        school.lga?.toLowerCase().includes(search.toLowerCase()))
  );

  // Get step status for stepper
  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentStep) return 'complete';
    if (stepIndex === currentStep) return 'current';
    return 'upcoming';
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
          <p className="text-gray-500">Loading acceptance form...</p>
        </div>
      </div>
    );
  }

  // Already submitted - show status
  if (status?.submitted) {
    return <AcceptanceSubmitted status={status} />;
  }

  // Cannot submit - show errors
  if (!status?.can_submit) {
    return <CannotSubmit status={status} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4 pb-6 sm:pb-8 px-1">
      {/* Header */}
      <div className="text-center px-2">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
          Submit Acceptance Form
        </h1>
        <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
          Complete all steps to submit your teaching practice acceptance form
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
        <CardContent className="p-4 sm:p-6">
          {/* Step 1: Download Documents */}
          <StepContent isActive={currentStep === 0}>
            <DocumentsStep navigate={navigate} />
          </StepContent>

          {/* Step 2: Contact & School Selection */}
          <StepContent isActive={currentStep === 1}>
            <ContactAndSchoolStep
              formData={formData}
              formErrors={formErrors}
              onChange={handleInputChange}
              user={user}
              search={search}
              onSearchChange={setSearch}
              selectedSchool={selectedSchool}
              onSelectSchool={setSelectedSchool}
              filteredSchools={filteredSchools}
            />
          </StepContent>

          {/* Step 3: Upload Signed Form */}
          <StepContent isActive={currentStep === 2}>
            <UploadStep
              signedForm={signedForm}
              imagePreview={imagePreview}
              fileInputRef={fileInputRef}
              onFileChange={handleFileChange}
              onClear={() => {
                setSignedForm(null);
                setImagePreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
            />
          </StepContent>

          {/* Step 4: Review & Submit */}
          <StepContent isActive={currentStep === 3}>
            <ReviewStep
              formData={formData}
              selectedSchool={selectedSchool}
              signedForm={signedForm}
              imagePreview={imagePreview}
              user={user}
            />
          </StepContent>

          {/* Navigation */}
          <StepActions>
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4"
            >
              <IconChevronLeft className="w-4 h-4" />
              <span className="hidden xs:inline">Previous</span>
              <span className="xs:hidden">Back</span>
            </Button>

            {currentStep < STEPS.length - 1 ? (
              <Button type="button" onClick={nextStep} className="gap-1 sm:gap-2 text-sm sm:text-base px-4 sm:px-6">
                Next
                <IconChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                loading={submitting}
                className="gap-1 sm:gap-2 min-w-[120px] sm:min-w-[160px] text-sm sm:text-base"
              >
                <IconCheck className="w-4 h-4" />
                Submit
              </Button>
            )}
          </StepActions>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Sub-components for each step
// =============================================================================

/**
 * Step 1: Documents Preview
 */
function DocumentsStep({ navigate }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <IconInfoCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-blue-800">
          <p className="font-medium">Before you begin</p>
          <p className="mt-1">
            View and print both documents below. Take them to your prospective Place of 
            Primary Assignment (PPA) for signing and stamping.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Introduction Letter */}
        <div className="p-4 sm:p-6 border-2 rounded-xl transition-all border-gray-200 hover:border-primary-300 hover:bg-gray-50 active:bg-gray-100">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center bg-gray-100 flex-shrink-0">
              <IconFileText className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Introduction Letter</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Present this to your prospective PPA
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/student/introduction-letter')}
            className="w-full mt-3 sm:mt-4 gap-2"
          >
            <IconFileText className="w-4 h-4" />
            View & Print
          </Button>
        </div>

        {/* Acceptance Form */}
        <div className="p-4 sm:p-6 border-2 rounded-xl transition-all border-gray-200 hover:border-primary-300 hover:bg-gray-50 active:bg-gray-100">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center bg-gray-100 flex-shrink-0">
              <IconClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Acceptance Form</h3>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Get this signed and stamped by your PPA
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/student/acceptance-document')}
            className="w-full mt-3 sm:mt-4 gap-2"
          >
            <IconClipboardCheck className="w-4 h-4" />
            View & Print
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Step 2: Contact Information & School Selection
 */
function ContactAndSchoolStep({
  formData,
  formErrors,
  onChange,
  user,
  search,
  onSearchChange,
  selectedSchool,
  onSelectSchool,
  filteredSchools,
}) {
  return (
    <div className="space-y-4 sm:space-y-4">
      {/* Contact Information Section */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
            <IconUser className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Contact Information</h3>
            <p className="text-xs sm:text-sm text-gray-500">
              Provide your contact details
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <IconPhone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="tel"
                value={formData.phone}
                onChange={(e) => onChange('phone', e.target.value)}
                className="pl-10 text-base"
                placeholder="08012345678"
                error={formErrors.phone}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <div className="relative">
              <IconMail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => onChange('email', e.target.value)}
                className="pl-10 text-base"
                placeholder="student@email.com"
                error={formErrors.email}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200" />

      {/* School Selection Section */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
            <IconBuildingBank className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Select Your School</h3>
            <p className="text-xs sm:text-sm text-gray-500">
              Choose the school where you've obtained acceptance
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-11 sm:h-12 text-base"
            placeholder="Search schools by name, LGA, or ward..."
          />
        </div>

        {/* Selected School */}
        {selectedSchool && (
          <div className="p-3 sm:p-4 bg-primary-50 border-2 border-primary-300 rounded-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <IconBuilding className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary-900 text-sm sm:text-base truncate">{selectedSchool.school_code} | {selectedSchool.name}</p>
                  <p className="text-xs sm:text-sm text-gray-700 flex items-center gap-1">
                    <IconMapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">
                      {selectedSchool.ward}, {selectedSchool.lga}, {selectedSchool.state}
                    </span>
                  </p>
                  {selectedSchool.route_name && (
                    <p className="text-xs sm:text-sm text-gray-600 truncate">Route: {selectedSchool.route_name}</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectSchool(null)}
                className="p-1.5 sm:p-2 text-primary-600 hover:text-primary-800 hover:bg-primary-100 active:bg-primary-200 rounded-lg transition-colors flex-shrink-0"
              >
                <IconX className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        )}

        {/* School List */}
        {!selectedSchool && (
          <div className="max-h-64 sm:max-h-72 overflow-y-auto border rounded-xl divide-y -mx-1 px-1">
            {filteredSchools.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-gray-500">
                <IconBuildingBank className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mb-2 sm:mb-3" />
                <p className="font-medium text-sm sm:text-base">No available schools found</p>
                <p className="text-xs sm:text-sm">Try adjusting your search</p>
              </div>
            ) : (
              filteredSchools.map((school) => (
                <button
                  key={school.id}
                  type="button"
                  onClick={() => onSelectSchool(school)}
                  className="w-full p-3 sm:p-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-start gap-2 sm:gap-4"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <IconBuilding className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm sm:text-base">{school.name}</p>
                    <p className="text-xs sm:text-sm text-gray-700 flex items-center gap-1">
                      {school.school_code && (
                        <span className="font-medium text-primary-800">({school.school_code}) | </span>
                      )}
                      <IconMapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {school.ward}, {school.lga}, {school.state}
                      </span>
                    </p>
                    {school.route_name && (
                      <p className="text-xs sm:text-sm text-gray-600 truncate">Route: {school.route_name}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        <p className="text-xs sm:text-sm text-gray-500 flex items-start sm:items-center gap-2">
          <IconInfoCircle className="w-4 h-4 flex-shrink-0 mt-0.5 sm:mt-0" />
          <span>If your school is not listed, please contact the TP office.</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Step 3: Upload Signed Form
 */
function UploadStep({
  signedForm,
  imagePreview,
  fileInputRef,
  onFileChange,
  onClear,
}) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
          <IconUpload className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Upload Signed Acceptance Form</h3>
          <p className="text-xs sm:text-sm text-gray-500">
            Upload a clear photo of your signed and stamped acceptance form
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <IconAlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-amber-800">
          <p className="font-medium">Important</p>
          <ul className="mt-1 list-disc list-inside space-y-0.5 sm:space-y-1">
            <li>Only JPEG and PNG images are allowed</li>
            <li>Maximum file size: 1MB</li>
            <li>Ensure the signature and stamp are clearly visible</li>
            <li>Take the photo in good lighting</li>
          </ul>
        </div>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept=".jpg,.jpeg,.png"
        className="hidden"
      />

      {signedForm && imagePreview ? (
        <div className="space-y-3 sm:space-y-4">
          {/* Preview */}
          <div className="relative rounded-xl overflow-hidden border-2 border-green-300 bg-green-50">
            <img
              src={imagePreview}
              alt="Uploaded acceptance form"
              className="w-full max-h-72 sm:max-h-96 object-contain"
            />
            <div className="absolute top-2 sm:top-3 right-2 sm:right-3 flex gap-1.5 sm:gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="h-7 w-7 sm:h-8 sm:w-8 bg-white shadow-md"
                title="Change image"
              >
                <IconRefresh className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={onClear}
                className="h-7 w-7 sm:h-8 sm:w-8 bg-white shadow-md hover:bg-red-50"
                title="Remove image"
              >
                <IconX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600" />
              </Button>
            </div>
          </div>

          {/* File Info */}
          <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-green-50 border border-green-200 rounded-lg">
            <IconFileCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-green-900 truncate text-sm sm:text-base">{signedForm.name}</p>
              <p className="text-xs sm:text-sm text-green-700">
                {formatFileSize(signedForm.size)}
              </p>
            </div>
            <IconCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center gap-3 sm:gap-4 p-8 sm:p-12 border-2 border-dashed border-gray-300 rounded-xl hover:border-primary-400 hover:bg-primary-50 active:bg-primary-100 transition-all cursor-pointer group"
        >
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gray-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
            <IconPhoto className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 group-hover:text-primary-600 transition-colors" />
          </div>
          <div className="text-center">
            <p className="font-medium text-gray-700 group-hover:text-primary-700 text-sm sm:text-base">
              Tap to upload your signed acceptance form
            </p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">JPEG or PNG, max 1MB</p>
          </div>
        </button>
      )}
    </div>
  );
}

/**
 * Step 4: Review & Submit
 */
function ReviewStep({ formData, selectedSchool, signedForm, imagePreview, user }) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
          <IconClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Review Your Submission</h3>
          <p className="text-xs sm:text-sm text-gray-500">
            Please verify all information before submitting
          </p>
        </div>
      </div>

      {/* Student Information */}
      <div className="p-3 sm:p-4 bg-gray-50 rounded-xl space-y-2 sm:space-y-3">
        <h4 className="font-medium text-gray-900 flex items-center gap-2 text-sm sm:text-base">
          <IconUser className="w-4 h-4" />
          Your Information
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Name</span>
            <span className="font-medium truncate ml-2">{user?.name || user?.full_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Reg. Number</span>
            <span className="font-medium truncate ml-2">{user?.registration_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Phone</span>
            <span className="font-medium">{formData.phone}</span>
          </div>
          {formData.email && (
            <div className="flex justify-between">
              <span className="text-gray-500">Email</span>
              <span className="font-medium truncate ml-2">{formData.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* School Information */}
      {selectedSchool && (
        <div className="p-3 sm:p-4 bg-primary-50 border border-primary-200 rounded-xl">
          <h4 className="font-medium text-primary-900 flex items-center gap-2 mb-2 sm:mb-3 text-sm sm:text-base">
            <IconBuildingBank className="w-4 h-4" />
            Selected School
          </h4>
          <div className="flex items-start gap-2 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
              <IconBuilding className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-primary-900 text-sm sm:text-base truncate">{selectedSchool.school_code} | {selectedSchool.name}</p>
              <p className="text-xs sm:text-sm text-primary-700 flex items-center gap-1 mt-1">
                <IconMapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{selectedSchool.ward}, {selectedSchool.lga}, {selectedSchool.state}</span>
              </p>
              {selectedSchool.route_name && (
                <p className="text-xs sm:text-sm text-primary-600 mt-1 truncate">
                  Route: {selectedSchool.route_name}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Document */}
      {signedForm && imagePreview && (
        <div className="p-3 sm:p-4 bg-green-50 border border-green-200 rounded-xl">
          <h4 className="font-medium text-green-900 flex items-center gap-2 mb-2 sm:mb-3 text-sm sm:text-base">
            <IconFileCheck className="w-4 h-4" />
            Uploaded Document
          </h4>
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src={imagePreview}
              alt="Uploaded form"
              className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border flex-shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-green-900 truncate text-sm sm:text-base">{signedForm.name}</p>
              <p className="text-xs sm:text-sm text-green-700">
                {formatFileSize(signedForm.size)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Declaration */}
      <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-start gap-2 sm:gap-3">
          <IconInfoCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-blue-800">
            <p className="font-medium">Confirmation</p>
            <p className="mt-1">
              By submitting this form, you confirm that all information provided is 
              accurate and the uploaded document is duly signed and stamped by your 
              Place of Primary Assignment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Status Components
// =============================================================================

/**
 * Already Submitted State
 */
function AcceptanceSubmitted({ status }) {
  // Check if posting letter is available from session settings
  const postingLetterAvailable = status?.posting_letter?.can_download;
  const postingLetterMessage = status?.posting_letter?.message || 
    (status?.windows?.posting_letter?.message || 'Not yet available');

  return (
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4 px-1">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Acceptance Form</h1>

      <Card className="border-2 bg-green-50 border-green-200">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full flex items-center justify-center flex-shrink-0 bg-green-100">
              <IconCheck className="w-5 h-5 sm:w-7 sm:h-7 text-green-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-semibold text-green-900">
                Acceptance Submitted Successfully
              </h3>
              <p className="mt-1 text-sm sm:text-base text-green-700">
                {postingLetterAvailable
                  ? 'Your acceptance form has been submitted. You can now download your posting letter.'
                  : 'Your acceptance form has been submitted. Posting letter will be available soon.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-3">
          <CardTitle className="text-base sm:text-lg">
            Submission Details
            <p className="font-medium text-xs text-gray-500 mt-1">
              Submitted:  
              {new Date(status.acceptance.submitted_at).toLocaleDateString('en-NG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-2 sm:pt-3 space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
            <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
              <p className="text-xs sm:text-sm text-gray-500">School</p>
              <p className="font-medium mt-1 text-sm sm:text-base truncate">{status.acceptance.school_name}</p>
            </div>
            {status.acceptance.school_code && (
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-500">School Code</p>
                <p className="font-medium mt-1 text-sm sm:text-base">{status.acceptance.school_code}</p>
              </div>
            )}
            {status.acceptance.school_ward && (
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-500">Ward</p>
                <p className="font-medium mt-1 text-sm sm:text-base">{status.acceptance.school_ward}</p>
              </div>
            )}
            {status.acceptance.school_lga && (
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-500">LGA</p>
                <p className="font-medium mt-1 text-sm sm:text-base">{status.acceptance.school_lga}</p>
              </div>
            )}
            {status.acceptance.school_state && (
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-500">State</p>
                <p className="font-medium mt-1 text-sm sm:text-base">{status.acceptance.school_state}</p>
              </div>
            )}
            {status.acceptance.route_name && (
              <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                <p className="text-xs sm:text-sm text-gray-500">Route</p>
                <p className="font-medium mt-1 text-sm sm:text-base">{status.acceptance.route_name}</p>
              </div>
            )}
          </div>

          {postingLetterAvailable ? (
              <a
                href="/student/posting-letter"
                className="w-full gap-2 inline-flex items-center justify-center px-4 py-2.5 sm:py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 transition-colors"
              >
                <IconDownload className="w-4 h-4" />
                Download Posting Letter
              </a>
            ) : (
            <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                <IconInfoCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <p className="font-medium text-blue-900 text-sm sm:text-base">Posting Letter</p>
                  <p className="text-xs sm:text-sm text-blue-700">{postingLetterMessage}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Cannot Submit State
 */
function CannotSubmit({ status }) {
  return (
    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4 px-1">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Acceptance Form</h1>

      <Card>
        <CardContent className="p-6 sm:p-12 text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <IconAlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
          </div>
          <h2 className="font-semibold text-gray-900 mb-2">Cannot Submit Form</h2>
          {status?.submission_errors?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4 text-left">
              <ul className="space-y-1.5 sm:space-y-2">
                {status.submission_errors.map((error, index) => (
                  <li key={index} className="flex items-start gap-2 text-yellow-900 text-sm sm:text-base">
                    <IconX className="w-4 h-4 text-yellow-900 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AcceptanceFormPage;
