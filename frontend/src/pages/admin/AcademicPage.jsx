/**
 * Academic Structure Page
 * Manage Faculties, Departments, and Programs
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { facultiesApi, departmentsApi, programsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconBuilding,
  IconSchool as IconGraduationCap,
  IconBook,
  IconPlus,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react';

function AcademicPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [activeTab, setActiveTab] = useState('faculties');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Data
  const [faculties, setFaculties] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);

  // Filters
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState(null); // 'faculty', 'department', 'program'
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState({ type: null, id: null });
  const [deleting, setDeleting] = useState(false);

  // Fetch data
  const fetchFaculties = async () => {
    try {
      const response = await facultiesApi.getAll({ status: 'active' });
      setFaculties(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load faculties');
    }
  };

  const fetchDepartments = async () => {
    try {
      const params = { status: 'active' };
      if (selectedFaculty) params.faculty_id = selectedFaculty;
      const response = await departmentsApi.getAll(params);
      setDepartments(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load departments');
    }
  };

  const fetchPrograms = async () => {
    try {
      const params = { status: 'active' };
      if (selectedDepartment) params.department_id = selectedDepartment;
      if (selectedFaculty && !selectedDepartment) params.faculty_id = selectedFaculty;
      const response = await programsApi.getAll(params);
      setPrograms(response.data.data || response.data || []);
    } catch (err) {
      toast.error('Failed to load programs');
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchFaculties(), fetchDepartments(), fetchPrograms()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchDepartments();
      fetchPrograms();
    }
  }, [selectedFaculty, selectedDepartment]);

  // Modal handlers
  const openCreateModal = (type) => {
    setModalType(type);
    setEditItem(null);
    setFormData(getDefaultFormData(type));
    setShowModal(true);
  };

  const openEditModal = (type, item) => {
    setModalType(type);
    setEditItem(item);
    setFormData({ ...item });
    setShowModal(true);
  };

  const getDefaultFormData = (type) => {
    switch (type) {
      case 'faculty':
        return { name: '', code: '' };
      case 'department':
        return { name: '', code: '', faculty_id: selectedFaculty || '' };
      case 'program':
        return { name: '', code: '', department_id: selectedDepartment || '' };
      default:
        return {};
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const api = modalType === 'faculty' ? facultiesApi : modalType === 'department' ? departmentsApi : programsApi;

      if (editItem) {
        await api.update(editItem.id, formData);
        toast.success(`${modalType} updated successfully`);
      } else {
        await api.create(formData);
        toast.success(`${modalType} created successfully`);
      }

      setShowModal(false);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to save ${modalType}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type, id) => {
    setDeleteTarget({ type, id });
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    const { type, id } = deleteTarget;
    if (!type || !id) return;

    setDeleting(true);
    try {
      const api = type === 'faculty' ? facultiesApi : type === 'department' ? departmentsApi : programsApi;
      await api.delete(id);
      toast.success(`${type} deleted successfully`);
      fetchAll();
      setShowDeleteConfirm(false);
      setDeleteTarget({ type: null, id: null });
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to delete ${type}`);
    } finally {
      setDeleting(false);
    }
  };

  // Filter data by search
  const filterBySearch = (items) => {
    if (!search) return items;
    const term = search.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(term) || item.code.toLowerCase().includes(term)
    );
  };

  // Get current data based on active tab
  const currentData = useMemo(() => {
    const data = activeTab === 'faculties' ? faculties : activeTab === 'departments' ? departments : programs;
    return filterBySearch(data);
  }, [activeTab, faculties, departments, programs, search]);

  // Handlers wrapped in useCallback
  const handleEdit = useCallback((item) => {
    openEditModal(activeTab.slice(0, -1), item);
  }, [activeTab]);

  const handleDeleteItem = useCallback((id) => {
    handleDelete(activeTab.slice(0, -1), id);
  }, [activeTab]);

  // Table columns definition
  const columns = useMemo(() => {
    const baseColumns = [
      {
        accessor: 'name',
        header: 'Name',
        render: (value) => <div className="font-medium text-gray-900">{value}</div>,
      },
      {
        accessor: 'code',
        header: 'Code',
        render: (value) => <Badge variant="outline">{value}</Badge>,
      },
    ];

    if (activeTab === 'departments') {
      baseColumns.push({
        accessor: 'faculty_name',
        header: 'Faculty',
      });
    }

    if (activeTab === 'programs') {
      baseColumns.push({
        accessor: 'department_name',
        header: 'Department',
      });
    }

    baseColumns.push({
      accessor: activeTab === 'faculties' ? 'department_count' : activeTab === 'departments' ? 'program_count' : 'student_count',
      header: 'Count',
      render: (value, row) => {
        if (activeTab === 'faculties') return `${row.department_count} depts`;
        if (activeTab === 'departments') return `${row.program_count} progs`;
        return `${value || 0} students`;
      },
    });

    if (canEdit) {
      baseColumns.push({
        accessor: 'actions',
        header: 'Actions',
        align: 'right',
        sortable: false,
        exportable: false,
        render: (_, row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleEdit(row); }}
              className="text-gray-400 hover:text-primary-600"
            >
              <IconPencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); handleDeleteItem(row.id); }}
              className="text-gray-400 hover:text-red-600"
            >
              <IconTrash className="w-4 h-4" />
            </Button>
          </div>
        ),
      });
    }

    return baseColumns;
  }, [activeTab, canEdit, handleEdit, handleDeleteItem]);

  // Toolbar with filters
  const tableToolbar = useMemo(() => (
    <div className="flex items-center gap-4">
      {activeTab !== 'faculties' && (
        <Select
          value={selectedFaculty || ''}
          onChange={(e) => {
            setSelectedFaculty(e.target.value || null);
            setSelectedDepartment(null);
          }}
          className="w-auto"
        >
          <option value="">All Faculties</option>
          {faculties.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </Select>
      )}
      {activeTab === 'programs' && (
        <Select
          value={selectedDepartment || ''}
          onChange={(e) => setSelectedDepartment(e.target.value || null)}
          className="w-auto"
        >
          <option value="">All Departments</option>
          {departments
            .filter((d) => !selectedFaculty || d.faculty_id == selectedFaculty)
            .map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
        </Select>
      )}
      {canEdit && (
        <Button size="sm" onClick={() => openCreateModal(activeTab.slice(0, -1))}>
          <IconPlus className="w-4 h-4 mr-2" />
          Add {activeTab.slice(0, -1)}
        </Button>
      )}
    </div>
  ), [activeTab, faculties, departments, selectedFaculty, selectedDepartment, canEdit]);

  const tabs = [
    { id: 'faculties', label: 'Faculties', icon: IconBuilding, count: faculties.length },
    { id: 'departments', label: 'Departments', icon: IconBook, count: departments.length },
    { id: 'programs', label: 'Programs', icon: IconGraduationCap, count: programs.length },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Academic Structure</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage faculties, departments, and programs</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 -mx-2 sm:mx-0 overflow-x-auto">
        <nav className="flex gap-1 sm:gap-4 px-2 sm:px-0">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="ghost"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 sm:py-3 border-b-2 font-medium text-xs sm:text-sm rounded-none whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              )}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.slice(0, -3)}</span>
              <Badge variant="secondary" className="ml-1 text-[10px] sm:text-xs">
                {tab.count}
              </Badge>
            </Button>
          ))}
        </nav>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Search by name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Filters for Departments and Programs */}
        {activeTab !== 'faculties' && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Select
              value={selectedFaculty || ''}
              onChange={(e) => {
                setSelectedFaculty(e.target.value || null);
                setSelectedDepartment(null);
              }}
              className="text-sm"
            >
              <option value="">All Faculties</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
  
            {activeTab === 'programs' && (
              <Select
                value={selectedDepartment || ''}
                onChange={(e) => setSelectedDepartment(e.target.value || null)}
                className="text-sm"
              >
                <option value="">All Departments</option>
                {departments
                  .filter((d) => !selectedFaculty || d.faculty_id == selectedFaculty)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            )}
          </div>
        )}
        
        {canEdit && (
          <Button onClick={() => openCreateModal(activeTab.slice(0, -1))} className="active:scale-95 flex-shrink-0">
            <IconPlus className="w-4 h-4 sm:mr-2" />
            Add {activeTab.slice(0, -1)}
          </Button>
        )}
      </div>


      {/* Content */}
      <DataTable
        data={currentData}
        columns={columns}
        keyField="id"
        loading={loading}
        sortable
        searchable={false}
        exportable
        exportFilename={`${activeTab}_export`}
        emptyIcon={activeTab === 'faculties' ? IconBuilding : activeTab === 'departments' ? IconBook : IconGraduationCap}
        emptyTitle={`No ${activeTab} found`}
        emptyDescription={`Add your first ${activeTab.slice(0, -1)} to get started`}
      />

      {/* Modal */}
      <Dialog
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={`${editItem ? 'Edit' : 'Create'} ${modalType}`}
        width="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editItem ? 'Update' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={`Enter ${modalType} name`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <Input
              value={formData.code || ''}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="e.g., EDU, SCI"
            />
          </div>

          {modalType === 'department' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Faculty</label>
              <Select
                value={formData.faculty_id || ''}
                onChange={(e) => setFormData({ ...formData, faculty_id: parseInt(e.target.value) })}
                className="w-full"
              >
                <option value="">Select Faculty</option>
                {faculties.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {modalType === 'program' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <Select
                value={formData.department_id || ''}
                onChange={(e) => setFormData({ ...formData, department_id: parseInt(e.target.value) })}
                className="w-full"
              >
                <option value="">Select Department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.faculty_name})
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteTarget({ type: null, id: null }); }}
        onConfirm={confirmDelete}
        title={`Delete ${deleteTarget.type ? deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1) : ''}`}
        message={`Are you sure you want to delete this ${deleteTarget.type}? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default AcademicPage;
