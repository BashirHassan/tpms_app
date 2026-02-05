/**
 * Multiposting Page (Admin)
 * Create multiple supervisor postings in a single batch operation
 * Mirrors the legacy system's multiposting experience
 * 
 * Access Control:
 * - Super Admin / Head of TP: Full access to all supervisors
 * - Deans (with allocation): Access only to supervisors in their faculty
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { postingsApi, sessionsApi, deanAllocationsApi, autoPostingApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Select';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { Dialog } from '../../components/ui/Dialog';
import AutoPostDialog from '../../components/AutoPostDialog';
import {
  IconUsers,
  IconBuildingBank as IconSchool,
  IconPlus,
  IconTrash,
  IconCheck,
  IconX,
  IconAlertCircle,
  IconCircleCheck,
  IconLoader2,
  IconEye,
  IconSend,
  IconRefresh,
  IconCrown,
  IconList,
  IconWand,
} from '@tabler/icons-react';
import { formatCurrency, getOrdinal } from '../../utils/helpers';

// Calculate total allowance for a supervisor
// Note: tetfund is only counted once per session regardless of multiple postings
const calculateSupervisorTotalAllowance = (supervisor) => {
  const postingCount = supervisor.current_visits || 0;
  if (postingCount === 0) return 0;
  
  // Get rate values from supervisor (these come from their rank)
  const localRunning = parseFloat(supervisor.local_running_allowance) || 0;
  const transport = parseFloat(supervisor.transport_per_km) || 0;
  const dsa = parseFloat(supervisor.dsa) || 0;
  const dta = parseFloat(supervisor.dta) || 0;
  const tetfund = parseFloat(supervisor.tetfund) || 0;
  
  // For display purposes, we show a simplified estimate
  // The actual total from postings would need to come from the backend
  // This shows the rank rates as an indicator
  return supervisor.total_allowance || 0;
};

// Custom renderers for SearchableSelect
const renderSupervisorOption = (supervisor, { isSelected }) => {
  const primaryPostings = supervisor.current_visits || 0;
  const totalAllowance = supervisor.total_allowance || 0;
  
  return (
    <div className="min-w-0">
      <div className={`font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
        {supervisor.fullname || supervisor.name}
      </div>
      <div className="flex items-center gap-1 mt-0 text-xs text-gray-500">
        <span className="text-primary-600 font-medium whitespace-nowrap">
          {primaryPostings} posting{primaryPostings !== 1 ? 's' : ''}
        </span>
        {totalAllowance > 0 && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-green-600 font-medium">{formatCurrency(totalAllowance)}</span>
          </>
        )}
        {supervisor.rank_code && (
          <>
            <span className="text-gray-400">•</span>
            <span>{supervisor.rank_code}</span>
          </>
        )}
      </div>
    </div>
  );
};

const renderSupervisorSelected = (supervisor) => (
  <div className="min-w-0">
    <div className="font-medium truncate text-gray-900">{supervisor.fullname || supervisor.name}</div>
  </div>
);

const renderSchoolOption = (school, { isSelected }) => {
  const totalSlots = school.total_available_slots || 0;
  const slotLabel = totalSlots === 1 
    ? '1 slot available'
    : `${totalSlots} slots available`;
  
  return (
    <div className="min-w-0">
      <div className={`font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
        {school.school_name}
      </div>
      <div className="flex items-center gap-1 mt-0 text-xs text-gray-500">
        <span className="text-green-600 font-medium whitespace-nowrap">{slotLabel}</span>
        {school.route_name && (
          <>
            <span className="text-gray-400">•</span>
            <span className="text-primary-600 font-medium whitespace-nowrap">{school.route_name}</span>
          </>
        )}
        {school.distance_km && (
          <>
            <span className="text-gray-400">•</span>
            <span>{school.distance_km} km</span>
          </>
        )}
      </div>
    </div>
  );
};

const renderSchoolSelected = (school) => (
  <div className="min-w-0">
    <div className="font-medium truncate text-gray-900">{school.school_name}</div>
  </div>
);

// Row component for each posting entry
function PostingRow({
  rowNumber,
  rowId,
  data,
  supervisors,
  schools,
  sessionId,
  maxSupervisionVisits = 3,
  allRows,
  onUpdate,
  onRemove,
  canRemove,
}) {
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [lastValidated, setLastValidated] = useState('');

  // Get selected group's available visits
  const selectedGroup = useMemo(() => {
    if (!data.group_number) return null;
    return groups.find(g => g.group_number?.toString() === data.group_number?.toString());
  }, [groups, data.group_number]);

  // Calculate which visits are still available for the selected group, considering other rows in batch
  const computedAvailableVisits = useMemo(() => {
    if (!data.school_id || !data.group_number || !selectedGroup) return [];
    
    // Start with the API-provided available visits for this group
    let baseAvailable = selectedGroup.available_visits 
      ? [...selectedGroup.available_visits] 
      : Array.from({ length: maxSupervisionVisits }, (_, i) => i + 1);
    
    // Find the index of the current row
    const currentIndex = allRows.findIndex((r) => r.id === rowId);
    
    // Filter out visits that are already selected by EARLIER rows in the batch for the same school + group
    allRows.slice(0, currentIndex).forEach((row) => {
      if (row.school_id?.toString() === data.school_id?.toString() && 
          row.group_number?.toString() === data.group_number?.toString() && 
          row.visit_number) {
        baseAvailable = baseAvailable.filter(v => v.toString() !== row.visit_number.toString());
      }
    });
    
    return baseAvailable;
  }, [selectedGroup, allRows, data.school_id, data.group_number, rowId, maxSupervisionVisits]);

  // Load groups when school changes
  const handleSchoolChange = async (schoolId) => {
    onUpdate({ school_id: schoolId, group_number: '', visit_number: '', validation: null });
    setValidation(null);
    setLastValidated('');

    if (!schoolId) {
      setGroups([]);
      return;
    }

    setLoadingGroups(true);
    try {
      // Use postingsApi.getSchoolGroups which excludes merged/secondary groups
      // Now returns groups with per-group available_visits
      const response = await postingsApi.getSchoolGroups(schoolId, sessionId);
      const groupsData = response.data?.data || response.data || [];
      setGroups(groupsData);
    } catch (err) {
      console.error('Failed to load groups:', err);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  // Clear visit when group changes (since available visits are per-group)
  const handleGroupChange = (groupNumber) => {
    onUpdate({ group_number: groupNumber, visit_number: '', validation: null });
    setValidation(null);
    setLastValidated('');
  };

  // Check for duplicates within the batch (school + group + visit is a duplicate)
  const checkBatchDuplicates = () => {
    if (!data.school_id || !data.group_number || !data.visit_number) {
      return null;
    }

    // Find the index of the current row
    const currentIndex = allRows.findIndex((r) => r.id === rowId);

    // Only check rows that come BEFORE this row (so first row never shows duplicate error)
    // Duplicate = same school + group + visit
    const duplicateRow = allRows.slice(0, currentIndex).find((row) => 
      row.school_id && row.group_number && row.visit_number &&
      row.school_id.toString() === data.school_id.toString() &&
      row.group_number.toString() === data.group_number.toString() &&
      row.visit_number.toString() === data.visit_number.toString()
    );

    if (duplicateRow) {
      const duplicateIndex = allRows.findIndex((r) => r.id === duplicateRow.id) + 1;
      return `Duplicate posting - same school, group and visit as Row #${duplicateIndex}`;
    }

    return null;
  };

  // Create validation key for current data
  const currentValidationKey = `${data.supervisor_id}_${data.school_id}_${data.group_number}_${data.visit_number}`;

  // Create a stable key for batch duplicate checking (school + group + visit)
  const allRowsKey = useMemo(() => {
    return allRows.map(r => `${r.id}_${r.school_id}_${r.group_number}_${r.visit_number}`).join('|');
  }, [allRows]);

  // Trigger validation on field changes
  useEffect(() => {
    // Skip if any required field is missing
    if (!data.supervisor_id || !data.school_id || !data.group_number || !data.visit_number) {
      setValidation(null);
      setLastValidated('');
      return;
    }

    // First check for batch duplicates (no API call needed)
    const batchDuplicateError = checkBatchDuplicates();
    if (batchDuplicateError) {
      const errorResult = { valid: false, errors: [batchDuplicateError] };
      setValidation(errorResult);
      setLastValidated(''); // Clear so it re-validates when duplicate is resolved
      onUpdate({ validation: errorResult });
      return;
    }

    // Skip DB validation if we already validated this exact combination
    if (currentValidationKey === lastValidated) {
      return;
    }

    const timer = setTimeout(async () => {
      setValidating(true);
      try {
        const response = await postingsApi.validatePosting({
          supervisor_id: data.supervisor_id,
          school_id: data.school_id,
          group_number: parseInt(data.group_number),
          visit_number: parseInt(data.visit_number),
          session_id: sessionId,
        });

        const validationData = response.data.data || response.data || {};
        setValidation(validationData);
        setLastValidated(currentValidationKey);
        onUpdate({ validation: validationData });
      } catch (err) {
        const errorResult = { valid: false, errors: ['Validation failed'] };
        setValidation(errorResult);
        setLastValidated(''); // Clear so user can retry
        onUpdate({ validation: errorResult });
      } finally {
        setValidating(false);
      }
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValidationKey, sessionId, allRowsKey]);

  // Get validation status styling
  const getValidationStyles = () => {
    if (!validation) {
      return {
        container: 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm',
        badge: 'bg-gray-100 text-gray-600',
        indicator: null,
      };
    }
    if (validation.valid) {
      return {
        container: 'bg-green-50/50 border-green-300 shadow-sm shadow-green-100',
        badge: 'bg-green-100 text-green-700',
        indicator: 'bg-green-500',
      };
    }
    return {
      container: 'bg-red-50/50 border-red-300 shadow-sm shadow-red-100',
      badge: 'bg-red-100 text-red-700',
      indicator: 'bg-red-500',
    };
  };

  const styles = getValidationStyles();

  return (
    <div className={`group relative rounded-xl border-2 transition-all duration-200 ${styles.container}`}>
      {/* Status indicator line */}
      {styles.indicator && (
        <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-full ${styles.indicator}`} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${styles.badge}`}>
            {rowNumber}
          </span>
          <div className="flex items-center gap-2">
            {validating && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                <IconLoader2 className="w-3 h-3 animate-spin" />
                Validating
              </span>
            )}
            {!validating && validation?.valid && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                <IconCircleCheck className="w-3.5 h-3.5" />
                Valid
              </span>
            )}
            {!validating && validation && !validation.valid && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                <IconAlertCircle className="w-3.5 h-3.5" />
                Invalid
              </span>
            )}
          </div>
        </div>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 focus:opacity-100"
            title="Remove posting"
          >
            <IconTrash className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Form Fields */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Supervisor */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <IconUsers className="w-4 h-4 text-gray-400" />
              Supervisor
            </label>
            <SearchableSelect
              options={supervisors}
              value={data.supervisor_id || ''}
              onChange={(value) => onUpdate({ supervisor_id: value })}
              placeholder="Select supervisor..."
              searchPlaceholder="Search supervisors..."
              getOptionValue={(s) => s.id}
              getOptionLabel={(s) => s.fullname || s.name}
              renderOption={renderSupervisorOption}
              renderSelected={renderSupervisorSelected}
              maxDisplayed={100}
            />
          </div>

          {/* School */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <IconSchool className="w-4 h-4 text-gray-400" />
              School
            </label>
            <SearchableSelect
              options={schools}
              value={data.school_id || ''}
              onChange={(value) => handleSchoolChange(value)}
              placeholder="Select school..."
              searchPlaceholder="Search schools..."
              getOptionValue={(s) => s.school_id}
              getOptionLabel={(s) => s.school_name}
              renderOption={renderSchoolOption}
              renderSelected={renderSchoolSelected}
              maxDisplayed={100}
            />
          </div>

          {/* Group */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Group</label>
            <Select
              value={data.group_number || ''}
              onChange={(e) => handleGroupChange(e.target.value)}
              disabled={!data.school_id || loadingGroups}
              className="w-full"
            >
              <option value="">
                {loadingGroups ? 'Loading groups...' : groups.length > 0 ? 'Select group' : 'No groups available'}
              </option>
              {groups.map((g) => (
                <option key={g.group_number} value={g.group_number}>
                  Group {g.group_number} ({g.student_count} students) - {g.available_visits?.length || 0} visits available
                </option>
              ))}
            </Select>
          </div>

          {/* Visit */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Visit</label>
            <Select
              value={data.visit_number || ''}
              onChange={(e) => onUpdate({ visit_number: e.target.value })}
              disabled={!data.group_number || computedAvailableVisits.length === 0}
              className="w-full"
            >
              <option value="">
                {!data.group_number 
                  ? 'Select group first' 
                  : computedAvailableVisits.length === 0 
                    ? 'All visits assigned' 
                    : 'Select visit'}
              </option>
              {computedAvailableVisits.map((visitNum) => (
                <option key={visitNum} value={visitNum}>
                  {getOrdinal(visitNum)} Visit
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Validation Error Messages */}
        {!validating && validation && !validation.valid && validation.errors?.length > 0 && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
            <div className="space-y-1">
              {validation.errors.map((error, i) => (
                <div key={i} className="flex items-start gap-2 text-red-700 text-sm">
                  <IconX className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MultipostingPage() {
  const { hasRole, user } = useAuth();
  const { toast } = useToast();
  const isAdminLevel = hasRole(['super_admin', 'head_of_teaching_practice']);
  
  // Dean allocation state
  const [deanAllocation, setDeanAllocation] = useState(null);
  const [loadingAllocation, setLoadingAllocation] = useState(true);
  
  // Determine if user can access this page (admin level or dean with allocation)
  const isDean = user?.is_dean === 1 || user?.is_dean === true;
  // A dean can VIEW the page if they have any allocation (even if exhausted)
  const hasDeanAccess = isDean && deanAllocation;
  // A dean can EDIT (create postings) only if they have remaining allocation
  const hasRemainingAllocation = deanAllocation && deanAllocation.allocated_postings > deanAllocation.used_postings;
  const canEdit = isAdminLevel || hasRemainingAllocation;
  // For read-only mode: dean has allocation but exhausted it
  const isReadOnlyMode = isDean && deanAllocation && !hasRemainingAllocation;
  
  // Get faculty_id filter for dean users
  const facultyIdFilter = !isAdminLevel && isDean ? deanAllocation?.faculty_id : null;

  // State
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [maxSupervisionVisits, setMaxSupervisionVisits] = useState(3);
  const [supervisors, setSupervisors] = useState([]);
  const [schools, setSchools] = useState([]);

  // Posting rows
  const [rows, setRows] = useState([createEmptyRow(1)]);
  const [rowCounter, setRowCounter] = useState(1);

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData] = useState([]);

  // Success modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Auto-posting dialog
  const [showAutoPostDialog, setShowAutoPostDialog] = useState(false);

  // Create empty row
  function createEmptyRow(id) {
    return {
      id,
      supervisor_id: '',
      school_id: '',
      group_number: '',
      visit_number: '',
      validation: null,
    };
  }

  // Fetch dean allocation for non-admin users
  useEffect(() => {
    const fetchDeanAllocation = async () => {
      if (isAdminLevel) {
        setLoadingAllocation(false);
        return;
      }
      
      try {
        const response = await deanAllocationsApi.getMyAllocation();
        setDeanAllocation(response.data.data);
      } catch (err) {
        console.error('Failed to fetch dean allocation:', err);
      } finally {
        setLoadingAllocation(false);
      }
    };
    
    fetchDeanAllocation();
  }, [isAdminLevel]);

  // Fetch sessions
  useEffect(() => {
    if (!loadingAllocation) {
      fetchSessions();
    }
  }, [loadingAllocation]);

  // Fetch data when session changes
  useEffect(() => {
    if (selectedSession && !loadingAllocation) {
      fetchData();
      // Update max supervision visits when session changes
      const session = sessions.find((s) => s.id.toString() === selectedSession);
      if (session) {
        setMaxSupervisionVisits(session.max_supervision_visits || 3);
      }
    }
  }, [selectedSession, sessions, loadingAllocation]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
      if (current) {
        setSelectedSession(current.id.toString());
        setMaxSupervisionVisits(current.max_supervision_visits || 3);
      }
    } catch (err) {
      toast.error('Failed to load sessions');
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [supervisorsRes, schoolsRes] = await Promise.all([
        // Pass faculty_id filter for deans
        postingsApi.getSupervisorsForPosting(selectedSession, facultyIdFilter),
        postingsApi.getSchoolsWithGroups(selectedSession),
      ]);
      setSupervisors(supervisorsRes.data.data || []);
      setSchools(schoolsRes.data.data || []);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Add new row
  const addRow = () => {
    // For deans, check allocation limit
    if (!isAdminLevel && deanAllocation) {
      const remainingAllocation = deanAllocation.allocated_postings - deanAllocation.used_postings;
      if (rows.length >= remainingAllocation) {
        toast.warning(`You can only create ${remainingAllocation} more posting(s) based on your allocation`);
        return;
      }
    }
    
    const newId = rowCounter + 1;
    setRowCounter(newId);
    setRows([...rows, createEmptyRow(newId)]);
  };

  // Remove row
  const removeRow = (id) => {
    if (rows.length <= 1) {
      toast.warning('At least one posting row is required');
      return;
    }
    setRows(rows.filter((r) => r.id !== id));
  };

  // Update row
  const updateRow = (id, updates) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  // Validate all rows
  const validateAllRows = () => {
    const errors = [];
    const validPostings = [];

    rows.forEach((row, index) => {
      const rowNum = index + 1;

      // Check required fields
      if (!row.supervisor_id || !row.school_id || !row.group_number || !row.visit_number) {
        errors.push(`Row ${rowNum}: All fields are required`);
        return;
      }

      // Check validation status
      if (row.validation && !row.validation.valid) {
        errors.push(`Row ${rowNum}: ${row.validation.errors?.join(', ') || 'Invalid posting'}`);
        return;
      }

      // Check for duplicates within batch (school + group + visit is duplicate)
      const key = `${row.school_id}_${row.group_number}_${row.visit_number}`;
      const duplicate = validPostings.find((p) => p.key === key);
      if (duplicate) {
        errors.push(`Row ${rowNum}: Duplicate posting (same school, group and visit as Row ${duplicate.rowNum})`);
        return;
      }

      // Get supervisor and school names for review
      const supervisor = supervisors.find((s) => s.id.toString() === row.supervisor_id.toString());
      const school = schools.find((s) => s.school_id.toString() === row.school_id.toString());

      validPostings.push({
        ...row,
        key,
        rowNum,
        supervisor_name: supervisor?.fullname || supervisor?.name || 'Unknown',
        school_name: school?.school_name || 'Unknown',
      });
    });

    return { valid: errors.length === 0, errors, validPostings };
  };

  // Open review modal
  const handleReview = () => {
    const result = validateAllRows();

    if (!result.valid) {
      toast.error(
        <div>
          <strong>Validation Errors:</strong>
          <ul className="mt-2 list-disc list-inside">
            {result.errors.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {result.errors.length > 5 && <p className="mt-2">...and {result.errors.length - 5} more</p>}
        </div>
      );
      return;
    }

    setReviewData(result.validPostings);
    setShowReviewModal(true);
  };

  // Submit postings
  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const postingsToSubmit = reviewData.map((row) => ({
        supervisor_id: parseInt(row.supervisor_id),
        school_id: parseInt(row.school_id),
        group_number: parseInt(row.group_number),
        visit_number: parseInt(row.visit_number),
      }));

      const response = await postingsApi.createMultiPostings(selectedSession, postingsToSubmit);

      const responseData = response.data.data || response.data || {};
      const { successful = [], failed = [], summary = {} } = responseData;

      setShowReviewModal(false);

      // Store success data for the modal
      setSuccessData({
        successful,
        failed,
        summary,
        reviewData: [...reviewData], // Keep a copy for display
      });
      setShowSuccessModal(true);

      // Reset rows if all successful
      if (summary.failed === 0) {
        setRowCounter(1);
        setRows([createEmptyRow(1)]);
      } else {
        // Remove successful rows, keep failed ones
        const failedSchoolIds = failed.map((f) => f.school_id);
        const failedRows = rows.filter((r) => failedSchoolIds.includes(parseInt(r.school_id)));
        if (failedRows.length > 0) {
          setRows(failedRows);
        } else {
          setRowCounter(1);
          setRows([createEmptyRow(1)]);
        }
      }

      // Refresh supervisor data to update posting counts
      fetchData();
      
      // Refresh dean allocation if applicable
      if (!isAdminLevel && isDean) {
        try {
          const allocationRes = await deanAllocationsApi.getMyAllocation();
          setDeanAllocation(allocationRes.data.data);
        } catch (err) {
          console.error('Failed to refresh dean allocation:', err);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create postings');
    } finally {
      setProcessing(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableRows = useMemo(() => rows, [JSON.stringify(rows.map(r => ({ id: r.id, school_id: r.school_id, group_number: r.group_number, visit_number: r.visit_number })))]);

  // Column definitions for review table
  const reviewTableColumns = useMemo(() => [
    {
      header: 'Row #',
      accessor: 'rowNum',
      width: '80px',
    },
    {
      header: 'School',
      accessor: 'school_name',
    },
    {
      header: 'Group',
      accessor: 'group_number',
      formatter: (value) => `Group ${value}`,
    },
    {
      header: 'Visit',
      accessor: 'visit_number',
      formatter: (value) => `${getOrdinal(value)} Visit`,
    },
  ], []);

  // Group postings by supervisor for review
  const groupBySuper = (postings) => {
    const groups = {};
    postings.forEach((p) => {
      if (!groups[p.supervisor_id]) {
        groups[p.supervisor_id] = {
          supervisor_name: p.supervisor_name,
          postings: [],
        };
      }
      groups[p.supervisor_id].postings.push(p);
    });
    return Object.values(groups);
  };

  // Non-admin, non-dean users cannot access at all
  if (!isAdminLevel && !isDean) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">You don't have permission to access this page.</p>
      </div>
    );
  }

  // Show loading while checking dean allocation
  if (loadingAllocation) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <IconLoader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto" />
          <p className="text-gray-500 mt-2">Checking access...</p>
        </div>
      </div>
    );
  }

  // Show access denied only for deans who have NO allocation at all
  if (!isAdminLevel && isDean && !deanAllocation) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
              <IconCrown className="w-8 h-8 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Dean Access Required</h2>
            <p className="text-gray-600 mb-4">
              You are a dean but have not been allocated any postings for this session. Please contact the Head of Teaching Practice.
            </p>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Read-Only Mode Warning (Exhausted Allocation) */}
      {isReadOnlyMode && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <IconAlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-red-800">
                  Allocation Exhausted
                </p>
                <p className="text-sm text-red-600">
                  You have used all {deanAllocation.allocated_postings} allocated posting(s). 
                </p>
              </div>
              <Link to="/admin/dean-postings">
                <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100">
                  <IconList className="w-4 h-4 mr-2" />
                  View My Postings
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dean Allocation Banner (Active Allocation) */}
      {!isAdminLevel && deanAllocation && !isReadOnlyMode && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <IconCrown className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-800">
                  Dean Posting Mode - {deanAllocation.faculty_name || 'Your Faculty'}
                </p>
                <p className="text-sm text-amber-600">
                  Allocation: {deanAllocation.used_postings} / {deanAllocation.allocated_postings} used 
                  • {deanAllocation.allocated_postings - deanAllocation.used_postings} remaining
                </p>
              </div>
              <Link to="/admin/dean-postings">
                <Button variant="outline" size="sm" className="border-amber-300 text-amber-700 hover:bg-amber-100">
                  <IconList className="w-4 h-4 mr-2" />
                  My Postings
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Multiposting</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">
            Create multiple supervisor postings in a single batch
            {!isAdminLevel && deanAllocation?.faculty_name && (
              <span className="text-amber-600 ml-1">• {deanAllocation.faculty_name} supervisors only</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" onClick={fetchData} disabled={loading} className="active:scale-95">
            <IconRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {/* Auto-Post button - only for admin-level users */}
          {isAdminLevel && !isReadOnlyMode && (
            <Button 
              variant="outline" 
              onClick={() => setShowAutoPostDialog(true)}
              disabled={loading || !selectedSession}
              className="flex whitespace-nowrap"
              title="Auto-post supervisors"
            >
              <IconWand className="w-4 h-4 mr-2" />
              Auto-Post
            </Button>
          )}
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

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <IconUsers className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold">{supervisors.length}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Supervisors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                <IconSchool className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold">{schools.length}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">Schools</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <IconPlus className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-bold">{rows.length}</p>
                <p className="text-[10px] sm:text-sm text-gray-500 truncate">In Batch</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Posting Rows */}
      <Card>
        <CardHeader className="border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Posting Entries</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {isReadOnlyMode 
                  ? 'Your allocation is exhausted. View your existing postings or request additional allocation.'
                  : 'Fill in each posting with supervisor, school, group and visit details'
                }
              </p>
            </div>
            {!isReadOnlyMode && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {rows.filter(r => r.validation?.valid).length} of {rows.length} valid
                </span>
                <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-300 rounded-full"
                    style={{ width: `${rows.length > 0 ? (rows.filter(r => r.validation?.valid).length / rows.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {isReadOnlyMode ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <IconAlertCircle className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Allocation Exhausted</h3>
              <p className="text-gray-500 mb-4 max-w-md mx-auto">
                You have used all {deanAllocation?.allocated_postings || 0} allocated posting(s). 
                Contact the Head of Teaching Practice for additional allocation.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Link to="/admin/dean-postings">
                  <Button variant="outline">
                    <IconList className="w-4 h-4 mr-2" />
                    View My Postings
                  </Button>
                </Link>
              </div>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <IconLoader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
              <p className="text-gray-500 font-medium">Loading supervisors and schools...</p>
              <p className="text-sm text-gray-400 mt-1">Please wait a moment</p>
            </div>
          ) : (
            <>
              <div className="space-y-4  pr-2 -mr-2">
                {rows.map((row, index) => (
                  <PostingRow
                    key={row.id}
                    rowId={row.id}
                    rowNumber={index + 1}
                    data={row}
                    supervisors={supervisors}
                    schools={schools}
                    sessionId={selectedSession}
                    maxSupervisionVisits={maxSupervisionVisits}
                    allRows={stableRows}
                    onUpdate={(updates) => updateRow(row.id, updates)}
                    onRemove={() => removeRow(row.id)}
                    canRemove={rows.length > 1}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-100">
                <Button 
                  variant="outline" 
                  onClick={addRow}
                  className="border-dashed border-2 hover:border-primary-400 hover:bg-primary-50"
                >
                  <IconPlus className="w-4 h-4 mr-2" />
                  Add Another Posting
                </Button>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {rows.length} posting{rows.length !== 1 ? 's' : ''} in batch
                  </span>
                  <Button 
                    onClick={handleReview} 
                    disabled={rows.length === 0 || rows.filter(r => r.validation?.valid).length === 0}
                  >
                    <IconEye className="w-4 h-4 mr-2" />
                    Review & Submit
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Review Modal */}
      <Dialog
        isOpen={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        title="Review Postings"
        width="3xl"
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" onClick={() => setShowReviewModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={processing}>
              {processing ? (
                <>
                  <IconLoader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <IconSend className="w-4 h-4 mr-2" />
                  Confirm & Post All
                </>
              )}
            </Button>
          </div>
        }
      >
        {/* Summary */}
        <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-4">
          <strong>Summary:</strong> {reviewData.length} posting(s) for{' '}
          {groupBySuper(reviewData).length} supervisor(s)
        </div>

        {/* Grouped by supervisor */}
        {groupBySuper(reviewData).map((group, gi) => (
          <div key={gi} className="border rounded-lg mb-4">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <IconUsers className="w-4 h-4" />
                <span className="font-semibold">{group.supervisor_name}</span>
                <Badge>{group.postings.length} posting(s)</Badge>
              </div>
            </div>
            <DataTable
              data={group.postings}
              columns={reviewTableColumns}
              keyField="rowNum"
              size="sm"
              sortable={false}
              exportable={false}
              emptyTitle="No postings"
            />
          </div>
        ))}

        {/* Warning */}
        <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg mt-4">
          <div className="flex items-start gap-2">
            <IconAlertCircle className="w-5 h-5 mt-0.5" />
            <div>
              <strong>Important:</strong> Some postings may automatically create additional
              dependent route postings for merged groups. This is normal behavior.
            </div>
          </div>
        </div>
      </Dialog>

      {/* Success Modal */}
      <Dialog
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Posting Complete"
        width="4xl"
        footer={
          <div className="flex items-center justify-end">
            <Button onClick={() => setShowSuccessModal(false)}>
              <IconCheck className="w-4 h-4 mr-2" />
              Done
            </Button>
          </div>
        }
      >
        {successData && (
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <IconCircleCheck className="w-6 h-6 text-green-600" />
                  <span className="text-3xl font-bold text-green-700">
                    {successData.summary.successful || 0}
                  </span>
                </div>
                <p className="text-sm text-green-600 font-medium">Primary Postings</p>
              </div>
              {(successData.summary.dependent_created > 0 || successData.dependent_postings?.length > 0) && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <IconCircleCheck className="w-6 h-6 text-purple-600" />
                    <span className="text-3xl font-bold text-purple-700">
                      {successData.summary.dependent_created || successData.dependent_postings?.length || 0}
                    </span>
                  </div>
                  <p className="text-sm text-purple-600 font-medium">Merged Group Postings</p>
                </div>
              )}
              {successData.summary.failed > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <IconAlertCircle className="w-6 h-6 text-red-600" />
                    <span className="text-3xl font-bold text-red-700">
                      {successData.summary.failed}
                    </span>
                  </div>
                  <p className="text-sm text-red-600 font-medium">Failed Postings</p>
                </div>
              )}
            </div>

            {/* Successful Postings List */}
            {successData.successful && successData.successful.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-50 px-4 py-3 border-b border-green-200">
                  <div className="flex items-center gap-2 text-green-800">
                    <IconCircleCheck className="w-4 h-4" />
                    <span className="font-semibold">Successfully Created</span>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Supervisor</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">School</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Group</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Visit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {successData.successful.map((posting, idx) => {
                        // Find matching review data for display names
                        const reviewItem = successData.reviewData?.find(
                          (r) =>
                            r.supervisor_id?.toString() === posting.supervisor_id?.toString() &&
                            r.school_id?.toString() === posting.school_id?.toString() &&
                            r.group_number?.toString() === posting.group_number?.toString()
                        );
                        return (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              {posting.supervisor_name || reviewItem?.supervisor_name || 'N/A'}
                            </td>
                            <td className="px-4 py-2">
                              {posting.school_name || reviewItem?.school_name || 'N/A'}
                            </td>
                            <td className="px-4 py-2">Group {posting.group_number}</td>
                            <td className="px-4 py-2">{getOrdinal(posting.visit_number)} Visit</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Failed Postings List */}
            {successData.failed && successData.failed.length > 0 && (
              <div className="border border-red-200 rounded-lg overflow-hidden">
                <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                  <div className="flex items-center gap-2 text-red-800">
                    <IconAlertCircle className="w-4 h-4" />
                    <span className="font-semibold">Failed to Create</span>
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <div className="divide-y divide-red-100">
                    {successData.failed.map((posting, idx) => (
                      <div key={idx} className="px-4 py-3 bg-red-50/50">
                        <div className="flex items-start gap-2">
                          <IconX className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {posting.school_name || `School ID: ${posting.school_id}`} - Group {posting.group_number}
                            </p>
                            <p className="text-sm text-red-600 mt-0.5">{posting.error || 'Unknown error'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Dependent/Merged Group Postings */}
            {successData.dependent_postings && successData.dependent_postings.length > 0 && (
              <div className="border border-purple-200 rounded-lg overflow-hidden">
                <div className="bg-purple-50 px-4 py-3 border-b border-purple-200">
                  <div className="flex items-center gap-2 text-purple-800">
                    <IconCircleCheck className="w-4 h-4" />
                    <span className="font-semibold">Auto-created Merged Group Postings</span>
                    <Badge variant="info" className="ml-2">No Allowance</Badge>
                  </div>
                </div>
                <div className="max-h-36 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Merged School</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Group</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Visit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {successData.dependent_postings.map((posting, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/50">
                          <td className="px-4 py-2">{posting.school_name || `School ID: ${posting.school_id}`}</td>
                          <td className="px-4 py-2">Group {posting.group_number}</td>
                          <td className="px-4 py-2">{getOrdinal(posting.visit_number)} Visit</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bg-purple-50 px-4 py-2 border-t border-purple-200 text-xs text-purple-700">
                  These postings were automatically created for merged groups. They don't receive separate allowances.
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Auto-Post Dialog */}
      <AutoPostDialog
        open={showAutoPostDialog}
        onClose={() => setShowAutoPostDialog(false)}
        sessionId={selectedSession ? parseInt(selectedSession) : null}
        maxVisits={maxSupervisionVisits}
        facultyId={facultyIdFilter}
        onComplete={() => {
          // Refresh data after auto-posting completes
          fetchData();
        }}
      />
    </div>
  );
}

export default MultipostingPage;
