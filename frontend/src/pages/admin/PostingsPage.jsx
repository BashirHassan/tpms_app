/**
 * Postings Management Page
 * View and manage supervisor postings with summary stats and tabs
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { postingsApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFeature } from '../../context/InstitutionSelectionContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { DataTable } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconClipboardList,
  IconUsers,
  IconBuildingBank as IconSchool,
  IconMapPin,
  IconRefresh,
  IconTrash,
  IconCar,
  IconWalk,
  IconCheck,
  IconClock,
  IconX,
  IconSearch,
} from '@tabler/icons-react';
import { getOrdinal } from '../../utils/helpers';

function PostingsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canDelete = hasRole(['super_admin', 'head_of_teaching_practice']);
  const locationTrackingEnabled = useFeature('supervisor_location_tracking');

  // State
  const [activeTab, setActiveTab] = useState('all-postings');
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');

  // Data
  const [summaryStats, setSummaryStats] = useState(null);
  const [allPostings, setAllPostings] = useState([]);
  const [schoolsStudents, setSchoolsStudents] = useState([]);
  const [schoolsSupervisors, setSchoolsSupervisors] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });

  // Filters/Search for each tab
  const [allPostingsSearch, setAllPostingsSearch] = useState('');
  const [schoolsStudentsSearch, setSchoolsStudentsSearch] = useState('');
  const [schoolsSupervisorsSearch, setSchoolsSupervisorsSearch] = useState('');

  // Delete confirmation
  const [deletingPosting, setDeletingPosting] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch data when session or tab changes
  useEffect(() => {
    if (selectedSession) {
      fetchSummaryStats();
      fetchTabData();
    }
  }, [selectedSession, activeTab, pagination.page, allPostingsSearch]);

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

  const fetchSummaryStats = async () => {
    try {
      const response = await postingsApi.getSummaryStats(selectedSession);
      setSummaryStats(response.data.data || response.data || {});
    } catch (err) {
      console.error('Failed to load summary stats:', err);
    }
  };

  const fetchTabData = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'all-postings':
          await fetchAllPostings();
          break;
        case 'schools-students':
          await fetchSchoolsStudents();
          break;
        case 'schools-supervisors':
          await fetchSchoolsSupervisors();
          break;
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllPostings = async () => {
    const response = await postingsApi.getPostingsForDisplay({
      session_id: selectedSession,
      page: pagination.page,
      limit: pagination.limit,
      search: allPostingsSearch,
    });
    setAllPostings(response.data.data || response.data || []);
    setPagination((prev) => ({
      ...prev,
      total: response.data.pagination?.total || 0,
    }));
  };

  const fetchSchoolsStudents = async () => {
    const response = await postingsApi.getSchoolsStudents(selectedSession);
    setSchoolsStudents(response.data.data || response.data || []);
  };

  const fetchSchoolsSupervisors = async () => {
    const response = await postingsApi.getSchoolsSupervisors(selectedSession);
    setSchoolsSupervisors(response.data.data || response.data || []);
  };

  const handleRefresh = () => {
    fetchSummaryStats();
    fetchTabData();
  };

  const handleDeletePosting = async () => {
    if (!deletingPosting) return;

    setDeleting(true);
    try {
      await postingsApi.delete(deletingPosting.id);
      toast.success('Posting deleted successfully');
      setDeletingPosting(null);
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete posting');
    } finally {
      setDeleting(false);
    }
  };

  // Column definitions for All Postings tab
  const allPostingsColumns = useMemo(
    () => [
      {
        accessor: 'sn',
        header: 'S/N',
        sortable: false,
        render: (_, __, index) => (pagination.page - 1) * pagination.limit + index + 1,
      },
      {
        accessor: 'school_name',
        header: 'School Name',
        render: (value) => <span className="font-medium text-gray-900">{value}</span>,
      },
      {
        accessor: 'group_number',
        header: 'Group',
        render: (value) => (
          <Badge variant="outline">Group {value || 1}</Badge>
        ),
      },
      {
        accessor: 'visit_number',
        header: 'Visit',
        render: (value) => <Badge variant="outline">{getOrdinal(value)} Visit</Badge>,
      },
      {
        accessor: 'supervisor_name',
        header: 'Supervisor',
        render: (value) => value || 'N/A',
      },
      {
        accessor: 'route_name',
        header: 'Route',
        render: (value) => (
          <Badge variant="outline">{value || 'N/A'}</Badge>
        ),
      },
      {
        accessor: 'lga',
        header: 'LGA',
        render: (value) => <span className="text-gray-600">{value || 'N/A'}</span>,
      },
      {
        accessor: 'session_name',
        header: 'Session',
        render: (value) => <span className="text-sm text-gray-500">{value}</span>,
      },
      // Location tracking column - only show if feature is enabled
      ...(locationTrackingEnabled
        ? [
            {
              accessor: 'location_verified',
              header: 'Location',
              render: (value, row) => {
                if (value === 1 || value === true) {
                  return (
                    <Badge variant="success" className="flex items-center gap-1 w-fit">
                      <IconCheck className="h-3 w-3" />
                      Verified
                    </Badge>
                  );
                } else if (row.has_coordinates === false || row.has_coordinates === 0) {
                  return (
                    <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                      <IconX className="h-3 w-3" />
                      No GPS
                    </Badge>
                  );
                } else {
                  return (
                    <Badge variant="warning" className="flex items-center gap-1 w-fit">
                      <IconClock className="h-3 w-3" />
                      Pending
                    </Badge>
                  );
                }
              },
            },
          ]
        : []),
      {
        accessor: 'actions',
        header: 'Action',
        sortable: false,
        exportable: false,
        render: (_, row) =>
          canDelete ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setDeletingPosting(row);
              }}
              title="Delete Posting"
            >
              <IconTrash className="w-4 h-4 text-red-600" />
            </Button>
          ) : null,
      },
    ],
    [canDelete, pagination.page, pagination.limit, locationTrackingEnabled]
  );

  // Column definitions for Schools & Students tab
  const schoolsStudentsColumns = useMemo(
    () => [
      {
        accessor: 'sn',
        header: 'S/N',
        sortable: false,
        render: (_, __, index) => index + 1,
      },
      {
        accessor: 'school_name',
        header: 'School',
        render: (value) => <span className="font-medium text-gray-900">{value}</span>,
      },
      {
        accessor: 'route_name',
        header: 'Route Name',
        render: (value) => (
          <Badge variant="outline">
            {value || 'N/A'}
          </Badge>
        ),
      },
      {
        accessor: 'students_count',
        header: 'Students',
        render: (value) => <span className="font-semibold">{value || 0}</span>,
      },
      {
        accessor: 'groups_count',
        header: 'Groups',
        render: (value) => <Badge variant="outline">{value || 0} groups</Badge>,
      },
      {
        accessor: 'state',
        header: 'State',
        render: (value) => value || 'N/A',
      },
      {
        accessor: 'lga',
        header: 'LGA',
        render: (value) => value || 'N/A',
      },
    ],
    []
  );

  // Column definitions for Groups & Supervisors tab
  const schoolsSupervisorsColumns = useMemo(
    () => [
      {
        accessor: 'sn',
        header: 'S/N',
        sortable: false,
        render: (_, __, index) => index + 1,
      },
      {
        accessor: 'school_name',
        header: 'School',
        render: (value) => <span className="font-medium text-gray-900">{value}</span>,
      },
      {
        accessor: 'group_number',
        header: 'Group',
        render: (value) => <Badge variant="outline">Group {value || 1}</Badge>,
      },
      {
        accessor: 'student_count',
        header: 'Students',
        render: (value) => <span className="text-gray-600">{value || 0}</span>,
      },
      {
        accessor: 'supervisors_count',
        header: 'Supervisors Assigned',
        render: (value, row) => {
          const max = row.max_supervision_visits || 3;
          const count = value || 0;
          const isComplete = count >= max;
          return (
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${isComplete ? 'text-green-600' : 'text-orange-600'}`}>
                {count} / {max}
              </span>
              {isComplete ? (
                <IconCheck className="w-4 h-4 text-green-600" />
              ) : (
                <IconClock className="w-4 h-4 text-orange-500" />
              )}
            </div>
          );
        },
      },
      {
        accessor: 'status',
        header: 'Status',
        render: (_, row) => {
          const max = row.max_supervision_visits || 3;
          const count = row.supervisors_count || 0;
          const remaining = max - count;
          if (remaining <= 0) {
            return <Badge variant="success">Complete</Badge>;
          }
          return (
            <Badge variant="warning">{remaining} supervisor{remaining > 1 ? 's' : ''} needed</Badge>
          );
        },
      },
    ],
    []
  );

  // Filter data based on search (for client-side search)
  const filterData = (data, search, searchFields) => {
    if (!search.trim()) return data;
    const searchLower = search.toLowerCase();
    return data.filter((row) =>
      searchFields.some((field) => {
        const value = row[field];
        return value && String(value).toLowerCase().includes(searchLower);
      })
    );
  };

  // Get current data based on active tab (with search filtering for non-paginated tabs)
  const getCurrentData = () => {
    switch (activeTab) {
      case 'all-postings':
        return allPostings; // Server-side search
      case 'schools-students':
        return filterData(schoolsStudents, schoolsStudentsSearch, [
          'school_name',
          'route_name',
          'state',
          'lga',
        ]);
      case 'schools-supervisors':
        return filterData(schoolsSupervisors, schoolsSupervisorsSearch, [
          'school_name',
          'group_number',
        ]);
      default:
        return [];
    }
  };

  // Get current columns based on active tab
  const getCurrentColumns = () => {
    switch (activeTab) {
      case 'all-postings':
        return allPostingsColumns;
      case 'schools-students':
        return schoolsStudentsColumns;
      case 'schools-supervisors':
        return schoolsSupervisorsColumns;
      default:
        return [];
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Supervisor Postings</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">View and manage all supervisor postings</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" onClick={handleRefresh} className="active:scale-95">
            <IconRefresh className="w-4 h-4" />
          </Button>
          <Select
            value={selectedSession}
            onChange={(e) => {
              setSelectedSession(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="flex-1 sm:flex-none sm:w-auto text-sm"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} {session.is_current && '(Current)'}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Summary Stats */}
      {summaryStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {/* Total Postings */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{summaryStats.total_postings || 0}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Postings</p>
                  <div className="hidden sm:flex gap-2 mt-1">
                    <span className="text-xs text-green-600">
                      {summaryStats.primary_count || 0} Primary
                    </span>
                    <span className="text-xs text-gray-400">|</span>
                    <span className="text-xs text-orange-600">
                      {summaryStats.non_primary_count || 0} Secondary
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inside Count */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <IconWalk className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{summaryStats.inside_count || 0}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Inside</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Outside Count */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                  <IconCar className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{summaryStats.outside_count || 0}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Outside</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unique Schools */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <IconSchool className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{summaryStats.unique_schools || 0}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Schools</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 -mx-3 sm:mx-0 px-3 sm:px-0">
        <nav className="-mb-px flex space-x-4 sm:space-x-6 overflow-x-auto scrollbar-hide">
          <Button
            variant="ghost"
            onClick={() => {
              setActiveTab('all-postings');
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`py-2 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap flex items-center gap-1 rounded-none ${
              activeTab === 'all-postings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconClipboardList className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">All</span> Postings
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('schools-students')}
            className={`py-2 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap flex items-center gap-1 rounded-none ${
              activeTab === 'schools-students'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconSchool className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Schools &</span> Students
          </Button>
          <Button
            variant="ghost"
            onClick={() => setActiveTab('schools-supervisors')}
            className={`py-2 px-1 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap flex items-center gap-1 rounded-none ${
              activeTab === 'schools-supervisors'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <IconUsers className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Groups &</span> Supervisors
          </Button>
        </nav>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {/* Search Input for each tab */}
          <div className="p-3 sm:p-4 border-b bg-gray-50">
            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder={
                  activeTab === 'all-postings'
                    ? 'Search by school, route, LGA, supervisor, or group...'
                    : activeTab === 'schools-students'
                    ? 'Search by school, route, state, or LGA...'
                    : 'Search by school or group...'
                }
                value={
                  activeTab === 'all-postings'
                    ? allPostingsSearch
                    : activeTab === 'schools-students'
                    ? schoolsStudentsSearch
                    : schoolsSupervisorsSearch
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (activeTab === 'all-postings') {
                    setAllPostingsSearch(value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  } else if (activeTab === 'schools-students') {
                    setSchoolsStudentsSearch(value);
                  } else {
                    setSchoolsSupervisorsSearch(value);
                  }
                }}
                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-full"
              />
            </div>
          </div>
          <DataTable
            data={getCurrentData()}
            columns={getCurrentColumns()}
            loading={loading}
            sortable
            exportable
            exportFilename={`postings-${activeTab}-${new Date().toISOString().split('T')[0]}`}
            pagination={
              activeTab === 'all-postings'
                ? {
                    page: pagination.page,
                    limit: pagination.limit,
                    total: pagination.total,
                    onPageChange: (page) => setPagination((prev) => ({ ...prev, page })),
                  }
                : null
            }
            emptyMessage={
              activeTab === 'all-postings'
                ? 'No postings found for this session'
                : activeTab === 'schools-students'
                ? 'No schools with students found'
                : 'No groups with approved students found'
            }
          />
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deletingPosting}
        onOpenChange={() => setDeletingPosting(null)}
        title="Delete Posting"
        description={`Are you sure you want to delete this posting for "${deletingPosting?.school_name}" by "${deletingPosting?.supervisor_name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeletePosting}
      />
    </div>
  );
}

export default PostingsPage;
