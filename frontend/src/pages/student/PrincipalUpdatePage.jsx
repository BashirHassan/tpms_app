/**
 * Student Portal — Principal Update Page
 * Authenticated students can suggest school principal detail updates.
 * Institution is derived from the student's JWT (no public subdomain logic needed).
 */

import { useState, useEffect } from 'react';
import {
  IconUser,
  IconPhone,
  IconCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconSchool,
  IconChevronRight,
  IconUserCircle,
} from '@tabler/icons-react';
import apiClient from '../../api/client';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

const portalSchoolsApi = {
  getSchoolsForUpdate: (params) =>
    apiClient.get('/portal/schools/for-update', { params }),
  getSchoolPrincipal: (schoolId) =>
    apiClient.get(`/portal/schools/${schoolId}/principal`),
  submitPrincipalUpdate: (data) =>
    apiClient.post('/portal/schools/principal-update', data),
};

export default function StudentPrincipalUpdatePage() {
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showContactInfo, setShowContactInfo] = useState(false);

  const [formData, setFormData] = useState({
    proposed_principal_name: '',
    proposed_principal_phone: '',
    contributor_name: '',
    contributor_phone: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    loadSchools();
  }, []);

  useEffect(() => {
    if (selectedSchool) {
      loadSchoolInfo(selectedSchool);
      setShowForm(false);
      setSuccess(false);
    } else {
      setSchoolInfo(null);
      setShowForm(false);
      setSuccess(false);
      setError('');
      setFormData({ proposed_principal_name: '', proposed_principal_phone: '', contributor_name: '', contributor_phone: '' });
      setFormErrors({});
      setShowContactInfo(false);
    }
  }, [selectedSchool]);

  const loadSchools = async () => {
    try {
      setLoadingSchools(true);
      const response = await portalSchoolsApi.getSchoolsForUpdate({ exclude_pending_principal: 'true' });
      setSchools(response.data.data || response.data || []);
    } catch {
      setError('Failed to load schools');
    } finally {
      setLoadingSchools(false);
    }
  };

  const loadSchoolInfo = async (schoolId) => {
    try {
      setLoading(true);
      const response = await portalSchoolsApi.getSchoolPrincipal(schoolId);
      setSchoolInfo(response.data.data || response.data || null);
    } catch {
      setError('Failed to load school information');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    const phoneRegex = /^(\+?234|0)?[789][01]\d{8}$/;

    if (!formData.proposed_principal_name.trim()) {
      errors.proposed_principal_name = 'Principal name is required';
    } else if (formData.proposed_principal_name.trim().length < 3) {
      errors.proposed_principal_name = 'Name must be at least 3 characters';
    }

    if (!formData.proposed_principal_phone.trim()) {
      errors.proposed_principal_phone = 'Phone number is required';
    } else if (!phoneRegex.test(formData.proposed_principal_phone.replace(/\s/g, ''))) {
      errors.proposed_principal_phone = 'Please enter a valid Nigerian phone number';
    }

    if (formData.contributor_phone && !phoneRegex.test(formData.contributor_phone.replace(/\s/g, ''))) {
      errors.contributor_phone = 'Please enter a valid Nigerian phone number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      await portalSchoolsApi.submitPrincipalUpdate({
        school_id: parseInt(selectedSchool),
        ...formData,
      });
      setSuccess(true);
      setShowForm(false);
      setFormData({ proposed_principal_name: '', proposed_principal_phone: '', contributor_name: '', contributor_phone: '' });
      loadSchoolInfo(selectedSchool);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit update request');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSchoolData = schools.find((s) => String(s.id) === String(selectedSchool));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Update Principal Details</h1>
        <p className="text-sm text-gray-500 mt-1">
          Help keep school records accurate by reporting changes to principal information
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 animate-in slide-in-from-top-2 duration-300">
          <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-800 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
          selectedSchool ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
        }`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
            selectedSchool ? 'bg-primary-500 text-white' : 'bg-gray-300 text-gray-600'
          }`}>1</span>
          Select School
        </div>
        <IconChevronRight className="w-4 h-4 text-gray-400" />
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
          schoolInfo ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600'
        }`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
            schoolInfo ? 'bg-primary-500 text-white' : 'bg-gray-300 text-gray-600'
          }`}>2</span>
          Update Details
        </div>
      </div>

      {/* Main Card */}
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-0">
          {/* School Selection */}
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <IconSchool className="w-4 h-4 text-primary-500" />
                Select School
              </label>
              <SearchableSelect
                options={schools}
                value={selectedSchool}
                onChange={setSelectedSchool}
                placeholder="Search for a school..."
                searchPlaceholder="Type school name, code, ward, or LGA..."
                loading={loadingSchools}
                getOptionValue={(opt) => String(opt.id)}
                getOptionLabel={(opt) => `${opt.name} (${opt.school_code || 'N/A'}) - ${opt.ward}, ${opt.lga}`}
                filterFn={(options, search) => {
                  const q = search.toLowerCase();
                  return options.filter((opt) =>
                    opt.name?.toLowerCase().includes(q) ||
                    opt.school_code?.toLowerCase().includes(q) ||
                    opt.ward?.toLowerCase().includes(q) ||
                    opt.lga?.toLowerCase().includes(q)
                  );
                }}
                renderOption={(opt) => (
                  <div className="py-1">
                    <div className="font-medium text-gray-900">{opt.name}</div>
                    <div className="text-xs text-gray-500">{opt.ward}, {opt.lga}</div>
                  </div>
                )}
                clearable
              />
            </div>
          </div>

          {/* School Info */}
          {loading ? (
            <div className="p-8 flex items-center justify-center border-t border-gray-100">
              <div className="flex items-center gap-3 text-gray-500">
                <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                Loading school information...
              </div>
            </div>
          ) : schoolInfo && (
            <div className="border-t border-gray-100">
              {/* School Header */}
              <div className="bg-gray-50 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center">
                    <IconSchool className="w-5 h-5 text-primary-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{selectedSchoolData?.name}</h3>
                    <p className="text-sm text-gray-500">{selectedSchoolData?.ward}, {selectedSchoolData?.lga}</p>
                  </div>
                </div>
              </div>

              {/* Current Principal */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                      <IconUser className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 mb-1">Principal Name</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {schoolInfo.school?.principal_name || <span className="text-gray-400 font-normal italic">Not recorded</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50">
                    <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                      <IconPhone className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-500 mb-1">Principal Phone</p>
                      <p className="text-sm font-semibold text-gray-900 font-mono">
                        {schoolInfo.school?.principal_phone || <span className="text-gray-400 font-normal font-sans italic">Not recorded</span>}
                      </p>
                    </div>
                  </div>
                </div>

                {!schoolInfo.feature_enabled && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <IconInfoCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">Principal update submissions are currently disabled for this institution.</p>
                  </div>
                )}

                {schoolInfo.pending_request_exists && !success && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                    <IconInfoCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-blue-800">An update request for this school is already pending review.</p>
                  </div>
                )}

                {success && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <IconCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-800">Update Request Submitted!</p>
                      <p className="text-sm text-emerald-700 mt-1">Your request will be reviewed by an administrator.</p>
                    </div>
                  </div>
                )}

                {schoolInfo.can_request_update && !showForm && !success && (
                  <div className="pt-2">
                    <p className="text-sm text-gray-600 mb-4">Is this information incorrect? Submit updated principal details.</p>
                    <Button onClick={() => setShowForm(true)}>
                      <IconUser className="w-4 h-4 mr-2" />
                      Update Details
                    </Button>
                  </div>
                )}

                {showForm && (
                  <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-gray-100">
                    <div>
                      <h4 className="font-semibold text-gray-900">Submit Updated Information</h4>
                      <p className="text-sm text-gray-500">Provide the correct principal details for this school</p>
                    </div>

                    <div className="p-5 rounded-xl border border-primary-100 space-y-4">
                      <div className="flex items-center gap-2 mb-2">
                        <IconUserCircle className="w-5 h-5 text-primary-600" />
                        <span className="font-medium text-primary-900">New Principal Information</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          label="Principal Name"
                          required
                          value={formData.proposed_principal_name}
                          onChange={(e) => setFormData({ ...formData, proposed_principal_name: e.target.value.toUpperCase() })}
                          error={formErrors.proposed_principal_name}
                          placeholder="Enter principal's full name"
                          className="uppercase"
                        />
                        <Input
                          label="Principal Phone"
                          required
                          type="tel"
                          value={formData.proposed_principal_phone}
                          onChange={(e) => setFormData({ ...formData, proposed_principal_phone: e.target.value })}
                          error={formErrors.proposed_principal_phone}
                          placeholder="e.g., 08012345678"
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowContactInfo(!showContactInfo)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <IconUser className="w-5 h-5 text-gray-400" />
                          <span className="font-medium text-gray-700 text-sm">Your Contact Information</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
                        </div>
                        <IconChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showContactInfo ? 'rotate-90' : ''}`} />
                      </button>
                      {showContactInfo && (
                        <div className="p-4 pt-0 border-t border-gray-100 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                            <Input
                              label="Your Name"
                              value={formData.contributor_name}
                              onChange={(e) => setFormData({ ...formData, contributor_name: e.target.value.toUpperCase() })}
                              placeholder="Enter your full name"
                              className="uppercase"
                            />
                            <Input
                              label="Your Phone"
                              type="tel"
                              value={formData.contributor_phone}
                              onChange={(e) => setFormData({ ...formData, contributor_phone: e.target.value })}
                              error={formErrors.contributor_phone}
                              placeholder="e.g., 08012345678"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowForm(false);
                          setFormData({ proposed_principal_name: '', proposed_principal_phone: '', contributor_name: '', contributor_phone: '' });
                          setShowContactInfo(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" loading={submitting}>
                        <IconCheck className="w-4 h-4 mr-2" />
                        Submit Update Request
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
