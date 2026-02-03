/**
 * Supervisor Dashboard
 * 
 * Dashboard for supervisors, lead monitors, and field monitors.
 * Shows their assignments, postings, results submitted, and reports.
 * Role-specific content based on user's role.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { dashboardApi } from '../../../api/dashboard';
import { formatCurrency, formatDate, formatGreetingName, getOrdinal } from '../../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  IconClipboardList,
  IconCalendar,
  IconRefresh,
  IconArrowRight,
  IconMapPin,
  IconUsers,
  IconSchool,
  IconCash,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconReport,
  IconChecklist,
  IconEye,
  IconStar,
  IconTrendingUp,
  IconBuildingBank,
  IconRoute,
  IconCar,
  IconWalk,
} from '@tabler/icons-react';

function SupervisorDashboard() {
  const { user, effectiveInstitution, hasFeature } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const response = await dashboardApi.getSupervisorStats();
      setData(response.data.data);
    } catch (err) {
      console.error('Failed to fetch supervisor dashboard:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const formatNumber = (num) => {
    return num?.toString() || '0';
  };


  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getRoleDisplayName = (role) => {
    const roleNames = {
      supervisor: 'Supervisor',
      field_monitor: 'Field Monitor',
    };
    return roleNames[role] || role;
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      completed: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-gray-100 text-gray-700',
      in_progress: 'bg-purple-100 text-purple-700',
      draft: 'bg-gray-100 text-gray-700',
      submitted: 'bg-green-100 text-green-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">{error}</div>
        <Button onClick={handleRefresh}>
          Try Again
        </Button>
      </div>
    );
  }

  const { currentSession, role, summary, postings, assignments, results, reports, upcomingDates } = data || {};
  const isSupervisor = role === 'supervisor';
  const isMonitor = role === 'field_monitor';

  // Calculate total allowances for supervisors
  const totalAllowances = postings?.reduce((sum, p) => {
    return sum + (p.local_running || 0) + (p.transport || 0) + (p.dsa || 0) + (p.dta || 0) + (p.tetfund || 0);
  }, 0) || 0;

  return (
    <div className="space-y-4">
      {/* Header with Session Info */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-xl py-4 px-6 text-white">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">
              Welcome, {formatGreetingName(user?.name)}!
            </h1>
            <p className="flex gap-1 items-center text-primary-100 text-sm">
              {getRoleDisplayName(role)}
              {currentSession && (
                <span className="flex items-center text-sm text-primary-100">
                  (<IconCalendar className="w-4 h-4" />
                  <span>
                    {currentSession.name}
                  </span>)
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-white bg-white/10 hover:bg-white/20"
          >
            <IconRefresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Supervisor Stats */}
      {isSupervisor && (
        <>
          {/* Summary Cards */}
          <div className={`grid grid-cols-2 ${hasFeature('allowance_calculation') ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2 sm:gap-4`}>
            {/* Total Postings */}
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <IconClipboardList className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg sm:text-2xl font-bold">{formatNumber(summary?.postings?.total_postings)}</p>
                    <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Postings</p>
                    <div className="hidden sm:flex gap-2 mt-1 truncate">
                      <span className="text-xs text-green-600">
                        {summary?.postings?.primary_postings || 0} Primary
                      </span>
                      <span className="text-xs text-gray-400">|</span>
                      <span className="text-xs text-orange-600">
                        {summary?.postings?.merged_postings || 0} Merged
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
                    <p className="text-lg sm:text-2xl font-bold">{formatNumber(summary?.postings?.inside_count)}</p>
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
                    <p className="text-lg sm:text-2xl font-bold">{formatNumber(summary?.postings?.outside_count)}</p>
                    <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Outside</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Students */}
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <IconUsers className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg sm:text-2xl font-bold">{formatNumber(summary?.postings?.total_students)}</p>
                    <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Students</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Total Allowances - only if feature enabled */}
            {hasFeature('allowance_calculation') && (
              <Card className="col-span-2 md:col-span-1">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                      <IconCash className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg sm:text-xl font-bold truncate">{formatCurrency(summary?.postings?.total_allowances)}</p>
                      <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Allowances</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* My Postings */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <IconClipboardList className="w-5 h-5 text-gray-400" />
                My Postings
              </CardTitle>
              <Link
                to="/admin/my-postings"
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View All
                <IconArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {postings?.length > 0 ? (
                <div className="overflow-x-auto whitespace-nowrap pb-2 space-y-1 scrollbar-hide">
                  {postings.slice(0, 5).map((posting) => (
                    <div
                      key={posting.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg min-w-[375px] flex-shrink-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <IconBuildingBank className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 whitespace-nowrap truncate">{posting.school_name}</p>
                          <p className="text-xs text-gray-500">
                            Group {posting.group_number} • {getOrdinal(posting.visit_number)} Visit • {posting.student_count} students
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {posting.distance_km && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <IconRoute className="w-3.5 h-3.5" />
                            {posting.distance_km}km
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">
                  No postings assigned yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* My Results */}
          {hasFeature('supervisor_scoring') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <IconStar className="w-5 h-5 text-gray-400" />
                  My Submitted Results
                </CardTitle>
                <Link
                  to="/admin/result-upload"
                  className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                >
                  View All
                  <IconArrowRight className="w-4 h-4" />
                </Link>
              </CardHeader>
              <CardContent>
                {results?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 font-medium">Student</th>
                          <th className="py-2 font-medium">School</th>
                          <th className="py-2 font-medium">Group</th>
                          <th className="py-2 font-medium">Score</th>
                          <th className="py-2 font-medium">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.slice(0, 5).map((result) => (
                          <tr key={result.id} className="border-b last:border-0">
                            <td className="py-2 pr-2">
                              <p className="font-medium text-gray-900">{result.student_name}</p>
                              <p className="text-xs text-gray-500">{result.registration_number}</p>
                            </td>
                            <td className="py-2 text-gray-700 whitespace-nowrap">{result.school_name}</td>
                            <td className="py-2 text-gray-700 whitespace-nowrap pr-2">Group {result.group_number}</td>
                            <td className="py-2">
                              <span className="font-medium text-primary-600">{result.total_score}</span>
                            </td>
                            <td className="py-2 text-gray-500 whitespace-nowrap">{formatTimeAgo(result.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-8">
                    No results submitted yet
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Monitor Stats */}
      {isMonitor && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <IconChecklist className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Total Assignments</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatNumber(summary?.assignments?.total_assignments)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center flex-shrink-0">
                    <IconClock className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Pending</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatNumber(summary?.assignments?.pending_assignments)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <IconTrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">In Progress</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatNumber(summary?.assignments?.in_progress)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
                    <IconCheck className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500">Completed</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatNumber(summary?.assignments?.completed_assignments)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* My Assignments */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <IconChecklist className="w-5 h-5 text-gray-400" />
                My Assignments
              </CardTitle>
              <Link
                to="/admin/monitoring"
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View All
                <IconArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {assignments?.length > 0 ? (
                <div className="space-y-3">
                  {assignments.slice(0, 5).map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <IconBuildingBank className="w-5 h-5 text-primary-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">{assignment.school_name}</p>
                          <p className="text-xs text-gray-500">
                            {assignment.monitoring_type?.replace(/_/g, ' ')} • 
                            Priority: {assignment.priority}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(assignment.status)}`}>
                        {assignment.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">
                  No assignments yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* My Reports */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <IconReport className="w-5 h-5 text-gray-400" />
                My Reports
              </CardTitle>
            </CardHeader>
            <CardContent>
              {reports?.length > 0 ? (
                <div className="space-y-3">
                  {reports.slice(0, 5).map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{report.school_name}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(report.visit_date)} • 
                          {report.students_observed} students observed •
                          Rating: {report.overall_rating}/5
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusColor(report.status)}`}>
                        {report.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-8">
                  No reports submitted yet
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Upcoming Dates */}
      {upcomingDates?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <IconCalendar className="w-5 h-5 text-gray-400" />
              Important Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {upcomingDates.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    item.type === 'supervision_visit' ? 'bg-blue-100' : 'bg-primary-100'
                  }`}>
                    <IconCalendar className={`w-5 h-5 ${
                      item.type === 'supervision_visit' ? 'text-blue-600' : 'text-primary-600'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{item.title} {item.end_date ? 'Schedule' : ''}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {item.end_date ? (
                        <>
                          <span>{formatDate(item.date)}</span>
                          <span>→</span>
                          <span>{formatDate(item.end_date)}</span>
                        </>
                      ) : (
                        <span>{formatDate(item.date)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SupervisorDashboard;
