/**
 * Students Management Page
 * Manage students with Excel upload and program auto-detection
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { studentsApi, programsApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatFileSize } from '../../utils/helpers';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Select';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import {
  IconUsers,
  IconUpload,
  IconDownload,
  IconRefresh,
  IconFileSpreadsheet,
  IconCircleCheck,
  IconCircleX,
  IconAlertTriangle,
  IconX,
  IconEdit,
  IconTrash,
  IconUserPlus,
  IconCopy,
  IconCheck,
  IconSearch,
  IconChevronRight,
  IconChevronLeft,
  IconEye,
  IconLoader2,
  IconPrinter,
} from '@tabler/icons-react';

function StudentsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);
  const fileInputRef = useRef(null);

  // State
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadStep, setUploadStep] = useState('select'); // 'select' | 'preview' | 'result'
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [parsedData, setParsedData] = useState([]);

  // Add/Edit student modal
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null); // null = add mode, object = edit mode
  const [savingStudent, setSavingStudent] = useState(false);
  const [studentForm, setStudentForm] = useState({
    full_name: '',
    registration_number: '',
    program_id: '',
  });

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Copy PIN state
  const [copiedPin, setCopiedPin] = useState(null);

  // Success dialog state (after creating a student)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdStudent, setCreatedStudent] = useState(null);
  const [copiedSuccessPin, setCopiedSuccessPin] = useState(false);

  // Fetch students
  const fetchStudents = useCallback(async () => {
    if (!selectedSession) return;
    
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search) params.search = search;
      if (programFilter) params.program_id = programFilter;
      if (selectedSession) params.session_id = selectedSession;
      if (statusFilter) params.status = statusFilter;

      const response = await studentsApi.getAll(params);
      setStudents(response.data.data || response.data || []);
      setPagination((prev) => ({
        ...prev,
        total: response.data.pagination?.total || 0,
      }));
    } catch (err) {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, programFilter, selectedSession, statusFilter, toast]);

  const fetchPrograms = async () => {
    try {
      const response = await programsApi.getAll({ status: 'active' });
      setPrograms(response.data.data || response.data || []);
    } catch (err) {
      console.error('Failed to load programs:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll({ status: 'active' });
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      // Auto-select current session like AcceptancesPage
      if (sessionsData.length > 0) {
        const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
        setSelectedSession(current.id.toString());
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  useEffect(() => {
    fetchPrograms();
    fetchSessions();
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Normalize column names (same logic as backend)
  const normalizeColumn = (name) => {
    const normalized = name.toLowerCase().trim().replace(/[_\s]+/g, '_');
    const mappings = {
      reg_number: 'registration_number',
      reg_no: 'registration_number',
      regno: 'registration_number',
      registration_no: 'registration_number',
      matriculation_number: 'registration_number',
      matric_number: 'registration_number',
      matric_no: 'registration_number',
      name: 'full_name',
      student_name: 'full_name',
      fullname: 'full_name',
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
          const processedStudents = rawData.map((row, index) => {
            const normalized = {};
            for (const [key, value] of Object.entries(row)) {
              const normalizedKey = normalizeColumn(key);
              normalized[normalizedKey] = String(value).trim();
            }
            if (normalized.full_name) normalized.full_name = normalized.full_name.toUpperCase();
            if (normalized.registration_number) normalized.registration_number = normalized.registration_number.toUpperCase();
            return { ...normalized, row_number: index + 2 }; // +2 for header row and 0-index
          });

          // Client-side validation
          const errors = [];
          const validStudents = [];

          for (const student of processedStudents) {
            const rowErrors = [];
            if (!student.registration_number) rowErrors.push('Registration number is required');
            if (!student.full_name) rowErrors.push('Full name is required');

            if (rowErrors.length > 0) {
              errors.push({
                row: student.row_number,
                registration_number: student.registration_number || 'N/A',
                full_name: student.full_name || 'N/A',
                errors: rowErrors,
              });
            } else {
              validStudents.push(student);
            }
          }

          // Check for duplicates within file
          const regNumbers = validStudents.map(s => s.registration_number);
          const duplicatesInFile = regNumbers.filter((item, index) => regNumbers.indexOf(item) !== index);
          const uniqueDuplicates = [...new Set(duplicatesInFile)];

          for (const dup of uniqueDuplicates) {
            const rows = validStudents.filter(s => s.registration_number === dup).map(s => s.row_number);
            errors.push({
              row: rows.join(', '),
              registration_number: dup,
              full_name: 'Multiple entries',
              errors: [`Duplicate registration number appears in rows: ${rows.join(', ')}`],
            });
          }

          // Filter out duplicates from valid students (keep first occurrence)
          const seenRegNumbers = new Set();
          const uniqueValidStudents = validStudents.filter(s => {
            if (seenRegNumbers.has(s.registration_number)) {
              return false;
            }
            seenRegNumbers.add(s.registration_number);
            return true;
          });

          resolve({
            totalRows: rawData.length,
            validStudents: uniqueValidStudents,
            clientErrors: errors,
            preview: uniqueValidStudents.slice(0, 10),
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
      // Parse file client-side first
      const clientValidation = await parseAndValidateFile(file);
      setParsedData(clientValidation.validStudents);

      // Now validate against server (check for existing students)
      const serverResponse = await studentsApi.upload(file, true); // validate_only=true
      const serverData = serverResponse.data;

      // Merge client and server validation results
      const allErrors = serverData.errors || clientValidation.clientErrors;
      const hasErrors = allErrors && allErrors.length > 0;
      setValidationResult({
        totalRows: clientValidation.totalRows,
        validRows: serverData.valid_rows || clientValidation.validStudents.length,
        errorRows: serverData.error_rows || clientValidation.clientErrors.length,
        programsDetected: serverData.programs_detected || 0,
        programsUndetected: serverData.programs_undetected || 0,
        errors: allErrors,
        preview: serverData.preview || clientValidation.preview,
        canProceed: !hasErrors && serverData.can_proceed !== false && clientValidation.validStudents.length > 0,
      });

      setUploadStep('preview');
    } catch (err) {
      console.error('Validation error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to validate file';
      toast.error(errorMessage);
      
      // If server validation failed, still show client-side results if available
      try {
        const clientValidation = await parseAndValidateFile(file);
        setParsedData(clientValidation.validStudents);
        const hasClientErrors = clientValidation.clientErrors && clientValidation.clientErrors.length > 0;
        setValidationResult({
          totalRows: clientValidation.totalRows,
          validRows: clientValidation.validStudents.length,
          errorRows: clientValidation.clientErrors.length,
          programsDetected: 0,
          programsUndetected: clientValidation.validStudents.length,
          errors: clientValidation.clientErrors,
          preview: clientValidation.preview,
          canProceed: !hasClientErrors && clientValidation.validStudents.length > 0,
          serverError: errorMessage,
        });
        setUploadStep('preview');
      } catch (parseErr) {
        toast.error(parseErr.message);
      }
    } finally {
      setValidating(false);
    }
  };

  // Handle file upload (actual upload after preview)
  const handleUpload = async () => {
    if (!uploadFile) return;

    setUploading(true);
    try {
      const response = await studentsApi.upload(uploadFile, false); // validate_only=false
      const result = response.data.data || response.data || {};
      setUploadResult(result);
      setUploadStep('result');
      
      const insertedCount = result?.inserted || 0;
      if (insertedCount > 0) {
        toast.success(`Successfully imported ${insertedCount} students`);
      }
      // Always refresh the table after upload attempt
      fetchStudents();
    } catch (err) {
      const errorData = err.response?.data;
      if (errorData) {
        setUploadResult(errorData);
        setUploadStep('result');
        // Still refresh in case some were imported before error
        fetchStudents();
      } else {
        toast.error(err.response?.data?.message || 'Upload failed');
      }
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
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
  const handleDownloadTemplate = async () => {
    try {
      const response = await studentsApi.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'student_upload_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  // Export students
  const handleExport = async () => {
    try {
      const response = await studentsApi.export();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `students_export_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Failed to export students');
    }
  };

  // Copy PIN to clipboard
  const handleCopyPin = useCallback(async (pin, studentId) => {
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedPin(studentId);
      setTimeout(() => setCopiedPin(null), 2000);
    } catch (err) {
      toast.error('Failed to copy PIN');
    }
  }, [toast]);

  // Open add modal
  const openAddModal = useCallback(() => {
    setEditingStudent(null);
    setStudentForm({ full_name: '', registration_number: '', program_id: '' });
    setShowStudentModal(true);
  }, []);

  // Open edit modal
  const openEditModal = useCallback((student) => {
    setEditingStudent(student);
    setStudentForm({
      full_name: student.full_name || '',
      registration_number: student.registration_number || '',
      program_id: student.program_id?.toString() || '',
    });
    setShowStudentModal(true);
  }, []);

  // Open delete confirmation
  const openDeleteConfirm = useCallback((student) => {
    setStudentToDelete(student);
    setShowDeleteConfirm(true);
  }, []);

  // Close student modal
  const closeStudentModal = () => {
    setShowStudentModal(false);
    setEditingStudent(null);
    setStudentForm({ full_name: '', registration_number: '', program_id: '' });
  };

  // Save student (add or edit)
  const handleSaveStudent = async (e) => {
    e.preventDefault();
    
    if (!studentForm.full_name || !studentForm.registration_number) {
      toast.error('Full name and registration number are required');
      return;
    }

    if (!studentForm.program_id) {
      toast.error('Please select a program');
      return;
    }

    // Normalize values to uppercase
    const regNumUpper = studentForm.registration_number.toUpperCase().trim();
    const fullNameUpper = studentForm.full_name.toUpperCase().trim();

    // Validate registration number uniqueness against current session data
    const duplicateStudent = students.find(
      (s) => s.registration_number.toUpperCase() === regNumUpper && s.id !== editingStudent?.id
    );
    if (duplicateStudent) {
      toast.error(`Registration number already exists for: ${duplicateStudent.full_name}`);
      return;
    }

    setSavingStudent(true);
    try {
      if (editingStudent) {
        // Update existing student
        await studentsApi.update(editingStudent.id, {
          full_name: fullNameUpper,
          registration_number: regNumUpper,
          program_id: parseInt(studentForm.program_id),
        });
        toast.success('Student updated successfully');
        closeStudentModal();
        fetchStudents();
      } else {
        // Create new student
        const response = await studentsApi.create({
          full_name: fullNameUpper,
          registration_number: regNumUpper,
          program_id: parseInt(studentForm.program_id),
        });
        const newStudent = response.data.data || response.data || {};
        // Find program name for display
        const selectedProgram = programs.find(p => p.id === parseInt(studentForm.program_id));
        setCreatedStudent({
          ...newStudent,
          program_name: selectedProgram?.name || 'N/A',
        });
        closeStudentModal();
        setShowSuccessDialog(true);
        fetchStudents();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save student');
    } finally {
      setSavingStudent(false);
    }
  };

  // Delete student
  const handleDeleteStudent = async () => {
    if (!studentToDelete) return;

    setDeleting(true);
    try {
      await studentsApi.delete(studentToDelete.id);
      toast.success('Student deleted successfully');
      setShowDeleteConfirm(false);
      setStudentToDelete(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete student');
    } finally {
      setDeleting(false);
    }
  };

  // Table columns definition
  const columns = useMemo(() => [
    {
      accessor: 'full_name',
      header: 'Full Name',
      render: (value) => (
        <div className="font-medium text-gray-900">{value}</div>
      ),
    },
    {
      accessor: 'registration_number',
      header: 'Registration No.',
      render: (value) => (
        <code className="text-sm bg-gray-100 px-2 py-1 rounded">{value}</code>
      ),
    },
    {
      accessor: 'pin',
      header: 'PIN',
      render: (value, row) => value ? (
        <div className="flex items-center gap-2">
          <code className="text-lg font-semibold bg-primary-50 tracking-wider text-primary-800 px-2 rounded">{value}</code>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); handleCopyPin(value, row.id); }}
            className="text-gray-400 hover:text-primary-600"
            title="Copy PIN"
          >
            {copiedPin === row.id ? <IconCheck className="w-4 h-4 text-green-600" /> : <IconCopy className="w-4 h-4" />}
          </Button>
        </div>
      ) : <span className="text-gray-400">-</span>,
    },
    {
      accessor: 'program_name',
      header: 'Program',
      render: (value) => value || <span className="text-amber-600">Not Assigned</span>,
    },
    {
      accessor: 'status',
      header: 'Status',
      type: 'status',
    },
    ...(canEdit ? [{
      accessor: 'actions',
      header: 'Actions',
      align: 'right',
      sortable: false,
      exportable: false,
      render: (_, row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); openEditModal(row); }}
            className="text-gray-400 hover:text-primary-600"
            title="Edit student"
          >
            <IconEdit className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); openDeleteConfirm(row); }}
            className="text-gray-400 hover:text-red-600"
            title="Delete student"
          >
            <IconTrash className="w-4 h-4" />
          </Button>
        </div>
      ),
    }] : []),
  ], [canEdit, copiedPin, handleCopyPin, openEditModal, openDeleteConfirm]);

  // Toolbar with filters
  const tableToolbar = (
    <div className="block md:flex gap-2">
      <div className="grid grid-cols-2 lg:grid-cols-5 items-center gap-2">
        {/* Search - full width on mobile */}
        <div className="relative w-full col-span-2">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((p) => ({ ...p, page: 1 }));
            }}
            placeholder="Search name or reg number..."
            className="pl-9 pr-3 py-2"
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <Select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="text-sm"
          >
            <option value="">All Programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
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
      <Button 
        variant="outline" 
        onClick={() => { setSearch(''); setProgramFilter(''); setStatusFilter(''); setPagination(p => ({ ...p, page: 1 })); }} 
        className="active:scale-95 flex-shrink-0 mt-2 md:mt-0"
      >
        <IconRefresh className="w-4 h-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Students</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">Manage student records and registrations</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link to="/admin/students/print-pins">
            <Button size="sm" variant="outline" className="active:scale-95">
              <IconPrinter className="w-4 h-4 sm:mr-2 flex-shrink-0" />
              <span className="hidden sm:inline">Print PINs</span>
            </Button>
          </Link>
          {canEdit && (
            <>
              <Button size="sm" variant="outline" onClick={openAddModal} className="active:scale-95">
                <IconUserPlus className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                <span className="hidden sm:inline">Add Student</span>
              </Button>
              <Button size="sm" onClick={() => setShowUploadModal(true)} className="active:scale-95">
                <IconUpload className="w-4 h-4 sm:mr-2 flex-shrink-0" />
                <span className="hidden sm:inline">Bulk Upload</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Students Table */}
      <DataTable
        data={students}
        columns={columns}
        keyField="id"
        loading={loading}
        sortable
        exportable
        exportFilename="students_export"
        toolbar={tableToolbar}
        emptyIcon={IconUsers}
        emptyTitle="No students found"
        emptyDescription="Upload students via Excel or add them manually"
        pagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          onPageChange: (page) => setPagination((p) => ({ ...p, page })),
        }}
      />

      {/* Upload Modal - Multi-step */}
      <Dialog
        isOpen={showUploadModal}
        onClose={resetUploadModal}
        title={
          uploadStep === 'select' ? 'Upload Students - Select File' :
          uploadStep === 'preview' ? 'Upload Students - Review & Confirm' :
          'Upload Students - Results'
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
                <li>• <strong>full_name</strong> (required)</li>
                <li>• <strong>registration_number</strong> (required - must contain program code)</li>
              </ul>
              <p className="text-[10px] sm:text-xs text-blue-700 mt-2 sm:mt-3">
                Programs are detected from registration numbers. The registration number must contain the program code 
                as one of its parts (e.g., NCE/2024/<strong>MATH</strong>/124 will match program with code MATH or NCE-MATH).
              </p>
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
                  <div className="text-lg sm:text-2xl font-bold text-primary-600">{validationResult.programsDetected}</div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Programs</div>
                </div>
              </div>
            </div>

            {/* Server Error Warning */}
            {validationResult.serverError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <IconAlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Server validation unavailable</p>
                    <p className="text-xs text-amber-700 mt-1">{validationResult.serverError}</p>
                    <p className="text-xs text-amber-700 mt-1">Duplicate checks against existing students may not be complete.</p>
                  </div>
                </div>
              </div>
            )}

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
                        <th className="pb-2 pr-2">Reg. Number</th>
                        <th className="pb-2">Error</th>
                      </tr>
                    </thead>
                    <tbody className="text-red-700">
                      {validationResult.errors.slice(0, 15).map((error, idx) => (
                        <tr key={idx} className="border-t border-red-100">
                          <td className="py-1 pr-2">{error.row}</td>
                          <td className="py-1 pr-2 font-mono text-xs">{error.registration_number}</td>
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
                        <th className="px-4 py-2 font-medium">Registration Number</th>
                        <th className="px-4 py-2 font-medium">Full Name</th>
                        <th className="px-4 py-2 font-medium">Program</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationResult.preview.map((student, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              {student.registration_number}
                            </code>
                          </td>
                          <td className="px-4 py-2 font-medium">{student.full_name}</td>
                          <td className="px-4 py-2">
                            {student.program ? (
                              <Badge variant="success" size="sm">{student.program.name || student.program.code}</Badge>
                            ) : (
                              <Badge variant="warning" size="sm">Not detected</Badge>
                            )}
                          </td>
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
                      <span className="hidden sm:inline">Upload {validationResult.validRows} Students</span>
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
                  <div className="text-[10px] sm:text-xs text-gray-500">Successful</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-red-600">
                    {uploadResult.errors?.length || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500">Failed</div>
                </div>
                <div className="bg-white rounded-lg p-2 sm:p-3 shadow-sm">
                  <div className="text-lg sm:text-2xl font-bold text-primary-600">
                    {uploadResult.students?.filter(s => s.program_name).length || 0}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500">With Program</div>
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
                      {error.registration_number}: {error.error}
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

            {/* Imported Students with PINs */}
            {uploadResult.students && uploadResult.students.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-50 px-4 py-2 border-b flex items-center justify-between">
                  <h4 className="font-medium text-green-900 flex items-center gap-2">
                    <IconCircleCheck className="w-4 h-4" />
                    Imported Students ({uploadResult.students.length})
                  </h4>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-left text-gray-600">
                        <th className="px-4 py-2 font-medium">Registration Number</th>
                        <th className="px-4 py-2 font-medium">Full Name</th>
                        <th className="px-4 py-2 font-medium">Program</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploadResult.students.slice(0, 50).map((student, idx) => (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              {student.registration_number}
                            </code>
                          </td>
                          <td className="px-4 py-2 font-medium">{student.full_name}</td>
                          <td className="px-4 py-2">
                            {student.program_name ? (
                              <span className="text-gray-700">{student.program_name}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {uploadResult.students.length > 10 && (
                    <div className="text-center py-2 text-gray-500 text-xs border-t">
                      Showing first 10 of {uploadResult.students.length} imported students
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

      {/* Add/Edit Student Modal */}
      <Dialog
        isOpen={showStudentModal}
        onClose={closeStudentModal}
        title={editingStudent ? 'Edit Student' : 'Add Student'}
        width="md"
      >
        <form onSubmit={handleSaveStudent} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentForm.full_name}
                  onChange={(e) => setStudentForm({ ...studentForm, full_name: e.target.value.toUpperCase() })}
                  placeholder="e.g., JOHN DOE"
                  className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Registration Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentForm.registration_number}
                  onChange={(e) => setStudentForm({ ...studentForm, registration_number: e.target.value.toUpperCase() })}
                  placeholder="e.g., NCE/2024/MATH/001"
                  className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 uppercase"
                  required
                />
                {editingStudent && (
                  <p className="text-[10px] sm:text-xs text-amber-600 mt-1">
                    ⚠️ Changing registration number will be validated for duplicates
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Program <span className="text-red-500">*</span>
                </label>
                <Select
                  value={studentForm.program_id}
                  onChange={(e) => setStudentForm({ ...studentForm, program_id: e.target.value })}
                  className="text-sm sm:text-base"
                  required
                >
                  <option value="">Select a program</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              {!editingStudent && (
                <div className="bg-blue-50 rounded-lg p-2.5 sm:p-3 text-xs sm:text-sm text-blue-800">
                  <p>An 10-digit PIN will be auto-generated and displayed after creation.</p>
                </div>
              )}

              <div className="flex justify-end gap-2 sm:gap-3 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={closeStudentModal} className="active:scale-95">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={savingStudent} loading={savingStudent} className="active:scale-95">
                  {editingStudent ? 'Update Student' : 'Add Student'}
                </Button>
              </div>
            </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setStudentToDelete(null); }}
        onConfirm={handleDeleteStudent}
        title="Delete Student"
        message={
          studentToDelete
            ? `Are you sure you want to permanently delete "${studentToDelete.full_name}" (${studentToDelete.registration_number})? This will also delete all related records including acceptances, payments, and posting information. This action cannot be undone.`
            : 'Are you sure you want to delete this student?'
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        requireText="DELETE"
        loading={deleting}
      />

      {/* Success Dialog - After Creating Student */}
      <Dialog
        isOpen={showSuccessDialog}
        onClose={() => { setShowSuccessDialog(false); setCreatedStudent(null); setCopiedSuccessPin(false); }}
        title="Student Created Successfully"
        width="md"
      >
        {createdStudent && (
          <div className="space-y-4">
            <div className="flex items-center justify-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <IconCircleCheck className="w-10 h-10 text-green-600" />
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">{createdStudent.full_name}</h3>
              <p className="text-sm text-gray-500">has been added to the system</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Registration Number</span>
                <code className="text-sm bg-gray-200 px-2 py-1 rounded font-medium">
                  {createdStudent.registration_number}
                </code>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Program</span>
                <span className="text-sm font-medium text-gray-900">{createdStudent.program_name}</span>
              </div>
            </div>

            {/* PIN Section - Highlighted */}
            <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
              <div className="text-center">
                <p className="text-sm text-primary-700 mb-2">Student Login PIN</p>
                <div className="flex items-center justify-center gap-3">
                  <code className="text-3xl font-bold tracking-widest text-primary-800">
                    {createdStudent.pin}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(createdStudent.pin);
                        setCopiedSuccessPin(true);
                        setTimeout(() => setCopiedSuccessPin(false), 2000);
                      } catch (err) {
                        toast.error('Failed to copy PIN');
                      }
                    }}
                    className="bg-primary-100 hover:bg-primary-200 text-primary-700"
                    title="Copy PIN"
                  >
                    {copiedSuccessPin ? (
                      <IconCheck className="w-5 h-5 text-green-600" />
                    ) : (
                      <IconCopy className="w-5 h-5" />
                    )}
                  </Button>
                </div>
                {copiedSuccessPin && (
                  <p className="text-xs text-green-600 mt-2">PIN copied to clipboard!</p>
                )}
              </div>
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={() => { setShowSuccessDialog(false); setCreatedStudent(null); setCopiedSuccessPin(false); }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

export default StudentsPage;
