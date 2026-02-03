/**
 * Global Admin Dashboard
 * 
 * Super admin dashboard with cross-institution statistics and quick navigation.
 * Shows platform-wide overview including all institutions, users, and activity.
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { globalDashboardApi } from '../../../api/dashboard';
import { authApi } from '../../../api/auth';
import { getInstitutionUrl } from '../../../hooks/useSubdomain';
import { formatCurrency, formatNumber } from '../../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import {
  IconBuilding,
  IconUsers,
  IconSchool,
  IconBuildingBank,
  IconClipboardList,
  IconCalendar,
  IconArrowRight,
  IconRefresh,
  IconUserCheck,
  IconUserPlus,
  IconEye,
  IconTrendingUp,
  IconActivity,
  IconClock,
  IconExternalLink,
} from '@tabler/icons-react';

function GlobalAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [navigating, setNavigating] = useState(null); // Track which institution is being navigated to

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const response = await globalDashboardApi.getGlobalStats();
      setData(response.data.data);
    } catch (err) {
      console.error('Failed to fetch global dashboard:', err);
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

  /**
   * Navigate to institution dashboard with secure SSO
   * 
   * Security: Uses one-time exchange tokens instead of exposing JWT in URL
   * 1. Generate a short-lived SSO token server-side
   * 2. Pass only the SSO token in URL (not the JWT)
   * 3. Target subdomain exchanges SSO token for a real JWT
   */
  const handleInstitutionClick = async (institutionSubdomain) => {
    setNavigating(institutionSubdomain);
    
    try {
      // Generate one-time SSO token
      const response = await authApi.generateSsoToken();
      const { sso_token } = response.data.data || response.data;
      
      // Build URL with SSO token
      const baseUrl = getInstitutionUrl(institutionSubdomain);
      const url = `${baseUrl}/admin/dashboard?sso_token=${encodeURIComponent(sso_token)}`;
      
      // Open in new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error('Failed to generate SSO token:', err);
      // Fallback: open without SSO (user will need to login)
      const baseUrl = getInstitutionUrl(institutionSubdomain);
      window.open(`${baseUrl}/admin/dashboard`, '_blank', 'noopener,noreferrer');
    } finally {
      setNavigating(null);
    }
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
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const getActionIcon = (action) => {
    const iconMap = {
      login: IconUserCheck,
      create: IconUserPlus,
      view: IconEye,
      update: IconRefresh,
      delete: IconActivity,
    };
    
    const actionKey = Object.keys(iconMap).find(key => 
      action?.toLowerCase().includes(key)
    );
    return iconMap[actionKey] || IconActivity;
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

  const { summary, institutions, recentActivity } = data || {};

  const platformStats = [
    {
      name: 'Total Institutions',
      value: formatNumber(summary?.institutions?.total_institutions),
      subValue: `${summary?.institutions?.active_institutions || 0} active`,
      icon: IconBuilding,
      color: 'bg-blue-500',
    },
    {
      name: 'Total Users',
      value: formatNumber(summary?.users?.total_users),
      subValue: `${summary?.users?.supervisors || 0} supervisors`,
      icon: IconUsers,
      color: 'bg-green-500',
    },
    {
      name: 'Total Students',
      value: formatNumber(summary?.students?.total_students),
      subValue: `${summary?.students?.active_students || 0} active`,
      icon: IconSchool,
      color: 'bg-purple-500',
    },
    {
      name: 'Partner Schools',
      value: formatNumber(summary?.schools?.total_schools),
      subValue: `${summary?.schools?.active_schools || 0} active`,
      icon: IconBuildingBank,
      color: 'bg-orange-500',
    },
    {
      name: 'Active Sessions',
      value: formatNumber(summary?.sessions?.current_sessions),
      subValue: `${summary?.sessions?.total_sessions || 0} total`,
      icon: IconCalendar,
      color: 'bg-teal-500',
    },
    {
      name: 'Active Postings',
      value: formatNumber(summary?.postings?.active_postings),
      subValue: `${summary?.postings?.total_postings || 0} total`,
      icon: IconClipboardList,
      color: 'bg-pink-500',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Platform Overview
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Global statistics across all institutions
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <IconRefresh className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Platform Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {platformStats.map((stat) => (
          <Card key={stat.name}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center flex-shrink-0`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500 truncate">{stat.name}</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-400">{stat.subValue}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Institutions & Activity Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Institutions List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base sm:text-lg">Institutions</CardTitle>
            <Link
              to="/admin/institutions"
              className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              View All
              <IconArrowRight className="w-4 h-4" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {institutions?.length > 0 ? (
                institutions.slice(0, 8).map((institution) => (
                  <div
                    key={institution.id}
                    className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors ${
                      navigating === institution.subdomain ? 'opacity-70' : ''
                    }`}
                    onClick={() => !navigating && handleInstitutionClick(institution.subdomain)}
                    title={`Open ${institution.name} in new tab`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {institution.logo_url ? (
                        <img
                          src={institution.logo_url}
                          alt={institution.name}
                          className="w-10 h-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                          <IconBuilding className="w-5 h-5 text-primary-600" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{institution.name}</p>
                        <p className="text-xs text-gray-500">{institution.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <IconSchool className="w-3.5 h-3.5" />
                        <span>{institution.student_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <IconUsers className="w-3.5 h-3.5" />
                        <span>{institution.user_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <IconBuildingBank className="w-3.5 h-3.5" />
                        <span>{institution.school_count}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          institution.status === 'active'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {institution.status}
                      </span>
                      {navigating === institution.subdomain ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
                      ) : (
                        <IconExternalLink className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">No institutions found</p>
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
                recentActivity.map((activity, index) => {
                  const ActionIcon = getActionIcon(activity.action);
                  return (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <ActionIcon className="w-4 h-4 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900">
                          <span className="font-medium">{activity.user_name || 'Unknown'}</span>
                          {' '}
                          <span className="text-gray-600">
                            {activity.action?.replace(/_/g, ' ')}
                          </span>
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">{activity.institution_name}</span>
                          <span className="text-gray-300">•</span>
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <IconClock className="w-3 h-3" />
                            {formatTimeAgo(activity.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">No recent activity</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/admin/institutions"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
            >
              <IconBuilding className="w-6 h-6 text-primary-600" />
              <span className="text-sm font-medium text-gray-700 text-center">Manage Institutions</span>
            </Link>
            <Link
              to="/admin/institutions/create"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
            >
              <IconUserPlus className="w-6 h-6 text-primary-600" />
              <span className="text-sm font-medium text-gray-700 text-center">Create Institution</span>
            </Link>
            <Link
              to="/admin/users"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
            >
              <IconUsers className="w-6 h-6 text-primary-600" />
              <span className="text-sm font-medium text-gray-700 text-center">View All Users</span>
            </Link>
            <Link
              to="/admin/features"
              className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-primary-300 transition-colors"
            >
              <IconTrendingUp className="w-6 h-6 text-primary-600" />
              <span className="text-sm font-medium text-gray-700 text-center">Feature Toggles</span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default GlobalAdminDashboard;
