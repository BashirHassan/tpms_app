/**
 * Acceptances Management Page (Admin)
 * Manage and review student acceptance forms
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { acceptancesApi, sessionsApi, schoolsApi, groupsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconFileText,
  IconEye,
  IconDownload,
  IconBuildingBank as IconSchool,
  IconRefresh,
  IconTrash,
  IconPencil as IconEdit,
  IconPhoto,
} from '@tabler/icons-react';

function AcceptancesPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canReview = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(true);
  const [acceptances, setAcceptances] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [schools, setSchools] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  // Filters
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedSchool, setSelectedSchool] = useState('');
  const [search, setSearch] = useState('');

  // Modal state
  const [selectedAcceptance, setSelectedAcceptance] = useState(null);

  // Edit modal state
  const [editingAcceptance, setEditingAcceptance] = useState(null);
  const [editSchool, setEditSchool] = useState('');
  const [editGroup, setEditGroup] = useState('');
  const [editSchoolGroups, setEditSchoolGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete confirmation state
  const [deletingAcceptance, setDeletingAcceptance] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Image preview state
  const [previewImage, setPreviewImage] = useState(null);

  // Fetch data
  useEffect(() => {
    fetchSessions();
    fetchSchools();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      fetchAcceptances();
      fetchStatistics();
    }
  }, [selectedSession, selectedSchool, search, pagination.page]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll({ status: 'active' });
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      if (sessionsData.length > 0) {
        const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchSchools = async () => {
    try {
      const response = await schoolsApi.getAll({ status: 'active', limit: 500 });
      setSchools(response.data.data || response.data || []);
    } catch (err) {
      console.error('Failed to load schools:', err);
    }
  };

  const fetchAcceptances = async () => {
    setLoading(true);
    try {
      const params = {
        session_id: selectedSession,
        page: pagination.page,
        limit: pagination.limit,
      };
      if (selectedSchool) params.school_id = selectedSchool;
      if (search) params.search = search;

      const response = await acceptancesApi.getAll(params);
      setAcceptances(response.data.data || response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (err) {
      toast.error('Failed to load acceptances');
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const response = await acceptancesApi.getStatistics(selectedSession);
      setStatistics(response.data.data || response.data || {});
    } catch (err) {
      console.error('Failed to load statistics:', err);
    }
  };

  // Helper to download image
  const handleDownload = async (url, filename) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'signed_form.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      toast.error('Failed to download file');
    }
  };

  const fetchSchoolGroups = useCallback(async (schoolId) => {
    if (!schoolId || !selectedSession) return;
    
    setLoadingGroups(true);
    try {
      const response = await groupsApi.getSchoolGroups(schoolId, selectedSession);
      const groups = response.data?.data || response.data || [];
      setEditSchoolGroups(groups);
      
      // If current group is not in the list, add it as an option
      if (groups.length === 0) {
        setEditSchoolGroups([{ group_number: 1 }]);
      }
    } catch (err) {
      console.error('Failed to fetch school groups:', err);
      // Fallback to basic groups 1-10
      setEditSchoolGroups([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ group_number: n })));
    } finally {
      setLoadingGroups(false);
    }
  }, [selectedSession]);

  const openEditModal = useCallback((acceptance) => {
    setEditingAcceptance(acceptance);
    setEditSchool(acceptance.school_id.toString());
    setEditGroup(acceptance.group_number.toString());
    // Fetch groups for the current school
    fetchSchoolGroups(acceptance.school_id);
  }, [fetchSchoolGroups]);

  // Table columns definition
  const columns = useMemo(() => [
    {
      accessor: 'student_name',
      header: 'Student',
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{row.registration_number}</p>
        </div>
      ),
    },
    {
      accessor: 'phone',
      header: 'Phone',
      render: (value) => value || 'N/A',
    },
    {
      accessor: 'program_name',
      header: 'Program',
      render: (value) => value || 'N/A',
    },
    {
      accessor: 'school_name',
      header: 'School',
      render: (value, row) => (
        <div>
          <p className="text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{row.route_name || 'N/A'}</p>
        </div>
      ),
    },
    {
      accessor: 'group_number',
      header: 'Group',
      render: (value) => <Badge variant="outline">Group {value}</Badge>,
    },
    {
      accessor: 'status',
      header: 'Status',
      render: () => (
        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
          Submitted
        </span>
      ),
    },
    {
      accessor: 'submitted_at',
      header: 'Submitted',
      type: 'date',
    },
    {
      accessor: 'actions',
      header: 'Actions',
      sortable: false,
      exportable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedAcceptance(row); }} title="View Details">
            <IconEye className="w-4 h-4" />
          </Button>
          {canReview && (
            <>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditModal(row); }} title="Edit School/Group">
                <IconEdit className="w-4 h-4 text-blue-600" />
              </Button>
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeletingAcceptance(row); }} title="Delete">
                <IconTrash className="w-4 h-4 text-red-600" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ], [canReview, openEditModal]);

  // Toolbar with filters
  const handleSchoolChange = (schoolId) => {
    setEditSchool(schoolId);
    setEditGroup('1'); // Reset to group 1 when school changes
    fetchSchoolGroups(schoolId);
  };

  const handleUpdate = async () => {
    if (!editingAcceptance) return;

    setSaving(true);
    try {
      await acceptancesApi.update(editingAcceptance.id, {
        school_id: parseInt(editSchool),
        group_number: parseInt(editGroup),
      });
      toast.success('Acceptance updated successfully');
      setEditingAcceptance(null);
      fetchAcceptances();
      fetchStatistics();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update acceptance');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAcceptance) return;

    setDeleting(true);
    try {
      await acceptancesApi.delete(deletingAcceptance.id);
      toast.success('Acceptance deleted successfully');
      setDeletingAcceptance(null);
      fetchAcceptances();
      fetchStatistics();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete acceptance');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Acceptance Forms</h1>
        <Button variant="outline" onClick={fetchAcceptances} size="sm" className="active:scale-95">
          <IconRefresh className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconFileText className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_submissions}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Submissions</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <IconFileText className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.not_submitted || 0}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Not Submitted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <IconSchool className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.schools_selected}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Schools Selected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Search</label>
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or reg number..."
                className="text-sm"
              />
            </div>
            <div className="sm:col-span-1 lg:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">School</label>
              <Select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="text-sm"
              >
                <option value="">All Schools</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Session</label>
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
        </CardContent>
      </Card>

      {/* Acceptances Table */}
      <DataTable
        data={acceptances}
        columns={columns}
        keyField="id"
        loading={loading}
        sortable
        exportable
        exportFilename="acceptances_export"
        emptyIcon={IconFileText}
        emptyTitle="No acceptances found"
        emptyDescription="Student acceptance forms will appear here"
        pagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          onPageChange: (page) => setPagination((p) => ({ ...p, page })),
        }}
      />

      {/* View Modal */}
      <Dialog
        isOpen={!!selectedAcceptance}
        onClose={() => setSelectedAcceptance(null)}
        title="Acceptance Details"
        width="xl"
      >
        {selectedAcceptance && (
          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Student</p>
                <p className="font-medium text-sm sm:text-base truncate">{selectedAcceptance.student_name}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Reg Number</p>
                <p className="font-medium text-sm sm:text-base truncate">{selectedAcceptance.registration_number}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">School</p>
                <p className="font-medium text-sm sm:text-base truncate">{selectedAcceptance.school_name}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Group</p>
                <p className="font-medium text-sm sm:text-base">Group {selectedAcceptance.group_number}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Phone</p>
                <p className="font-medium text-sm sm:text-base">{selectedAcceptance.phone}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-gray-500">Email</p>
                <p className="font-medium text-sm sm:text-base truncate">{selectedAcceptance.email || 'N/A'}</p>
              </div>
            </div>

            {selectedAcceptance.signed_form_url && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setPreviewImage({ url: selectedAcceptance.signed_form_url, name: selectedAcceptance.student_name })}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 sm:p-3 bg-gray-50 hover:bg-gray-100 active:scale-[0.98]"
                >
                  <IconPhoto className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                  <span className="text-green-600 font-medium text-sm sm:text-base">View Signed Form</span>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleDownload(selectedAcceptance.signed_form_url, `acceptance_${selectedAcceptance.registration_number}.jpg`)}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 sm:p-3 bg-gray-50 hover:bg-gray-100 active:scale-[0.98]"
                >
                  <IconDownload className="w-4 h-4 sm:w-5 sm:h-5 text-primary-600" />
                  <span className="text-primary-600 font-medium text-sm sm:text-base">Download</span>
                </Button>
              </div>
            )}

            {/* Status indicator */}
            <div className="pt-3 sm:pt-4 border-t">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"></div>
                <span className="text-xs sm:text-sm text-green-700 font-medium">Auto-approved on submission</span>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Edit Modal */}
      <Dialog
        isOpen={!!editingAcceptance}
        onClose={() => setEditingAcceptance(null)}
        title="Edit Acceptance"
        width="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setEditingAcceptance(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </>
        }
      >
        {editingAcceptance && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Student</p>
              <p className="font-medium">{editingAcceptance.student_name}</p>
              <p className="text-sm text-gray-500">{editingAcceptance.registration_number}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
              <Select
                value={editSchool}
                onChange={(e) => handleSchoolChange(e.target.value)}
              >
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group Number</label>
              <Select
                value={editGroup}
                onChange={(e) => setEditGroup(e.target.value)}
                disabled={loadingGroups}
              >
                {loadingGroups ? (
                  <option>Loading groups...</option>
                ) : editSchoolGroups.length > 0 ? (
                  editSchoolGroups.map((group) => (
                    <option key={group.group_number} value={group.group_number}>
                      Group {group.group_number} {group.student_count !== undefined ? `(${group.student_count} students)` : ''}
                    </option>
                  ))
                ) : (
                  [1, 2, 3, 4, 5].map((num) => (
                    <option key={num} value={num}>
                      Group {num}
                    </option>
                  ))
                )}
              </Select>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={!!deletingAcceptance}
        onClose={() => setDeletingAcceptance(null)}
        title="Delete Acceptance"
        width="md"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDeletingAcceptance(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        }
      >
        {deletingAcceptance && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
              <IconTrash className="w-6 h-6 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">Are you sure you want to delete this acceptance?</p>
                <p className="text-sm text-red-600 mt-1">This action cannot be undone. The student will be able to submit a new acceptance form.</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-500">Student</p>
              <p className="font-medium">{deletingAcceptance.student_name}</p>
              <p className="text-sm text-gray-500 mt-2">School</p>
              <p className="font-medium">{deletingAcceptance.school_name}</p>
            </div>
          </div>
        )}
      </Dialog>

      {/* Image Preview Modal */}
      <Dialog
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        title={previewImage?.name ? `Signed Form - ${previewImage.name}` : 'Signed Form'}
        width="xl"
        footer={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPreviewImage(null)}
            >
              Close
            </Button>
            {previewImage?.url && (
              <Button
                onClick={() => handleDownload(previewImage.url, `acceptance_form.jpg`)}
              >
                <IconDownload className="w-4 h-4 mr-2" />
                Download
              </Button>
            )}
          </div>
        }
      >
        {previewImage && (
          <div className="flex items-center justify-center bg-gray-100 rounded-lg p-4 min-h-[400px]">
            <img
              src={previewImage.url}
              alt="Signed Acceptance Form"
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '';
                e.target.alt = 'Failed to load image';
              }}
            />
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default AcceptancesPage;
