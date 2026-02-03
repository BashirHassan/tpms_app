/**
 * Master Schools Management Page (Super Admin Only)
 * Manage the central schools registry across all institutions
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { masterSchoolsApi } from '../../api/masterSchools';
import { nigeriaGeoData } from '../../data/nigeria';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatCoordinate, formatFileSize } from '../../utils/helpers';
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
  IconUpload,
  IconDownload,
  IconMapPin,
  IconPhone,
  IconX,
  IconRefresh,
  IconEye,
  IconShieldCheck,
  IconShieldOff,
  IconAlertTriangle,
  IconFilter,
  IconChevronDown,
  IconChevronUp,
  IconChevronRight,
  IconChevronLeft,
  IconCurrentLocation,
  IconMap2,
  IconGitMerge,
  IconChartBar,
  IconBuilding,
  IconFileSpreadsheet,
  IconCircleCheck,
  IconCircleX,
  IconLoader2,
  IconCheck,
} from '@tabler/icons-react';

function MasterSchoolsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();

  // Ensure only super_admin can access
  if (!hasRole(['super_admin'])) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <IconShieldOff className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-500">This page is only accessible to Super Admins</p>
        </div>
      </div>
    );
  }

  // State
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState([]);
  const [states, setStates] = useState([]);
  const [lgas, setLgas] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  // Form-specific states for dependent dropdowns
  const [formLgas, setFormLgas] = useState([]);
  const [formWards, setFormWards] = useState([]);
  const [loadingFormLgas, setLoadingFormLgas] = useState(false);
  const [loadingFormWards, setLoadingFormWards] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [lgaFilter, setLgaFilter] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

  // Merge modal
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [merging, setMerging] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState([]);
  const [mergeTarget, setMergeTarget] = useState(null);

  // Upload modal
  const fileInputRef = useRef(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadStep, setUploadStep] = useState('select'); // 'select' | 'preview' | 'result'
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [parsedData, setParsedData] = useState([]);

  // Fetch data
  const fetchSchools = async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (stateFilter) params.state = stateFilter;
      if (lgaFilter) params.lga = lgaFilter;
      if (verifiedFilter) params.is_verified = verifiedFilter === 'verified' ? 1 : 0;

      const response = await masterSchoolsApi.getAll(params);
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

  const fetchStates = () => {
    try {
      const data = nigeriaGeoData.getStates();
      setStates(data);
    } catch (err) {
      console.error('Failed to load states:', err);
    }
  };

  const fetchLgas = (state) => {
    if (!state) {
      setLgas([]);
      return;
    }
    try {
      const data = nigeriaGeoData.getLGAs(state);
      setLgas(data);
    } catch (err) {
      console.error('Failed to load LGAs:', err);
    }
  };

  // Fetch LGAs for form (dependent on selected state)
  const fetchFormLgas = (state) => {
    if (!state) {
      setFormLgas([]);
      setFormWards([]);
      return;
    }
    setLoadingFormLgas(true);
    try {
      const data = nigeriaGeoData.getLGAs(state);
      setFormLgas(data);
    } catch (err) {
      console.error('Failed to load LGAs:', err);
    } finally {
      setLoadingFormLgas(false);
    }
  };

  // Fetch wards for form (dependent on state and LGA)
  const fetchFormWards = async (state, lga) => {
    if (!state || !lga) {
      setFormWards([]);
      return;
    }
    setLoadingFormWards(true);
    try {
      const data = await nigeriaGeoData.getWards(state, lga);
      setFormWards(data);
    } catch (err) {
      console.error('Failed to load wards:', err);
    } finally {
      setLoadingFormWards(false);
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

  const fetchStats = async () => {
    try {
      const response = await masterSchoolsApi.getStats();
      setStats(response.data.data || response.data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const fetchDuplicates = async () => {
    setLoadingDuplicates(true);
    try {
      const response = await masterSchoolsApi.findDuplicates({ state: stateFilter });
      setDuplicates(response.data.data || []);
    } catch (err) {
      toast.error('Failed to find duplicates');
    } finally {
      setLoadingDuplicates(false);
    }
  };

  // Upload handlers - Normalize column names (same logic as backend)
  const normalizeColumn = (name) => {
    const normalized = name.toLowerCase().trim().replace(/[_\s]+/g, '_');
    const mappings = {
      school_name: 'name',
      schoolname: 'name',
      school: 'name',
      name: 'name',
      code: 'official_code',
      official_code: 'official_code',
      type: 'school_type',
      school_type: 'school_type',
      schooltype: 'school_type',
      category: 'category',
      state: 'state',
      lga: 'lga',
      local_government: 'lga',
      local_government_area: 'lga',
      ward: 'ward',
      address: 'address',
      principal: 'principal_name',
      principal_name: 'principal_name',
      principalname: 'principal_name',
      phone: 'principal_phone',
      principal_phone: 'principal_phone',
      principalphone: 'principal_phone',
      lat: 'latitude',
      latitude: 'latitude',
      lng: 'longitude',
      long: 'longitude',
      longitude: 'longitude',
    };
    return mappings[normalized] || normalized;
  };

  // Parse Excel file and perform client-side validation
  const parseAndValidateFile = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (rawData.length === 0) {
            reject(new Error('Excel file is empty'));
            return;
          }

          // Process and normalize data
          const processedSchools = rawData.map((row, index) => {
            const normalized = {};
            for (const [key, value] of Object.entries(row)) {
              const normalizedKey = normalizeColumn(key);
              normalized[normalizedKey] = String(value).trim();
            }
            return { ...normalized, row_number: index + 2 }; // +2 for header row and 0-index
          });

          // Client-side validation
          const errors = [];
          const validSchools = [];

          for (const school of processedSchools) {
            const rowErrors = [];
            if (!school.name) rowErrors.push('School name is required');
            if (!school.state) rowErrors.push('State is required');
            if (!school.lga) rowErrors.push('LGA is required');

            // Validate school_type if provided
            if (school.school_type && !['primary', 'junior', 'senior', 'both'].includes(school.school_type.toLowerCase())) {
              rowErrors.push('School type must be: primary, junior, senior, or both');
            }

            // Validate category if provided
            if (school.category && !['public', 'private', 'others'].includes(school.category.toLowerCase())) {
              rowErrors.push('Category must be: public, private, or others');
            }

            if (rowErrors.length > 0) {
              errors.push({
                row: school.row_number,
                name: school.name || 'N/A',
                state: school.state || 'N/A',
                errors: rowErrors,
              });
            } else {
              validSchools.push({
                ...school,
                school_type: (school.school_type || 'senior').toLowerCase(),
                category: (school.category || 'public').toLowerCase(),
              });
            }
          }

          // Check for duplicates within file (same name + state + lga)
          const schoolKeys = validSchools.map(s => `${s.name?.toLowerCase()}|${s.state?.toLowerCase()}|${s.lga?.toLowerCase()}`);
          const duplicatesInFile = schoolKeys.filter((item, index) => schoolKeys.indexOf(item) !== index);
          const uniqueDuplicates = [...new Set(duplicatesInFile)];

          for (const dup of uniqueDuplicates) {
            const rows = validSchools.filter(s => 
              `${s.name?.toLowerCase()}|${s.state?.toLowerCase()}|${s.lga?.toLowerCase()}` === dup
            ).map(s => s.row_number);
            errors.push({
              row: rows.join(', '),
              name: dup.split('|')[0],
              state: dup.split('|')[1],
              errors: [`Duplicate school appears in rows: ${rows.join(', ')}`],
            });
          }

          // Filter out duplicates from valid schools (keep first occurrence)
          const seenKeys = new Set();
          const uniqueValidSchools = validSchools.filter(s => {
            const key = `${s.name?.toLowerCase()}|${s.state?.toLowerCase()}|${s.lga?.toLowerCase()}`;
            if (seenKeys.has(key)) {
              return false;
            }
            seenKeys.add(key);
            return true;
          });

          resolve({
            totalRows: rawData.length,
            validSchools: uniqueValidSchools,
            clientErrors: errors,
            // Show preview of processed data (even if some have errors)
            preview: processedSchools.slice(0, 10),
            duplicateRows: uniqueDuplicates.length,
          });
        } catch (err) {
          reject(new Error('Failed to parse Excel file: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Handle file selection - parse immediately
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setUploadFile(file);
    setUploadResult(null);
    setValidationResult(null);
    setValidating(true);

    try {
      const clientValidation = await parseAndValidateFile(file);
      setParsedData(clientValidation.validSchools);

      // Server-side validation would check for existing schools
      const hasErrors = clientValidation.clientErrors && clientValidation.clientErrors.length > 0;
      setValidationResult({
        totalRows: clientValidation.totalRows,
        validRows: clientValidation.validSchools.length,
        errorRows: clientValidation.clientErrors.length,
        duplicateRows: clientValidation.duplicateRows || 0,
        errors: clientValidation.clientErrors,
        preview: clientValidation.preview,
        canProceed: !hasErrors && clientValidation.validSchools.length > 0,
      });

      setUploadStep('preview');
    } catch (err) {
      console.error('Validation error:', err);
      toast.error(err.message || 'Failed to validate file');
    } finally {
      setValidating(false);
    }
  };

  // Handle file upload (actual upload after preview)
  const handleUpload = async () => {
    if (!parsedData || parsedData.length === 0) return;

    setUploading(true);
    try {
      let inserted = 0;
      let failed = 0;
      const uploadErrors = [];
      const successfulSchools = [];

      // Upload schools one by one (or batch if API supports it)
      for (const school of parsedData) {
        try {
          await masterSchoolsApi.create({
            name: school.name,
            official_code: school.official_code || null,
            school_type: school.school_type || 'senior',
            category: school.category || 'public',
            state: school.state,
            lga: school.lga,
            ward: school.ward || null,
            address: school.address || null,
            principal_name: school.principal_name || null,
            principal_phone: school.principal_phone || null,
            latitude: school.latitude ? parseFloat(school.latitude) : null,
            longitude: school.longitude ? parseFloat(school.longitude) : null,
          });
          inserted++;
          successfulSchools.push(school);
        } catch (err) {
          failed++;
          uploadErrors.push({
            row: school.row_number,
            name: school.name,
            error: err.response?.data?.message || 'Failed to create school',
          });
        }
      }

      setUploadResult({
        inserted,
        failed,
        errors: uploadErrors,
        schools: successfulSchools.slice(0, 50),
      });
      setUploadStep('result');
      
      if (inserted > 0) {
        toast.success(`Successfully imported ${inserted} schools`);
        fetchSchools();
        fetchStats();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Reset upload modal state
  const resetUploadModal = () => {
    setShowUploadModal(false);
    setUploadFile(null);
    setUploadResult(null);
    setUploadStep('select');
    setValidating(false);
    setValidationResult(null);
    setParsedData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Open upload modal (reset state first)
  const openUploadModal = () => {
    setUploadFile(null);
    setUploadResult(null);
    setUploadStep('select');
    setValidating(false);
    setValidationResult(null);
    setParsedData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setShowUploadModal(true);
  };

  // Go back to file selection
  const handleBackToSelect = () => {
    setUploadStep('select');
    setUploadFile(null);
    setValidationResult(null);
    setParsedData([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Download template
  const handleDownloadTemplate = () => {
    // Create template data
    const templateData = [
      {
        name: 'Government Secondary School Kaduna',
        official_code: 'GSS001',
        school_type: 'senior',
        category: 'public',
        state: 'Kaduna',
        lga: 'Kaduna North',
        ward: 'Unguwan Sarki',
        address: '123 School Road, Kaduna',
        principal_name: 'Mr. John Doe',
        principal_phone: '08012345678',
        latitude: '10.5167',
        longitude: '7.4333',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Schools');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 40 }, // name
      { wch: 15 }, // official_code
      { wch: 12 }, // school_type
      { wch: 10 }, // category
      { wch: 15 }, // state
      { wch: 20 }, // lga
      { wch: 20 }, // ward
      { wch: 30 }, // address
      { wch: 25 }, // principal_name
      { wch: 15 }, // principal_phone
      { wch: 12 }, // latitude
      { wch: 12 }, // longitude
    ];

    XLSX.writeFile(wb, 'master_schools_upload_template.xlsx');
    toast.success('Template downloaded');
  };

  useEffect(() => {
    fetchStates();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchSchools();
  }, [pagination.page, search, stateFilter, lgaFilter, verifiedFilter]);

  useEffect(() => {
    fetchLgas(stateFilter);
  }, [stateFilter]);

  // Modal handlers
  const getDefaultFormData = () => ({
    name: '',
    official_code: '',
    school_type: 'senior',
    category: 'public',
    state: '',
    lga: '',
    ward: '',
    address: '',
    principal_name: '',
    principal_phone: '',
    latitude: null,
    longitude: null,
  });

  const openCreateModal = () => {
    setEditSchool(null);
    setFormData(getDefaultFormData());
    setFormLgas([]);
    setFormWards([]);
    setShowModal(true);
  };

  const openEditModal = useCallback(async (school) => {
    setEditSchool(school);
    const defaults = getDefaultFormData();
    setFormData({
      ...defaults,
      ...school,
      school_type: school.school_type || defaults.school_type,
      category: school.category || defaults.category,
    });
    
    // Load LGAs and Wards for the existing school's state/lga
    if (school.state) {
      try {
        const lgaData = nigeriaGeoData.getLGAs(school.state);
        setFormLgas(lgaData);
        
        if (school.lga) {
          const wardData = await nigeriaGeoData.getWards(school.state, school.lga);
          setFormWards(wardData);
        }
      } catch (err) {
        console.error('Failed to load location data for edit:', err);
      }
    } else {
      setFormLgas([]);
      setFormWards([]);
    }
    
    setShowModal(true);
  }, []);

  const handleViewSchool = useCallback((school) => {
    setSelectedSchool(school);
  }, []);

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('School name is required');
      return;
    }
    if (!formData.state) {
      toast.error('State is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      };

      if (editSchool) {
        await masterSchoolsApi.update(editSchool.id, payload);
        toast.success('School updated successfully');
      } else {
        await masterSchoolsApi.create(payload);
        toast.success('School created successfully');
      }

      setShowModal(false);
      fetchSchools();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save school');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setSchoolToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!schoolToDelete) return;
    
    setDeleting(true);
    try {
      await masterSchoolsApi.delete(schoolToDelete);
      toast.success('School deleted successfully');
      fetchSchools();
      fetchStats();
      setShowDeleteConfirm(false);
      setSchoolToDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete school');
    } finally {
      setDeleting(false);
    }
  };

  const handleVerify = async (school) => {
    try {
      await masterSchoolsApi.verify(school.id);
      toast.success(`${school.name} verified successfully`);
      fetchSchools();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to verify school');
    }
  };

  const handleMerge = async () => {
    if (!mergeTarget || selectedForMerge.length === 0) {
      toast.error('Select schools to merge and a target');
      return;
    }

    const sourceIds = selectedForMerge.filter(id => id !== mergeTarget);
    if (sourceIds.length === 0) {
      toast.error('No source schools to merge');
      return;
    }

    setMerging(true);
    try {
      await masterSchoolsApi.merge(sourceIds, mergeTarget);
      toast.success(`${sourceIds.length} school(s) merged successfully`);
      setShowMergeModal(false);
      setSelectedForMerge([]);
      setMergeTarget(null);
      fetchSchools();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to merge schools');
    } finally {
      setMerging(false);
    }
  };

  const openMergeModal = async () => {
    setShowMergeModal(true);
    await fetchDuplicates();
  };

  const clearFilters = () => {
    setSearch('');
    setStateFilter('');
    setLgaFilter('');
    setVerifiedFilter('');
  };

  const hasActiveFilters = stateFilter || lgaFilter || verifiedFilter;

  // Column definitions
  const columns = useMemo(() => [
    {
      header: 'School',
      accessor: 'name',
      sortable: true,
      formatter: (value, row) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate flex items-center gap-1.5">
            {value}
            {row.is_verified ? (
              <IconShieldCheck className="w-4 h-4 text-green-600 flex-shrink-0" title="Verified" />
            ) : (
              <IconShieldOff className="w-4 h-4 text-gray-400 flex-shrink-0" title="Unverified" />
            )}
          </div>
          <div className="text-sm text-gray-500 flex flex-wrap gap-1 mt-1">
            {row.official_code && <span className="font-mono text-xs text-blue-600">{row.official_code}</span>}
            <Badge variant="secondary" className="text-xs">{row.category}</Badge>
          </div>
        </div>
      ),
    },
    {
      header: 'Location',
      accessor: 'state',
      sortable: true,
      responsive: 'md',
      formatter: (value, row) => (
        <div className="text-sm">
          <div className="text-gray-900">{row.ward || row.lga}</div>
          <div className="text-gray-500">{row.lga}, {value}</div>
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: 'school_type',
      sortable: true,
      responsive: 'lg',
      formatter: (value) => (
        <span className="text-gray-500 capitalize">{value}</span>
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
            >
              <IconMapPin className="w-4 h-4" />
            </a>
          ) : (
            <IconAlertTriangle className="w-4 h-4 text-amber-500" title="No GPS" />
          )}
        </div>
      ),
    },
    {
      header: 'Institutions',
      accessor: 'linked_institutions_count',
      sortable: true,
      responsive: 'md',
      formatter: (value) => (
        <div className="flex items-center gap-1 text-gray-600">
          <IconBuilding className="w-4 h-4" />
          {value || 0}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'actions',
      align: 'right',
      formatter: (_, row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleViewSchool(row); }}
            title="View details"
          >
            <IconEye className="w-4 h-4" />
          </Button>
          {!row.is_verified && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleVerify(row); }}
              className="hover:text-green-600 hover:bg-green-50"
              title="Verify"
            >
              <IconShieldCheck className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
            title="Edit"
          >
            <IconPencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
            className="hover:text-red-600 hover:bg-red-50"
            title="Delete"
          >
            <IconTrash className="w-4 h-4" />
          </Button>
        </div>
      ),
    },
  ], [handleViewSchool, openEditModal]);

  return (
    <div className="space-y-4 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Central Schools Registry</h1>
          <p className="text-sm text-gray-500">Manage the master list of schools across all institutions</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openUploadModal}>
            <IconUpload className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Bulk Upload</span>
          </Button>
          <Button variant="outline" size="sm" onClick={openMergeModal}>
            <IconGitMerge className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Find Duplicates</span>
          </Button>
          <Button onClick={openCreateModal} size="sm">
            <IconPlus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Add School</span>
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total_schools || 0}</div>
              <div className="text-xs text-gray-500">Total Schools</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.verified_schools || 0}</div>
              <div className="text-xs text-gray-500">Verified</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.total_links || 0}</div>
              <div className="text-xs text-gray-500">Institution Links</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.states_covered || 0}</div>
              <div className="text-xs text-gray-500">States Covered</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.lgas_covered || 0}</div>
              <div className="text-xs text-gray-500">LGAs Covered</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-3 sm:py-4">
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search schools..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <Button
                variant={hasActiveFilters ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <IconFilter className="w-4 h-4" />
                {showFilters ? <IconChevronUp className="w-4 h-4 ml-1" /> : <IconChevronDown className="w-4 h-4 ml-1" />}
              </Button>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <IconRefresh className="w-4 h-4" />
                </Button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 pt-2 border-t border-gray-100">
                <Select
                  value={stateFilter}
                  onChange={(e) => { setStateFilter(e.target.value); setLgaFilter(''); }}
                  className="text-sm"
                >
                  <option value="">All States</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
                <Select
                  value={lgaFilter}
                  onChange={(e) => setLgaFilter(e.target.value)}
                  className="text-sm"
                  disabled={!stateFilter}
                >
                  <option value="">All LGAs</option>
                  {lgas.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </Select>
                <Select
                  value={verifiedFilter}
                  onChange={(e) => setVerifiedFilter(e.target.value)}
                  className="text-sm"
                >
                  <option value="">All Status</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                </Select>
              </div>
            )}
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
        title={editSchool ? 'Edit School' : 'Add School to Registry'}
        width="2xl"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Official Code</label>
            <Input
              value={formData.official_code || ''}
              onChange={(e) => setFormData({ ...formData, official_code: e.target.value.toUpperCase() })}
              placeholder="e.g., FED/KN/001"
            />
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
            <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
            <Select
              value={formData.state || ''}
              onChange={(e) => {
                const newState = e.target.value;
                setFormData({ ...formData, state: newState, lga: '', ward: '' });
                setFormWards([]);
                fetchFormLgas(newState);
              }}
              className="w-full"
            >
              <option value="">Select State</option>
              {states.map((state) => (
                <option key={state} value={state}>{state}</option>
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
                fetchFormWards(formData.state, newLga);
              }}
              disabled={!formData.state || loadingFormLgas}
              className="w-full"
            >
              <option value="">{loadingFormLgas ? 'Loading...' : 'Select LGA'}</option>
              {formLgas.map((lga) => (
                <option key={lga} value={lga}>{lga}</option>
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
                // Auto-fetch ward coordinates to prefill GPS
                if (newWard && formData.state && formData.lga) {
                  fetchWardCoordinates(formData.state, formData.lga, newWard);
                }
              }}
              disabled={!formData.lga || loadingFormWards}
              className="w-full"
            >
              <option value="">{loadingFormWards ? 'Loading...' : 'Select Ward'}</option>
              {formWards.map((ward, idx) => (
                <option key={`${ward.name}-${idx}`} value={ward.name}>{ward.name}</option>
              ))}
            </Select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <Input
              value={formData.address || ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Full address"
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
              min="-90"
              max="90"
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
              min="-180"
              max="180"
              value={formData.longitude ?? ''}
              onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
              placeholder="e.g., 3.37920"
            />
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
      </Dialog>

      {/* View School Modal */}
      <Dialog
        isOpen={!!selectedSchool}
        onClose={() => setSelectedSchool(null)}
        title="School Details"
        width="2xl"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setSelectedSchool(null); selectedSchool && openEditModal(selectedSchool); }}
              className="w-full sm:w-auto"
            >
              <IconPencil className="w-4 h-4 mr-2" />
              Edit School
            </Button>
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
                {selectedSchool.is_verified ? (
                  <IconShieldCheck className="w-5 h-5 text-green-600" title="Verified" />
                ) : (
                  <IconShieldOff className="w-5 h-5 text-gray-400" title="Unverified" />
                )}
              </h3>
              {selectedSchool.official_code && (
                <div>
                  <Badge variant="outline" className="text-blue-600 text-lg">{selectedSchool.official_code}</Badge>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              <div>
                <label className="text-gray-500 text-xs">Type</label>
                <p className="font-medium capitalize">{selectedSchool.school_type}</p>
              </div>
              <div>
                <label className="text-gray-500 text-xs">Category</label>
                <p className="font-medium capitalize">{selectedSchool.category}</p>
              </div>
              <div>
                <label className="text-gray-500 text-xs">State</label>
                <p className="font-medium">{selectedSchool.state}</p>
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
                <label className="text-gray-500 text-xs">Linked Institutions</label>
                <p className="font-medium">{selectedSchool.linked_institutions_count || 0}</p>
              </div>
            </div>

            {(selectedSchool.principal_name || selectedSchool.principal_phone) && (
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2 text-sm">Principal Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-2">
                  <p>{selectedSchool.principal_name}</p>
                  {selectedSchool.principal_phone && (
                    <a 
                      href={`tel:${selectedSchool.principal_phone}`} 
                      className="text-primary-600 flex items-center gap-1 mt-1 hover:underline"
                    >
                      <IconPhone className="w-3 h-3" /> {selectedSchool.principal_phone}
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center gap-2 mb-3">
                <IconMap2 className="w-4 h-4 text-blue-600" />
                <h4 className="font-medium">GPS Location</h4>
              </div>
              {selectedSchool.latitude != null && selectedSchool.longitude != null ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-500 text-xs">Latitude</label>
                      <p className="font-medium font-mono text-xs">{selectedSchool.latitude}</p>
                    </div>
                    <div>
                      <label className="text-gray-500 text-xs">Longitude</label>
                      <p className="font-medium font-mono text-xs">{selectedSchool.longitude}</p>
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
                </div>
              ) : (
                <div className="bg-amber-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-700 text-sm">
                    <IconAlertTriangle className="w-4 h-4" />
                    <span>GPS coordinates not set</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Merge/Duplicates Modal */}
      <Dialog
        isOpen={showMergeModal}
        onClose={() => {
          setShowMergeModal(false);
          setSelectedForMerge([]);
          setMergeTarget(null);
        }}
        title="Find & Merge Duplicate Schools"
        width="2xl"
        footer={
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShowMergeModal(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button 
              onClick={handleMerge} 
              disabled={!mergeTarget || selectedForMerge.length < 2 || merging} 
              className="w-full sm:w-auto"
            >
              {merging ? 'Merging...' : `Merge ${Math.max(0, selectedForMerge.length - 1)} School(s)`}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {loadingDuplicates ? (
            <div className="flex items-center justify-center py-8">
              <IconRefresh className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : duplicates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <IconShieldCheck className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>No potential duplicates found</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Select schools to merge. Choose one as the target (data will be preserved) and others will be merged into it.
              </p>
              <div className="border rounded-lg max-h-96 overflow-y-auto divide-y">
                {duplicates.map((school) => (
                  <div
                    key={school.id}
                    className={`p-3 flex items-center gap-3 ${
                      selectedForMerge.includes(school.id) ? 'bg-blue-50' : ''
                    } ${mergeTarget === school.id ? 'bg-green-50 border-l-4 border-green-500' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedForMerge.includes(school.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForMerge([...selectedForMerge, school.id]);
                        } else {
                          setSelectedForMerge(selectedForMerge.filter(id => id !== school.id));
                          if (mergeTarget === school.id) setMergeTarget(null);
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate flex items-center gap-1">
                        {school.name}
                        {school.is_verified && <IconShieldCheck className="w-4 h-4 text-green-600" />}
                      </div>
                      <div className="text-sm text-gray-500">
                        {school.ward}, {school.lga}, {school.state}
                      </div>
                      <div className="text-xs text-gray-400">
                        {school.linked_institutions_count || 0} institution(s) linked
                      </div>
                    </div>
                    {selectedForMerge.includes(school.id) && (
                      <Button
                        size="sm"
                        variant={mergeTarget === school.id ? 'primary' : 'outline'}
                        onClick={() => setMergeTarget(school.id)}
                      >
                        {mergeTarget === school.id ? 'Target' : 'Set as Target'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
                <p><strong>Warning:</strong> Merging is permanent. All institution links from source schools will be moved to the target school.</p>
              </div>
            </>
          )}
        </div>
      </Dialog>

      {/* Upload Modal - Multi-step */}
      <Dialog
        isOpen={showUploadModal}
        onClose={resetUploadModal}
        title={
          uploadStep === 'select' ? 'Upload Schools - Select File' :
          uploadStep === 'preview' ? 'Upload Schools - Review & Confirm' :
          'Upload Schools - Results'
        }
        width="2xl"
      >
        {/* Step Indicator */}
        <div className="flex items-center justify-center mb-4 sm:mb-6">
          <div className="flex items-center gap-1 sm:gap-2">
            <div className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium ${
              uploadStep === 'select' ? 'bg-primary-600 text-white' : 'bg-green-500 text-white'
            }`}>
              {uploadStep !== 'select' ? <IconCheck className="w-3 h-3 sm:w-4 sm:h-4" /> : '1'}
            </div>
            <span className={`text-xs sm:text-sm hidden sm:inline ${uploadStep === 'select' ? 'text-primary-700 font-medium' : 'text-gray-500'}`}>Select File</span>
            <IconChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-300 mx-1 sm:mx-2" />
            <div className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium ${
              uploadStep === 'preview' ? 'bg-primary-600 text-white' : 
              uploadStep === 'result' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {uploadStep === 'result' ? <IconCheck className="w-3 h-3 sm:w-4 sm:h-4" /> : '2'}
            </div>
            <span className={`text-xs sm:text-sm hidden sm:inline ${uploadStep === 'preview' ? 'text-primary-700 font-medium' : 'text-gray-500'}`}>Review</span>
            <IconChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-300 mx-1 sm:mx-2" />
            <div className={`flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium ${
              uploadStep === 'result' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              3
            </div>
            <span className={`text-xs sm:text-sm hidden sm:inline ${uploadStep === 'result' ? 'text-primary-700 font-medium' : 'text-gray-500'}`}>Complete</span>
          </div>
        </div>

        {/* Step 1: Select File */}
        {uploadStep === 'select' && (
          <div className="space-y-3 sm:space-y-4">
            <div
              onClick={() => !validating && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 sm:p-8 text-center cursor-pointer transition-colors active:scale-[0.99] ${
                validating ? 'border-primary-300 bg-primary-50' : 'border-gray-300 hover:border-primary-500'
              }`}
            >
              {validating ? (
                <>
                  <IconLoader2 className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-primary-500 animate-spin" />
                  <p className="font-medium text-sm sm:text-base text-primary-700">Validating file...</p>
                  <p className="text-xs sm:text-sm text-primary-600 mt-1">Checking for errors and duplicates</p>
                </>
              ) : (
                <>
                  <IconFileSpreadsheet className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-gray-400" />
                  <p className="font-medium text-sm sm:text-base text-gray-900">Click to select Excel file</p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-1">.xlsx or .xls files only</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="bg-blue-50 rounded-lg p-3 sm:p-4">
              <h4 className="font-medium text-sm sm:text-base text-blue-900 mb-2">Required columns:</h4>
              <ul className="text-xs sm:text-sm text-blue-800 space-y-1">
                <li>• <strong>name</strong> (required) - School name</li>
                <li>• <strong>state</strong> (required) - State name</li>
                <li>• <strong>lga</strong> (required) - Local Government Area</li>
                <li>• <strong>ward</strong> (optional) - Ward name</li>
                <li>• <strong>address</strong> (optional) - Full address</li>
                <li>• <strong>principal_name</strong> (optional) - Principal's name</li>
                <li>• <strong>principal_phone</strong> (optional) - Principal's phone</li>
                <li>• <strong>latitude</strong> (optional) - GPS latitude</li>
                <li>• <strong>longitude</strong> (optional) - GPS longitude</li>
              </ul>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 sm:gap-3">
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="active:scale-95">
                <IconDownload className="w-4 h-4 mr-2 flex-shrink-0" />
                Download Template
              </Button>
              <Button variant="outline" size="sm" onClick={resetUploadModal} className="active:scale-95">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Preview & Validate */}
        {uploadStep === 'preview' && validationResult && (
          <div className="space-y-3 sm:space-y-4">
            {/* File Info */}
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 rounded-lg">
              <IconFileSpreadsheet className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm sm:text-base text-gray-900 truncate">{uploadFile?.name}</p>
                <p className="text-xs sm:text-sm text-gray-500">
                  {formatFileSize(uploadFile?.size)}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleBackToSelect} className="active:scale-95 flex-shrink-0">
                <IconX className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">Change</span>
              </Button>
            </div>

            {/* Validation Summary */}
            <div className={`rounded-lg p-3 sm:p-4 ${
              validationResult.canProceed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
            }`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                {validationResult.canProceed ? (
                  <IconCircleCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <IconAlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0" />
                )}
                <span className="font-medium text-sm sm:text-base">
                  {validationResult.canProceed ? 'Validation Passed' : 'Validation Issues Found'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-gray-900">{validationResult.totalRows}</div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Total Rows</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-green-600">{validationResult.validRows}</div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Valid</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-red-600">{validationResult.errorRows}</div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Errors</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-amber-600">{validationResult.duplicateRows || 0}</div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Duplicates</div>
                </div>
              </div>
            </div>

            {/* Errors List */}
            {validationResult.errors && validationResult.errors.length > 0 && (
              <div className="border border-red-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-2 border-b border-red-200">
                  <h4 className="font-medium text-red-900 flex items-center gap-2">
                    <IconCircleX className="w-4 h-4" />
                    Errors ({validationResult.errors.length})
                  </h4>
                </div>
                <div className="max-h-40 overflow-y-auto p-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="pb-2 pr-2">Row</th>
                        <th className="pb-2 pr-2">School Name</th>
                        <th className="pb-2">Error</th>
                      </tr>
                    </thead>
                    <tbody className="text-red-700">
                      {validationResult.errors.slice(0, 15).map((error, idx) => (
                        <tr key={idx} className="border-t border-red-100">
                          <td className="py-1 pr-2">{error.row}</td>
                          <td className="py-1 pr-2 font-medium truncate max-w-[150px]">{error.name || '-'}</td>
                          <td className="py-1">{Array.isArray(error.errors) ? error.errors.join(', ') : error.message || error.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validationResult.errors.length > 15 && (
                    <p className="text-gray-500 text-xs mt-2 text-center">
                      ... and {validationResult.errors.length - 15} more errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Preview Table */}
            {validationResult.preview && validationResult.preview.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b flex items-center gap-2">
                  <IconEye className="w-4 h-4 text-gray-500" />
                  <h4 className="font-medium text-gray-900">Preview (first 10 rows)</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-gray-600">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">State</th>
                        <th className="px-4 py-2 font-medium">LGA</th>
                        <th className="px-4 py-2 font-medium">Ward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.preview.map((school, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{school.name}</td>
                          <td className="px-4 py-2">{school.state}</td>
                          <td className="px-4 py-2">{school.lga}</td>
                          <td className="px-4 py-2">{school.ward || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Error Warning - Must fix before proceeding */}
            {validationResult.errors && validationResult.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <IconCircleX className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-800">
                      Cannot proceed with upload
                    </p>
                    <p className="text-xs text-red-700 mt-0.5">
                      Please fix all {validationResult.errors.length} error(s) in your Excel file and re-upload.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 sm:gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={handleBackToSelect} className="active:scale-95">
                <IconChevronLeft className="w-4 h-4 mr-1 flex-shrink-0" />
                Back
              </Button>
              <div className="flex gap-2 sm:gap-3">
                <Button variant="outline" size="sm" onClick={resetUploadModal} className="active:scale-95 flex-1 sm:flex-none">
                  Cancel
                </Button>
                <Button 
                  size="sm"
                  onClick={handleUpload} 
                  disabled={!validationResult.canProceed || uploading || (validationResult.errors && validationResult.errors.length > 0)}
                  loading={uploading}
                  className="active:scale-95 flex-1 sm:flex-none"
                  title={validationResult.errors && validationResult.errors.length > 0 ? 'Fix all errors before uploading' : ''}
                >
                  {uploading ? 'Uploading...' : (
                    <>
                      <IconUpload className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                      <span className="hidden sm:inline">Upload {validationResult.validRows} Schools</span>
                      <span className="sm:hidden">Upload ({validationResult.validRows})</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {uploadStep === 'result' && uploadResult && (
          <div className="space-y-4">
            {/* Result Summary */}
            <div className={`rounded-lg p-3 sm:p-4 ${
              (uploadResult.inserted > 0 && (!uploadResult.errors || uploadResult.errors.length === 0))
                ? 'bg-green-50' 
                : 'bg-amber-50'
            }`}>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                {(uploadResult.inserted > 0 && (!uploadResult.errors || uploadResult.errors.length === 0)) ? (
                  <IconCircleCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <IconAlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0" />
                )}
                <span className="font-medium text-sm sm:text-base">
                  {(uploadResult.inserted > 0 && (!uploadResult.errors || uploadResult.errors.length === 0))
                    ? 'Upload Complete!' 
                    : 'Upload Completed with Issues'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-green-600">
                    {uploadResult.inserted || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Inserted</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-amber-600">
                    {uploadResult.skipped || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Skipped</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-red-600">
                    {uploadResult.errors?.length || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Failed</div>
                </div>
              </div>
            </div>

            {/* Import Errors */}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div className="border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                  <IconCircleX className="w-4 h-4" />
                  Import Errors ({uploadResult.errors.length})
                </h4>
                <ul className="text-sm space-y-1">
                  {uploadResult.errors.slice(0, 10).map((error, idx) => (
                    <li key={idx} className="text-red-700">
                      Row {error.row}: {error.name} - {error.error}
                    </li>
                  ))}
                  {uploadResult.errors.length > 10 && (
                    <li className="text-gray-500">
                      ... and {uploadResult.errors.length - 10} more errors
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Imported Schools */}
            {uploadResult.schools && uploadResult.schools.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-50 px-4 py-2 border-b flex items-center justify-between">
                  <h4 className="font-medium text-green-900 flex items-center gap-2">
                    <IconCircleCheck className="w-4 h-4" />
                    Imported Schools ({uploadResult.schools.length})
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-gray-600">
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">State</th>
                        <th className="px-4 py-2 font-medium">LGA</th>
                        <th className="px-4 py-2 font-medium">Ward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.schools.slice(0, 50).map((school, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{school.name}</td>
                          <td className="px-4 py-2">{school.state}</td>
                          <td className="px-4 py-2">{school.lga}</td>
                          <td className="px-4 py-2">{school.ward || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {uploadResult.schools.length > 50 && (
                    <div className="text-center py-2 text-gray-500 text-xs border-t">
                      Showing first 50 of {uploadResult.schools.length} imported schools
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={resetUploadModal}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setSchoolToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete School"
        message="Are you sure you want to delete this school from the central registry? This will affect all institutions that have linked to this school."
        confirmText="Delete"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}

export default MasterSchoolsPage;
