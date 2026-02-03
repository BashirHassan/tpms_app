/**
 * Supervisor My Postings Page (Printable)
 * Shows supervisor's assigned postings grouped by School/Group/Visit
 * with list of students under each posting
 * 
 * A4 Print Ready Layout
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { postingsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
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
import { getOrdinal } from '../../utils/helpers';
import {
  IconPrinter,
  IconRefresh,
  IconSchool,
  IconUsers,
  IconAlertCircle,
  IconFilter,
  IconMapPin,
  IconMail,
} from '@tabler/icons-react';

function SupervisorMyPostingsPage() {
  const { user, institution } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [postings, setPostings] = useState([]);
  const [hasPostings, setHasPostings] = useState(false);
  const [statistics, setStatistics] = useState(null);

  // Filters - store all options separately so they persist when filtering
  const [allRoutes, setAllRoutes] = useState([]);
  const [allVisitNumbers, setAllVisitNumbers] = useState([]);
  const [allLocationCategories, setAllLocationCategories] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedVisit, setSelectedVisit] = useState('');
  const [selectedLocationCategory, setSelectedLocationCategory] = useState('');

  // Fetch postings on mount and when filters change
  useEffect(() => {
    fetchPostings();
  }, [selectedRoute, selectedVisit, selectedLocationCategory]);

  const fetchPostings = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedRoute) params.route_id = selectedRoute;
      if (selectedVisit) params.visit_number = selectedVisit;
      if (selectedLocationCategory) params.location_category = selectedLocationCategory;

      const response = await postingsApi.getMyPostingsPrintable(params);
      const responseData = response.data || {};

      setSession(responseData.session || null);
      setHasPostings(responseData.has_postings || false);
      setPostings(responseData.data || []);
      setStatistics(responseData.statistics || null);
      
      // Only update filter options when no filters are applied (initial load)
      // This ensures all options remain available even when filtering
      const noFiltersApplied = !selectedRoute && !selectedVisit && !selectedLocationCategory;
      if (noFiltersApplied) {
        setAllRoutes(responseData.routes || []);
        setAllVisitNumbers(responseData.visit_numbers || []);
        setAllLocationCategories(responseData.location_categories || []);
      }
    } catch (err) {
      console.error('Failed to load postings:', err);
      toast.error('Failed to load your postings');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 sm:h-64">
        <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // No postings state
  if (!hasPostings) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Postings</h1>
        </div>
        <Card>
          <CardContent className="p-8 sm:p-12 text-center">
            <IconAlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">No Postings Found</h2>
            <p className="text-gray-500 max-w-md mx-auto text-sm sm:text-base">
              You have not been posted to any school for supervision in the current session.
            </p>
            {session && (
              <p className="text-xs sm:text-sm text-gray-400 mt-3 sm:mt-4">
                Current Session: {session.name}
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
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Postings</h1>
            {session && (
              <p className="text-xs sm:text-sm text-gray-500 truncate">Session: {session.name}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={() => {
              setSelectedRoute('');
              setSelectedVisit('');
              setSelectedLocationCategory('');
            }} disabled={loading} className="active:scale-95">
              <IconRefresh className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Link to="/admin/my-invitation">
              <Button variant="outline" size="sm" className="active:scale-95">
                <IconMail className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Invitation</span>
              </Button>
            </Link>
            <Button variant="primary" size="sm" onClick={handlePrint} className="active:scale-95">
              <IconPrinter className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Print</span>
            </Button>
          </div>
        </div>

        {/* Filters & Stats Bar */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-3">
            <div className="p-3 sm:p-4 space-y-0">
                {/* Stats – mobile first, right-aligned on desktop */}
                {statistics && (
                    <div className="flex flex-wrap gap-2 sm:gap-3 md:justify-end">
                        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-primary-50 rounded-full">
                            <IconSchool className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-600" />
                            <span className="text-xs sm:text-sm font-semibold text-primary-700">
                            {statistics.total_schools}{' '}
                            {statistics.total_schools === 1 ? 'school' : 'schools'}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-green-50 rounded-full">
                            <IconUsers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600" />
                            <span className="text-xs sm:text-sm font-semibold text-green-700">
                            {statistics.total_students}{' '}
                            {statistics.total_students === 1 ? 'student' : 'students'}
                            </span>
                        </div>
                    </div>
                )}

                {/* Filters – single row with explicit label */}
                <div>
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm mb-1 font-semibold text-gray-700 whitespace-nowrap">
                        <IconFilter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500" />
                        <span>Filters:</span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
          className="print:p-0"
        >
          <DocumentLetterhead 
            institution={institution}
            showContacts={true}
            session={session}
            variant="full"
          />

          <h2 
            className="text-center font-bold text-lg uppercase tracking-wide"
          >
            SUPERVISOR POSTING SCHEDULE
          </h2>
          <h3 className="text-center text-base">
            {session?.name} Teaching Practice Exercise
          </h3>

          {/* Supervisor Info */}
          <div className="border border-gray-300 rounded-lg px-4 py-2 mb-3 bg-gray-50">
            <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 text-sm">
              <div>
                <span className="font-semibold">Supervisor Name:</span>{' '}
                <span className="uppercase">{user?.name}</span>
              </div>
              {statistics && (
                <div className="md:text-end">
                  <span className="font-semibold">Summary:</span>{' '}
                  {statistics.total_postings} ({statistics.total_schools} schools, {statistics.total_students} students)
                </div>
              )}
            </div>
          </div>

          {/* Postings List - postings now have merged_groups nested structure */}
          <PostingList postings={postings} />

          {/* Document Footer */}
          <DocumentFooter institution={institution} session={session} />
        </DocumentContainer>
      </div>
    </div>
  );
}

export default SupervisorMyPostingsPage;
