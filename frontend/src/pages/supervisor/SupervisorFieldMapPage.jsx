/**
 * Supervisor Field Map
 * Visual, map-based view of a supervisor's entire posting workload:
 * school locations, an optimized visit order, distance and visit-status
 * tracking, and a one-tap hand-off to Google Maps for turn-by-turn nav.
 */

import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { postingsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatsCard, StatsGrid } from '../../components/ui/StatsCard';
import { DashboardSkeleton } from '../../components/ui/Skeleton';
import { formatGreetingName, getMapViewUrl, getDirectionsUrl, getMultiStopDirectionsUrl } from '../../utils/helpers';
import {
  IconRefresh,
  IconRoute,
  IconSchool,
  IconUsers,
  IconClock,
  IconNavigation,
  IconExternalLink,
  IconMapPinOff,
  IconAlertTriangle,
  IconCheck,
  IconMapPin,
} from '@tabler/icons-react';

const STATUS_META = {
  visited: { label: 'Visited', badge: 'bg-green-50 text-green-700 ring-green-200', marker: '#16a34a' },
  pending: { label: 'Pending', badge: 'bg-amber-50 text-amber-700 ring-amber-200', marker: '#f59e0b' },
  overdue: { label: 'Overdue', badge: 'bg-red-50 text-red-700 ring-red-200', marker: '#dc2626' },
};

// Average road speed + fixed per-stop dwell time, for a rough trip-time estimate only.
const AVG_SPEED_KMH = 35;
const MINUTES_PER_STOP = 45;

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function numberedIcon(number, color) {
  return L.divIcon({
    className: '',
    html: `<div style="background:${color}" class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ring-2 ring-white shadow-md">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

const institutionIcon = L.divIcon({
  className: '',
  html: `<div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-700 text-white ring-2 ring-white shadow-md"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M14 16h1M5 21V5a1 1 0 0 1 1-1h5l7 3v14"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -18],
});

function SupervisorFieldMapPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [hasPostings, setHasPostings] = useState(false);

  const fetchFieldMap = async (isRefresh = false) => {
    try {
      setError(null);
      if (isRefresh) setRefreshing(true);
      const response = await postingsApi.getFieldMap();
      const body = response.data || {};
      setHasPostings(Boolean(body.has_postings));
      setData(body.data || null);
    } catch (err) {
      console.error('Failed to load field map:', err);
      setError(err.response?.data?.message || 'Failed to load your field map');
      toast.error('Failed to load your field map');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFieldMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orderedSchools = useMemo(() => {
    if (!data) return [];
    if (data.optimized_order?.length) {
      return data.optimized_order
        .map((id) => data.schools.find((s) => s.institution_school_id === id))
        .filter(Boolean);
    }
    // No institution GPS to route from - fall back to nearest-first by known distance.
    return [...(data.schools || [])].sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
  }, [data]);

  const mapBounds = useMemo(() => {
    if (!data) return null;
    const points = [];
    if (data.institution?.latitude != null) points.push([data.institution.latitude, data.institution.longitude]);
    orderedSchools.forEach((s) => points.push([s.latitude, s.longitude]));
    return points.length > 0 ? L.latLngBounds(points) : null;
  }, [data, orderedSchools]);

  const estTripMinutes = data
    ? (data.total_distance_km / AVG_SPEED_KMH) * 60 + orderedSchools.length * MINUTES_PER_STOP
    : 0;

  const allStopsUrl = useMemo(() => {
    if (!orderedSchools.length) return null;
    const stops = orderedSchools.map((s) => ({ lat: s.latitude, lng: s.longitude }));
    const origin =
      data?.institution?.latitude != null
        ? { lat: data.institution.latitude, lng: data.institution.longitude }
        : null;
    return getMultiStopDirectionsUrl(stops, origin);
  }, [orderedSchools, data]);

  if (loading) {
    return <DashboardSkeleton statCards={4} />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <Button onClick={() => fetchFieldMap()}>Try Again</Button>
      </div>
    );
  }

  const unlocated = data?.unlocated || [];
  const institution = data?.institution || null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl py-4 px-6 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">Field Map</h1>
            <p className="text-primary-100 text-sm">
              {formatGreetingName(user?.name)}&apos;s posting workload{data?.session ? ` — ${data.session.name}` : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchFieldMap(true)}
            disabled={refreshing}
            className="text-white bg-white/10 hover:bg-white/20"
          >
            <IconRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {!hasPostings ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <IconSchool className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p>You have no active postings this session yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {institution && institution.latitude == null && orderedSchools.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <IconAlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Your institution doesn&apos;t have a GPS location set yet, so we can&apos;t suggest an optimized visit
                order. Ask an admin to set it to unlock route optimization.
              </span>
            </div>
          )}

          {/* Workload Stats */}
          <StatsGrid columns={4}>
            <StatsCard label="Total Schools" value={data.statistics.total_schools} icon={IconSchool} tone="blue" />
            <StatsCard
              label="Total Distance"
              value={`${data.total_distance_km} km`}
              icon={IconRoute}
              tone="purple"
            />
            <StatsCard label="Total Students" value={data.statistics.total_students} icon={IconUsers} tone="teal" />
            <StatsCard
              label="Est. Trip Time"
              value={formatDuration(estTripMinutes)}
              icon={IconClock}
              tone="amber"
              subValue="Rough estimate"
            />
          </StatsGrid>

          {/* Map */}
          {mapBounds && (
            <Card>
              <CardContent className="p-0 overflow-hidden rounded-lg">
                <MapContainer
                  bounds={mapBounds}
                  boundsOptions={{ padding: [40, 40] }}
                  style={{ height: '420px', width: '100%' }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {institution?.latitude != null && (
                    <Marker position={[institution.latitude, institution.longitude]} icon={institutionIcon}>
                      <Popup>
                        <strong>{institution.name}</strong>
                        <br />
                        Start point
                      </Popup>
                    </Marker>
                  )}
                  {orderedSchools.map((s, index) => (
                    <Marker
                      key={s.institution_school_id}
                      position={[s.latitude, s.longitude]}
                      icon={numberedIcon(index + 1, STATUS_META[s.visit_status]?.marker || '#6b7280')}
                    >
                      <Popup>
                        <strong>{s.school_name}</strong>
                        <br />
                        {s.school_address}
                        <br />
                        {s.distance_km} km from institution &middot; {STATUS_META[s.visit_status]?.label}
                        <br />
                        <a href={getDirectionsUrl(s.latitude, s.longitude)} target="_blank" rel="noopener noreferrer">
                          Get directions
                        </a>
                      </Popup>
                    </Marker>
                  ))}
                  {data.route_available && institution?.latitude != null && (
                    <Polyline
                      positions={[
                        [institution.latitude, institution.longitude],
                        ...orderedSchools.map((s) => [s.latitude, s.longitude]),
                      ]}
                      pathOptions={{ color: '#1a5f2a', weight: 3, dashArray: '6 6' }}
                    />
                  )}
                </MapContainer>
              </CardContent>
            </Card>
          )}

          {/* Directions CTA */}
          {allStopsUrl && (
            <a href={allStopsUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Button className="w-full sm:w-auto">
                <IconNavigation className="w-4 h-4 mr-2" />
                Get Directions to All Stops
              </Button>
            </a>
          )}

          {/* Ordered Stop List */}
          {orderedSchools.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IconRoute className="w-4 h-4" />
                  {data.route_available ? 'Suggested Visit Order' : 'Your Schools'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-gray-100">
                {orderedSchools.map((s, index) => {
                  const status = STATUS_META[s.visit_status] || STATUS_META.pending;
                  return (
                    <div key={s.institution_school_id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{s.school_name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {s.distance_km} km from institution
                          {s.distance_from_previous_km != null && (
                            <> &middot; {s.distance_from_previous_km} km from previous stop</>
                          )}
                          {' '}&middot; {s.student_count} student{s.student_count === 1 ? '' : 's'}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${status.badge}`}
                      >
                        {s.visit_status === 'visited' && <IconCheck className="w-3 h-3" />}
                        {status.label}
                      </span>
                      <a
                        href={getMapViewUrl(s.latitude, s.longitude)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700"
                        title="View on map"
                      >
                        <IconExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Unlocated Schools */}
          {unlocated.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <IconMapPinOff className="w-4 h-4" />
                  Location Pending ({unlocated.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-gray-100">
                {unlocated.map((s) => {
                  const status = STATUS_META[s.visit_status] || STATUS_META.pending;
                  return (
                    <div key={s.institution_school_id} className="flex items-center gap-3 px-4 py-3">
                      <IconMapPin className="w-4 h-4 flex-shrink-0 text-gray-300" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{s.school_name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {s.distance_km} km from institution &middot; {s.student_count} student
                          {s.student_count === 1 ? '' : 's'} &middot; location not yet recorded
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${status.badge}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default SupervisorFieldMapPage;
