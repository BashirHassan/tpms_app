/**
 * Student Portal — Location Update Page
 * Authenticated students can suggest school GPS coordinate updates.
 * Institution is derived from the student's JWT (no public subdomain logic needed).
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
  IconBuilding,
  IconSearch,
  IconX,
  IconChevronRight,
  IconUser,
  IconPhone,
} from '@tabler/icons-react';
import apiClient from '../../api/client';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const portalSchoolsApi = {
  getSchoolsForUpdate: (params) =>
    apiClient.get('/portal/schools/for-update', { params }),
  getSchoolLocation: (schoolId) =>
    apiClient.get(`/portal/schools/${schoolId}/location`),
  submitLocationUpdate: (data) =>
    apiClient.post('/portal/schools/location-update', data),
};

export default function StudentLocationUpdatePage() {
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');
  const [search, setSearch] = useState('');
  const [schoolInfo, setSchoolInfo] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [showContactInfo, setShowContactInfo] = useState(false);

  const [formData, setFormData] = useState({
    proposed_latitude: '',
    proposed_longitude: '',
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
      setSearch('');
      setFormData({ proposed_latitude: '', proposed_longitude: '', contributor_name: '', contributor_phone: '' });
      setFormErrors({});
      setShowContactInfo(false);
    }
  }, [selectedSchool]);

  const loadSchools = async () => {
    try {
      setLoadingSchools(true);
      const response = await portalSchoolsApi.getSchoolsForUpdate({
        missing_coordinates_only: 'true',
        exclude_pending_location: 'true',
      });
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
      const response = await portalSchoolsApi.getSchoolLocation(schoolId);
      setSchoolInfo(response.data.data || response.data || null);
    } catch {
      setError('Failed to load school information');
    } finally {
      setLoading(false);
    }
  };

  const getGoogleMapsUrl = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setGettingLocation(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((prev) => ({
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
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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
      await portalSchoolsApi.submitLocationUpdate({
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
      setError(err.response?.data?.message || 'Failed to submit update request');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedSchoolData = schools.find((s) => String(s.id) === String(selectedSchool));

  const filteredSchools = schools.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.school_code?.toLowerCase().includes(q) ||
      s.ward?.toLowerCase().includes(q) ||
      s.lga?.toLowerCase().includes(q) ||
      s.address?.toLowerCase().includes(q) ||
      s.route_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Update School Location</h1>
        <p className="text-sm text-gray-500 mt-1">
          Help keep GPS coordinates accurate for field monitoring and navigation
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
          Update Location
        </div>
      </div>

      {/* Main Card */}
      <Card className="shadow-sm border-gray-200">
        <CardContent className="p-0">
          {/* School Selection */}
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                <IconSchool className="w-4 h-4 text-primary-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Select School</p>
                <p className="text-xs text-gray-500">Search and choose a school missing GPS coordinates</p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 text-sm"
                placeholder="Search by name, code, ward, LGA, or route..."
                disabled={!!selectedSchool}
              />
            </div>

            {/* Selected School Card */}
            {selectedSchoolData && (
              <div className="p-3 sm:p-4 bg-primary-50 border-2 border-primary-300 rounded-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <IconBuilding className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-primary-900 text-sm truncate">
                        {selectedSchoolData.school_code
                          ? `${selectedSchoolData.school_code} | ${selectedSchoolData.name}`
                          : selectedSchoolData.name}
                      </p>
                      <p className="text-xs text-gray-700 flex items-center gap-1 mt-0.5">
                        <IconMapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">
                          {selectedSchoolData.ward}, {selectedSchoolData.lga}
                          {selectedSchoolData.state ? `, ${selectedSchoolData.state}` : ''}
                        </span>
                      </p>
                      {selectedSchoolData.address && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{selectedSchoolData.address}</p>
                      )}
                      {selectedSchoolData.route_name && (
                        <p className="text-xs text-primary-600 mt-0.5 truncate">
                          Route: {selectedSchoolData.route_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSchool('')}
                    className="p-1.5 text-primary-600 hover:text-primary-800 hover:bg-primary-100 active:bg-primary-200 rounded-lg transition-colors flex-shrink-0"
                  >
                    <IconX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* School List */}
            {!selectedSchool && (
              <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {loadingSchools ? (
                  <div className="flex items-center justify-center p-8 text-gray-500">
                    <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mr-3" />
                    <span className="text-sm">Loading schools...</span>
                  </div>
                ) : filteredSchools.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                    <IconSchool className="w-10 h-10 text-gray-300 mb-2" />
                    <p className="font-medium text-sm">No schools found</p>
                    <p className="text-xs text-gray-400">Try adjusting your search</p>
                  </div>
                ) : (
                  filteredSchools.map((school) => (
                    <button
                      key={school.id}
                      type="button"
                      onClick={() => setSelectedSchool(String(school.id))}
                      className="w-full p-3 sm:p-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-start gap-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <IconBuilding className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate text-sm">{school.name}</p>
                        {school.school_code && (
                          <p className="text-xs font-medium text-primary-700 mt-0.5">({school.school_code})</p>
                        )}
                        <p className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                          <IconMapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">
                            {school.ward}, {school.lga}
                            {school.state ? `, ${school.state}` : ''}
                          </span>
                        </p>
                        {school.address && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{school.address}</p>
                        )}
                        {school.route_name && (
                          <p className="text-xs text-primary-600 mt-0.5 truncate">Route: {school.route_name}</p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            <p className="text-xs text-gray-500 flex items-start gap-2">
              <IconInfoCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>Only schools missing GPS coordinates are listed. Contact the TP office if your school is not shown.</span>
            </p>
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
              <div className="p-6 space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Current Location</p>

                <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50">
                  <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                    <IconMap2 className="w-4 h-4 text-slate-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-500 mb-1">GPS Coordinates</p>
                    {schoolInfo.school?.latitude && schoolInfo.school?.longitude ? (
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold text-gray-900 font-mono">
                          {schoolInfo.school.latitude}, {schoolInfo.school.longitude}
                        </p>
                        <a
                          href={getGoogleMapsUrl(schoolInfo.school.latitude, schoolInfo.school.longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                        >
                          <IconExternalLink className="w-3.5 h-3.5" />
                          View on Google Maps
                        </a>
                      </div>
                    ) : (
                      <p className="text-sm font-medium text-gray-400 italic">Not yet recorded</p>
                    )}
                  </div>
                </div>

                {!schoolInfo.feature_enabled && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <IconInfoCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">Location update submissions are currently disabled for this institution.</p>
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
                    <p className="text-sm text-gray-600 mb-4">Is the location incorrect or not recorded? Submit updated coordinates.</p>
                    <Button onClick={() => setShowForm(true)}>
                      <IconMapPin className="w-4 h-4 mr-2" />
                      Update Location
                    </Button>
                  </div>
                )}

                {showForm && (
                  <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-gray-100 animate-in slide-in-from-top-2 duration-300">
                    <div>
                      <h4 className="font-semibold text-gray-900">Submit Updated Location</h4>
                      <p className="text-sm text-gray-500">Provide the accurate GPS coordinates for this school</p>
                    </div>

                    {/* Device Location */}
                    <div className="p-4 rounded-xl border border-primary-100">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-primary-900 text-sm mb-0.5">Use Device Location</p>
                          <p className="text-xs text-primary-700">For best accuracy, be at the school when submitting</p>
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

                    {/* Manual Coordinates */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          <div className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center">
                            <IconMap2 className="w-4 h-4 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 font-mono">
                              {formData.proposed_latitude}, {formData.proposed_longitude}
                            </p>
                            <a
                              href={getGoogleMapsUrl(formData.proposed_latitude, formData.proposed_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 transition-colors"
                            >
                              <IconExternalLink className="w-3.5 h-3.5" />
                              Preview on Google Maps
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Contributor Info */}
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
                        <div className="p-4 pt-0 border-t border-gray-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                            <Input
                              label="Your Name"
                              value={formData.contributor_name}
                              onChange={(e) => setFormData({ ...formData, contributor_name: e.target.value.toUpperCase() })}
                              placeholder="Enter your full name"
                              className="uppercase"
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
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowForm(false);
                          setFormData({ proposed_latitude: '', proposed_longitude: '', contributor_name: '', contributor_phone: '' });
                          setShowContactInfo(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" loading={submitting}>
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
    </div>
  );
}
