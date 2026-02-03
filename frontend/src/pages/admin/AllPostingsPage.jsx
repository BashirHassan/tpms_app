/**
 * All Postings Page (TP Head - Printable)
 * Shows all supervisors' postings grouped by Supervisor/School/Group/Visit
 * with list of students under each posting
 * 
 * A4 Print Ready Layout (Landscape when showing all supervisors)
 */

import { useState, useEffect } from 'react';
import { postingsApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, getOrdinal, getMapViewUrl, getDirectionsUrl } from '../../utils/helpers';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import {
  DocumentLetterhead,
  DocumentContainer,
  DocumentFooter,
  DocumentPrintStyles,
} from '../../components/documents/DocumentPreview';
import { PostingList } from '../../components/postings';
import {
  IconPrinter,
  IconRefresh,
  IconSchool,
  IconUsers,
  IconAlertCircle,
  IconFilter,
  IconUser,
  IconCalendar,
  IconMapPin,
  IconMap2,
  IconPhone,
  IconRoute,
  IconEye,
  IconExternalLink,
  IconNavigation,
} from '@tabler/icons-react';
import { Badge } from '../../components/ui/Badge';

// ============================================
// Supervisors Table Component
// ============================================
function SupervisorsTable({ supervisors, className = '', isPrepostingMode = false, maxVisits = 3 }) {
  // In preposting mode, show empty rows for each visit number
  if (isPrepostingMode) {
    const visitRows = Array.from({ length: maxVisits }, (_, i) => i + 1);
    return (
      <table className={`w-full text-xs border-collapse ${className}`}>
        <thead>
          <tr className="bg-blue-100">
            <th className="border border-gray-300 px-1.5 py-0.5 text-left font-semibold w-8">
              Visit
            </th>
            <th className="border border-gray-300 px-1.5 py-0.5 text-left font-semibold">
              Supervisor
            </th>
          </tr>
        </thead>
        <tbody>
          {visitRows.map((visitNum, idx) => (
            <tr
              key={`prepost-visit-${visitNum}`}
              className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              <td className="border border-gray-300 px-1.5 py-0.5 text-center font-semibold">
                {getOrdinal(visitNum)}
              </td>
              <td className="border border-gray-300 px-1.5 py-0.5 h-5">
                {/* Empty cell for preposting template */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (!supervisors || supervisors.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No supervisors assigned
      </p>
    );
  }

  return (
    <table className={`w-full text-xs border-collapse ${className}`}>
      <thead>
        <tr className="bg-blue-100">
          <th className="border border-gray-300 px-1.5 py-0.5 text-left font-semibold w-8">
            Visit
          </th>
          <th className="border border-gray-300 px-1.5 py-0.5 text-left font-semibold">
            Supervisor
          </th>
        </tr>
      </thead>
      <tbody>
        {supervisors.map((sup, idx) => (
          <tr
            key={`${sup.supervisor_id}-${sup.visit_number}`}
            className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
          >
            <td className="border border-gray-300 px-1.5 py-0.5 text-center font-semibold">
              {getOrdinal(sup.visit_number)}
            </td>
            <td className="border border-gray-300 px-1.5 py-0.5">
              {sup.supervisor_name}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ============================================
// Students Table Component (Compact)
// ============================================
function StudentsTableCompact({ students, className = '' }) {
  if (!students || students.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic">
        No students assigned
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-2 sm:mx-0">
      <table className={`w-full text-xs border-collapse ${className}`}>
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-1 py-0.5 text-left font-semibold w-6">
              #
            </th>
            <th className="border border-gray-300 px-1 py-0.5 text-left font-semibold">
              Reg. Number
            </th>
            <th className="border border-gray-300 px-1 py-0.5 text-left font-semibold">
              Student Name
            </th>
            <th className="border border-gray-300 px-1 py-0.5 text-left font-semibold">
              Score
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, idx) => (
            <tr
              key={student.student_id}
              className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              <td className="border border-gray-300 px-1 py-0.5 text-center">
                {idx + 1}
              </td>
              <td className="border border-gray-300 px-1 py-0.5 whitespace-nowrap">
                {student.registration_number}
              </td>
              <td className="border border-gray-300 px-1 py-0.5 whitespace-nowrap">
                {student.full_name}
              </td>
              <td className="border border-gray-300 px-1 py-0.5">
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================
// School Group Card Component
// ============================================
function SchoolGroupCard({ group, className = '', isPrepostingMode = false, maxVisits = 3 }) {
  const hasMergedGroups = group.merged_groups && group.merged_groups.length > 0;
  const totalSchools = 1 + (group.merged_groups?.length || 0);
  const hasCoordinates = group.school_latitude && group.school_longitude;

  // Build full location string
  const locationParts = [
    group.school_ward,
    group.school_lga && `${group.school_lga} LGA`,
    group.school_state && `${group.school_state} State`,
  ].filter(Boolean);
  const fullLocation = locationParts.join(', ');

  return (
    <div className={`posting-card border border-gray-300 rounded-lg overflow-hidden ${className}`}>
      {/* School Header - Matching PostingCard style */}
      <div className="bg-gray-100 border-b border-gray-200 px-2 sm:px-4 py-2">
        {/* School Name Row with Distance & Location Category */}
        <div className="flex flex-col sm:flex-row sm:items-start md:items-center gap-1 sm:justify-between">
          <div className="flex items-start gap-1.5 min-w-0 flex-1">
            <IconSchool className="h-4 w-4 sm:h-5 sm:w-5 text-primary-600 flex-shrink-0 mt-0.5" />
            <h4 className="text-xs sm:text-sm font-semibold text-gray-900 leading-tight break-words">
              {group.school_name}
            </h4>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {group.school_distance_km && (
              <>
                <span className="text-xs uppercase">{group.location_category}</span>
                <span className="text-sm">
                  ({Number(group.school_distance_km).toFixed(1)} km)
                </span>
              </>
            )}
            {hasMergedGroups && (
              <span className="text-[10px] sm:text-xs text-primary-800 px-1.5 py-0.5 rounded bg-primary-50 font-medium">
                Merged ({totalSchools} schools)
              </span>
            )}
          </div>
        </div>

        {/* Address & Location Details */}
        <div className="mt-1 space-y-0.5 sm:ml-0">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {group.school_address && (
              <div className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-600">
                <IconMapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                <span className="break-words">{group.school_address}</span>
              </div>
            )}
            {/* Map Links - Only show if coordinates exist */}
            {hasCoordinates && (
              <div className="flex items-center md:justify-end gap-3 text-[10px] sm:text-xs print:hidden">
                <a
                  href={getMapViewUrl(group.school_latitude, group.school_longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
                  title="View school location on Google Maps"
                >
                  <IconExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Open in Maps</span>
                </a>
                <a
                  href={getDirectionsUrl(group.school_latitude, group.school_longitude)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
                  title="Get directions to this school"
                >
                  <IconNavigation className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>Get Directions</span>
                </a>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2">
            {fullLocation && (
              <div className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-600">
                <IconMap2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                <span className="break-words">{fullLocation}</span>
              </div>
            )}
            {group.principal_phone && (
              <div className="flex items-center md:justify-end gap-1.5 text-[10px] sm:text-xs text-gray-600">
                <IconPhone className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-gray-300" />
                <span>
                  {group.principal_name ? `${group.principal_name}: ` : 'Principal: '}
                  <a href={`tel:${group.principal_phone}`} className="text-primary-600 hover:underline print:text-black print:no-underline">
                    {group.principal_phone}
                  </a>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Meta Badges - Matching PostingCard style */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between gap-1 mt-1 pt-0.5 border-t border-gray-300">
          <div className="flex flex-wrap items-center font-semibold text-[11px] leading-tight text-gray-800 print:text-black gap-x-1 sm:gap-x-0">
            <span>Group {group.group_number}</span>
            {group.route_name && (
              <>
                <span className="mx-1 sm:mx-2 print:mx-1">|</span>
                <span className="break-words">{group.route_name}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Side by Side Layout */}
      <div className="p-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Students Table (Left - Larger) */}
          <div className="flex-1 min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
              <IconUsers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Students ({group.student_count || group.students?.length || 0})
            </div>
            <StudentsTableCompact students={group.students} />
          </div>

          {/* Supervisors Table (Right - Narrower) */}
          <div className="w-48 flex-shrink-0">
            <div className="text-xs sm:text-sm font-semibold text-primary-700 mb-1 flex items-center gap-1">
              <IconUser className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {isPrepostingMode ? `Visits (${maxVisits})` : `Supervisors (${group.supervisors?.length || 0})`}
            </div>
            <SupervisorsTable 
              supervisors={group.supervisors} 
              isPrepostingMode={isPrepostingMode}
              maxVisits={maxVisits}
            />
          </div>
        </div>
      </div>

      {/* Merged Schools Section */}
      {hasMergedGroups && (
        <div className="px-2 sm:px-3 pb-2 sm:pb-3 space-y-1">
          {/* Divider with label */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-purple-600 font-semibold pt-1.5 sm:pt-2 border-t border-gray-200">
            <IconRoute className="w-3 h-3 flex-shrink-0" />
            <span>MERGED SCHOOLS ({group.merged_groups.length})</span>
          </div>

          {group.merged_groups.map((merged) => {
            const mergedLocationParts = [
              merged.school_ward,
              merged.school_lga && `${merged.school_lga} LGA`,
              merged.school_state && `${merged.school_state} State`,
            ].filter(Boolean);
            const mergedFullLocation = mergedLocationParts.join(', ');
            const mergedHasCoordinates = merged.school_latitude && merged.school_longitude;

            return (
              <div
                key={`${merged.school_id}-${merged.group_number}`}
                className="posting-card border-2 border-purple-300 rounded-lg overflow-hidden bg-white"
              >
                {/* Merged School Header - Matching PostingCard secondary style */}
                <div className="bg-purple-50 border-b border-purple-200 px-2 sm:px-4 py-2">
                  {/* School Name Row */}
                  <div className="flex flex-col sm:flex-row sm:items-start md:items-center gap-1 sm:justify-between">
                    <div className="flex items-start gap-1.5 sm:gap-2 min-w-0 flex-1">
                      <IconSchool className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-900 leading-tight break-words">
                        {merged.school_name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {merged.school_distance_km && (
                        <>
                          <span className="text-xs uppercase">{merged.location_category}</span>
                          <span className="text-sm">
                            ({Number(merged.school_distance_km).toFixed(1)} km)
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Address & Location Details */}
                  <div className="mt-1 space-y-0.5">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                      {merged.school_address && (
                        <div className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-600">
                          <IconMapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                          <span className="break-words">{merged.school_address}</span>
                        </div>
                      )}
                      {/* Map Links */}
                      {mergedHasCoordinates && (
                        <div className="flex items-center md:justify-end gap-3 text-[10px] sm:text-xs print:hidden">
                          <a
                            href={getMapViewUrl(merged.school_latitude, merged.school_longitude)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary-600 hover:text-primary-700 hover:underline"
                            title="View school location on Google Maps"
                          >
                            <IconExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span>Open in Maps</span>
                          </a>
                          <a
                            href={getDirectionsUrl(merged.school_latitude, merged.school_longitude)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
                            title="Get directions to this school"
                          >
                            <IconNavigation className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            <span>Get Directions</span>
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2">
                      {mergedFullLocation && (
                        <div className="flex items-start gap-1.5 text-[10px] sm:text-xs text-gray-600">
                          <IconMap2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 mt-0.5 text-gray-300" />
                          <span className="break-words">{mergedFullLocation}</span>
                        </div>
                      )}
                      {merged.principal_phone && (
                        <div className="flex items-center md:justify-end gap-1.5 text-[10px] sm:text-xs text-gray-600">
                          <IconPhone className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0 text-gray-300" />
                          <span>
                            {merged.principal_name ? `${merged.principal_name}: ` : 'Principal: '}
                            <a href={`tel:${merged.principal_phone}`} className="text-primary-600 hover:underline print:text-black print:no-underline">
                              {merged.principal_phone}
                            </a>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Meta Badges */}
                  <div className="flex flex-wrap items-center font-semibold text-[11px] leading-tight text-gray-800 print:text-black gap-x-1 sm:gap-x-0 mt-1 pt-0.5 border-t border-purple-200">
                    <span>Group {merged.group_number}</span>
                    {merged.route_name && (
                      <>
                        <span className="mx-1 sm:mx-2 print:mx-1">|</span>
                        <span className="break-words">{merged.route_name}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Merged School Content - Students Only */}
                <div className="p-3">
                  <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
                    <IconUsers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    Students ({merged.student_count || merged.students?.length || 0})
                  </div>
                  <StudentsTableCompact students={merged.students} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// School Group List Component
// ============================================
function SchoolGroupList({ groups, className = '', isPrepostingMode = false, maxVisits = 3 }) {
  if (!groups || groups.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {groups.map((group, index) => (
        <SchoolGroupCard
          key={`${group.school_id}-${group.group_number}-${index}`}
          group={group}
          isPrepostingMode={isPrepostingMode}
          maxVisits={maxVisits}
        />
      ))}
    </div>
  );
}

function AllPostingsPage() {
  const { institution } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [postingsData, setPostingsData] = useState([]);
  const [groupedBySupervisor, setGroupedBySupervisor] = useState(false);
  const [groupedBySchool, setGroupedBySchool] = useState(false);
  const [hasPostings, setHasPostings] = useState(false);
  const [statistics, setStatistics] = useState(null);

  // Filter options (persist when filtering)
  const [allSessions, setAllSessions] = useState([]);
  const [allSupervisors, setAllSupervisors] = useState([]);
  const [allRoutes, setAllRoutes] = useState([]);
  const [allVisitNumbers, setAllVisitNumbers] = useState([]);
  const [allLocationCategories, setAllLocationCategories] = useState([]);

  // Selected filters
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedVisit, setSelectedVisit] = useState('');
  const [selectedLocationCategory, setSelectedLocationCategory] = useState('');
  const [viewType, setViewType] = useState('postings'); // 'postings' or 'preposting'

  // Initial load - fetch current session first
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch data when filters or viewType change
  useEffect(() => {
    if (selectedSession || allSessions.length > 0) {
      fetchData();
    }
  }, [selectedSession, selectedSupervisor, selectedRoute, selectedVisit, selectedLocationCategory, viewType]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // First fetch to get sessions and current session
      const response = await postingsApi.getAllPostingsPrintable({});
      const responseData = response.data || {};

      setSession(responseData.session || null);
      setHasPostings(responseData.has_postings || false);
      setPostingsData(responseData.data || []);
      setGroupedBySupervisor(responseData.grouped_by_supervisor || false);
      setGroupedBySchool(responseData.grouped_by_school || false);
      setStatistics(responseData.statistics || null);

      // Store filter options
      setAllSessions(responseData.sessions || []);
      setAllSupervisors(responseData.supervisors || []);
      setAllRoutes(responseData.routes || []);
      setAllVisitNumbers(responseData.visit_numbers || []);
      setAllLocationCategories(responseData.location_categories || []);

      // Set current session as selected if available
      if (responseData.session) {
        setSelectedSession(responseData.session.id.toString());
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
      toast.error('Failed to load postings');
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedSession) params.session_id = selectedSession;
      if (selectedRoute) params.route_id = selectedRoute;
      if (selectedLocationCategory) params.location_category = selectedLocationCategory;

      // Use different endpoint based on view type
      if (viewType === 'preposting') {
        // Preposting template - fetch from acceptances-based endpoint
        const response = await postingsApi.getPrepostingTemplate(params);
        const responseData = response.data || {};

        setSession(responseData.session || null);
        setHasPostings(responseData.has_data || false);
        setPostingsData(responseData.data || []);
        setGroupedBySupervisor(false);
        setGroupedBySchool(true); // Always grouped by school for preposting
        setStatistics(responseData.statistics || null);

        // Update filter options
        setAllSessions(responseData.sessions || []);
        setAllRoutes(responseData.routes || []);
        setAllLocationCategories(responseData.location_categories || []);
        // Clear supervisor/visit filters as they're not applicable
        setAllSupervisors([]);
        setAllVisitNumbers([]);
      } else {
        // Regular postings view
        if (selectedSupervisor) params.supervisor_id = selectedSupervisor;
        if (selectedVisit) params.visit_number = selectedVisit;

        const response = await postingsApi.getAllPostingsPrintable(params);
        const responseData = response.data || {};

        setSession(responseData.session || null);
        setHasPostings(responseData.has_postings || false);
        setPostingsData(responseData.data || []);
        setGroupedBySupervisor(responseData.grouped_by_supervisor || false);
        setGroupedBySchool(responseData.grouped_by_school || false);
        setStatistics(responseData.statistics || null);

        // Only update filter options when minimal filters are applied (session only)
        const minimalFilters = !selectedSupervisor && !selectedRoute && !selectedVisit && !selectedLocationCategory;
        if (minimalFilters) {
          setAllSupervisors(responseData.supervisors || []);
          setAllRoutes(responseData.routes || []);
          setAllVisitNumbers(responseData.visit_numbers || []);
          setAllLocationCategories(responseData.location_categories || []);
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleRefresh = () => {
    setSelectedSupervisor('');
    setSelectedRoute('');
    setSelectedVisit('');
    setSelectedLocationCategory('');
    fetchData();
  };

  // Format date with long month format
  const formatDateLong = (dateStr) => formatDate(dateStr, { month: 'long' }, 'N/A');

  // Loading state
  if (loading && !session) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // No postings state
  if (!hasPostings && !loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-2xl font-bold text-gray-900">All Supervisor Postings</h1>
        </div>

        {/* Session Filter even when no postings */}
        <div className="print:hidden max-w-[210mm] mx-auto">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2 text-sm mb-2 font-semibold text-gray-700">
              <IconCalendar className="w-4 h-4 text-gray-500" />
              <span>Session:</span>
            </div>
            <Select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full md:w-64"
            >
              {allSessions.map(s => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name} {s.is_current ? '(Current)' : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-12 text-center">
            <IconAlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No Postings Found</h2>
            <p className="text-gray-500 max-w-md mx-auto">
              {selectedSupervisor 
                ? 'The selected supervisor has no postings in this session.'
                : 'No supervisors have been posted to any schools in this session.'
              }
            </p>
            {session && (
              <p className="text-sm text-gray-400 mt-4">
                Session: {session.name}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header with filters - Hidden on print */}
      <div className="print:hidden max-w-[210mm] mx-auto">
        {/* Page Header */}
        <div className="flex sm:items-center sm:justify-between gap-2 sm:gap-3 mb-1">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">All Supervisor Postings</h1>
            {session && (
              <p className="text-xs sm:text-sm text-gray-500 truncate">Session: {session.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="active:scale-95">
              <IconRefresh className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="primary" size="sm" onClick={handlePrint} className="active:scale-95">
              <IconPrinter className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Print</span>
            </Button>
          </div>
        </div>

        {/* Filters & Stats Bar */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-3">
          <div className="p-4 space-y-3">
            {/* Stats – mobile first, right-aligned on desktop */}
            {statistics && (
              <div className="flex flex-wrap gap-3 md:justify-end">
                {/* Supervisor count - only show in postings view */}
                {viewType === 'postings' && statistics.total_supervisors !== undefined && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full">
                    <IconUser className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-700">
                      {statistics.total_supervisors}{' '}
                      {statistics.total_supervisors === 1 ? 'supervisor' : 'supervisors'}
                    </span>
                  </div>
                )}

                {/* Groups count - show in preposting view */}
                {viewType === 'preposting' && statistics.total_groups !== undefined && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full">
                    <IconUsers className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-700">
                      {statistics.total_groups}{' '}
                      {statistics.total_groups === 1 ? 'group' : 'groups'}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 rounded-full">
                  <IconSchool className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-semibold text-primary-700">
                    {statistics.total_schools}{' '}
                    {statistics.total_schools === 1 ? 'school' : 'schools'}
                  </span>
                </div>

                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
                  <IconUsers className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">
                    {statistics.total_students}{' '}
                    {statistics.total_students === 1 ? 'student' : 'students'}
                  </span>
                </div>
              </div>
            )}

            {/* Filters */}
            <div>
              <div className="flex items-center gap-2 text-sm mb-1 font-semibold text-gray-700 whitespace-nowrap">
                <IconFilter className="w-4 h-4 text-gray-500" />
                <span>Filters:</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {/* Session Filter */}
                <Select
                  value={selectedSession}
                  onChange={(e) => setSelectedSession(e.target.value)}
                  className="min-w-[160px]"
                >
                  {allSessions.map(s => (
                    <option key={s.id} value={s.id.toString()}>
                      {s.name} {s.is_current ? '(Current)' : ''}
                    </option>
                  ))}
                </Select>

                {/* View Type Filter */}
                <div className="flex items-center gap-2">
                  <Select
                    value={viewType}
                    onChange={(e) => {
                      setViewType(e.target.value);
                      // Clear supervisor/visit filters when switching to preposting
                      if (e.target.value === 'preposting') {
                        setSelectedSupervisor('');
                        setSelectedVisit('');
                      }
                    }}
                    className="min-w-[160px] flex-1"
                  >
                    <option value="postings">Postings</option>
                    <option value="preposting">Preposting Template</option>
                  </Select>
                </div>

                {/* Supervisor Filter - Only show in postings view */}
                {viewType === 'postings' && (
                  <SearchableSelect
                    options={allSupervisors}
                    value={selectedSupervisor}
                    onChange={(val) => setSelectedSupervisor(val || '')}
                    placeholder="All Supervisors"
                    searchPlaceholder="Search supervisors..."
                    getOptionValue={(s) => s.id.toString()}
                    getOptionLabel={(s) => s.name}
                    clearable={true}
                    className="min-w-[180px] md:col-span-2 lg:col-span-2"
                  />
                )}

                {/* Route Filter */}
                <SearchableSelect
                  options={allRoutes}
                  value={selectedRoute}
                  onChange={(val) => setSelectedRoute(val || '')}
                  placeholder="All Routes"
                  searchPlaceholder="Search routes..."
                  getOptionValue={(r) => r.id.toString()}
                  getOptionLabel={(r) => r.name}
                  clearable={true}
                  className="min-w-[160px]"
                />

                {/* Visit Filter - Only show in postings view */}
                {viewType === 'postings' && (
                  <Select
                    value={selectedVisit}
                    onChange={(e) => setSelectedVisit(e.target.value)}
                    className="min-w-[140px]"
                  >
                    <option value="">All Visits</option>
                    {allVisitNumbers.map(v => (
                      <option key={v} value={v.toString()}>
                        {getOrdinal(v)} Visit
                      </option>
                    ))}
                  </Select>
                )}

                {/* Location Category Filter */}
                <Select
                  value={selectedLocationCategory}
                  onChange={(e) => setSelectedLocationCategory(e.target.value)}
                  className="min-w-[140px]"
                >
                  <option value="">All Locations</option>
                  {allLocationCategories.map(cat => {
                    const threshold = session?.inside_distance_threshold_km || 10;
                    return (
                      <option key={cat} value={cat}>
                        {cat === 'inside' ? `Inside (≤${threshold}km)` : `Outside (>${threshold}km)`}
                      </option>
                    );
                  })}
                </Select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Document */}
      <div className="print-document">
        {/* Shared Print Styles */}
        <DocumentPrintStyles containerClass="print-document" />

        <DocumentContainer 
          institution={institution}
          showWatermark={true}
          className={`print:p-0`}
        >
          <DocumentLetterhead 
            institution={institution}
            showContacts={true}
            session={session}
            variant="full"
          />

          <h2 className="text-center font-bold text-lg uppercase">
            {viewType === 'preposting' 
              ? 'PREPOSTING TEMPLATE - SUPERVISION SCHEDULE'
              : 'ALL SUPERVISORS POSTING SCHEDULE'
            }
          </h2>
          <h3 className="text-center text-base mb-2">
            {session?.name} Teaching Practice Exercise
          </h3>

          {/* Summary Info */}
          <div className="border border-gray-300 rounded-lg px-4 py-2 mb-3 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 text-sm">
              {session?.tp_start_date && (
                <div>
                  <span className="font-semibold">TP Period:</span>{' '}
                  {formatDateLong(session.tp_start_date)} - {formatDateLong(session.tp_end_date)}
                </div>
              )}
              <div className="md:text-end">
                {viewType === 'preposting' ? (
                  <div>
                    <span className="font-semibold">Max Supervision Visits:</span>{' '}
                    {session?.max_supervision_visits || 6}
                  </div>
                ) : statistics && (
                  <div>
                    <span className="font-semibold">Summary:</span>{' '}
                    {statistics.total_supervisors} supervisors, {statistics.total_postings} postings, {statistics.total_students} students
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Postings - Different layouts based on grouping */}
          {groupedBySupervisor ? (
            // Supervisor selected - show grouped by supervisor
            postingsData.map((supervisorData, index) => (
              <div 
                key={supervisorData.supervisor_id} 
                className={`supervisor-section ${index > 0 ? 'mt-6 pt-4 border-t-2 border-gray-300' : ''}`}
              >
                {/* Supervisor Header */}
                <div className="bg-primary-100 border border-primary-300 rounded-lg px-4 py-2 mb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <IconUser className="w-5 h-5 text-primary-700" />
                      <span className="font-bold text-primary-900 uppercase">
                        {supervisorData.supervisor_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-primary-700">
                      <span>
                        <IconSchool className="w-4 h-4 inline mr-1" />
                        {supervisorData.posting_count} {supervisorData.posting_count === 1 ? 'posting' : 'postings'}
                      </span>
                      <span>
                        <IconUsers className="w-4 h-4 inline mr-1" />
                        {supervisorData.student_count} {supervisorData.student_count === 1 ? 'student' : 'students'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Supervisor's Postings */}
                <PostingList postings={supervisorData.postings} />
              </div>
            ))
          ) : groupedBySchool ? (
            // No supervisor selected - show grouped by school with supervisors table
            <SchoolGroupList 
              groups={postingsData} 
              isPrepostingMode={viewType === 'preposting'}
              maxVisits={session?.max_supervision_visits || 6}
            />
          ) : (
            // Fallback - flat list sorted by school name
            <PostingList postings={postingsData} showSupervisor={true} />
          )}

          {/* Document Footer */}
          <DocumentFooter institution={institution} />
        </DocumentContainer>
      </div>
    </div>
  );
}

export default AllPostingsPage;
