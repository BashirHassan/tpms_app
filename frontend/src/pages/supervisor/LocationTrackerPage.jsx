/**
 * Location Tracker Page (Supervisor)
 * 
 * Shows supervisor's postings with location verification status.
 * Allows supervisor to record their location for each posting via dialog.
 */

import { useState, useEffect, useCallback } from 'react';
import { locationApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { LocationVerification } from '../../components/LocationVerification';
import {
  IconMapPin,
  IconRefresh,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconSchool,
  IconEye,
  IconCurrentLocation,
  IconClock,
  IconLoader2,
  IconExternalLink,
  IconNavigation,
} from '@tabler/icons-react';
import { getOrdinal, getMapViewUrl, getDirectionsUrl, formatDistance } from '../../utils/helpers';

function LocationTrackerPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [postings, setPostings] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPosting, setSelectedPosting] = useState(null);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch postings when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchPostings();
    }
  }, [selectedSession]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      if (sessionsData.length > 0) {
        const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      toast.error('Failed to load sessions');
    }
  };

  const fetchPostings = async () => {
    setLoading(true);
    try {
      const params = selectedSession ? { session_id: selectedSession } : {};
      const response = await locationApi.getMyPostingsLocationStatus(params);
      setPostings(response.data.data || []);
    } catch (err) {
      console.error('Failed to load postings:', err);
      toast.error('Failed to load your postings');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchPostings();
  };

  const handleOpenDialog = (posting) => {
    setSelectedPosting(posting);
    setDialogOpen(true);
  };

  const handleVerified = (result) => {
    // Update the posting in the list
    setPostings((prev) =>
      prev.map((p) =>
        p.posting_id === selectedPosting.posting_id
          ? { ...p, location_verified: true, location_verified_at: new Date().toISOString() }
          : p
      )
    );
    setDialogOpen(false);
    toast.success('Location verified successfully!');
  };

  // Calculate statistics
  const stats = {
    total: postings.length,
    verified: postings.filter((p) => p.location_verified).length,
    pending: postings.filter((p) => !p.location_verified && p.has_coordinates).length,
    noCoordinates: postings.filter((p) => !p.has_coordinates).length,
  };

  // Session options
  const sessionOptions = sessions.map((s) => ({
    value: s.id.toString(),
    label: s.name + (s.is_current ? ' (Current)' : ''),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Location Tracker</h1>
          <p className="mt-1 text-sm text-gray-500">
            Verify your location at each school before uploading results
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <IconRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="w-48"
          >
            <option value="">Select Session</option>
            {sessionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <IconSchool className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total Postings</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <IconCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{stats.verified}</p>
                <p className="text-xs text-gray-500">Verified</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <IconClock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <IconAlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{stats.noCoordinates}</p>
                <p className="text-xs text-gray-500">No GPS Set</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Postings List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconMapPin className="h-5 w-5 text-primary-600" />
            My Postings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <IconLoader2 className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : postings.length === 0 ? (
            <div className="py-12 text-center">
              <IconSchool className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-sm text-gray-500">No postings found for this session</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {postings.map((posting) => (
                <div
                  key={posting.posting_id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <IconSchool className="h-5 w-5 text-gray-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">
                          {posting.school_name} 
                          <span className="text-sm text-gray-600">({posting.school_code})</span>
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" size="sm">
                            Group {posting.group_number}
                          </Badge>
                          <Badge variant="outline" size="sm">
                            {getOrdinal(posting.visit_number)} Visit
                          </Badge>
                          {posting.is_primary_posting ? (
                            <Badge variant="primary" size="sm">Primary</Badge>
                          ) : (
                            <Badge variant="secondary" size="sm">Secondary</Badge>
                          )}
                          {posting.distance_km && (
                            <Badge variant="info" size="sm">
                              {posting.distance_km}km
                            </Badge>
                          )}
                        </div>
                        {/* Map Links */}
                        {posting.has_coordinates && (
                          <div className="flex items-center gap-3 mt-1">
                            <a
                              href={getMapViewUrl(posting.school_latitude, posting.school_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline"
                              title="View school location on Google Maps"
                            >
                              <IconExternalLink className="w-3.5 h-3.5" />
                              <span>Open in Maps</span>
                            </a>
                            <a
                              href={getDirectionsUrl(posting.school_latitude, posting.school_longitude)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:underline"
                              title="Get directions to this school"
                            >
                              <IconNavigation className="w-3.5 h-3.5" />
                              <span>Get Directions</span>
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status Badge */}
                    {posting.location_verified ? (
                      <Badge variant="success" className="flex items-center gap-1">
                        <IconCheck className="h-3.5 w-3.5" />
                        Verified
                      </Badge>
                    ) : !posting.has_coordinates ? (
                      <Badge variant="danger" className="flex items-center gap-1">
                        <IconX className="h-3.5 w-3.5" />
                        No GPS
                      </Badge>
                    ) : (
                      <Badge variant="warning" className="flex items-center gap-1">
                        <IconClock className="h-3.5 w-3.5" />
                        Pending
                      </Badge>
                    )}

                    {/* Action Button */}
                    <Button
                      size="sm"
                      variant={posting.location_verified ? 'outline' : 'primary'}
                      onClick={() => handleOpenDialog(posting)}
                      disabled={!posting.has_coordinates && !posting.location_verified}
                    >
                      {posting.location_verified ? (
                        <>
                          <IconEye className="h-4 w-4 mr-1" />
                          Details
                        </>
                      ) : (
                        <>
                          <IconCurrentLocation className="h-4 w-4 mr-1" />
                          Record Location
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Verification Dialog */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={
          selectedPosting?.location_verified
            ? 'Location Verification Details'
            : 'Verify Your Location'
        }
        width="xl"
      >
        {selectedPosting && (
          <div className="space-y-4">
            {selectedPosting.location_verified ? (
              // Show verification details
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                      <IconCheck className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-green-800">Location Verified</p>
                      <p className="text-sm text-green-600">
                        {selectedPosting.location_verified_at
                          ? `Verified on ${new Date(selectedPosting.location_verified_at).toLocaleString()}`
                          : 'Your location has been verified'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-4">
                  <h4 className="font-medium text-gray-900">{selectedPosting.school_name}</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">Group {selectedPosting.group_number}</Badge>
                    <Badge variant="outline">{getOrdinal(selectedPosting.visit_number)} Visit</Badge>
                  </div>
                  {selectedPosting.school_latitude && selectedPosting.school_longitude && (
                    <>
                      <p className="mt-2 text-xs text-gray-500">
                        School Coordinates: {selectedPosting.school_latitude.toFixed(6)},{' '}
                        {selectedPosting.school_longitude.toFixed(6)}
                      </p>
                      <div className="mt-3 flex items-center gap-4">
                        <a
                          href={getMapViewUrl(selectedPosting.school_latitude, selectedPosting.school_longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 hover:underline"
                          title="View school location on Google Maps"
                        >
                          <IconExternalLink className="w-4 h-4" />
                          <span>Open in Maps</span>
                        </a>
                        <a
                          href={getDirectionsUrl(selectedPosting.school_latitude, selectedPosting.school_longitude)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 hover:underline"
                          title="Get directions to this school"
                        >
                          <IconNavigation className="w-4 h-4" />
                          <span>Get Get Directions</span>
                        </a>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              // Show location verification component
              <LocationVerification
                posting={selectedPosting}
                onVerified={handleVerified}
                onError={(error) => {
                  toast.error(error);
                }}
                showSchoolInfo={true}
              />
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default LocationTrackerPage;
