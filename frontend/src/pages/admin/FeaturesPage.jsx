/**
 * Feature Management Page
 * Styled similar to JEI Feature Management with stats cards, table, and modals
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { featuresApi } from '../../api/features';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { DataTable } from '../../components/ui/DataTable';
import {
  IconToggleLeft,
  IconSettings,
  IconInfoCircle,
  IconShieldCheck,
  IconPlus,
  IconEdit,
  IconTrash,
  IconFilter,
  IconFilterOff,
} from '@tabler/icons-react';

// Simple Switch component
const Switch = ({ checked, onCheckedChange, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => !disabled && onCheckedChange?.(!checked)}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
      checked ? 'bg-primary-600' : 'bg-gray-200'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);

// Simple Textarea component
const Textarea = ({ className = '', ...props }) => (
  <textarea
    className={`flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    {...props}
  />
);

function FeaturesPage() {
  const { refreshFeatures, hasRole } = useAuth();
  const { toast } = useToast();
  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);
  const [formData, setFormData] = useState({
    featureKey: '',
    name: '',
    description: '',
    module: 'other',
    isEnabled: false,
    isPremium: false,
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    module: '',
    type: '', // 'premium' | 'standard' | ''
    status: '', // 'enabled' | 'disabled' | ''
  });
  const [showFilters, setShowFilters] = useState(false);

  const moduleNames = {
    core: 'Core Features',
    posting: 'Posting & Grouping',
    finance: 'Finance & Payments',
    documents: 'Documents',
    portal: 'Portals',
    monitoring: 'Monitoring',
    reports: 'Reports & Analytics',
    notifications: 'Notifications',
    other: 'Other',
  };

  const fetchFeatures = useCallback(async () => {
    try {
      setLoading(true);
      const response = await featuresApi.getAll();
      setFeatures(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load features');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  const handleToggle = useCallback(async (featureId, currentState) => {
    try {
      setToggling(featureId);
      await featuresApi.toggle(featureId, !currentState);
      await fetchFeatures();
      await refreshFeatures();
      toast.success(`Feature ${!currentState ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error('Failed to toggle feature');
    } finally {
      setToggling(null);
    }
  }, [fetchFeatures, refreshFeatures, toast]);

  const handleOpenForm = useCallback((feature = null) => {
    if (feature) {
      setEditingFeature(feature);
      setFormData({
        featureKey: feature.feature_key,
        name: feature.name,
        description: feature.description || '',
        module: feature.module || 'other',
        isEnabled: feature.is_enabled,
        isPremium: feature.is_premium,
      });
    } else {
      setEditingFeature(null);
      setFormData({
        featureKey: '',
        name: '',
        description: '',
        module: 'other',
        isEnabled: false,
        isPremium: false,
      });
    }
    setFormErrors({});
    setIsFormOpen(true);
  }, []);

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingFeature(null);
    setFormData({
      featureKey: '',
      name: '',
      description: '',
      module: 'other',
      isEnabled: false,
      isPremium: false,
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!editingFeature) {
      if (!formData.featureKey.trim()) {
        errors.featureKey = 'Feature key is required';
      } else if (!/^[a-z_]+$/.test(formData.featureKey)) {
        errors.featureKey = 'Feature key must be lowercase letters and underscores only';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingFeature) {
        await featuresApi.update(editingFeature.id, {
          name: formData.name,
          description: formData.description,
          module: formData.module,
          is_enabled: formData.isEnabled,
          is_premium: formData.isPremium,
        });
        toast.success('Feature updated successfully');
      } else {
        await featuresApi.create({
          feature_key: formData.featureKey,
          name: formData.name,
          description: formData.description,
          module: formData.module,
          is_enabled: formData.isEnabled,
          is_premium: formData.isPremium,
        });
        toast.success('Feature created successfully');
      }
      handleCloseForm();
      await fetchFeatures();
      await refreshFeatures();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save feature');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setIsDeleting(true);
      await featuresApi.delete(deleteConfirm.id);
      toast.success('Feature deleted successfully');
      setDeleteConfirm(null);
      await fetchFeatures();
      await refreshFeatures();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete feature');
    } finally {
      setIsDeleting(false);
    }
  };

  // Stats calculations
  const enabledCount = features.filter(f => f.is_enabled).length;
  const premiumCount = features.filter(f => f.is_premium).length;

  // Filter features based on selected filters
  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      if (filters.module && feature.module !== filters.module) return false;
      if (filters.type === 'premium' && !feature.is_premium) return false;
      if (filters.type === 'standard' && feature.is_premium) return false;
      if (filters.status === 'enabled' && !feature.is_enabled) return false;
      if (filters.status === 'disabled' && feature.is_enabled) return false;
      return true;
    });
  }, [features, filters]);

  // Check if any filters are active
  const hasActiveFilters = filters.module || filters.type || filters.status;

  // Clear all filters
  const clearFilters = () => {
    setFilters({ module: '', type: '', status: '' });
  };

  // DataTable columns
  const columns = useMemo(
    () => [
      {
        accessor: 'name',
        header: 'Feature',
        render: (value, row) => (
          <div>
            <p className="font-medium text-gray-900">{value}</p>
            {row.description && (
              <p className="text-sm text-gray-500 max-w-xs truncate">
                {row.description}
              </p>
            )}
          </div>
        ),
      },
      {
        accessor: 'feature_key',
        header: 'Key',
        render: (value) => (
          <code className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">
            {value}
          </code>
        ),
      },
      {
        accessor: 'module',
        header: 'Module',
        render: (value) => (
          <span className="text-sm text-gray-600">
            {moduleNames[value] || value || 'Other'}
          </span>
        ),
      },
      {
        accessor: 'is_premium',
        header: 'Type',
        render: (value) =>
          value ? (
            <Badge variant="warning">Premium</Badge>
          ) : (
            <Badge variant="default">Standard</Badge>
          ),
      },
      {
        accessor: 'is_enabled',
        header: 'Status',
        render: (value, row) => (
          <div className="flex items-center gap-2">
            <Switch
              checked={value}
              onCheckedChange={() => handleToggle(row.id, value)}
              disabled={toggling === row.id}
            />
            <span className={`text-sm ${value ? 'text-green-600' : 'text-gray-500'}`}>
              {value ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        ),
      },
      {
        accessor: 'actions',
        header: 'Actions',
        sortable: false,
        exportable: false,
        render: (_, row) =>
          hasRole(['super_admin', 'head_of_teaching_practice']) ? (
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => handleOpenForm(row)}>
                <IconEdit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteConfirm(row)}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [toggling, hasRole, handleToggle, handleOpenForm]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Feature Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 truncate">
            Manage feature toggles and premium modules
          </p>
        </div>
        {hasRole(['super_admin', 'head_of_teaching_practice']) && (
          <Button onClick={() => handleOpenForm()} size="sm" className="active:scale-95 flex-shrink-0">
            <IconPlus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Feature</span>
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-blue-100 flex-shrink-0">
                <IconToggleLeft className="h-4 w-4 sm:h-6 sm:w-6 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{features.length}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Features</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-green-100 flex-shrink-0">
                <IconSettings className="h-4 w-4 sm:h-6 sm:w-6 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{enabledCount}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Enabled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:pt-6">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-purple-100 flex-shrink-0">
                <IconShieldCheck className="h-4 w-4 sm:h-6 sm:w-6 text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold text-gray-900">{premiumCount}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Premium</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Feature Toggles</CardTitle>
              <CardDescription>
                Control which features are available in the system
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <IconFilter className="h-4 w-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    {[filters.module, filters.type, filters.status].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <IconFilterOff className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        {showFilters && (
          <CardContent className="pt-0 pb-4 border-b">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Module
                </label>
                <Select
                  value={filters.module}
                  onChange={(e) => setFilters({ ...filters, module: e.target.value })}
                  className="w-full"
                >
                  <option value="">All Modules</option>
                  {Object.entries(moduleNames).map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <Select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                  className="w-full"
                >
                  <option value="">All Types</option>
                  <option value="premium">Premium</option>
                  <option value="standard">Standard</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <Select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full"
                >
                  <option value="">All Statuses</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
        <CardContent className="p-0">
          <DataTable
            data={filteredFeatures}
            columns={columns}
            loading={loading}
            keyField="id"
            sortable
            searchable
            searchPlaceholder="Search features..."
            exportable
            exportFilename={`features-${new Date().toISOString().split('T')[0]}`}
            emptyIcon={IconToggleLeft}
            emptyTitle={hasActiveFilters ? 'No features match filters' : 'No features configured'}
            emptyDescription={
              hasActiveFilters
                ? 'Try adjusting your filters or clear them to see all features'
                : 'Create your first feature toggle to control system modules'
            }
          />
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-blue-100">
              <IconInfoCircle className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-blue-900">About Feature Toggles</h4>
              <p className="text-sm text-blue-700 mt-1">
                Feature toggles allow you to enable or disable system modules without deploying new code.
                Premium features are gated modules that can be toggled on for specific functionality.
                Changes take effect immediately across the application.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        title={editingFeature ? 'Edit Feature' : 'Add Feature'}
        width="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingFeature && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Feature Key <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.featureKey}
                onChange={(e) =>
                  setFormData({ ...formData, featureKey: e.target.value.toLowerCase().replace(/[^a-z_]/g, '') })
                }
                placeholder="e.g., student_portal"
                className={formErrors.featureKey ? 'border-red-500' : ''}
              />
              {formErrors.featureKey && (
                <p className="text-sm text-red-500">{formErrors.featureKey}</p>
              )}
              <p className="text-xs text-gray-500">
                Unique identifier for the feature. Use lowercase letters and underscores only.
              </p>
            </div>
          )}

          {editingFeature && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Feature Key</label>
              <div className="px-3 py-2 bg-gray-100 rounded-md">
                <code className="text-sm text-gray-700">{formData.featureKey}</code>
              </div>
              <p className="text-xs text-gray-500">
                Feature keys cannot be changed after creation.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Student Portal"
              className={formErrors.name ? 'border-red-500' : ''}
            />
            {formErrors.name && (
              <p className="text-sm text-red-500">{formErrors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Module</label>
            <Select
              value={formData.module}
              onChange={(e) => setFormData({ ...formData, module: e.target.value })}
              className="w-full"
            >
              {Object.entries(moduleNames).map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this feature does..."
              rows={3}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-700 cursor-pointer">
                  Enabled
                </label>
                <p className="text-xs text-gray-500">
                  Feature is active and accessible
                </p>
              </div>
              <Switch
                checked={formData.isEnabled}
                onCheckedChange={(checked) => setFormData({ ...formData, isEnabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <label className="text-sm font-medium text-gray-700 cursor-pointer">
                  Premium Feature
                </label>
                <p className="text-xs text-gray-500">
                  Mark as a premium/gated feature
                </p>
              </div>
              <Switch
                checked={formData.isPremium}
                onCheckedChange={(checked) => setFormData({ ...formData, isPremium: checked })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleCloseForm} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingFeature ? 'Update Feature' : 'Create Feature'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Feature Toggle"
        width="md"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to delete the feature toggle{' '}
            <strong className="text-gray-900">{deleteConfirm?.name}</strong>?
          </p>
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              <strong>Warning:</strong> This action cannot be undone. Any code
              referencing the feature key{' '}
              <code className="px-1 py-0.5 bg-red-100 rounded">
                {deleteConfirm?.feature_key}
              </code>{' '}
              may break.
            </p>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} loading={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Feature'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export default FeaturesPage;
