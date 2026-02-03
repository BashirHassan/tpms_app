/**
 * Institutions Management Page
 * Super Admin only - manage all institutions and view stats
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { institutionsApi } from '../../api/institutions';
import { cn, formatDate } from '../../utils/helpers';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { DataTable, columnHelpers } from '../../components/ui/DataTable';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import {
  IconBuilding,
  IconPlus,
  IconEdit,
  IconTrash,
  IconSearch,
  IconRefresh,
  IconCheck,
  IconX,
  IconUsers,
  IconSchool,
  IconEye,
  IconMail,
  IconPhone,
  IconMapPin,
  IconGlobe,
  IconCalendar,
} from '@tabler/icons-react';

// Status badge styling
const statusStyles = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  suspended: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

export default function InstitutionsPage() {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [institutions, setInstitutions] = useState([]);
  const [allStats, setAllStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Modal states
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  
  // Selected institution for modals
  const [selectedInstitution, setSelectedInstitution] = useState(null);

  // Fetch institutions
  const fetchInstitutions = useCallback(async () => {
    try {
      setLoading(true);
      const [institutionsRes, statsRes] = await Promise.all([
        institutionsApi.getAll(),
        institutionsApi.getAllStats(),
      ]);
      // Handle nested response structure
      const institutionsData = institutionsRes?.data?.data || institutionsRes?.data || [];
      const statsData = statsRes?.data?.data || statsRes?.data || null;
      
      // Merge stats into institutions - stats contains student_count and user_count
      const statsInstitutions = statsData?.institutions || [];
      const mergedInstitutions = Array.isArray(institutionsData) 
        ? institutionsData.map(inst => {
            const stats = statsInstitutions.find(s => s.id === inst.id);
            return {
              ...inst,
              student_count: stats?.student_count || 0,
              current_session_student_count: stats?.current_session_student_count || 0,
              staff_count: stats?.user_count || 0,
              school_count: stats?.school_count || 0,
              // Mark setup as complete if active and has any data
              setup_complete: inst.status === 'active',
            };
          })
        : [];
      
      setInstitutions(mergedInstitutions);
      setAllStats(statsData);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch institutions:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch institutions');
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchInstitutions();
    }
  }, [isSuperAdmin, fetchInstitutions]);

  // Filter institutions by search term and status
  const filteredInstitutions = useMemo(() => {
    return institutions.filter((inst) => {
      const matchesSearch = 
        inst.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inst.subdomain?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = !statusFilter || inst.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [institutions, searchTerm, statusFilter]);

  // Compute filtered stats based on filtered institutions
  const filteredStats = useMemo(() => {
    if (!allStats) return null;
    const filteredIds = new Set(filteredInstitutions.map(i => i.id));
    const filteredStatsInsts = (allStats.institutions || []).filter(i => filteredIds.has(i.id));
    return {
      total_institutions: filteredInstitutions.length,
      active_institutions: filteredInstitutions.filter(i => i.status === 'active').length,
      total_students: filteredStatsInsts.reduce((sum, i) => sum + (i.student_count || 0), 0),
      total_users: filteredStatsInsts.reduce((sum, i) => sum + (i.user_count || 0), 0),
    };
  }, [allStats, filteredInstitutions]);

  // Handle delete institution
  const handleDelete = async () => {
    if (!selectedInstitution) return;
    
    try {
      setSaving(true);
      await institutionsApi.updateStatus(selectedInstitution.id, 'deleted');
      setShowDeleteModal(false);
      setSelectedInstitution(null);
      await fetchInstitutions();
    } catch (err) {
      console.error('Failed to delete institution:', err);
      setError(err.response?.data?.message || err.message || 'Failed to delete institution');
    } finally {
      setSaving(false);
    }
  };

  // Open view modal
  const openViewModal = async (institution) => {
    try {
      const res = await institutionsApi.getById(institution.id);
      const data = res?.data?.data || res?.data || institution;
      // Merge stats data
      const stats = allStats?.institutions?.find(s => s.id === institution.id);
      setSelectedInstitution({
        ...data,
        student_count: stats?.student_count || institution.student_count || 0,
        staff_count: stats?.user_count || institution.staff_count || 0,
        school_count: stats?.school_count || institution.school_count || 0,
      });
      setShowViewModal(true);
    } catch (err) {
      console.error('Failed to fetch institution details:', err);
      setSelectedInstitution(institution);
      setShowViewModal(true);
    }
  };

  // Navigate to edit (uses settings page)
  const handleEdit = (institution) => {
    // Navigate to institution settings page with the institution ID
    navigate(`/admin/institutions/${institution.id}/settings`);
  };

  // Table columns for DataTable
  const columns = useMemo(() => [
    {
      accessor: 'name',
      header: 'Institution',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
            style={{ backgroundColor: row.primary_color || '#6366f1' }}
          >
            {value?.charAt(0) || 'I'}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">{value}</p>
            <p className="text-sm text-gray-500 truncate">{row.subdomain || 'No subdomain'}</p>
          </div>
        </div>
      ),
    },
    {
      accessor: 'code',
      header: 'Code',
      render: (value) => <span className="font-mono text-sm text-gray-700">{value}</span>,
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (value) => (
        <span className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
          statusStyles[value] || statusStyles.pending
        )}>
          {value}
        </span>
      ),
    },
    {
      accessor: 'student_count',
      header: 'Students',
      render: (value) => <span className="text-gray-700">{value || 0}</span>,
    },
    {
      accessor: 'current_session_student_count',
      header: 'Current Session',
      render: (value) => <span className="text-gray-700">{value || 0}</span>,
    },
    {
      accessor: 'staff_count',
      header: 'Staff',
      render: (value) => <span className="text-gray-700">{value || 0}</span>,
    },
    {
      accessor: 'school_count',
      header: 'Schools',
      render: (value) => <span className="text-gray-700">{value || 0}</span>,
    },
    columnHelpers.actions((_, row) => (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); openViewModal(row); }}
          className="text-gray-600 hover:bg-gray-100"
          title="View Details"
        >
          <IconEye className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
          className="text-blue-600 hover:bg-blue-50"
          title="Edit"
        >
          <IconEdit className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedInstitution(row);
            setShowDeleteModal(true);
          }}
          className="text-red-600 hover:bg-red-50"
          title="Delete"
        >
          <IconTrash className="w-4 h-4" />
        </Button>
      </div>
    ), { header: 'Actions' }),
  ], [openViewModal, handleEdit]);

  // Toolbar with filters
  const tableToolbar = (
    <div className="flex flex-col md:flex-row gap-2">
      {/* Filters - grid on mobile, flex on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-2">
        <div className="relative w-full col-span-2">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search institutions..."
            className="pl-9 pr-3 w-full"
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </Select>
      </div>
      <Button 
        variant="outline"
        onClick={() => { setSearchTerm(''); setStatusFilter(''); }} 
        className="active:scale-95 flex-shrink-0 justify-self-end"
        title="Clear filters"
      >
        <IconRefresh className="w-4 h-4" />
      </Button>
    </div>
  );

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <IconBuilding className="w-16 h-16 mx-auto text-gray-400" />
          <h2 className="mt-4 text-xl font-semibold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">Only Super Admin can access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Institutions</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage all institutions</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={fetchInstitutions} disabled={loading} className="active:scale-95">
            <IconRefresh className={cn('w-4 h-4', loading && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => navigate('/admin/institutions/create')} className="active:scale-95">
            <IconPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Institution</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {filteredStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-white rounded-lg border p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg flex-shrink-0">
                <IconBuilding className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Institutions</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">
                  {filteredStats.total_institutions}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg flex-shrink-0">
                <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Active</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">
                  {filteredStats.active_institutions}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg flex-shrink-0">
                <IconSchool className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Students</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">
                  {filteredStats.total_students}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg border p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-100 rounded-lg flex-shrink-0">
                <IconUsers className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Staff</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900">
                  {filteredStats.total_users}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Institutions Table - Using DataTable */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={filteredInstitutions}
            columns={columns}
            keyField="id"
            loading={loading}
            sortable
            exportable
            exportFilename="institutions"
            toolbar={tableToolbar}
            emptyIcon={IconBuilding}
            emptyTitle="No institutions found"
            emptyDescription="Adjust your filters or add a new institution"
          />
        </CardContent>
      </Card>

      {/* View Details Modal */}
      <Dialog
        isOpen={showViewModal && !!selectedInstitution}
        onClose={() => {
          setShowViewModal(false);
          setSelectedInstitution(null);
        }}
        title={
          selectedInstitution && (
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: selectedInstitution.primary_color || '#6366f1' }}
              >
                {selectedInstitution.name?.charAt(0) || 'I'}
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900">{selectedInstitution.name}</div>
                <div className="text-sm text-gray-500 font-mono">{selectedInstitution.code}</div>
              </div>
            </div>
          )
        }
        width="3xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowViewModal(false);
                if (selectedInstitution) handleEdit(selectedInstitution);
              }}
            >
              <IconEdit className="w-4 h-4 mr-2" />
              Edit Institution
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowViewModal(false);
                setSelectedInstitution(null);
              }}
            >
              Close
            </Button>
          </div>
        }
      >
        {selectedInstitution && (
          <div className="space-y-4">
            {/* Status & Type Badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn(
                'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium capitalize',
                statusStyles[selectedInstitution.status] || statusStyles.pending
              )}>
                {selectedInstitution.status}
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800 capitalize">
                {selectedInstitution.institution_type?.replace(/_/g, ' ')}
              </span>
              {selectedInstitution.subdomain && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  <IconGlobe className="w-3 h-3" />
                  {selectedInstitution.subdomain}
                </span>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <IconSchool className="w-8 h-8 mx-auto text-purple-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedInstitution.student_count || 0}</p>
                  <p className="text-sm text-gray-500">Students</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <IconUsers className="w-8 h-8 mx-auto text-amber-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedInstitution.staff_count || 0}</p>
                  <p className="text-sm text-gray-500">Staff</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <IconBuilding className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900">{selectedInstitution.school_count || 0}</p>
                  <p className="text-sm text-gray-500">Schools</p>
                </CardContent>
              </Card>
            </div>

            {/* Contact Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <IconMail className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="text-sm font-medium text-gray-900">{selectedInstitution.email || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <IconPhone className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="text-sm font-medium text-gray-900">{selectedInstitution.phone || 'N/A'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg md:col-span-2">
                  <IconMapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-500">Address</p>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedInstitution.address || 'N/A'}
                      {selectedInstitution.state && `, ${selectedInstitution.state}`}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Branding Colors */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Branding Colors</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border"
                    style={{ backgroundColor: selectedInstitution.primary_color || '#1a5f2a' }}
                  />
                  <div>
                    <p className="text-xs text-gray-500">Primary</p>
                    <span className="text-sm font-mono text-gray-600">
                      {selectedInstitution.primary_color || '#1a5f2a'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border"
                    style={{ backgroundColor: selectedInstitution.secondary_color || '#8b4513' }}
                  />
                  <div>
                    <p className="text-xs text-gray-500">Secondary</p>
                    <span className="text-sm font-mono text-gray-600">
                      {selectedInstitution.secondary_color || '#8b4513'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Timestamps */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <IconCalendar className="w-4 h-4" />
                  Created: {formatDate(selectedInstitution.created_at)}
                </span>
                <span>Updated: {formatDate(selectedInstitution.updated_at)}</span>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedInstitution(null);
        }}
        onConfirm={handleDelete}
        title="Delete Institution"
        message={`Are you sure you want to delete "${selectedInstitution?.name}"? This action will mark the institution as deleted and cannot be undone easily.`}
        confirmText="Delete Institution"
        cancelText="Cancel"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
