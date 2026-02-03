/**
 * Users Management Page
 * Full CRUD for staff users with institution, rank, file number, and dean status
 */

import { useState, useEffect, useMemo } from 'react';
import { usersApi } from '../../api/users';
import { ranksApi } from '../../api/ranks';
import { institutionsApi } from '../../api/institutions';
import { facultiesApi } from '../../api/academic';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { getRoleName, getStatusColor, formatDate } from '../../utils/helpers';
import { 
  IconPencil as IconEdit, 
  IconTrash, 
  IconUserPlus,
  IconCrown,
  IconBuilding,
  IconRefresh,
  IconCircleCheck,
  IconCopy,
  IconCheck,
  IconKey
} from '@tabler/icons-react';

// Role options for regular institution users
const BASE_ROLE_OPTIONS = [
  { value: 'head_of_teaching_practice', label: 'Head of Teaching Practice' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'field_monitor', label: 'Field Monitor' },
];

// Super admin role option (only shown to super admins)
const SUPER_ADMIN_ROLE = { value: 'super_admin', label: 'Super Admin' };

// Initial form state (no password - it's auto-generated)
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

function UsersPage() {
  const { user: currentUser, hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);
  const isSuperAdmin = currentUser?.role === 'super_admin';
  
  // Build role options - include super_admin only if current user is super_admin
  const roleOptions = isSuperAdmin 
    ? [SUPER_ADMIN_ROLE, ...BASE_ROLE_OPTIONS]
    : BASE_ROLE_OPTIONS;

  // Data state
  const [users, setUsers] = useState([]);
  const [ranks, setRanks] = useState([]);
  const [faculties, setFaculties] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & filters state
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [formData, setFormData] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Check if selected role is super_admin (to hide institution-specific fields)
  const isCreatingSuperAdmin = formData.role === 'super_admin';

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Success dialog state (after creating a user)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdUser, setCreatedUser] = useState(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Password reset confirmation state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [userToReset, setUserToReset] = useState(null);
  const [resetting, setResetting] = useState(false);

  // Password reset success dialog state
  const [showResetSuccessDialog, setShowResetSuccessDialog] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [copiedResetPassword, setCopiedResetPassword] = useState(false);

  // Fetch users with pagination
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;

      const response = await usersApi.getAll(params);
      // API returns { success, data: users[], pagination }
      setUsers(response.data?.data || response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data?.pagination?.total || 0,
      }));
    } catch (err) {
      toast.error('Failed to load users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch ranks for dropdown
  const fetchRanks = async () => {
    try {
      const response = await ranksApi.getAll({ status: 'active' });
      setRanks(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load ranks:', err);
    }
  };

  // Fetch faculties for dropdown
  const fetchFaculties = async () => {
    try {
      const response = await facultiesApi.getAll({ status: 'active' });
      setFaculties(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load faculties:', err);
    }
  };

  // Fetch institutions for dropdown (super_admin only)
  const fetchInstitutions = async () => {
    if (!isSuperAdmin) return;
    try {
      const response = await institutionsApi.getSwitchList();
      setInstitutions(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load institutions:', err);
    }
  };

  // Initial load for ranks, faculties and institutions
  useEffect(() => {
    fetchRanks();
    fetchFaculties();
    if (isSuperAdmin) {
      fetchInstitutions();
    }
  }, [isSuperAdmin]);

  // Fetch users when pagination or filters change
  useEffect(() => {
    fetchUsers();
  }, [pagination.page, search, roleFilter, statusFilter]);

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

  // Form change handler
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    // Clear error when field is changed
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Form validation
  const validateForm = () => {
    const errors = {};
    
    if (!formData.name || formData.name.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }
    
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Valid email is required';
    }
    
    if (!formData.role) {
      errors.role = 'Role is required';
    }

    // Super admin creating non-super_admin users must select an institution
    // But if creating a super_admin, institution is not required
    if (isSuperAdmin && !editUser && formData.role !== 'super_admin' && !formData.institution_id) {
      errors.institution_id = 'Institution is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save handler
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
      };
      
      // Only include institution-specific fields for non-super_admin users
      if (formData.role !== 'super_admin') {
        payload.rank_id = formData.rank_id ? parseInt(formData.rank_id) : null;
        payload.faculty_id = formData.faculty_id ? parseInt(formData.faculty_id) : null;
        payload.file_number = formData.file_number || null;
        payload.is_dean = formData.is_dean;
        
        // Super admin can specify institution for non-super_admin users
        if (isSuperAdmin && formData.institution_id) {
          payload.institution_id = parseInt(formData.institution_id);
        }
      }

      if (editUser) {
        // Update - only include status for edit
        payload.status = formData.status;
        await usersApi.update(editUser.id, payload);
        toast.success('User updated successfully');
        closeModal();
        fetchUsers();
      } else {
        // Create - no password needed (auto-generated and emailed)
        const response = await usersApi.create(payload);
        const newUser = response.data?.data || response.data || {};
        setCreatedUser({
          ...newUser,
          name: formData.name,
          email: formData.email,
          role: formData.role,
        });
        closeModal();
        setShowSuccessDialog(true);
        fetchUsers();
      }
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save user';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Delete handlers
  const handleDelete = (user) => {
    // Prevent self-deletion
    if (user.id === currentUser?.id) {
      toast.error('You cannot delete your own account');
      return;
    }
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    
    setDeleting(true);
    try {
      await usersApi.delete(userToDelete.id);
      toast.success('User deleted successfully');
      fetchUsers();
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to delete user';
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  // Password reset handlers
  const handleResetPassword = (user) => {
    // Prevent self-reset
    if (user.id === currentUser?.id) {
      toast.error('You cannot reset your own password here. Use the Change Password option instead.');
      return;
    }
    setUserToReset(user);
    setShowResetConfirm(true);
  };

  const confirmResetPassword = async () => {
    if (!userToReset) return;
    
    setResetting(true);
    try {
      const response = await usersApi.hardResetPassword(userToReset.id);
      const resetData = response.data?.data || {};
      
      setResetUser({
        ...resetData,
        name: resetData.name || userToReset.name,
        email: resetData.email || userToReset.email,
        role: resetData.role || userToReset.role,
      });
      
      setShowResetConfirm(false);
      setUserToReset(null);
      setShowResetSuccessDialog(true);
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to reset password';
      toast.error(message);
    } finally {
      setResetting(false);
    }
  };

  // Table columns
  const columns = useMemo(() => [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (value, row) => row ? (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{row.name}</span>
          {row.is_dean === 1 && (
            <IconCrown className="w-4 h-4 text-amber-500" title="Dean" />
          )}
        </div>
      ) : null
    },
    {
      key: 'email',
      header: 'Email',
      render: (value, row) => row ? <span className="text-gray-500">{row.email}</span> : null
    },
    {
      key: 'role',
      header: 'Role',
      render: (value, row) => row ? <Badge variant="primary">{getRoleName(row.role)}</Badge> : null
    },
    {
      key: 'rank_name',
      header: 'Rank',
      render: (value, row) => row ? (
        <span className="text-gray-600">
          {row.rank_name || <span className="text-gray-400 italic">Not set</span>}
        </span>
      ) : null
    },
    {
      key: 'faculty_name',
      header: 'Faculty',
      render: (value, row) => row ? (
        <span className="text-gray-600">
          {row.faculty_name || <span className="text-gray-400 italic">Not set</span>}
        </span>
      ) : null
    },
    {
      key: 'file_number',
      header: 'File No.',
      render: (value, row) => row ? (
        <span className="text-gray-600 text-sm font-mono">
          {row.file_number || <span className="text-gray-400 italic">—</span>}
        </span>
      ) : null
    },
    {
      key: 'status',
      header: 'Status',
      render: (value, row) => row ? (
        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(row.status)}`}>
          {row.status}
        </span>
      ) : null
    },
    {
      key: 'last_login',
      header: 'Last Login',
      render: (value, row) => row ? (
        <span className="text-gray-500 text-sm">
          {row.last_login ? formatDate(row.last_login) : 'Never'}
        </span>
      ) : null
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (value, row) => row ? (
        <div className="flex items-center justify-end gap-2">
          {canEdit && (
            <>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => openEditModal(row)}
                title="Edit user"
              >
                <IconEdit className="w-4 h-4" />
              </Button>
              {isSuperAdmin && row.id !== currentUser?.id && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => handleResetPassword(row)}
                  title="Reset password"
                >
                  <IconKey className="w-4 h-4 text-amber-500" />
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => handleDelete(row)}
                title="Delete user"
                disabled={row.id === currentUser?.id}
              >
                <IconTrash className="w-4 h-4 text-red-500" />
              </Button>
            </>
          )}
        </div>
      ) : null
    }
  ], [canEdit, currentUser]);

  // Toolbar with filters
  const tableToolbar = (
    <div className="flex items-center gap-4 flex-wrap">
      <Input
        placeholder="Search users..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPagination((p) => ({ ...p, page: 1 })); // Reset to page 1 on search
        }}
        className="w-64"
      />
      <Select
        value={roleFilter}
        onChange={(e) => {
          setRoleFilter(e.target.value);
          setPagination((p) => ({ ...p, page: 1 }));
        }}
        className="w-auto"
      >
        <option value="">All Roles</option>
        {roleOptions.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </Select>
      <Select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setPagination((p) => ({ ...p, page: 1 }));
        }}
        className="w-auto"
      >
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => { 
          setSearch(''); 
          setRoleFilter(''); 
          setStatusFilter(''); 
          setPagination((p) => ({ ...p, page: 1 }));
        }}
        title="Reset filters"
      >
        <IconRefresh className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage staff members and their roles</p>
        </div>
        {canEdit && (
          <Button onClick={openCreateModal} size="sm" className="active:scale-95 flex-shrink-0">
            <IconUserPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add User</span>
          </Button>
        )}
      </div>

      {/* Users Table */}
      <DataTable
        data={users}
        columns={columns}
        keyField="id"
        loading={loading}
        sortable
        exportable
        exportFilename="users"
        toolbar={tableToolbar}
        emptyTitle="No users found"
        emptyDescription="Create a new user to get started"
        pagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          onPageChange: (page) => setPagination((p) => ({ ...p, page })),
        }}
      />

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

          {/* Role - MOVED BEFORE INSTITUTION */}
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
              {roleOptions.map((option) => (
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

          {/* Institution (super_admin only, hidden when creating super_admin) */}
          {isSuperAdmin && !isCreatingSuperAdmin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <span className="flex items-center gap-1">
                  <IconBuilding className="w-4 h-4" />
                  Institution {!editUser && <span className="text-red-500">*</span>}
                </span>
              </label>
              <Select
                name="institution_id"
                value={formData.institution_id}
                onChange={handleChange}
                error={formErrors.institution_id}
                disabled={editUser} // Cannot change institution after creation
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
              {editUser && (
                <p className="mt-1 text-xs text-gray-500">
                  Institution cannot be changed after user creation
                </p>
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

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setUserToDelete(null);
        }}
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

      {/* Success Dialog - After Creating User */}
      <Dialog
        isOpen={showSuccessDialog}
        onClose={() => { setShowSuccessDialog(false); setCreatedUser(null); setCopiedPassword(false); }}
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

            {/* Password Section - Highlighted */}
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
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(createdUser.password);
                          setCopiedPassword(true);
                          setTimeout(() => setCopiedPassword(false), 2000);
                        } catch (err) {
                          toast.error('Failed to copy password');
                        }
                      }}
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

            {/* Email notification message */}
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <p>📧 Login credentials have also been sent to the user&apos;s email address.</p>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => { setShowSuccessDialog(false); setCreatedUser(null); setCopiedPassword(false); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Password Reset Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => {
          setShowResetConfirm(false);
          setUserToReset(null);
        }}
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

      {/* Password Reset Success Dialog */}
      <Dialog
        isOpen={showResetSuccessDialog}
        onClose={() => { setShowResetSuccessDialog(false); setResetUser(null); setCopiedResetPassword(false); }}
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

            {/* New Password Section - Highlighted */}
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
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(resetUser.password);
                          setCopiedResetPassword(true);
                          setTimeout(() => setCopiedResetPassword(false), 2000);
                        } catch (err) {
                          toast.error('Failed to copy password');
                        }
                      }}
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

            {/* Email notification message */}
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
              <p>📧 New login credentials have been sent to the user&apos;s email address.</p>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => { setShowResetSuccessDialog(false); setResetUser(null); setCopiedResetPassword(false); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default UsersPage;
