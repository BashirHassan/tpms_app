/**
 * Schools Management Page
 * Manage partner schools for teaching practice
 * 
 * Architecture:
 * - master_schools: Central registry (editable by super_admin only via Master Schools page)
 * - institution_schools: Institution-specific data (editable by staff)
 * 
 * Staff can only edit: route, capacity, distance, geofence, status, notes
 * Master data (name, state, lga, principal, GPS) is managed via Master Schools page
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { schoolsApi, routesApi } from '../../api';
import { nigeriaGeoData } from '../../data/nigeria';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCoordinate, formatNumber, formatDistance } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconBuildingBank as IconSchool,
  IconPlus,
  IconPencil,
  IconTrash,
  IconSearch,
  IconDownload,
  IconMapPin,
  IconUsers,
  IconPhone,
  IconX,
  IconRefresh,
  IconEye,
  IconCircleCheck,
  IconAlertTriangle,
  IconToggleLeft,
  IconToggleRight,
  IconCurrentLocation,
  IconMap2,
  IconLink,
  IconShieldCheck,
} from '@tabler/icons-react';

function SchoolsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingLgas, setLoadingLgas] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });


  // Filters
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationCategoryFilter, setLocationCategoryFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editSchool, setEditSchool] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // View modal
  const [selectedSchool, setSelectedSchool] = useState(null);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [schoolToDelete, setSchoolToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Link school modal (central registry)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [masterSearchQuery, setMasterSearchQuery] = useState('');
  const [masterSearchResults, setMasterSearchResults] = useState([]);
  const [searchingMaster, setSearchingMaster] = useState(false);
  const [selectedMasterSchool, setSelectedMasterSchool] = useState(null);
  const [linkFormData, setLinkFormData] = useState({
    route_id: null,
    distance_km: 0,
    student_capacity: 0,
    geofence_radius_m: 1000,
  });
  const [linking, setLinking] = useState(false);

  // Fetch data
  const fetchSchools = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (routeFilter) params.route_id = routeFilter;
      if (typeFilter) params.school_type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (locationCategoryFilter) params.location_category = locationCategoryFilter;
      if (stateFilter) params.state = stateFilter;

      const response = await schoolsApi.getAll(params);
      setSchools(response.data.data || response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.meta?.total || response.data.pagination?.total || 0,
      }));
    } catch (err) {
      toast.error('Failed to load schools');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await routesApi.getAll({ status: 'active' });
      setRoutes(response.data.data || response.data || []);
    } catch (err) {
      console.error('Failed to load routes:', err);
    }
  };

  const fetchStates = () => {
    try {
      const data = nigeriaGeoData.getStates();
      setStates(data);
    } catch (err) {
      console.error('Failed to load states:', err);
    }
  };

  // Fetch LGAs when state changes (dependent dropdown)
  const fetchLGAs = (state) => {
    if (!state) {
      setLgas([]);
      setWards([]);
      return;
    }
    setLoadingLgas(true);
    try {
      const data = nigeriaGeoData.getLGAs(state);
      setLgas(data);
      setWards([]); // Reset wards when state changes
    } catch (err) {
      console.error('Failed to load LGAs:', err);
      setLgas([]);
    } finally {
      setLoadingLgas(false);
    }
  };

  // Fetch wards when LGA changes (dependent dropdown)
  const fetchWards = async (state, lga) => {
    if (!state || !lga) {
      setWards([]);
      return;
    }
    setLoadingWards(true);
    try {
      const data = await nigeriaGeoData.getWards(state, lga);
      setWards(data);
    } catch (err) {
      console.error('Failed to load wards:', err);
      setWards([]);
    } finally {
      setLoadingWards(false);
    }
  };

  // Fetch ward coordinates and prefill latitude/longitude
  const fetchWardCoordinates = async (state, lga, ward) => {
    if (!state || !lga || !ward) return;
    try {
      const data = await nigeriaGeoData.getWardCoordinates(state, lga, ward);
      if (data && data.latitude && data.longitude) {
        setFormData(prev => ({
          ...prev,
          // Always update to new ward's coordinates when ward is changed
          latitude: data.latitude,
          longitude: data.longitude,
        }));
        toast.success(`Ward coordinates set: ${formatCoordinate(data.latitude, 4)}, ${formatCoordinate(data.longitude, 4)}`);
      }
    } catch (err) {
      console.error('Failed to load ward coordinates:', err);
    }
  };

  // Search master schools registry
  const searchMasterSchools = async (query) => {
    if (!query || query.length < 2) {
      setMasterSearchResults([]);
      return;
    }
    setSearchingMaster(true);
    try {
      const response = await schoolsApi.searchMasterSchools({ search: query, limit: 10 });
      setMasterSearchResults(response.data.data || []);
    } catch (err) {
      console.error('Failed to search master schools:', err);
      setMasterSearchResults([]);
    } finally {
      setSearchingMaster(false);
    }
  };

  // Debounced master search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (showLinkModal && masterSearchQuery) {
        searchMasterSchools(masterSearchQuery);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [masterSearchQuery, showLinkModal]);

  // Link a master school to this institution
  const handleLinkSchool = async () => {
    if (!selectedMasterSchool) {
      toast.error('Please select a school from the registry');
      return;
    }

    setLinking(true);
    try {
      await schoolsApi.linkSchool({
        master_school_id: selectedMasterSchool.id,
        route_id: linkFormData.route_id || null,
        distance_km: parseFloat(linkFormData.distance_km) || 0,
        student_capacity: parseInt(linkFormData.student_capacity) || 0,
        geofence_radius_m: parseInt(linkFormData.geofence_radius_m) || 1000,
      });
      toast.success(`${selectedMasterSchool.name} linked successfully`);
      setShowLinkModal(false);
      setSelectedMasterSchool(null);
      setMasterSearchQuery('');
      setMasterSearchResults([]);
      setLinkFormData({
        route_id: null,
        distance_km: 0,
        student_capacity: 0,
        geofence_radius_m: 1000,
      });
      fetchSchools();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to link school');
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
    fetchStates();
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [pagination.page, search, routeFilter, typeFilter, categoryFilter, locationCategoryFilter, stateFilter]);

  // Modal handlers
  const getDefaultFormData = () => ({
    name: '',
    code: '',
    route_id: null,
    school_type: 'senior',
    category: 'public',
    location_category: 'outside',
    state: '',
    lga: '',
    ward: '',
    address: '',
    distance_km: 0,
    student_capacity: 0,
    principal_name: '',
    principal_phone: '',
    latitude: null,
    longitude: null,
    geofence_radius_m: 1000,
    status: 'active',
  });

  const openCreateModal = () => {
    setEditSchool(null);
    setFormData(getDefaultFormData());
    setShowModal(true);
  };

  const openEditModal = useCallback((school) => {
    setEditSchool(school);
    // Merge with defaults to ensure required fields have valid values
    const defaults = getDefaultFormData();
    setFormData({
      ...defaults,
      ...school,
      // Ensure enum fields have valid values (not null/empty)
      school_type: school.school_type || defaults.school_type,
      category: school.category || defaults.category,
      location_category: school.location_category || defaults.location_category,
    });
    setShowModal(true);
  }, []);

  // Wrap handlers for DataTable
  const handleViewSchool = useCallback((school) => {
    setSelectedSchool(school);
  }, []);

  const handleDeleteSchool = useCallback((id) => {
    handleDelete(id);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editSchool) {
        // EDIT MODE: Only send institution-specific fields
        const payload = {
          route_id: formData.route_id || null,
          location_category: formData.location_category,
          distance_km: parseFloat(formData.distance_km) || 0,
          student_capacity: parseInt(formData.student_capacity) || 0,
          geofence_radius_m: parseInt(formData.geofence_radius_m) || 100,
          status: formData.status,
          notes: formData.notes || null,
        };

        await schoolsApi.update(editSchool.id, payload);
        toast.success('School settings updated');
      } else {
        // CREATE MODE: Full payload - explicitly list only the fields we need
        if (!formData.name) {
          toast.error('School name is required');
          setSaving(false);
          return;
        }

        const payload = {
          name: formData.name,
          code: formData.code || null,
          school_type: formData.school_type || 'senior',
          category: formData.category || 'public',
          location_category: formData.location_category || 'outside',
          state: formData.state,
          lga: formData.lga,
          ward: formData.ward,
          address: formData.address || null,
          principal_name: formData.principal_name || null,
          principal_phone: formData.principal_phone || null,
          distance_km: parseFloat(formData.distance_km) || 0,
          student_capacity: parseInt(formData.student_capacity) || 0,
          route_id: formData.route_id || null,
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          geofence_radius_m: parseInt(formData.geofence_radius_m) || 100,
          status: formData.status || 'active',
          notes: formData.notes || null,
        };

        await schoolsApi.create(payload);
        toast.success('School created successfully');
      }

      setShowModal(false);
      fetchSchools();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save school');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setSchoolToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!schoolToDelete) return;
    
    setDeleting(true);
    try {
      await schoolsApi.delete(schoolToDelete);
      toast.success('School deleted successfully');
      fetchSchools();
      setShowDeleteConfirm(false);
      setSchoolToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete school');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await schoolsApi.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data.data || response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'school_upload_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  const handleExport = async () => {
    try {
      const response = await schoolsApi.export();
      const url = window.URL.createObjectURL(new Blob([response.data.data || response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `schools_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Failed to export schools');
    }
  };

  const clearFilters = () => {
    setSearch('');
    setRouteFilter('');
    setTypeFilter('');
    setCategoryFilter('');
    setLocationCategoryFilter('');
    setStateFilter('');
  };

  // Check if any filter is active
  const hasActiveFilters = routeFilter || typeFilter || categoryFilter || locationCategoryFilter || stateFilter;

  // Handle status toggle
  const handleToggleStatus = async (school) => {
    const newStatus = school.status === 'active' ? 'inactive' : 'active';
    try {
      await schoolsApi.updateStatus(school.id, newStatus);
      toast.success(`School ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`);
      fetchSchools();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const getCategoryBadge = useCallback((category) => {
    const variants = {
      public: 'secondary',
      private: 'default',
      others: 'outline',
    };
    return <Badge variant={variants[category] || 'secondary'}>{category}</Badge>;
  }, []);

  const getLocationCategoryBadge = useCallback((locationCategory) => {
    const variants = {
      inside: 'success',
      outside: 'warning',
    };
    const labels = {
      inside: 'Inside',
      outside: 'Outside',
    };
    return (
      <Badge variant={variants[locationCategory] || 'secondary'}>
        {labels[locationCategory] || locationCategory}
      </Badge>
    );
  }, []);

  // Column definitions for DataTable
  const columns = useMemo(() => [
    {
      header: 'School',
      accessor: 'name',
      sortable: true,
      formatter: (value, row) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate flex items-center gap-1.5">
            {value}
            {row.is_verified && (
              <IconShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" title="Verified in Central Registry" />
            )}
          </div>
          <div className="text-sm text-gray-500 flex flex-wrap gap-1 mt-1">
            {row.code && <span className="font-mono text-xs">{row.code}</span>}
            {row.official_code && row.official_code !== row.code && (
              <span className="font-mono text-xs text-blue-600" title="Official Code">{row.official_code}</span>
            )}
            {getCategoryBadge(row.category)}
            {getLocationCategoryBadge(row.location_category)}
          </div>
        </div>
      ),
      exportFormatter: (value, row) => `${value} (${row.code || 'N/A'})`,
    },
    {
      header: 'Location',
      accessor: 'ward',
      sortable: true,
      responsive: 'md',
      formatter: (value, row) => (
        <div className="text-sm">
          <div className="text-gray-900">{row.ward || row.lga}</div>
          <div className="text-gray-500">
            {row.state} • {row.distance_km} km
          </div>
        </div>
      ),
      exportFormatter: (value, row) => `${row.ward || row.lga}, ${row.state}`,
    },
    {
      header: 'Route',
      accessor: 'route_name',
      sortable: true,
      responsive: 'lg',
      formatter: (value) => (
        value ? (
          <Badge variant="outline">{value}</Badge>
        ) : (
          <span className="text-gray-400">-</span>
        )
      ),
      exportFormatter: (value) => value || '-',
    },
    {
      header: 'Type',
      accessor: 'school_type',
      sortable: true,
      responsive: 'lg',
      formatter: (value) => (
        <span className="text-gray-500 capitalize">{value}</span>
      ),
      exportFormatter: (value) => value?.charAt(0).toUpperCase() + value?.slice(1),
    },
    {
      header: 'Capacity',
      accessor: 'student_capacity',
      sortable: true,
      responsive: 'md',
      formatter: (value) => (
        <div className="flex items-center gap-1 text-gray-600">
          <IconUsers className="w-4 h-4" />
          {value}
        </div>
      ),
    },
    {
      header: 'GPS',
      accessor: 'latitude',
      sortable: false,
      responsive: 'lg',
      formatter: (value, row) => (
        <div className="flex items-center">
          {value != null && row.longitude != null ? (
            <a
              href={`https://www.google.com/maps?q=${value},${row.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-green-600 hover:text-green-700"
              title={`GPS: ${value}, ${row.longitude} • Radius: ${formatDistance(row.geofence_radius_m || 500)}`}
            >
              <IconMapPin className="w-4 h-4" />
              <span className="text-xs">{formatDistance(row.geofence_radius_m || 500)}</span>
            </a>
          ) : (
            <div className="flex items-center gap-1 text-amber-500" title="GPS coordinates not set">
              <IconAlertTriangle className="w-4 h-4" />
            </div>
          )}
        </div>
      ),
      exportFormatter: (value, row) => value != null && row.longitude != null ? `${value},${row.longitude}` : 'Not set',
    },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      formatter: (value, row) => (
        <div className="flex items-center gap-2">
          <Badge variant={value === 'active' ? 'success' : 'secondary'}>
            {value}
          </Badge>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleToggleStatus(row); }}
              className={value === 'active' 
                  ? 'text-green-600 hover:text-green-700' 
                  : 'text-gray-400 hover:text-gray-600'
              }
              title={value === 'active' ? 'Deactivate school' : 'Activate school'}
            >
              {value === 'active' ? (
                <IconToggleRight className="w-5 h-5" />
              ) : (
                <IconToggleLeft className="w-5 h-5" />
              )}
            </Button>
          )}
        </div>
      ),
      exportFormatter: (value) => value?.charAt(0).toUpperCase() + value?.slice(1),
    },
    {
      header: 'Actions',
      accessor: 'actions',
      align: 'right',
      exportable: false,
      formatter: (_, row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleViewSchool(row); }}
            className="text-gray-400 hover:text-primary-600 hover:bg-gray-100"
            title="View details"
          >
            <IconEye className="w-4 h-4" />
          </Button>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
                className="text-gray-400 hover:text-primary-600 hover:bg-gray-100"
                title="Edit"
              >
                <IconPencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); handleDeleteSchool(row.id); }}
                className="text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Delete"
              >
                <IconTrash className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ], [getCategoryBadge, getLocationCategoryBadge, canEdit, handleViewSchool, openEditModal, handleDeleteSchool, handleToggleStatus]);

  return (
    <div className="space-y-4 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Schools</h1>
          <p className="text-sm text-gray-500">Manage partner schools for teaching practice</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowLinkModal(true)} className="flex-1 sm:flex-none">
                <IconLink className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Link School</span>
              </Button>
              <Button size="sm" onClick={openCreateModal} className="flex-1 sm:flex-none">
                <IconPlus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Add School</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-3 sm:py-4">
          <div className="space-y-3">
            {/* Search Bar */}
            <div className="flex gap-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                <div className="flex-1 relative col-span-2">
                  <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search schools..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <Select
                  value={routeFilter}
                  onChange={(e) => setRouteFilter(e.target.value)}
                  className="text-sm"
                >
                  <option value="">All Routes</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-sm"
                >
                  <option value="">All Types</option>
                  <option value="primary">Primary</option>
                  <option value="junior">Junior</option>
                  <option value="senior">Senior</option>
                  <option value="both">Both</option>
                </Select>
                <Select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-sm"
                >
                  <option value="">All Categories</option>
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="others">Others</option>
                </Select>
                <Select
                  value={locationCategoryFilter}
                  onChange={(e) => setLocationCategoryFilter(e.target.value)}
                  className="text-sm"
                >
                  <option value="">All Locations</option>
                  <option value="inside">Inside (≤10km)</option>
                  <option value="outside">Outside (&gt;10km)</option>
                </Select>
                <Select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="text-sm col-span-2 sm:col-span-1"
                >
                  <option value="">All States</option>
                  {states.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" onClick={clearFilters}>
                  <IconRefresh className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schools Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            data={schools}
            columns={columns}
            keyField="id"
            loading={loading}
            sortable
            exportable
            exportFilename="schools"
            emptyTitle="No schools found"
            emptyIcon={IconSchool}
            onRowClick={(row) => setSelectedSchool(row)}
            pagination={{
              page: pagination.page,
              limit: pagination.limit,
              total: pagination.total,
              onPageChange: (page) => setPagination((p) => ({ ...p, page })),
            }}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editSchool ? 'Edit Institution Settings' : 'Add School'}
        width={'2xl'}
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShowModal(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Saving...' : editSchool ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        {editSchool ? (
          /* EDIT MODE: Only institution-specific fields */
          <div className="space-y-4">
            {/* Show school name (read-only) */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <IconSchool className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-blue-900">{editSchool.name}</span>
                {editSchool.is_verified && (
                  <IconShieldCheck className="w-4 h-4 text-green-600" title="Verified" />
                )}
              </div>
              <p className="text-blue-700">
                {editSchool.ward && `${editSchool.ward}, `}{editSchool.lga}, {editSchool.state}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                <Select
                  value={formData.route_id || ''}
                  onChange={(e) => setFormData({ ...formData, route_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full"
                >
                  <option value="">Select Route</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location Category</label>
                <Select
                  value={formData.location_category || 'outside'}
                  onChange={(e) => setFormData({ ...formData, location_category: e.target.value })}
                  className="w-full"
                >
                  <option value="inside">Inside (≤10km)</option>
                  <option value="outside">Outside (&gt;10km)</option>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Distance (KM)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={formData.distance_km || 0}
                  onChange={(e) => setFormData({ ...formData, distance_km: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Student Capacity</label>
                <Input
                  type="number"
                  min="0"
                  value={formData.student_capacity || 0}
                  onChange={(e) => setFormData({ ...formData, student_capacity: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <Select
                  value={formData.status || 'active'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Geofence Radius (meters)
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="50"
                    max="5000"
                    step="10"
                    value={formData.geofence_radius_m || 100}
                    onChange={(e) => setFormData({ ...formData, geofence_radius_m: e.target.value })}
                    className="w-32"
                  />
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="10"
                    value={formData.geofence_radius_m || 100}
                    onChange={(e) => setFormData({ ...formData, geofence_radius_m: e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500 w-16">{formatDistance(formData.geofence_radius_m || 100)}</span>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <Input
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes about this school"
                />
              </div>
            </div>
          </div>
        ) : (
          /* CREATE MODE: Full form for new school */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="School name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <Input
                value={formData.code || ''}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., SCH001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
              <Select
                value={formData.route_id || ''}
                onChange={(e) => setFormData({ ...formData, route_id: e.target.value ? parseInt(e.target.value) : null })}
                className="w-full"
              >
                <option value="">Select Route</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={formData.school_type || 'senior'}
                onChange={(e) => setFormData({ ...formData, school_type: e.target.value })}
                className="w-full"
              >
                <option value="primary">Primary</option>
                <option value="junior">Junior</option>
                <option value="senior">Senior</option>
                <option value="both">Both</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <Select
                value={formData.category || 'public'}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="others">Others</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location Category</label>
              <Select
                value={formData.location_category || 'outside'}
                onChange={(e) => setFormData({ ...formData, location_category: e.target.value })}
                className="w-full"
              >
                <option value="inside">Inside (≤10km)</option>
                <option value="outside">Outside (&gt;10km)</option>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <Select
                value={formData.state || ''}
                onChange={(e) => {
                  const newState = e.target.value;
                  setFormData({ ...formData, state: newState, lga: '', ward: '' });
                  fetchLGAs(newState);
                }}
                className="w-full"
              >
                <option value="">Select State</option>
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">LGA</label>
              <Select
                value={formData.lga || ''}
                onChange={(e) => {
                  const newLga = e.target.value;
                  setFormData({ ...formData, lga: newLga, ward: '' });
                  fetchWards(formData.state, newLga);
                }}
                disabled={!formData.state || loadingLgas}
                className="w-full"
              >
                <option value="">{loadingLgas ? 'Loading...' : 'Select LGA'}</option>
                {lgas.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ward</label>
              <Select
                value={formData.ward || ''}
                onChange={(e) => {
                  const newWard = e.target.value;
                  setFormData({ ...formData, ward: newWard });
                  if (newWard) {
                    fetchWardCoordinates(formData.state, formData.lga, newWard);
                  }
                }}
                disabled={!formData.lga || loadingWards}
                className="w-full"
              >
                <option value="">{loadingWards ? 'Loading...' : 'Select Ward'}</option>
                {wards.map((w, idx) => (
                  <option key={`${w.name}-${idx}`} value={w.name}>
                    {w.name}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Selecting a ward will auto-fill GPS coordinates
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <Input
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Full address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Distance (KM)</label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={formData.distance_km || 0}
                onChange={(e) => setFormData({ ...formData, distance_km: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Student Capacity</label>
              <Input
                type="number"
                min="0"
                value={formData.student_capacity || 0}
                onChange={(e) => setFormData({ ...formData, student_capacity: e.target.value })}
              />
            </div>

            <div className="sm:col-span-2 pt-4 border-t">
              <h4 className="font-medium mb-3">Principal Information</h4>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Principal Name</label>
              <Input
                value={formData.principal_name || ''}
                onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                placeholder="Principal's name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Principal Phone</label>
              <Input
                value={formData.principal_phone || ''}
                onChange={(e) => setFormData({ ...formData, principal_phone: e.target.value })}
                placeholder="08012345678"
              />
            </div>

            {/* GPS Location Section */}
            <div className="sm:col-span-2 pt-4 border-t">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <IconMap2 className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium">GPS Location</h4>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (position) => {
                          setFormData({
                            ...formData,
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                          });
                          toast.success('Current location captured');
                        },
                        (error) => {
                          toast.error('Failed to get location: ' + error.message);
                        },
                        { enableHighAccuracy: true, timeout: 10000 }
                      );
                    } else {
                      toast.error('Geolocation is not supported by this browser');
                    }
                  }}
                >
                  <IconCurrentLocation className="w-4 h-4 mr-1" />
                  Get Current Location
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <Input
                type="number"
                step="any"
                value={formData.latitude ?? ''}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="e.g., 6.52438"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <Input
                type="number"
                step="any"
                value={formData.longitude ?? ''}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                placeholder="e.g., 3.37920"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Geofence Radius (meters)
              </label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="50"
                  max="5000"
                  step="10"
                  value={formData.geofence_radius_m || 100}
                  onChange={(e) => setFormData({ ...formData, geofence_radius_m: e.target.value })}
                  className="w-32"
                />
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="10"
                  value={formData.geofence_radius_m || 100}
                  onChange={(e) => setFormData({ ...formData, geofence_radius_m: e.target.value })}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 w-16">{formatDistance(formData.geofence_radius_m || 100)}</span>
              </div>
            </div>

            {formData.latitude && formData.longitude && (
              <div className="sm:col-span-2">
                <a
                  href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <IconMapPin className="w-4 h-4" />
                  View on Google Maps
                </a>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* View School Modal */}
      <Dialog
        isOpen={!!selectedSchool}
        onClose={() => setSelectedSchool(null)}
        title="School Details"
        width="3xl"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            {canEdit && selectedSchool && (
              <Button 
                variant="outline" 
                onClick={() => { setSelectedSchool(null); openEditModal(selectedSchool); }}
                className="w-full sm:w-auto"
              >
                <IconPencil className="w-4 h-4 mr-2" />
                Edit School
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedSchool(null)} className="w-full sm:w-auto">
              Close
            </Button>
          </div>
        }
      >

      {selectedSchool && (
        <div className="space-y-4">
          <div className="text-center pb-4 border-b">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <IconSchool className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
            </div>
            <h3 className="text-base sm:text-lg font-semibold flex items-center justify-center gap-1.5">
              {selectedSchool.name}
              {selectedSchool.is_verified && (
                <IconShieldCheck className="w-5 h-5 text-green-600" title="Verified in Central Registry" />
              )}
            </h3>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {selectedSchool.code && <Badge variant="outline">{selectedSchool.code}</Badge>}
              {selectedSchool.official_code && selectedSchool.official_code !== selectedSchool.code && (
                <Badge variant="outline" className="text-blue-600 border-blue-200">
                  Official: {selectedSchool.official_code}
                </Badge>
              )}
              {getCategoryBadge(selectedSchool.category)}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div>
              <label className="text-gray-500 text-xs">Type</label>
              <p className="font-medium capitalize">{selectedSchool.school_type}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Category</label>
              <p className="font-medium capitalize">{selectedSchool.category}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Route</label>
              <p className="font-medium">{selectedSchool.route_name || '-'}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Location</label>
              <p className="font-medium capitalize">{selectedSchool.location_category || 'outside'}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Distance</label>
              <p className="font-medium">{selectedSchool.distance_km} km</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">State</label>
              <p className="font-medium">{selectedSchool.state || '-'}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">LGA</label>
              <p className="font-medium">{selectedSchool.lga || '-'}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Ward</label>
              <p className="font-medium">{selectedSchool.ward || '-'}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Capacity</label>
              <p className="font-medium">{selectedSchool.student_capacity} students</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">Status</label>
              <div className="mt-0.5">
                <Badge variant={selectedSchool.status === 'active' ? 'success' : 'secondary'}>
                  {selectedSchool.status}
                </Badge>
              </div>
            </div>
          </div>

          {(selectedSchool.principal_name || selectedSchool.principal_phone) && (
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2 ">Principal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2">
                <p>{selectedSchool.principal_name}</p>
                {selectedSchool.principal_phone && (
                  <a 
                    href={`tel:${selectedSchool.principal_phone}`} 
                    className=" text-primary-600 flex items-center gap-1 mt-1 hover:underline"
                  >
                    <IconPhone className="w-3 h-3" /> {selectedSchool.principal_phone}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* GPS Location Tracking Section */}
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-3">
              <IconMap2 className="w-4 h-4 text-blue-600" />
              <h4 className="font-medium">GPS Location Tracking</h4>
            </div>
            {selectedSchool.latitude != null && selectedSchool.longitude != null ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div>
                    <label className="text-gray-500">Latitude</label>
                    <p className="font-medium font-mono">{selectedSchool.latitude}</p>
                  </div>
                  <div>
                    <label className="text-gray-500">Longitude</label>
                    <p className="font-medium font-mono">{selectedSchool.longitude}</p>
                  </div>
                  <div>
                    <label className="text-gray-500">Geofence Radius</label>
                    <p className="font-medium">{formatDistance(selectedSchool.geofence_radius_m || 500)}</p>
                  </div>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${selectedSchool.latitude},${selectedSchool.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                  <IconMapPin className="w-4 h-4" />
                  View on Google Maps
                </a>
                <div className="bg-green-50 rounded-lg p-2 mt-2">
                  <div className="flex items-center gap-1 text-green-700 text-xs">
                    <IconCircleCheck className="w-4 h-4" />
                    <span>Location verification enabled</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="flex items-center gap-2 text-amber-700 text-sm">
                  <IconAlertTriangle className="w-4 h-4" />
                  <span>GPS coordinates not set</span>
                </div>
                <p className="text-xs text-amber-600 mt-1">
                  Add GPS coordinates to enable supervisor visit verification
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      </Dialog>

      {/* Link School Modal - Search Central Registry */}
      <Dialog
        isOpen={showLinkModal}
        onClose={() => {
          setShowLinkModal(false);
          setSelectedMasterSchool(null);
          setMasterSearchQuery('');
          setMasterSearchResults([]);
        }}
        title="Link School from Central Registry"
        width="xl"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShowLinkModal(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleLinkSchool} 
              disabled={!selectedMasterSchool || linking} 
              className="w-full sm:w-auto"
            >
              {linking ? 'Linking...' : 'Link School'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Search Box */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Schools in Central Registry
            </label>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Type school name to search..."
                value={masterSearchQuery}
                onChange={(e) => setMasterSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
              {searchingMaster && (
                <IconRefresh className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>
          </div>

          {/* Search Results */}
          {masterSearchResults.length > 0 && !selectedMasterSchool && (
            <div className="border rounded-lg max-h-60 overflow-y-auto">
              {masterSearchResults.map((school) => (
                <div
                  key={school.id}
                  onClick={() => setSelectedMasterSchool(school)}
                  className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-900 flex items-center gap-1.5">
                        {school.name}
                        {school.is_verified && (
                          <IconShieldCheck className="w-4 h-4 text-green-600" title="Verified" />
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {school.ward}, {school.lga}, {school.state}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {school.linked_institutions_count || 0} institution(s)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected School */}
          {selectedMasterSchool && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-blue-900 flex items-center gap-1.5">
                    {selectedMasterSchool.name}
                    {selectedMasterSchool.is_verified && (
                      <IconShieldCheck className="w-4 h-4 text-green-600" />
                    )}
                  </div>
                  <div className="text-sm text-blue-700 mt-1">
                    {selectedMasterSchool.ward}, {selectedMasterSchool.lga}, {selectedMasterSchool.state}
                  </div>
                  {selectedMasterSchool.principal_name && (
                    <div className="text-sm text-blue-600 mt-1">
                      Principal: {selectedMasterSchool.principal_name}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedMasterSchool(null)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  <IconX className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Institution-specific fields */}
          {selectedMasterSchool && (
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-3 text-sm">Institution-Specific Settings</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                  <Select
                    value={linkFormData.route_id || ''}
                    onChange={(e) => setLinkFormData({ ...linkFormData, route_id: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full"
                  >
                    <option value="">Select Route</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Distance (KM)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={linkFormData.distance_km || 0}
                    onChange={(e) => setLinkFormData({ ...linkFormData, distance_km: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student Capacity</label>
                  <Input
                    type="number"
                    min="0"
                    value={linkFormData.student_capacity || 0}
                    onChange={(e) => setLinkFormData({ ...linkFormData, student_capacity: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Geofence Radius (meters)
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="10"
                      max="5000"
                      step="10"
                      value={linkFormData.geofence_radius_m || 1000}
                      onChange={(e) => setLinkFormData({ ...linkFormData, geofence_radius_m: e.target.value })}
                      className="w-32"
                    />
                    <input
                      type="range"
                      min="10"
                      max="1000"
                      step="10"
                      value={linkFormData.geofence_radius_m || 1000}
                      onChange={(e) => setLinkFormData({ ...linkFormData, geofence_radius_m: e.target.value })}
                      className="flex-1"
                    />
                    <span className="text-sm text-gray-500 w-16">{formatDistance(linkFormData.geofence_radius_m || 1000)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Info box */}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p><strong>Tip:</strong> Linking a school from the central registry means:</p>
            <ul className="list-disc list-inside mt-1 text-xs space-y-1">
              <li>School identity (name, GPS, principal) is shared across institutions</li>
              <li>Updates to school details are reflected everywhere</li>
              <li>Your institution-specific settings (route, capacity) remain separate</li>
            </ul>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setSchoolToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete School"
        message="Are you sure you want to delete this school? This action cannot be undone and may affect existing postings."
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default SchoolsPage;