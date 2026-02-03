/**
 * Routes Management Page
 * Manage delivery routes for school assignments
 */

import { useState, useEffect, useMemo } from 'react';
import { routesApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import {
  IconRoute as RouteIcon,
  IconPlus,
  IconPencil,
  IconTrash,
  IconMapPin,
} from '@tabler/icons-react';

function RoutesPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState([]);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editRoute, setEditRoute] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    status: 'active',
  });
  const [saving, setSaving] = useState(false);
  
  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch routes
  const fetchRoutes = async () => {
    setLoading(true);
    try {
      const response = await routesApi.getAll({ status: 'active' });
      setRoutes(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load routes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  // DataTable columns
  const columns = useMemo(
    () => [
      {
        accessor: 'name',
        header: 'Route Name',
        render: (value, row) => (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <RouteIcon className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{value}</p>
              {row.description && (
                <p className="text-sm text-gray-500 max-w-xs truncate">
                  {row.description}
                </p>
              )}
            </div>
          </div>
        ),
      },
      {
        accessor: 'code',
        header: 'Code',
        render: (value) => (
          <Badge variant="outline">{value}</Badge>
        ),
      },
      {
        accessor: 'school_count',
        header: 'Schools',
        render: (value) => (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <IconMapPin className="w-4 h-4" />
            <span>{value || 0} schools</span>
          </div>
        ),
      },
      {
        accessor: 'status',
        header: 'Status',
        type: 'status',
      },
      ...(canEdit
        ? [
            {
              accessor: 'actions',
              header: 'Actions',
              sortable: false,
              exportable: false,
              render: (_, row) => (
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditModal(row)}
                  >
                    <IconPencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(row.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <IconTrash className="w-4 h-4" />
                  </Button>
                </div>
              ),
            },
          ]
        : []),
    ],
    [canEdit]
  );

  // Modal handlers
  const openCreateModal = () => {
    setEditRoute(null);
    setFormData({ name: '', code: '', description: '', status: 'active' });
    setShowModal(true);
  };

  const openEditModal = (route) => {
    setEditRoute(route);
    setFormData({
      name: route.name,
      code: route.code,
      description: route.description || '',
      status: route.status,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      toast.error('Name and code are required');
      return;
    }

    setSaving(true);
    try {
      if (editRoute) {
        await routesApi.update(editRoute.id, formData);
        toast.success('Route updated successfully');
      } else {
        await routesApi.create(formData);
        toast.success('Route created successfully');
      }

      setShowModal(false);
      fetchRoutes();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setRouteToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!routeToDelete) return;
    
    setDeleting(true);
    try {
      await routesApi.delete(routeToDelete);
      toast.success('Route deleted successfully');
      fetchRoutes();
      setShowDeleteConfirm(false);
      setRouteToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete route');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Routes</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage delivery routes for school assignments</p>
        </div>
        {canEdit && (
          <Button onClick={openCreateModal} size="sm" className="active:scale-95 flex-shrink-0">
            <IconPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Route</span>
          </Button>
        )}
      </div>

      {/* Routes DataTable */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={routes}
            columns={columns}
            loading={loading}
            keyField="id"
            sortable
            searchable
            searchPlaceholder="Search routes..."
            exportable
            exportFilename={`routes-${new Date().toISOString().split('T')[0]}`}
            emptyIcon={RouteIcon}
            emptyTitle="No routes configured"
            emptyDescription="Create your first route to organize school assignments"
          />
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editRoute ? 'Edit Route' : 'Create Route'}
        width="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {editRoute ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., North Route"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <Input
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g., NORTH"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <Select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              className="w-full"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setRouteToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Route"
        message="Are you sure you want to delete this route? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default RoutesPage;
