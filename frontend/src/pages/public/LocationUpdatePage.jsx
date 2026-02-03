/**
 * Location Update Page
 * Public page for submitting school GPS coordinate updates
 * Uses subdomain-based institution branding (no manual institution selection)
 */

import { useState, useEffect } from 'react';
import { formatCoordinate } from '../../utils/helpers';
import {
  IconMapPin,
  IconCurrentLocation,
  IconCheck,
  IconAlertCircle,
  IconInfoCircle,
  IconExternalLink,
  IconMap2,
  IconSchool,
  IconChevronRight,
  IconUser,
  IconPhone,
  IconLoader2,
} from '@tabler/icons-react';
import { publicApi } from '../../api/publicApi';
import { useInstitution } from '../../context/InstitutionContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

export default function LocationUpdatePage() {
  // Institution branding from context
  const { institution, branding, loading: brandingLoading, error: brandingError, hasInstitution } = useInstitution();

  // State
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showContactInfo, setShowContactInfo] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    proposed_latitude: '',
    proposed_longitude: '',
    contributor_name: '',
    contributor_phone: '',
  });

  const [formErrors, setFormErrors] = useState({});

  // Load schools when institution is available
  useEffect(() => {
    if (hasInstitution && institution?.id) {
      loadSchools();
    }
  }, [hasInstitution, institution?.id]);

  // Load school info when school changes, reset states when cleared
  useEffect(() => {
    if (selectedSchool) {
      loadSchoolInfo(selectedSchool);
      setShowForm(false);
      setSuccess(false);
    } else {
      // Reset all states when school is cleared
      setSchoolInfo(null);
      setShowForm(false);
      setSuccess(false);
      setError('');
      setFormData({
        proposed_latitude: '',
        proposed_longitude: '',
        contributor_name: '',
        contributor_phone: ''
      });
      setFormErrors({});
      setShowContactInfo(false);
    }
  }, [selectedSchool]);

  const loadSchools = async () => {
    try {
      setLoadingSchools(true);
      // Use subdomain-aware endpoint
      const response = await publicApi.getSchoolsForCurrentInstitution({ 
        missingCoordinatesOnly: true,
        excludePendingLocation: true 
      });
      setSchools(response.data.data || response.data || []);
    } catch (err) {
      setError('Failed to load schools');
    } finally {
      setLoadingSchools(false);
    }
  };

  const loadSchoolInfo = async (schoolId) => {
    try {
      setLoading(true);
      // No institution_id needed - uses subdomain context
      const response = await publicApi.getSchoolLocation(schoolId);
      setSchoolInfo(response.data.data || response.data || null);
    } catch (err) {
      setError('Failed to load school information');
    } finally {
      setLoading(false);
    }
  };

  const getGoogleMapsUrl = (lat, lng) => {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setGettingLocation(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData(prev => ({
          ...prev,
          proposed_latitude: formatCoordinate(position.coords.latitude, 8),
          proposed_longitude: formatCoordinate(position.coords.longitude, 8),
        }));
        setGettingLocation(false);
      },
      () => {
        setError('Unable to get your location. Please enter coordinates manually.');
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const validateForm = () => {
    const errors = {};
    const phoneRegex = /^(\+?234|0)?[789][01]\d{8}$/;

    const lat = parseFloat(formData.proposed_latitude);
    const lng = parseFloat(formData.proposed_longitude);

    if (!formData.proposed_latitude) {
      errors.proposed_latitude = 'Latitude is required';
    } else if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.proposed_latitude = 'Please enter a valid latitude (-90 to 90)';
    }

    if (!formData.proposed_longitude) {
      errors.proposed_longitude = 'Longitude is required';
    } else if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.proposed_longitude = 'Please enter a valid longitude (-180 to 180)';
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
      // No institution_id needed - uses subdomain context
      await publicApi.submitLocationUpdate({
        school_id: parseInt(selectedSchool),
        proposed_latitude: parseFloat(formData.proposed_latitude),
        proposed_longitude: parseFloat(formData.proposed_longitude),
        contributor_name: formData.contributor_name || null,
        contributor_phone: formData.contributor_phone || null,
      });
      setSuccess(true);
      setShowForm(false);
      loadSchoolInfo(selectedSchool);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to submit update request';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSchoolData = schools.find((s) => String(s.id) === String(selectedSchool));

  // Show loading state while branding is loading
  if (brandingLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <IconLoader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error if no institution found
  if (brandingError || !hasInstitution) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-xl border-0">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <IconAlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Institution Not Found</h1>
            <p className="text-gray-600 mb-6">
              Please access this page from your institution&apos;s portal to submit location updates.
            </p>
            <p className="text-sm text-gray-500">
              Example: <code className="bg-gray-100 px-2 py-1 rounded">portal.digitaltp.ng/update-location</code>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen border rounded-xl">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        {/* Institution Branded Header */}
        <div className="text-center mb-10">
          {/* Institution Logo */}
          {branding.logo_url ? (
            <img 
              src={branding.logo_url} 
              alt={branding.name}
              className="h-16 w-16 object-contain mx-auto mb-4 rounded-xl"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/30 mb-4">
              <IconMapPin className="w-8 h-8 text-white" />
            </div>
          )}
          
          {/* Institution Name */}
          <h2 className="text-sm font-semibold text-primary-600 uppercase tracking-wider mb-2">
            {branding.name}
          </h2>
          
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Update School Location
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            Help us keep school GPS coordinates accurate for field monitoring and navigation
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <IconAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setError('')}
                className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-100"
              >
                ×
              </Button>
            </div>
          </div>
        )}

        {/* Progress Steps - Simplified (2 steps instead of 3) */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            selectedSchool 
              ? 'bg-primary-100 text-primary-700' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              selectedSchool 
                ? 'bg-primary-500 text-white' 
                : 'bg-gray-300 text-gray-600'
            }`}>1</span>
            Select School
          </div>
          <IconChevronRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
            schoolInfo 
              ? 'bg-primary-100 text-primary-700' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
              schoolInfo 
                ? 'bg-primary-500 text-white' 
                : 'bg-gray-300 text-gray-600'
            }`}>2</span>
            Update Location
          </div>
        </div>

        {/* Main Card */}
        <Card className="shadow-xl shadow-gray-200/50 border-0">
          <CardContent className="p-0">
            {/* Selection Section */}
            <div className="p-6 sm:p-8 space-y-4">
              {/* School Selection */}
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
                    const searchLower = search.toLowerCase();
                    return options.filter(
                      (opt) =>
                        opt.name?.toLowerCase().includes(searchLower) ||
                        opt.school_code?.toLowerCase().includes(searchLower) ||
                        opt.ward?.toLowerCase().includes(searchLower) ||
                        opt.lga?.toLowerCase().includes(searchLower) ||
                        opt.address?.toLowerCase().includes(searchLower) ||
                        opt.route_name?.toLowerCase().includes(searchLower)
                    );
                  }}
                  renderOption={(opt) => (
                    <div className="py-1">
                      <div className="font-medium text-gray-900">
                        {opt.name}
                      </div>
                      <div className="text-xs text-gray-600">
                        {opt.school_code && (
                          <span className="text-xs font-medium text-gray-800">({opt.school_code}) | </span>
                        )}
                        {opt.ward}, {opt.lga}
                      </div>
                      {opt.address && (
                        <div className="text-xs text-gray-500">{opt.address}</div>
                      )}
                      {opt.route_name && (
                        <div className="text-xs text-primary-600">Route: {opt.route_name}</div>
                      )}
                    </div>
                  )}
                  clearable
                />
              </div>
            </div>

            {/* School Info Display */}
            {loading ? (
              <div className="p-8 flex items-center justify-center border-t border-gray-100">
                <div className="flex items-center gap-3 text-gray-500">
                  <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  Loading school information...
                </div>
              </div>
            ) : schoolInfo && (
              <div className="border-t border-gray-100 animate-in slide-in-from-bottom-2 duration-300">
                {/* School Header */}
                <div className="bg-gradient-to-r from-gray-50 to-slate-50 p-6 sm:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
                      <IconSchool className="w-6 h-6 text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-gray-900 truncate">
                          {selectedSchoolData?.name}
                        </h3>
                        {selectedSchoolData?.school_code && (
                          <span className="text-xs font-medium text-primary-700 bg-primary-100 px-2 py-0.5 rounded-full">
                            {selectedSchoolData.school_code}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500">
                        {selectedSchoolData?.ward}, {selectedSchoolData?.lga}
                      </p>
                      {selectedSchoolData?.address && (
                        <p className="text-sm text-gray-500 mt-1">
                          {selectedSchoolData.address}
                        </p>
                      )}
                      {selectedSchoolData?.route_name && (
                        <p className="text-sm text-primary-600 mt-1">
                          Route: {selectedSchoolData.route_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Current Location Info */}
                <div className="p-6 sm:p-8 space-y-4">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-50">
                    <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                      <IconMap2 className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-500 mb-1">Current GPS Coordinates</p>
                      {schoolInfo.school.latitude && schoolInfo.school.longitude ? (
                        <div className="space-y-2">
                          <p className="text-lg font-semibold text-gray-900 font-mono">
                            {schoolInfo.school.latitude}, {schoolInfo.school.longitude}
                          </p>
                          <a
                            href={getGoogleMapsUrl(schoolInfo.school.latitude, schoolInfo.school.longitude)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
                          >
                            <IconExternalLink className="w-4 h-4" />
                            View on Google Maps
                          </a>
                        </div>
                      ) : (
                        <p className="text-lg font-medium text-gray-400 italic">Not yet recorded</p>
                      )}
                    </div>
                  </div>

                  {/* Status Messages */}
                  {!schoolInfo.feature_enabled && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <IconInfoCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-800">
                        Location update submissions are currently disabled for this institution.
                      </p>
                    </div>
                  )}

                  {schoolInfo.pending_request_exists && !success && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
                      <IconInfoCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800">
                        An update request for this school is already pending review.
                      </p>
                    </div>
                  )}

                  {success && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <IconCheck className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-800">Update Request Submitted!</p>
                        <p className="text-sm text-emerald-700 mt-1">
                          Your request will be reviewed by an administrator. Thank you for helping keep our records accurate.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Update Button */}
                  {schoolInfo.can_request_update && !showForm && !success && (
                    <div className="pt-4">
                      <p className="text-sm text-gray-600 mb-4">
                        Is the location incorrect or not recorded? Submit updated coordinates.
                      </p>
                      <div className="flex justify-end">
                        <Button 
                          onClick={() => setShowForm(true)}
                          className="w-full sm:w-auto"
                        >
                          <IconMapPin className="w-4 h-4 mr-2" />
                          Update Location
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Update Form */}
                  {showForm && (
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2 duration-300">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-1">Submit Updated Location</h4>
                        <p className="text-sm text-gray-500">Provide the accurate GPS coordinates for this school</p>
                      </div>

                      {/* Get Current Location Button */}
                      <div className="p-5 rounded-xl border border-primary-100">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-primary-900 mb-1">Use Device Location</p>
                            <p className="text-sm text-primary-700">
                              For best accuracy, be at the school when submitting
                            </p>
                          </div>
                          <Button
                            type="button"
                            onClick={getCurrentLocation}
                            loading={gettingLocation}
                            variant="outline"
                            className="bg-white shadow-sm w-full sm:w-auto"
                          >
                            <IconCurrentLocation className="w-4 h-4 mr-2" />
                            {gettingLocation ? 'Getting...' : 'Get Location'}
                          </Button>
                        </div>
                      </div>

                      {/* Manual Coordinate Entry */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input
                          label="Latitude"
                          required
                          value={formData.proposed_latitude}
                          onChange={(e) => setFormData({ ...formData, proposed_latitude: e.target.value })}
                          error={formErrors.proposed_latitude}
                          placeholder="e.g., 9.05785"
                        />
                        <Input
                          label="Longitude"
                          required
                          value={formData.proposed_longitude}
                          onChange={(e) => setFormData({ ...formData, proposed_longitude: e.target.value })}
                          error={formErrors.proposed_longitude}
                          placeholder="e.g., 7.49508"
                        />
                      </div>

                      {/* Preview Link */}
                      {formData.proposed_latitude && formData.proposed_longitude && (
                        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                              <IconMap2 className="w-5 h-5 text-gray-600" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {formData.proposed_latitude}, {formData.proposed_longitude}
                              </p>
                              <a
                                href={getGoogleMapsUrl(formData.proposed_latitude, formData.proposed_longitude)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 transition-colors"
                              >
                                <IconExternalLink className="w-3.5 h-3.5" />
                                Preview on Google Maps
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Contributor Info Toggle */}
                      <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setShowContactInfo(!showContactInfo)}
                          className="w-full flex items-center justify-between p-4 h-auto text-left hover:bg-gray-50 rounded-none"
                        >
                          <div className="flex items-center gap-3">
                            <IconUser className="w-5 h-5 text-gray-400" />
                            <span className="font-medium text-gray-700">Your Contact Information</span>
                            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Optional</span>
                          </div>
                          <IconChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showContactInfo ? 'rotate-90' : ''}`} />
                        </Button>
                        
                        {showContactInfo && (
                          <div className="p-4 pt-0 space-y-4 border-t border-gray-100 animate-in slide-in-from-top-1 duration-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                              <Input
                                label="Your Name"
                                value={formData.contributor_name}
                                onChange={(e) => setFormData({ ...formData, contributor_name: e.target.value })}
                                placeholder="Enter your full name"
                                icon={<IconUser className="w-4 h-4" />}
                              />
                              <Input
                                label="Your Phone"
                                type="tel"
                                value={formData.contributor_phone}
                                onChange={(e) => setFormData({ ...formData, contributor_phone: e.target.value })}
                                error={formErrors.contributor_phone}
                                placeholder="e.g., 08012345678"
                                icon={<IconPhone className="w-4 h-4" />}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Form Actions */}
                      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setShowForm(false);
                            setFormData({
                              proposed_latitude: '',
                              proposed_longitude: '',
                              contributor_name: '',
                              contributor_phone: '',
                            });
                            setShowContactInfo(false);
                          }}
                          className="w-full sm:w-auto"
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          loading={submitting}
                          className="w-full sm:w-auto"
                        >
                          <IconCheck className="w-4 h-4 mr-2" />
                          Submit Location Update
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-sm text-gray-500">
            Your contribution helps improve field monitoring accuracy
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Powered by DigitalTP
          </p>
        </div>
      </div>
    </div>
  );
}
