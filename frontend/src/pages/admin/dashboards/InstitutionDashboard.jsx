/**
 * Institution Dashboard
 * 
 * Head of Teaching Practice dashboard with institution-specific statistics.
 * Shows students, staff, schools, postings, and results.
 * Feature toggle dependent sections.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { dashboardApi } from '../../../api/dashboard';
import { formatCurrency, formatDate, formatGreetingName } from '../../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  IconUsers,
  IconSchool,
  IconBuildingBank,
  IconClipboardList,
  IconCash,
  IconCalendar,
  IconRefresh,
  IconArrowRight,
  IconClock,
  IconActivity,
  IconAlertCircle,
  IconFileCheck,
  IconReport,
} from '@tabler/icons-react';

function InstitutionDashboard() {
  const { user, effectiveInstitution, hasFeature } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const response = await dashboardApi.getInstitutionStats();
      setData(response.data.data);
    } catch (err) {
      console.error('Failed to fetch institution dashboard:', err);
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
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
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

  const { currentSession, summary, charts, recentActivity } = data || {};
  const { students, staff, schools, postings, payments, acceptances, results, pendingRequests } = summary || {};

  // Primary stats that are always shown
  const primaryStats = [
    {
      name: 'Total Students',
      value: formatNumber(students?.total_students),
      subValue: `${students?.active_students || 0} active`,
      icon: IconSchool,
      color: 'bg-blue-500',
      link: '/admin/students',
    },
    {
      name: 'Staff Members',
      value: formatNumber(staff?.total_staff),
      subValue: `${staff?.supervisors || 0} supervisors`,
      icon: IconUsers,
      color: 'bg-green-500',
      link: '/admin/users',
    },
    {
      name: 'Partner Schools',
      value: formatNumber(schools?.total_schools),
      subValue: `${schools?.active_schools || 0} active`,
      icon: IconBuildingBank,
      color: 'bg-purple-500',
      link: '/admin/schools',
    },
  ];

  // Feature-dependent stats
  const featureStats = [];

  // Total Postings (replaces Active Postings)
  if (hasFeature('posting_engine') || hasFeature('supervisor_posting')) {
    featureStats.push({
      name: 'Total Postings',
      value: formatNumber(postings?.total_postings),
      subValue: `${postings?.primary_postings || 0} primary • ${postings?.secondary_postings || 0} merged`,
      icon: IconClipboardList,
      color: 'bg-orange-500',
      link: '/admin/postings',
    });
  }

  // Payments - only visible to super_admin
  if ((hasFeature('payment_integration') || hasFeature('payment_gateway')) && user?.role === 'super_admin') {
    featureStats.push({
      name: 'Payments',
      value: formatCurrency(payments?.successful_amount),
      subValue: `${payments?.successful_payments || 0} received`,
      icon: IconCash,
      color: 'bg-teal-500',
      link: '/admin/payments',
    });
  }

  const allStats = [...primaryStats, ...featureStats];

  const lgGridCols =
  allStats.length >= 5
    ? 'lg:grid-cols-5'
    : `lg:grid-cols-${allStats.length}`;

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
              <span className="hidden md:block">{effectiveInstitution?.name}</span>
              <span className="block md:hidden">{effectiveInstitution?.code}</span>
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
          <div>
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
      </div>

      {/* Stats Grid */}
      <div className={`grid grid-cols-2 md:grid-cols-2 ${lgGridCols} gap-3`}>
        {allStats.map((stat) => (
          <Link key={stat.name} to={stat.link}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center flex-shrink-0`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-500 truncate">{stat.name}</p>
                    <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">{stat.value}</p>
                    <p className="text-xs text-gray-400 truncate">{stat.subValue}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pending Requests Alert */}
      {((pendingRequests?.pending_location_updates > 0) || (pendingRequests?.pending_principal_updates > 0)) && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <IconAlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-800">Pending Update Requests</p>
                <p className="text-sm text-amber-600">
                  {pendingRequests?.pending_location_updates > 0 && (
                    <span>{pendingRequests.pending_location_updates} location update{pendingRequests.pending_location_updates > 1 ? 's' : ''}</span>
                  )}
                  {pendingRequests?.pending_location_updates > 0 && pendingRequests?.pending_principal_updates > 0 && ' • '}
                  {pendingRequests?.pending_principal_updates > 0 && (
                    <span>{pendingRequests.pending_principal_updates} principal update{pendingRequests.pending_principal_updates > 1 ? 's' : ''}</span>
                  )}
                </p>
              </div>
              <Link
                to="/admin/school-update-requests"
                className="text-sm text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1"
              >
                Review
                <IconArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student & Acceptance Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Acceptance Status Breakdown */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Acceptance Status</CardTitle>
            <Link
              to="/admin/acceptances"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View All
              <IconArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hasFeature('acceptance_forms') && (
                <div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-green-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-700">{acceptances?.submitted || 0}</p>
                      <p className="text-xs text-green-600">Submitted</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                      <p className="text-2xl font-bold text-gray-700">{acceptances?.not_submitted || 0}</p>
                      <p className="text-xs text-gray-600">Not Submitted</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        {/* Results Summary */}
        {hasFeature('supervisor_scoring') && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <IconReport className="w-5 h-5 text-gray-400" />
                Assessment Results
              </CardTitle>
              <Link
                to="/admin/results"
                className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                View All
                <IconArrowRight className="w-4 h-4" />
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-700">{results?.total_results || 0}</p>
                  <p className="text-xs text-blue-600">Total Results</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">{results?.students_assessed || 0}</p>
                  <p className="text-xs text-green-600">Students Assessed</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-orange-700">{results?.highest_score || 0}</p>
                  <p className="text-xs text-orange-600">Highest Score</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-700">{results?.compliance_percentage || 0}%</p>
                  <p className="text-xs text-purple-600">Compliance</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>


      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/admin/schools"
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
              >
                <IconBuildingBank className="w-6 h-6 text-primary-600" />
                <span className="text-sm font-medium text-gray-700 text-center">Manage Schools</span>
              </Link>
              <Link
                to="/admin/students"
                className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
              >
                <IconSchool className="w-6 h-6 text-primary-600" />
                <span className="text-sm font-medium text-gray-700 text-center">Manage Students</span>
              </Link>
              {hasFeature('acceptance_forms') && (
                <Link
                  to="/admin/acceptances"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
                >
                  <IconFileCheck className="w-6 h-6 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700 text-center">Review Acceptances</span>
                </Link>
              )}
              {hasFeature('supervisor_posting') && (
                <Link
                  to="/admin/multiposting"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
                >
                  <IconClipboardList className="w-6 h-6 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700 text-center">Create Postings</span>
                </Link>
              )}
              {hasFeature('supervisor_posting') && (
                <Link
                  to="/admin/postings"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
                >
                  <IconClipboardList className="w-6 h-6 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700 text-center">All Postings</span>
                </Link>
              )}
              {hasFeature('supervisor_scoring') && (
                <Link
                  to="/admin/results"
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
                >
                  <IconReport className="w-6 h-6 text-primary-600" />
                  <span className="text-sm font-medium text-gray-700 text-center">View Results</span>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <IconActivity className="w-5 h-5 text-gray-400" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity?.length > 0 ? (
                recentActivity.slice(0, 6).map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50"
                  >
                    <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-900 truncate">
                        <span className="font-medium">{activity.user_name || 'System'}</span>
                        {' '}
                        <span className="text-gray-600">
                          {activity.action?.replace(/_/g, ' ')}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <IconClock className="w-3 h-3" />
                        {formatTimeAgo(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default InstitutionDashboard;
