/**
 * Global Users Page
 * 
 * Platform-wide user management for super_admin only.
 * Full CRUD: Create, Read, Update, Delete users across all institutions.
 * Accessible from admin.digitaltipi.com subdomain.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  IconUsers, 
  IconSearch, 
  IconRefresh,
  IconBuilding,
  IconMail,
  IconPhone,
  IconExternalLink,
  IconUserPlus,
  IconPencil,
  IconTrash,
  IconKey,
  IconCopy,
  IconCheck,
  IconCrown,
  IconCircleCheck,
} from '@tabler/icons-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, columnHelpers } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import api from '../../api/client';
import { authApi } from '../../api/auth';
import { getInstitutionUrl } from '../../hooks/useSubdomain';
import { formatDate, getRoleName } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';

const ROLES = [
  { value: '', label: 'All Roles' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'head_of_teaching_practice', label: 'Head of TP' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'field_monitor', label: 'Field Monitor' },
];

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'head_of_teaching_practice', label: 'Head of Teaching Practice' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'field_monitor', label: 'Field Monitor' },
];

const getRoleBadgeVariant = (role) => {
  const variants = {
    super_admin: 'info',
    head_of_teaching_practice: 'success',
    supervisor: 'warning',
    field_monitor: 'default',
  };
  return variants[role] || 'default';
};

const initialFormState = {
  name: '',
  email: '',
  phone: '',
  role: 'supervisor',
  institution_id: '',
  rank_id: '',
  faculty_id: '',
  file_number: '',
  is_dean: false,
  status: 'active',
};

function GlobalUsersPage() {
  const { toast } = useToast();
  
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, by_role: [], by_institution: [] });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [faculties, setFaculties] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [institutionId, setInstitutionId] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Check if selected role is super_admin (to hide institution-specific fields)
  const isCreatingSuperAdmin = formData.role === 'super_admin';

  // Success dialog (after create)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Password reset
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [userToReset, setUserToReset] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [showResetSuccessDialog, setShowResetSuccessDialog] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  // Fetch institutions for dropdown
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await api.get('/global/institutions');
        setInstitutions(response.data.data || []);
      } catch (err) {
        console.error('Failed to load institutions:', err);
      }
    };
    fetchInstitutions();
  }, []);

  // Fetch ranks and faculties when institution changes
  useEffect(() => {
    const fetchInstitutionData = async () => {
      if (!formData.institution_id || isCreatingSuperAdmin) {
        setRanks([]);
        setFaculties([]);
        return;
      }

      try {
        const institutionId = formData.institution_id;
        const [ranksRes, facultiesRes] = await Promise.all([
          api.get(`/${institutionId}/ranks?status=active`),
          api.get(`/${institutionId}/academic/faculties`),
        ]);
        setRanks(ranksRes.data.data || []);
        setFaculties(facultiesRes.data.data || []);
      } catch (err) {
        console.error('Failed to load institution data:', err);
        setRanks([]);
        setFaculties([]);
      }
    };
    fetchInstitutionData();
  }, [formData.institution_id, isCreatingSuperAdmin]);

  const fetchUsers = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
      });
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      if (institutionId) params.set('institution_id', institutionId);

      const response = await api.get(`/global/users?${params}`);
      const data = response.data.data;
      
      setUsers(data.users || []);
      setStats(data.stats || { total: 0, by_role: [], by_institution: [] });
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, role, institutionId]);

  useEffect(() => {
    fetchUsers(1);
  }, []);

  // Refetch when filters change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, role, institutionId]);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.pages) {
      fetchUsers(newPage);
    }
  };

  const openInstitution = async (subdomain) => {
    if (subdomain) {
      try {
        // Generate one-time SSO token for secure cross-subdomain login
        const response = await authApi.generateSsoToken();
        const { sso_token } = response.data.data || response.data;
        const baseUrl = getInstitutionUrl(subdomain) + '/admin/users';
        const url = `${baseUrl}?sso_token=${encodeURIComponent(sso_token)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      } catch (err) {
        console.error('Failed to generate SSO token:', err);
        // Fallback: open without SSO
        window.open(getInstitutionUrl(subdomain) + '/admin/users', '_blank', 'noopener,noreferrer');
      }
    }
  };

  // Modal handlers
  const openCreateModal = () => {
    setEditUser(null);
    setFormData(initialFormState);
    setFormErrors({});
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setEditUser(user);
    setFormData({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'supervisor',
      institution_id: user.institution_id ? String(user.institution_id) : '',
      rank_id: user.rank_id ? String(user.rank_id) : '',
      faculty_id: user.faculty_id ? String(user.faculty_id) : '',
      file_number: user.file_number || '',
      is_dean: user.is_dean === 1 || user.is_dean === true,
      status: user.status || 'active',
    });
    setFormErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditUser(null);
    setFormData(initialFormState);
    setFormErrors({});
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    // When institution changes, clear rank and faculty selections
    if (name === 'institution_id') {
      setFormData(prev => ({
        ...prev,
        institution_id: value,
        rank_id: '',
        faculty_id: '',
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      }));
    }
    
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name || formData.name.length < 2) errors.name = 'Name is required';
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Valid email is required';
    if (!formData.role) errors.role = 'Role is required';
    if (formData.role !== 'super_admin' && !formData.institution_id) errors.institution_id = 'Institution is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        role: formData.role,
        institution_id: formData.role === 'super_admin' ? null : parseInt(formData.institution_id),
        rank_id: formData.role === 'super_admin' ? null : (formData.rank_id ? parseInt(formData.rank_id) : null),
        faculty_id: formData.role === 'super_admin' ? null : (formData.faculty_id ? parseInt(formData.faculty_id) : null),
        file_number: formData.role === 'super_admin' ? null : (formData.file_number || null),
        is_dean: formData.role === 'super_admin' ? false : formData.is_dean,
        status: formData.status,
      };

      if (editUser) {
        await api.put(`/global/users/${editUser.id}`, payload);
        toast.success('User updated successfully');
        closeModal();
        fetchUsers(pagination.page);
      } else {
        const response = await api.post('/global/users', payload);
        const newUser = response.data?.data || {};
        setCreatedUser({
          ...newUser,
          name: formData.name,
          email: formData.email,
          role: formData.role,
        });
        closeModal();
        setShowSuccessDialog(true);
        fetchUsers(1);
      }
    } catch (err) {
      console.error('Failed to save user:', err);
      toast.error(err.response?.data?.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  // Delete handlers
  const handleDelete = (user) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/global/users/${userToDelete.id}`);
      toast.success('User deleted successfully');
      fetchUsers(pagination.page);
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    } catch (err) {
      console.error('Failed to delete user:', err);
      toast.error(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  // Password reset handlers
  const handleResetPassword = (user) => {
    setUserToReset(user);
    setShowResetConfirm(true);
  };

  const confirmResetPassword = async () => {
    if (!userToReset) return;
    setResetting(true);
    try {
      const response = await api.post(`/global/users/${userToReset.id}/reset-password`);
      const resetData = response.data?.data || {};
      setResetUser({
        ...resetData,
        name: resetData.name || userToReset.name,
        email: resetData.email || userToReset.email,
      });
      setShowResetConfirm(false);
      setUserToReset(null);
      setShowResetSuccessDialog(true);
    } catch (err) {
      console.error('Failed to reset password:', err);
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const copyToClipboard = async (text, setCopied) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  // DataTable columns
  const columns = useMemo(() => [
    {
      accessor: 'name',
      header: 'User',
      render: (value, row) => (
        <div>
          <p className="font-medium text-gray-900">{value}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <IconMail className="w-3 h-3" />
            {row.email}
          </div>
          {row.phone && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <IconPhone className="w-3 h-3" />
              {row.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      accessor: 'role',
      header: 'Role',
      render: (value) => (
        <Badge variant={getRoleBadgeVariant(value)}>
          {getRoleName(value)}
        </Badge>
      ),
      exportFormatter: (value) => getRoleName(value),
    },
    {
      accessor: 'institution_name',
      header: 'Institution',
      render: (value, row) => (
        value ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openInstitution(row.institution_subdomain);
            }}
            className="text-primary-600 hover:text-primary-700 hover:underline px-1 h-auto"
          >
            <IconBuilding className="w-4 h-4 mr-1" />
            {row.institution_code || value}
            <IconExternalLink className="w-3 h-3 ml-1" />
          </Button>
        ) : (
          <span className="text-gray-400 text-sm">—</span>
        )
      ),
    },
    {
      accessor: 'status',
      header: 'Status',
      render: (value) => (
        <Badge variant={value === 'active' ? 'success' : 'default'}>
          {value}
        </Badge>
      ),
    },
    {
      accessor: 'last_login',
      header: 'Last Login',
      render: (value) => (
        <span className="text-sm text-gray-500">
          {value ? formatDate(value, 'MMM d, yyyy HH:mm') : '—'}
        </span>
      ),
      exportFormatter: (value) => value ? formatDate(value, 'MMM d, yyyy HH:mm') : '-',
    },
    columnHelpers.actions((_, row) => (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            openEditModal(row);
          }}
          title="Edit"
        >
          <IconPencil className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            handleResetPassword(row);
          }}
          title="Reset Password"
        >
          <IconKey className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(row);
          }}
          title="Delete"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <IconTrash className="w-4 h-4" />
        </Button>
      </div>
    ), { header: 'Actions' }),
  ], []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Global User Management</h1>
          <p className="text-gray-500 text-sm mt-1">
            Create, update, and manage all users across all institutions
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => fetchUsers(pagination.page)} variant="outline">
            <IconRefresh className="w-4 h-4" />
          </Button>
          <Button onClick={openCreateModal}>
            <IconUserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <IconUsers className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
                <p className="text-xs text-gray-500">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {stats.by_role?.slice(0, 3).map((stat) => (
          <Card key={stat.role}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <IconUsers className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                  <p className="text-xs text-gray-500 truncate">{getRoleName(stat.role)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-56">
              <select
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">All Institutions</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>{i.code} - {i.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table - Using DataTable */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconUsers className="w-5 h-5 text-gray-400" />
            Users ({pagination.total})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="text-center py-12">
              <p className="text-red-500">{error}</p>
              <Button onClick={() => fetchUsers(1)} variant="outline" className="mt-4">Try Again</Button>
            </div>
          ) : (
            <DataTable
              data={users}
              columns={columns}
              keyField="id"
              loading={loading}
              sortable
              exportable
              exportFilename="global_users"
              emptyIcon={IconUsers}
              emptyTitle="No users found"
              emptyDescription="Adjust your filters or add a new user"
              pagination={{
                page: pagination.page,
                limit: pagination.limit,
                total: pagination.total,
                onPageChange: handlePageChange,
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        isOpen={showModal}
        onClose={closeModal}
        title={editUser ? 'Edit User' : 'Create User'}
        width="2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editUser ? 'Update User' : 'Create User'}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Name */}
          <Input
            label="Full Name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            error={formErrors.name}
            required
            placeholder="Enter full name"
          />

          {/* Email */}
          <div>
            <Input
              label="Email Address"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              error={formErrors.email}
              required
              placeholder="user@institution.edu.ng"
            />
            {!editUser && (
              <p className="mt-1 text-xs text-gray-500">
                A welcome email with login credentials will be sent.
              </p>
            )}
          </div>

          {/* Phone */}
          <Input
            label="Phone Number"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            placeholder="e.g., 08012345678"
          />

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <Select
              name="role"
              value={formData.role}
              onChange={handleChange}
              error={formErrors.role}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {formErrors.role && (
              <p className="mt-1 text-sm text-red-500">{formErrors.role}</p>
            )}
            {isCreatingSuperAdmin && (
              <p className="mt-1 text-xs text-amber-600">
                ⚠️ Super Admins have full platform access and are not bound to any institution
              </p>
            )}
          </div>

          {/* Institution (hidden when creating super_admin) */}
          {!isCreatingSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <IconBuilding className="w-4 h-4" />
                  Institution <span className="text-red-500">*</span>
                </span>
              </label>
              <Select
                name="institution_id"
                value={formData.institution_id}
                onChange={handleChange}
                error={formErrors.institution_id}
              >
                <option value="">Select an institution</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name} ({inst.code})
                  </option>
                ))}
              </Select>
              {formErrors.institution_id && (
                <p className="mt-1 text-sm text-red-500">{formErrors.institution_id}</p>
              )}
            </div>
          )}

          {/* Institution-specific fields - hidden for super_admin role */}
          {!isCreatingSuperAdmin && (
            <>
              {/* Rank */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rank
                </label>
                <Select
                  name="rank_id"
                  value={formData.rank_id}
                  onChange={handleChange}
                >
                  <option value="">Select a rank</option>
                  {ranks.map((rank) => (
                    <option key={rank.id} value={rank.id}>
                      {rank.name} ({rank.code})
                    </option>
                  ))}
                </Select>
              </div>

              {/* Faculty */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Faculty
                </label>
                <Select
                  name="faculty_id"
                  value={formData.faculty_id}
                  onChange={handleChange}
                >
                  <option value="">Select a faculty</option>
                  {faculties.map((faculty) => (
                    <option key={faculty.id} value={faculty.id}>
                      {faculty.name} ({faculty.code})
                    </option>
                  ))}
                </Select>
              </div>

              {/* File Number */}
              <div>
                <Input
                  label="File Number"
                  name="file_number"
                  value={formData.file_number}
                  onChange={handleChange}
                  placeholder="e.g., STAFF/2024/001"
                />
              </div>

              {/* Is Dean */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Check if is Dean
                </label>
                <div className="flex items-center gap-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="is_dean"
                    name="is_dean"
                    checked={formData.is_dean}
                    onChange={handleChange}
                    className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <label htmlFor="is_dean" className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                    <IconCrown className="w-4 h-4 text-amber-500" />
                    Is Dean
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Status (only for edit) */}
          {editUser && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <Select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          )}
        </div>
      </Dialog>

      {/* Success Dialog (Created User) */}
      <Dialog
        isOpen={showSuccessDialog}
        onClose={() => setShowSuccessDialog(false)}
        title="User Created Successfully"
        width="lg"
      >
        {createdUser && (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                <IconCircleCheck className="w-8 h-8 text-green-600" />
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">{createdUser.name}</h3>
              <p className="text-sm text-gray-500">has been added to the system</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Email</span>
                <code className="text-sm bg-gray-200 px-2 py-1 rounded font-medium">
                  {createdUser.email}
                </code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Role</span>
                <span className="text-sm font-medium text-gray-900">{getRoleName(createdUser.role)}</span>
              </div>
            </div>

            {/* Password Display */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="text-center">
                <p className="text-sm text-primary-700 mb-2">User Login Password</p>
                <div className="flex items-center justify-center gap-3">
                  <code className="text-3xl font-bold tracking-widest text-primary-800">
                    {createdUser.password || '••••••••'}
                  </code>
                  {createdUser.password && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(createdUser.password, setCopiedPassword)}
                      className="bg-primary-100 hover:bg-primary-200 text-primary-700"
                      title="Copy Password"
                    >
                      {copiedPassword ? (
                        <IconCheck className="w-5 h-5 text-green-600" />
                      ) : (
                        <IconCopy className="w-5 h-5" />
                      )}
                    </Button>
                  )}
                </div>
                {copiedPassword && (
                  <p className="text-xs text-green-600 mt-2">Password copied to clipboard!</p>
                )}
                {!createdUser.password && (
                  <p className="text-xs text-amber-600 mt-2">Password was sent via email only</p>
                )}
              </div>
            </div>

            {/* Email Notice */}
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <p>📧 Login credentials have also been sent to the user&apos;s email address.</p>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => setShowSuccessDialog(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setUserToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete User"
        message={
          userToDelete
            ? `Are you sure you want to permanently delete "${userToDelete.name}" (${userToDelete.email})? This will remove their access to the system. This action cannot be undone.`
            : 'Are you sure you want to delete this user?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        requireText="DELETE"
        loading={deleting}
      />

      {/* Password Reset Confirmation */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => { setShowResetConfirm(false); setUserToReset(null); }}
        onConfirm={confirmResetPassword}
        title="Reset User Password"
        message={
          userToReset
            ? `Are you sure you want to reset the password for "${userToReset.name}" (${userToReset.email})? A new password will be generated and sent to their email.`
            : 'Are you sure you want to reset this user\'s password?'
        }
        confirmText="Reset Password"
        cancelText="Cancel"
        variant="warning"
        loading={resetting}
      />

      {/* Password Reset Success */}
      <Dialog
        isOpen={showResetSuccessDialog}
        onClose={() => setShowResetSuccessDialog(false)}
        title="Password Reset Successfully"
        width="lg"
      >
        {resetUser && (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
                <IconKey className="w-8 h-8 text-amber-600" />
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">{resetUser.name}</h3>
              <p className="text-sm text-gray-500">Password has been reset</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Email</span>
                <code className="text-sm bg-gray-200 px-2 py-1 rounded font-medium">
                  {resetUser.email}
                </code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Role</span>
                <span className="text-sm font-medium text-gray-900">{getRoleName(resetUser.role)}</span>
              </div>
            </div>

            {/* New Password Display */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-center">
                <p className="text-sm text-amber-700 mb-2">New Password</p>
                <div className="flex items-center justify-center gap-3">
                  <code className="text-3xl font-bold tracking-widest text-amber-800">
                    {resetUser.password || '••••••••'}
                  </code>
                  {resetUser.password && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyToClipboard(resetUser.password, setCopiedResetPassword)}
                      className="bg-amber-100 hover:bg-amber-200 text-amber-700"
                      title="Copy Password"
                    >
                      {copiedResetPassword ? (
                        <IconCheck className="w-5 h-5 text-green-600" />
                      ) : (
                        <IconCopy className="w-5 h-5" />
                      )}
                    </Button>
                  )}
                </div>
                {copiedResetPassword && (
                  <p className="text-xs text-green-600 mt-2">Password copied to clipboard!</p>
                )}
                {!resetUser.password && (
                  <p className="text-xs text-amber-600 mt-2">Password was sent via email only</p>
                )}
              </div>
            </div>

            {/* Email Notice */}
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <p>📧 New login credentials have been sent to the user&apos;s email address.</p>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => setShowResetSuccessDialog(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default GlobalUsersPage;
