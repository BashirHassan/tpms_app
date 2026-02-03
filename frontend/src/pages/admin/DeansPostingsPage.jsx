/**
 * Dean's Postings Page
 * View and manage postings created by the current dean
 * 
 * Access Control:
 * - Only deans with posting allocation can access this page
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { deanAllocationsApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { useAlert } from '../../components/ui/AlertDialog';
import {
  IconUsers,
  IconBuildingBank as IconSchool,
  IconTrash,
  IconAlertCircle,
  IconCircleCheck,
  IconLoader2,
  IconRefresh,
  IconCrown,
  IconPlus,
  IconCalendar,
  IconMapPin,
} from '@tabler/icons-react';
import { getOrdinal, formatDate } from '../../utils/helpers';

function DeansPostingsPage() {
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useAlert();
  const isAdminLevel = hasRole(['super_admin', 'head_of_teaching_practice']);
  const isDean = user?.is_dean === 1 || user?.is_dean === true;

  // State
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [postings, setPostings] = useState([]);
  const [allocation, setAllocation] = useState(null);

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
      const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
      if (current) {
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      toast.error('Failed to load sessions');
    }
  };

  const fetchPostings = async () => {
    setLoading(true);
    try {
      const response = await deanAllocationsApi.getMyPostings({ session_id: selectedSession });
      setPostings(response.data.data || []);
      setAllocation(response.data.allocation || null);
    } catch (err) {
      toast.error('Failed to load your postings');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (posting) => {
    const confirmed = await confirm({
      title: 'Delete Posting',
      message: (
        <div>
          <p>Are you sure you want to delete this posting?</p>
          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm">
            <p><strong>Supervisor:</strong> {posting.supervisor_name}</p>
            <p><strong>School:</strong> {posting.school_name}</p>
            <p><strong>Group/Visit:</strong> Group {posting.group_number}, {getOrdinal(posting.visit_number)} Visit</p>
          </div>
          <p className="mt-3 text-amber-600 text-sm">
            This will also delete any merged group postings and return 1 allocation slot.
          </p>
        </div>
      ),
      confirmText: 'Delete Posting',
      confirmVariant: 'danger',
    });

    if (!confirmed) return;

    setDeleting(posting.id);
    try {
      await deanAllocationsApi.deleteMyPosting(posting.id);
      toast.success('Posting deleted successfully');
      fetchPostings();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete posting');
    } finally {
      setDeleting(null);
    }
  };

  // Table columns
  const columns = useMemo(() => [
    {
      header: 'Supervisor',
      accessor: 'supervisor_name',
      sortable: true,
    },
    {
      header: 'School',
      accessor: 'school_name',
      sortable: true,
    },
    {
      header: 'Route',
      accessor: 'route_name',
      formatter: (value) => value || '-',
    },
    {
      header: 'Group',
      accessor: 'group_number',
      formatter: (value) => `Group ${value}`,
    },
    {
      header: 'Visit',
      accessor: 'visit_number',
      formatter: (value) => getOrdinal(value),
    },
    {
      header: 'Distance',
      accessor: 'distance_km',
      formatter: (value) => `${value || 0} km`,
    },
    {
      header: 'Posted',
      accessor: 'posted_at',
      formatter: (value) => formatDate(value, 'short'),
      sortable: true,
    },
    {
      header: '',
      accessor: 'actions',
      width: '80px',
      formatter: (_, row) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDelete(row)}
          disabled={deleting === row.id}
          className="text-gray-400 hover:text-red-500 hover:bg-red-50"
          title="Delete posting"
        >
          {deleting === row.id ? (
            <IconLoader2 className="w-4 h-4 animate-spin" />
          ) : (
            <IconTrash className="w-4 h-4" />
          )}
        </Button>
      ),
    },
  ], [deleting]);

  // Access check - only deans can view this page
  if (!isDean && !isAdminLevel) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <IconAlertCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">
              Only deans can view this page.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Postings</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            View and manage postings you have created as dean
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" onClick={fetchPostings} disabled={loading} className="active:scale-95">
            <IconRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="text-sm"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name} {session.is_current && '(Current)'}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Allocation Summary */}
      {allocation && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <IconCrown className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-800">Posting Allocation</p>
                <p className="text-sm text-amber-600">
                  {allocation.used_postings} / {allocation.allocated_postings} used 
                  • {allocation.allocated_postings - allocation.used_postings} remaining
                </p>
              </div>
              {allocation.allocated_postings - allocation.used_postings > 0 && (
                <Link to="/admin/multiposting">
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700">
                    <IconPlus className="w-4 h-4 mr-2" />
                    Create More
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <IconUsers className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold">{postings.length}</p>
                <p className="text-sm text-gray-500">Total Postings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <IconSchool className="w-5 h-5 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold">{new Set(postings.map(p => p.institution_school_id)).size}</p>
                <p className="text-sm text-gray-500">Schools</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <IconUsers className="w-5 h-5 text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold">{new Set(postings.map(p => p.supervisor_id)).size}</p>
                <p className="text-sm text-gray-500">Supervisors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Postings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Postings Created by You</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <IconLoader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
              <p className="text-gray-500 mt-2">Loading postings...</p>
            </div>
          ) : postings.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <IconSchool className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Postings Yet</h3>
              <p className="text-gray-500 mb-4">
                You haven't created any postings for this session.
              </p>
              {allocation && allocation.allocated_postings > allocation.used_postings && (
                <Link to="/admin/multiposting">
                  <Button>
                    <IconPlus className="w-4 h-4 mr-2" />
                    Create Your First Posting
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <DataTable
              data={postings}
              columns={columns}
              keyField="id"
              searchable
              searchPlaceholder="Search by supervisor or school..."
              sortable
              defaultSortField="posted_at"
              defaultSortOrder="desc"
              emptyTitle="No postings found"
              emptyDescription="No postings match your search criteria."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default DeansPostingsPage;
