/**
 * Dean Posting Allocation Page
 * 
 * Allows Head of Teaching Practice and Super Admin to allocate postings to deans.
 * Deans can then create postings for supervisors within their faculty.
 */

import { useState, useEffect, useMemo } from 'react';
import { deanAllocationsApi } from '../../api/deanAllocations';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { formatDate } from '../../utils/helpers';
import {
  IconUsers,
  IconClipboardList,
  IconPlus,
  IconPencil as IconEdit,
  IconTrash,
  IconRefresh,
  IconCrown,
  IconBuilding,
  IconChartBar,
} from '@tabler/icons-react';

function DeanPostingAllocationPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // Data state
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState([]);
  const [stats, setStats] = useState(null);
  const [availableDeans, setAvailableDeans] = useState([]);
  const [allDeans, setAllDeans] = useState([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editAllocation, setEditAllocation] = useState(null);
  const [formData, setFormData] = useState({
    dean_user_id: '',
    allocated_postings: 0,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [allocationToDelete, setAllocationToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, allocationsRes, deansRes] = await Promise.all([
        deanAllocationsApi.getStats(),
        deanAllocationsApi.getAll(),
        deanAllocationsApi.getAllDeans(),
      ]);
      setStats(statsRes.data.data);
      setAllocations(allocationsRes.data.data || []);
      setAllDeans(deansRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableDeans = async () => {
    try {
      const response = await deanAllocationsApi.getAvailableDeans();
      setAvailableDeans(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch available deans:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open create modal
  const openCreateModal = async () => {
    await fetchAvailableDeans();
    setEditAllocation(null);
    setFormData({
      dean_user_id: '',
      allocated_postings: 0,
      notes: '',
    });
    setFormErrors({});
    setShowModal(true);
  };

  // Open edit modal
  const openEditModal = (allocation) => {
    setEditAllocation(allocation);
    setFormData({
      dean_user_id: allocation.dean_user_id,
      allocated_postings: allocation.allocated_postings,
      notes: allocation.notes || '',
    });
    setFormErrors({});
    setShowModal(true);
  };

  // Close modal
  const closeModal = () => {
    setShowModal(false);
    setEditAllocation(null);
    setFormData({
      dean_user_id: '',
      allocated_postings: 0,
      notes: '',
    });
    setFormErrors({});
  };

  // Form change handler
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) || 0 : value,
    }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Validate form
  const validateForm = () => {
    const errors = {};
    
    if (!editAllocation && !formData.dean_user_id) {
      errors.dean_user_id = 'Please select a dean';
    }
    
    if (formData.allocated_postings < 0) {
      errors.allocated_postings = 'Allocation must be 0 or greater';
    }

    if (editAllocation && formData.allocated_postings < editAllocation.used_postings) {
      errors.allocated_postings = `Cannot be less than used postings (${editAllocation.used_postings})`;
    }

    const maxAvailable = stats?.allocations?.available_to_allocate || 0;
    const currentAllocation = editAllocation?.allocated_postings || 0;
    const totalAvailable = maxAvailable + currentAllocation;
    
    if (formData.allocated_postings > totalAvailable) {
      errors.allocated_postings = `Exceeds available postings (max: ${totalAvailable})`;
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save allocation
  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors');
      return;
    }

    setSaving(true);
    try {
      if (editAllocation) {
        await deanAllocationsApi.update(editAllocation.id, {
          allocated_postings: formData.allocated_postings,
          notes: formData.notes,
        });
        toast.success('Allocation updated successfully');
      } else {
        await deanAllocationsApi.allocate({
          dean_user_id: parseInt(formData.dean_user_id),
          allocated_postings: formData.allocated_postings,
          notes: formData.notes,
        });
        toast.success('Allocation created successfully');
      }
      closeModal();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save allocation');
    } finally {
      setSaving(false);
    }
  };

  // Delete allocation
  const handleDelete = (allocation) => {
    if (allocation.used_postings > 0) {
      toast.error(`Cannot delete allocation with ${allocation.used_postings} used postings`);
      return;
    }
    setAllocationToDelete(allocation);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!allocationToDelete) return;
    
    setDeleting(true);
    try {
      await deanAllocationsApi.delete(allocationToDelete.id);
      toast.success('Allocation deleted successfully');
      setShowDeleteConfirm(false);
      setAllocationToDelete(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete allocation');
    } finally {
      setDeleting(false);
    }
  };

  // Table columns
  const columns = useMemo(() => [
    {
      key: 'dean_name',
      header: 'Dean',
      sortable: true,
      render: (value, row) => row ? (
        <div className="flex items-center gap-2">
          <IconCrown className="w-4 h-4 text-amber-500" />
          <div>
            <div className="font-medium text-gray-900">{row.dean_name}</div>
            <div className="text-xs text-gray-500">{row.dean_email}</div>
          </div>
        </div>
      ) : null,
    },
    {
      key: 'faculty_name',
      header: 'Faculty',
      render: (value, row) => row ? (
        <div className="flex items-center gap-2">
          <IconBuilding className="w-4 h-4 text-gray-400" />
          <span className="text-gray-700">
            {row.faculty_name || <span className="text-gray-400 italic">No faculty</span>}
          </span>
        </div>
      ) : null,
    },
    {
      key: 'allocated_postings',
      header: 'Allocated',
      align: 'center',
      render: (value, row) => row ? (
        <Badge variant="primary" className="text-lg font-semibold">
          {row.allocated_postings}
        </Badge>
      ) : null,
    },
    {
      key: 'used_postings',
      header: 'Used',
      align: 'center',
      render: (value, row) => row ? (
        <Badge 
          variant={row.used_postings > 0 ? 'success' : 'default'} 
          className="text-lg font-semibold"
        >
          {row.used_postings}
        </Badge>
      ) : null,
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'center',
      render: (value, row) => row ? (
        <span className={`font-semibold ${
          (row.allocated_postings - row.used_postings) > 0 
            ? 'text-green-600' 
            : 'text-gray-400'
        }`}>
          {row.allocated_postings - row.used_postings}
        </span>
      ) : null,
    },
    {
      key: 'allocated_by_name',
      header: 'Allocated By',
      render: (value, row) => row ? (
        <span className="text-gray-600 text-sm">{row.allocated_by_name}</span>
      ) : null,
    },
    {
      key: 'updated_at',
      header: 'Last Updated',
      render: (value, row) => row ? (
        <span className="text-gray-500 text-sm">{formatDate(row.updated_at)}</span>
      ) : null,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (value, row) => row && canEdit ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEditModal(row)}
            title="Edit allocation"
          >
            <IconEdit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDelete(row)}
            title="Delete allocation"
            disabled={row.used_postings > 0}
          >
            <IconTrash className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      ) : null,
    },
  ], [canEdit]);

  // Stats cards
  const statsCards = [
    {
      title: 'Total Postings',
      value: stats?.postings?.total_postings || 0,
      icon: IconClipboardList,
      color: 'bg-blue-500',
      description: 'Expected supervision visits',
    },
    {
      title: 'Primary Postings',
      value: stats?.postings?.primary_postings || 0,
      icon: IconChartBar,
      color: 'bg-green-500',
      description: 'Available for allocation',
    },
    {
      title: 'Merged Postings',
      value: stats?.postings?.merged_postings || 0,
      icon: IconUsers,
      color: 'bg-purple-500',
      description: 'Secondary/merged groups',
    },
  ];

  // Allocation summary
  const allocationSummary = {
    totalAllocated: stats?.allocations?.total_allocated || 0,
    totalUsed: stats?.allocations?.total_used || 0,
    availableToAllocate: stats?.allocations?.available_to_allocate || 0,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dean Posting Allocations</h1>
          <p className="text-xs sm:text-sm text-gray-500">
            Allocate postings to deans for faculty-based supervision assignments
            {stats?.session && (
              <span className="ml-2 text-primary-600 font-medium">• {stats.session.name}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchData} title="Refresh">
            <IconRefresh className="w-4 h-4" />
          </Button>
          {canEdit && (
            <Button onClick={openCreateModal}>
              <IconPlus className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Allocate Postings</span>
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statsCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center flex-shrink-0`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-500">{card.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  <p className="text-xs text-gray-400">{card.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Allocation Summary */}
      <Card className="border-primary-200 bg-primary-50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-primary-600">Total Allocated</p>
                <p className="text-xl font-bold text-primary-800">{allocationSummary.totalAllocated}</p>
              </div>
              <div>
                <p className="text-xs text-primary-600">Total Used</p>
                <p className="text-xl font-bold text-primary-800">{allocationSummary.totalUsed}</p>
              </div>
              <div>
                <p className="text-xs text-primary-600">Available to Allocate</p>
                <p className="text-xl font-bold text-green-700">{allocationSummary.availableToAllocate}</p>
              </div>
            </div>
            <div className="text-sm text-primary-700">
              <span className="font-medium">{allocationSummary.totalAllocated}</span> of{' '}
              <span className="font-medium">{stats?.postings?.primary_postings || 0}</span> primary postings allocated
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Allocations Table */}
      <DataTable
        data={allocations}
        columns={columns}
        keyField="id"
        loading={loading}
        sortable
        emptyTitle="No allocations yet"
        emptyDescription="Allocate postings to deans to enable faculty-based supervision"
      />

      {/* Allocation Modal */}
      <Dialog
        isOpen={showModal}
        onClose={closeModal}
        title={editAllocation ? 'Edit Allocation' : 'Allocate Postings to Dean'}
        width="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editAllocation ? 'Update Allocation' : 'Allocate'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Dean Selection (only for create) */}
          {!editAllocation && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Dean <span className="text-red-500">*</span>
              </label>
              <Select
                name="dean_user_id"
                value={formData.dean_user_id}
                onChange={handleChange}
                error={formErrors.dean_user_id}
              >
                <option value="">Select a dean...</option>
                {availableDeans.map((dean) => (
                  <option key={dean.id} value={dean.id}>
                    {dean.name} {dean.faculty_name ? `(${dean.faculty_name})` : ''}
                  </option>
                ))}
              </Select>
              {formErrors.dean_user_id && (
                <p className="mt-1 text-sm text-red-500">{formErrors.dean_user_id}</p>
              )}
              {availableDeans.length === 0 && (
                <p className="mt-1 text-sm text-amber-600">
                  No available deans. All deans already have allocations or no users are marked as deans.
                </p>
              )}
            </div>
          )}

          {/* Dean Info (for edit) */}
          {editAllocation && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <IconCrown className="w-6 h-6 text-amber-500" />
                <div>
                  <p className="font-medium text-gray-900">{editAllocation.dean_name}</p>
                  <p className="text-sm text-gray-500">
                    {editAllocation.faculty_name || 'No faculty assigned'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Allocation Number */}
          <div>
            <Input
              label="Number of Postings to Allocate"
              name="allocated_postings"
              type="number"
              min={editAllocation ? editAllocation.used_postings : 0}
              max={(stats?.allocations?.available_to_allocate || 0) + (editAllocation?.allocated_postings || 0)}
              value={formData.allocated_postings}
              onChange={handleChange}
              error={formErrors.allocated_postings}
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Available to allocate: {(stats?.allocations?.available_to_allocate || 0) + (editAllocation?.allocated_postings || 0)}
              {editAllocation && editAllocation.used_postings > 0 && (
                <span className="text-amber-600 ml-2">
                  • Minimum: {editAllocation.used_postings} (already used)
                </span>
              )}
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              rows={3}
              placeholder="Add any notes about this allocation..."
            />
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setAllocationToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Allocation"
        message={
          allocationToDelete
            ? `Are you sure you want to delete the allocation for "${allocationToDelete.dean_name}"? This action cannot be undone.`
            : 'Are you sure you want to delete this allocation?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default DeanPostingAllocationPage;
