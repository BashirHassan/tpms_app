/**
 * Admin Results Management Page
 * Teaching Practice Head page to manage student results
 * Allows creating/editing results for any student across all visits
 * 
 * UI Pattern: Based on SupervisorResultUploadPage with admin capabilities
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { resultsApi, sessionsApi, groupsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  IconUsers,
  IconClipboardCheck,
  IconRefresh,
  IconDeviceFloppy,
  IconChartBar,
  IconCheck,
  IconX,
  IconCalendar,
  IconSchool,
  IconFilter,
  IconEdit,
  IconListDetails,
  IconAlertCircle,
  IconSettings,
  IconPlus,
  IconTrash,
  IconGripVertical,
  IconArrowBack,
} from '@tabler/icons-react';
import { getOrdinal } from '../../utils/helpers';

function AdminResultsPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Sessions
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);

  // Schools filter
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('all');

  // Students & Scoring
  const [students, setStudents] = useState([]);
  const [scoringCriteria, setScoringCriteria] = useState([]);
  const [totalMaxScore, setTotalMaxScore] = useState(100);
  const [maxVisits, setMaxVisits] = useState(3);

  // Scoring Mode is now derived from session settings
  const scoringType = sessionInfo?.scoring_type || 'basic';

  // Pending Changes: { `${student_id}-${visit_number}`: { total_score, score_breakdown } }
  const [pendingChanges, setPendingChanges] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });

  // Statistics
  const [statistics, setStatistics] = useState(null);

  // Advanced Scoring Dialog
  const [advancedDialogOpen, setAdvancedDialogOpen] = useState(false);
  const [advancedDialogData, setAdvancedDialogData] = useState(null); // { student, visitNumber }
  const [dialogBreakdown, setDialogBreakdown] = useState({});

  // Criteria Management Dialog
  // dialogMode: 'list' | 'add' | 'edit'
  const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
  const [criteriaDialogMode, setCriteriaDialogMode] = useState('list');
  const [editingCriterion, setEditingCriterion] = useState(null);
  const [criteriaFormData, setCriteriaFormData] = useState({
    name: '',
    label: '',
    description: '',
    max_score: 20,
    order_index: 0,
    is_active: true,
  });
  const [criteriaFormErrors, setCriteriaFormErrors] = useState({});
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [deletingCriteriaId, setDeletingCriteriaId] = useState(null);

  // Confirm Dialog state
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    type: null, // 'delete' | 'initialize'
    criterionId: null,
  });

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    fetchSessions();
    fetchScoringCriteria();
  }, []);

  // Fetch schools when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchSchools();
      fetchStudentsWithResults();
    }
  }, [selectedSession]);

  // Refetch when filters change
  useEffect(() => {
    if (selectedSession) {
      fetchStudentsWithResults();
    }
  }, [selectedSchool, pagination.page, searchTerm]);

  // Clear pending changes when session changes
  useEffect(() => {
    setPendingChanges({});
  }, [selectedSession]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll();
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      
      // Select current session by default
      const current = sessionsData.find(s => s.is_current) || sessionsData[0];
      if (current) {
        setSelectedSession(current.id.toString());
        setSessionInfo(current);
        setMaxVisits(current.max_supervision_visits || 3);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
      toast.error('Failed to load sessions');
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchSchools = async () => {
    try {
      const response = await groupsApi.getSummary(selectedSession);
      const summary = response.data?.data || response.data || [];
      
      // Get unique schools
      const schoolMap = new Map();
      summary.forEach(item => {
        if (!schoolMap.has(item.institution_school_id)) {
          schoolMap.set(item.institution_school_id, {
            id: item.institution_school_id,
            name: item.school_name,
            student_count: item.student_count,
          });
        }
      });
      setSchools(Array.from(schoolMap.values()));
    } catch (err) {
      console.error('Failed to load schools:', err);
    }
  };

  const fetchScoringCriteria = async () => {
    try {
      const response = await resultsApi.getScoringCriteria();
      setScoringCriteria(response.data.data || response.data || []);
      setTotalMaxScore(parseFloat(response.data.totalMaxScore) || 100);
    } catch (err) {
      console.error('Failed to load scoring criteria:', err);
    }
  };

  const fetchStudentsWithResults = async () => {
    if (!selectedSession) return;

    setLoading(true);
    try {
      const params = {
        session_id: selectedSession,
        page: pagination.page,
        limit: pagination.limit,
      };

      if (selectedSchool && selectedSchool !== 'all') {
        params.school_id = selectedSchool;
      }

      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await resultsApi.getAdminStudentsWithResults(params);
      const data = response.data.data || response.data || {};

      setStudents(data.data || []);
      setMaxVisits(data.maxVisits || 3);
      setPagination(prev => ({
        ...prev,
        total: parseInt(data.pagination?.total) || 0,
        pages: parseInt(data.pagination?.pages) || 0,
      }));

      // Update session info with max visits
      if (sessionInfo) {
        setSessionInfo(prev => ({ ...prev, max_supervision_visits: data.maxVisits }));
      }

      // Calculate statistics
      const studentsData = data.data || [];
      const totalStudents = studentsData.length;
      let totalScored = 0;
      let totalScoreSum = 0;
      let scoredCount = 0;

      studentsData.forEach(s => {
        for (let v = 1; v <= data.maxVisits; v++) {
          const visitData = s[`visit_${v}`];
          if (visitData?.has_result) {
            totalScored++;
            totalScoreSum += parseFloat(visitData.total_score) || 0;
            scoredCount++;
          }
        }
      });

      setStatistics({
        total_students: data.pagination?.total || totalStudents,
        total_scored: totalScored,
        average_score: scoredCount > 0 ? (totalScoreSum / scoredCount).toFixed(1) : 0,
        max_visits: data.maxVisits,
      });
    } catch (err) {
      console.error('Failed to load students:', err);
      toast.error('Failed to load students with results');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // SCORE CHANGE HANDLERS
  // ============================================================

  const handleScoreChange = useCallback((studentId, visitNumber, score, studentData) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0) return;

    // Clamp to max score
    const clampedScore = Math.min(numScore, totalMaxScore);
    const changeKey = `${studentId}-${visitNumber}`;

    // Update local state
    setStudents(prev =>
      prev.map(s => {
        if (s.student_id === studentId) {
          return {
            ...s,
            [`visit_${visitNumber}`]: {
              ...s[`visit_${visitNumber}`],
              total_score: clampedScore,
            },
          };
        }
        return s;
      })
    );

    // Track change
    setPendingChanges(prev => ({
      ...prev,
      [changeKey]: {
        student_id: studentId,
        school_id: studentData.school_id,
        group_number: studentData.group_number || 1,
        visit_number: visitNumber,
        total_score: clampedScore,
        scoring_type: 'basic',
      },
    }));
  }, [totalMaxScore]);

  const handleAdvancedScoreChange = useCallback((studentId, visitNumber, criterionId, score, maxScore, studentData) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0) return;

    const clampedScore = Math.min(numScore, maxScore);
    const changeKey = `${studentId}-${visitNumber}`;

    // Get current student data
    const student = students.find(s => s.student_id === studentId);
    const visitData = student?.[`visit_${visitNumber}`] || {};
    const currentBreakdown = pendingChanges[changeKey]?.score_breakdown 
      || visitData.score_breakdown 
      || {};

    const newBreakdown = {
      ...currentBreakdown,
      [criterionId]: clampedScore,
    };

    // Calculate new total
    const newTotal = Object.values(newBreakdown).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

    // Update local state
    setStudents(prev =>
      prev.map(s => {
        if (s.student_id === studentId) {
          return {
            ...s,
            [`visit_${visitNumber}`]: {
              ...s[`visit_${visitNumber}`],
              total_score: newTotal,
              score_breakdown: newBreakdown,
            },
          };
        }
        return s;
      })
    );

    // Track change
    setPendingChanges(prev => ({
      ...prev,
      [changeKey]: {
        student_id: studentId,
        school_id: studentData.school_id,
        group_number: studentData.group_number || 1,
        visit_number: visitNumber,
        total_score: newTotal,
        score_breakdown: newBreakdown,
        scoring_type: 'advanced',
      },
    }));
  }, [students, pendingChanges]);

  // ============================================================
  // SAVE & DISCARD
  // ============================================================

  const saveAllChanges = async () => {
    const changes = Object.values(pendingChanges);
    if (changes.length === 0) {
      toast.info('No changes to save');
      return;
    }

    // Validate advanced scoring
    if (scoringType === 'advanced' && scoringCriteria.length > 0) {
      const incompleteChanges = changes.filter(change => {
        if (change.scoring_type !== 'advanced') return false;
        const breakdown = change.score_breakdown || {};
        return scoringCriteria.some(c => 
          breakdown[c.id] === undefined || breakdown[c.id] === '' || breakdown[c.id] === null
        );
      });

      if (incompleteChanges.length > 0) {
        toast.error('Please fill all criteria for advanced scoring');
        return;
      }
    }

    setSavingChanges(true);

    try {
      const response = await resultsApi.adminBulkSubmitResults(parseInt(selectedSession), changes);
      const { successful, failed } = response.data.data || response.data || {};

      setPendingChanges({});

      if (failed?.length === 0) {
        toast.success(`Successfully saved ${successful?.length || 0} result(s)`);
      } else {
        toast.warning(`Saved ${successful?.length || 0}, failed ${failed?.length || 0}`);
        if (failed?.length > 0) {
          console.error('Failed results:', failed);
        }
      }

      // Refresh data
      fetchStudentsWithResults();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save results');
    } finally {
      setSavingChanges(false);
    }
  };

  const discardChanges = () => {
    setPendingChanges({});
    fetchStudentsWithResults();
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // Check if all criteria are filled for pending advanced changes
  const allAdvancedCriteriaFilled = useMemo(() => {
    if (scoringType !== 'advanced' || scoringCriteria.length === 0) return true;
    
    const advancedChanges = Object.values(pendingChanges).filter(c => c.scoring_type === 'advanced');
    if (advancedChanges.length === 0) return true;
    
    return advancedChanges.every(change => {
      const breakdown = change.score_breakdown || {};
      return scoringCriteria.every(c => 
        breakdown[c.id] !== undefined && breakdown[c.id] !== '' && breakdown[c.id] !== null
      );
    });
  }, [scoringType, scoringCriteria, pendingChanges]);

  // ============================================================
  // ADVANCED SCORING DIALOG HANDLERS
  // ============================================================

  const openAdvancedDialog = (student, visitNumber) => {
    const changeKey = `${student.student_id}-${visitNumber}`;
    const visitData = student[`visit_${visitNumber}`] || {};
    
    // Get existing breakdown from pending changes or visit data
    let existingBreakdown = pendingChanges[changeKey]?.score_breakdown || visitData.score_breakdown || {};
    
    // Parse if it's a JSON string (backend may return string)
    if (typeof existingBreakdown === 'string') {
      try {
        existingBreakdown = JSON.parse(existingBreakdown);
      } catch (e) {
        console.error('Failed to parse score_breakdown:', e);
        existingBreakdown = {};
      }
    }
    
    // Normalize keys to numbers (criterion IDs) for consistent comparison
    const normalizedBreakdown = {};
    if (existingBreakdown && typeof existingBreakdown === 'object') {
      Object.entries(existingBreakdown).forEach(([key, value]) => {
        // Store with numeric key to match criterion.id
        normalizedBreakdown[parseInt(key) || key] = parseFloat(value) || 0;
      });
    }
    
    setAdvancedDialogData({ student, visitNumber });
    setDialogBreakdown({ ...normalizedBreakdown });
    setAdvancedDialogOpen(true);
  };

  const handleDialogCriterionChange = (criterionId, value, maxScore) => {
    const numVal = parseFloat(value);
    if (value === '') {
      const newBd = { ...dialogBreakdown };
      delete newBd[criterionId];
      setDialogBreakdown(newBd);
    } else if (!isNaN(numVal) && numVal >= 0) {
      const clampedScore = Math.min(numVal, maxScore);
      setDialogBreakdown(prev => ({ ...prev, [criterionId]: clampedScore }));
    }
  };

  const isDialogComplete = useMemo(() => {
    if (!advancedDialogData || scoringCriteria.length === 0) return false;
    return scoringCriteria.every(c => 
      dialogBreakdown[c.id] !== undefined && dialogBreakdown[c.id] !== '' && dialogBreakdown[c.id] !== null
    );
  }, [advancedDialogData, scoringCriteria, dialogBreakdown]);

  const dialogTotal = useMemo(() => {
    return Object.values(dialogBreakdown).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  }, [dialogBreakdown]);

  const saveAdvancedDialog = () => {
    if (!advancedDialogData || !isDialogComplete) return;
    
    const { student, visitNumber } = advancedDialogData;
    const changeKey = `${student.student_id}-${visitNumber}`;
    const newTotal = dialogTotal;

    // Update local state
    setStudents(prev =>
      prev.map(s => {
        if (s.student_id === student.student_id) {
          return {
            ...s,
            [`visit_${visitNumber}`]: {
              ...s[`visit_${visitNumber}`],
              total_score: newTotal,
              score_breakdown: { ...dialogBreakdown },
            },
          };
        }
        return s;
      })
    );

    // Track change
    setPendingChanges(prev => ({
      ...prev,
      [changeKey]: {
        student_id: student.student_id,
        school_id: student.school_id,
        group_number: student.group_number || 1,
        visit_number: visitNumber,
        total_score: newTotal,
        score_breakdown: { ...dialogBreakdown },
        scoring_type: 'advanced',
      },
    }));

    setAdvancedDialogOpen(false);
    setAdvancedDialogData(null);
    setDialogBreakdown({});
    toast.success('Score breakdown saved locally');
  };

  const cancelAdvancedDialog = () => {
    setAdvancedDialogOpen(false);
    setAdvancedDialogData(null);
    setDialogBreakdown({});
  };

  // ============================================================
  // CRITERIA MANAGEMENT HANDLERS
  // ============================================================

  const openCriteriaDialog = () => {
    setCriteriaDialogMode('list');
    setCriteriaDialogOpen(true);
    resetCriteriaForm();
  };

  const closeCriteriaDialog = () => {
    setCriteriaDialogOpen(false);
    setCriteriaDialogMode('list');
    resetCriteriaForm();
  };

  const resetCriteriaForm = () => {
    setCriteriaFormData({
      name: '',
      label: '',
      description: '',
      max_score: 20,
      order_index: scoringCriteria.length + 1,
      is_active: true,
    });
    setCriteriaFormErrors({});
    setEditingCriterion(null);
  };

  const startAddCriteria = () => {
    resetCriteriaForm();
    setCriteriaFormData(prev => ({
      ...prev,
      order_index: scoringCriteria.length + 1,
    }));
    setCriteriaDialogMode('add');
  };

  const startEditCriteria = (criterion) => {
    setEditingCriterion(criterion);
    setCriteriaFormData({
      name: criterion.name || '',
      label: criterion.label || '',
      description: criterion.description || '',
      max_score: criterion.max_score || 20,
      order_index: criterion.order_index || 0,
      is_active: criterion.is_active !== 0 && criterion.is_active !== false,
    });
    setCriteriaFormErrors({});
    setCriteriaDialogMode('edit');
  };

  const goBackToList = () => {
    setCriteriaDialogMode('list');
    resetCriteriaForm();
  };

  const validateCriteriaForm = () => {
    const errors = {};
    if (!criteriaFormData.name.trim()) {
      errors.name = 'Name is required';
    } else if (criteriaFormData.name.length > 100) {
      errors.name = 'Name must be 100 characters or less';
    }
    if (!criteriaFormData.label.trim()) {
      errors.label = 'Label is required';
    } else if (criteriaFormData.label.length > 255) {
      errors.label = 'Label must be 255 characters or less';
    }
    if (criteriaFormData.max_score <= 0 || criteriaFormData.max_score > 100) {
      errors.max_score = 'Max score must be between 1 and 100';
    }
    setCriteriaFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCriteriaFormChange = (field, value) => {
    setCriteriaFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (criteriaFormErrors[field]) {
      setCriteriaFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const saveCriteria = async () => {
    if (!validateCriteriaForm()) return;

    setSavingCriteria(true);
    try {
      const payload = {
        name: criteriaFormData.name.trim(),
        label: criteriaFormData.label.trim(),
        description: criteriaFormData.description.trim() || null,
        max_score: parseFloat(criteriaFormData.max_score),
        order_index: parseInt(criteriaFormData.order_index) || 0,
        is_active: criteriaFormData.is_active,
      };

      if (criteriaDialogMode === 'edit' && editingCriterion) {
        await resultsApi.updateCriteria(editingCriterion.id, payload);
        toast.success('Criteria updated successfully');
      } else {
        await resultsApi.createCriteria(payload);
        toast.success('Criteria created successfully');
      }

      // Refresh criteria list
      await fetchScoringCriteria();
      goBackToList();
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to save criteria';
      toast.error(message);
    } finally {
      setSavingCriteria(false);
    }
  };

  const openDeleteConfirm = (criterionId) => {
    setConfirmDialog({
      isOpen: true,
      type: 'delete',
      criterionId,
    });
  };

  const openInitializeConfirm = () => {
    setConfirmDialog({
      isOpen: true,
      type: 'initialize',
      criterionId: null,
    });
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      isOpen: false,
      type: null,
      criterionId: null,
    });
  };

  const handleConfirmAction = async () => {
    const { type, criterionId } = confirmDialog;

    if (type === 'delete' && criterionId) {
      setDeletingCriteriaId(criterionId);
      try {
        await resultsApi.deleteCriteria(criterionId);
        toast.success('Criteria deleted successfully');
        await fetchScoringCriteria();
      } catch (err) {
        const message = err.response?.data?.message || 'Failed to delete criteria';
        toast.error(message);
      } finally {
        setDeletingCriteriaId(null);
      }
    } else if (type === 'initialize') {
      setSavingCriteria(true);
      try {
        await resultsApi.initializeDefaultCriteria();
        toast.success('Default criteria initialized successfully');
        await fetchScoringCriteria();
      } catch (err) {
        const message = err.response?.data?.message || 'Failed to initialize default criteria';
        toast.error(message);
      } finally {
        setSavingCriteria(false);
      }
    }

    closeConfirmDialog();
  };

  

  const toggleCriteriaActive = async (criterion) => {
    try {
      await resultsApi.updateCriteria(criterion.id, {
        is_active: !criterion.is_active,
      });
      toast.success(`Criteria ${criterion.is_active ? 'deactivated' : 'activated'}`);
      await fetchScoringCriteria();
    } catch (err) {
      toast.error('Failed to update criteria status');
    }
  };

  // ============================================================
  // SESSION CHANGE HANDLER
  // ============================================================

  const handleSessionChange = (sessionId) => {
    setSelectedSession(sessionId);
    setSelectedSchool('all');
    setPagination(prev => ({ ...prev, page: 1 }));
    setPendingChanges({});

    // Update session info
    const session = sessions.find(s => s.id.toString() === sessionId);
    if (session) {
      setSessionInfo(session);
      setMaxVisits(session.max_supervision_visits || 3);
    }
  };

  // ============================================================
  // TABLE COLUMNS
  // ============================================================

  const studentsColumns = useMemo(() => {
    const baseColumns = [
      {
        accessor: 'registration_number',
        header: 'Reg. Number',
        render: (value) => (
          <span className="font-medium text-gray-900">{value}</span>
        ),
      },
      {
        accessor: 'student_name',
        header: 'Student Name',
        render: (value) => (
          <span className="text-gray-700">{value}</span>
        ),
      },
      {
        accessor: 'school_name',
        header: 'School',
        render: (value) => (
          <span className="text-sm text-gray-600 truncate max-w-[150px]" title={value}>
            {value}
          </span>
        ),
      },
      {
        accessor: 'status',
        header: 'Status',
        exportable: false,
        render: (value, row) => {
          // Calculate scored visits from actual data
          let scoredCount = 0;
          for (let v = 1; v <= maxVisits; v++) {
            const visitData = row[`visit_${v}`];
            const changeKey = `${row.student_id}-${v}`;
            if (pendingChanges[changeKey] || visitData?.has_result) {
              scoredCount++;
            }
          }

          const pendingCount = Object.keys(pendingChanges).filter(key => 
            key.startsWith(`${row.student_id}-`)
          ).length;

          if (pendingCount > 0) {
            return (
              <Badge variant="warning" className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {pendingCount} Unsaved
              </Badge>
            );
          }

          if (scoredCount === maxVisits) {
            return (
              <Badge variant="success" className="flex items-center gap-1">
                <IconCheck className="w-3 h-3" />
                Complete
              </Badge>
            );
          }

          if (scoredCount > 0) {
            return (
              <Badge variant="info" className="flex items-center gap-1">
                {scoredCount}/{maxVisits} Scored
              </Badge>
            );
          }

          return (
            <Badge variant="outline" className="flex items-center gap-1">
              <IconX className="w-3 h-3" />
              No Scores
            </Badge>
          );
        },
      },
    ];

    // Add columns for each visit
    for (let v = 1; v <= maxVisits; v++) {
      if (scoringType === 'basic') {
        baseColumns.push({
          accessor: `visit_${v}`,
          header: `${getOrdinal(v)} Visit`,
          sortable: false,
          exportable: true,
          exportFormatter: (visitData) => {
            // Export the numeric score, not the object
            if (visitData?.total_score !== null && visitData?.total_score !== undefined) {
              return Number(visitData.total_score).toFixed(1);
            }
            return '';
          },
          render: (visitData, row) => {
            const changeKey = `${row.student_id}-${v}`;
            const hasPending = pendingChanges[changeKey] !== undefined;
            const displayValue = pendingChanges[changeKey]?.total_score ?? visitData?.total_score;

            return (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={totalMaxScore}
                  step={0.5}
                  value={displayValue ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      // Clear the value
                      setStudents(prev =>
                        prev.map(s => {
                          if (s.student_id === row.student_id) {
                            return {
                              ...s,
                              [`visit_${v}`]: { ...s[`visit_${v}`], total_score: null },
                            };
                          }
                          return s;
                        })
                      );
                      return;
                    }
                    const numVal = parseFloat(val);
                    if (!isNaN(numVal) && numVal >= 0) {
                      setStudents(prev =>
                        prev.map(s => {
                          if (s.student_id === row.student_id) {
                            return {
                              ...s,
                              [`visit_${v}`]: { ...s[`visit_${v}`], total_score: numVal },
                            };
                          }
                          return s;
                        })
                      );
                    }
                  }}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val >= 0 && val <= totalMaxScore) {
                      handleScoreChange(row.student_id, v, val, row);
                    } else if (!isNaN(val) && val > totalMaxScore) {
                      handleScoreChange(row.student_id, v, totalMaxScore, row);
                      toast.warning(`Score capped at maximum ${totalMaxScore}`);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > totalMaxScore) {
                        e.target.value = totalMaxScore.toString();
                        handleScoreChange(row.student_id, v, totalMaxScore, row);
                        toast.warning(`Score capped at maximum ${totalMaxScore}`);
                      } else if (!isNaN(val) && val >= 0) {
                        handleScoreChange(row.student_id, v, val, row);
                      }
                      e.target.blur();
                    }
                  }}
                  placeholder={`0-${totalMaxScore}`}
                  className={`w-20 h-8 text-center text-sm ${
                    hasPending ? 'border-amber-400 bg-amber-50' : ''
                  } ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  disabled={savingChanges || !canEdit}
                />
                {hasPending && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved" />
                )}
              </div>
            );
          },
        });
      } else {
        // Advanced scoring - show total with clickable edit icon
        baseColumns.push({
          accessor: `visit_${v}`,
          header: `${getOrdinal(v)} Visit`,
          sortable: false,
          exportable: true,
          exportFormatter: (visitData) => {
            // Export the numeric score, not the object
            if (visitData?.total_score !== null && visitData?.total_score !== undefined) {
              return Number(visitData.total_score).toFixed(1);
            }
            return '';
          },
          render: (visitData, row) => {
            const changeKey = `${row.student_id}-${v}`;
            const hasPending = pendingChanges[changeKey] !== undefined;
            const breakdown = pendingChanges[changeKey]?.score_breakdown || visitData?.score_breakdown || {};
            const computedTotal = Object.values(breakdown).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
            const displayTotal = hasPending ? computedTotal : (visitData?.total_score ?? 0);
            const hasAnyScore = Object.keys(breakdown).length > 0 || visitData?.has_result;
            
            // Check if all criteria are filled
            const isComplete = scoringCriteria.every(c => 
              breakdown[c.id] !== undefined && breakdown[c.id] !== '' && breakdown[c.id] !== null
            );

            return (
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <span className={`font-semibold text-sm ${hasPending ? 'text-amber-600' : 'text-gray-900'}`}>
                    {Number(displayTotal).toFixed(1)} / {totalMaxScore}
                  </span>
                  {hasPending && !isComplete && (
                    <span className="text-[10px] text-red-500">Incomplete</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openAdvancedDialog(row, v)}
                  disabled={savingChanges || !canEdit}
                  className={`p-1.5 h-auto w-auto rounded-md ${
                    hasPending 
                      ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
                      : hasAnyScore
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  } ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={hasAnyScore ? 'Edit criteria scores' : 'Add criteria scores'}
                >
                  {hasAnyScore ? (
                    <IconEdit className="w-4 h-4" />
                  ) : (
                    <IconListDetails className="w-4 h-4" />
                  )}
                </Button>
                {hasPending && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved" />
                )}
              </div>
            );
          },
        });
      }
    }

    // Average score column
    baseColumns.push({
      accessor: 'average',
      header: 'Average',
      render: (value, row) => {
        // Always calculate average from visit data
        let total = 0;
        let count = 0;
        const hasPending = Object.keys(pendingChanges).some(k => k.startsWith(`${row.student_id}-`));
        
        for (let v = 1; v <= maxVisits; v++) {
          const changeKey = `${row.student_id}-${v}`;
          const visitData = row[`visit_${v}`];
          
          // Check pending changes first, then existing data
          if (pendingChanges[changeKey]) {
            total += parseFloat(pendingChanges[changeKey].total_score) || 0;
            count++;
          } else if (visitData?.has_result && visitData?.total_score !== null && visitData?.total_score !== undefined) {
            total += parseFloat(visitData.total_score) || 0;
            count++;
          }
        }
        
        const avg = count > 0 ? (total / count).toFixed(1) : '-';
        return <span className={`font-medium ${hasPending ? 'text-amber-600' : 'text-gray-900'}`}>{avg}</span>;
      },
      exportFormatter: (value, row) => {
        let total = 0;
        let count = 0;
        for (let v = 1; v <= maxVisits; v++) {
          const visitData = row[`visit_${v}`];
          if (visitData?.has_result && visitData?.total_score !== null && visitData?.total_score !== undefined) {
            total += parseFloat(visitData.total_score) || 0;
            count++;
          }
        }
        return count > 0 ? (total / count).toFixed(1) : '';
      },
    });

    return baseColumns;
  }, [maxVisits, scoringType, totalMaxScore, pendingChanges, savingChanges, canEdit, handleScoreChange, toast]);

  // Advanced scoring criteria columns (displayed separately)
  const renderAdvancedScoringRow = useCallback((student, visitNumber) => {
    if (scoringType !== 'advanced' || scoringCriteria.length === 0) return null;

    const changeKey = `${student.student_id}-${visitNumber}`;
    const visitData = student[`visit_${visitNumber}`] || {};
    const breakdown = pendingChanges[changeKey]?.score_breakdown || visitData.score_breakdown || {};

    return (
      <div className="flex flex-wrap gap-2 mt-1">
        {scoringCriteria.map(criterion => (
          <div key={criterion.id} className="flex items-center gap-1">
            <span className="text-xs text-gray-500">{criterion.label}:</span>
            <Input
              type="number"
              min={0}
              max={criterion.max_score}
              step={0.5}
              value={breakdown[criterion.id] ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '') return;
                const numVal = parseFloat(val);
                if (!isNaN(numVal) && numVal >= 0) {
                  handleAdvancedScoreChange(
                    student.student_id,
                    visitNumber,
                    criterion.id,
                    numVal,
                    criterion.max_score,
                    student
                  );
                }
              }}
              placeholder={`0-${criterion.max_score}`}
              className="w-16 h-6 text-xs text-center"
              disabled={savingChanges || !canEdit}
            />
          </div>
        ))}
      </div>
    );
  }, [scoringType, scoringCriteria, pendingChanges, savingChanges, canEdit, handleAdvancedScoreChange]);

  // Table header actions
  const saveDisabled = savingChanges || (scoringType === 'advanced' && !allAdvancedCriteriaFilled);
  const tableHeaderActions = hasPendingChanges ? (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="border"
        onClick={discardChanges}
        disabled={savingChanges}
      >
        Discard ({Object.keys(pendingChanges).length})
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={saveAllChanges}
        disabled={saveDisabled}
        title={scoringType === 'advanced' && !allAdvancedCriteriaFilled ? 'Fill all criteria fields before saving' : ''}
      >
        <IconDeviceFloppy className="w-4 h-4 mr-2" />
        {savingChanges ? 'Saving...' : `Save (${Object.keys(pendingChanges).length})`}
      </Button>
    </>
  ) : null;

  // Custom school option renderer
  const renderSchoolOption = (school, { isSelected }) => (
    <div className="min-w-0">
      <div className={`font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
        {school.name}
      </div>
      {school.id !== 'all' && (
        <div className="text-xs text-gray-500">
          {school.student_count} students
        </div>
      )}
    </div>
  );

  const renderSchoolSelected = (school) => (
    <div className="min-w-0">
      <div className="font-medium truncate text-gray-900">
        {school.id === 'all' ? 'All Schools' : `${school.name} (${school.student_count} students)`}
      </div>
    </div>
  );

  // ============================================================
  // RENDER
  // ============================================================

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Student Results Management</h1>
          <p className="text-xs sm:text-sm text-gray-500 truncate">
            Manage and edit student results across all supervision visits
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {canEdit && (
            <Button variant="outline" onClick={openCriteriaDialog} size="sm" className="active:scale-95">
              <IconSettings className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Manage Criteria</span>
            </Button>
          )}

          <Button variant="outline" onClick={fetchStudentsWithResults} disabled={loading} size="sm" className="active:scale-95">
            <IconRefresh className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconUsers className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_students}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Students</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                  <IconClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_scored}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Total Scores</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <IconChartBar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.average_score}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Avg. Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <IconCalendar className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.max_visits}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Max Visits</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <IconFilter className="w-4 h-4 inline mr-1" />
                Search
              </label>
              <Input
                type="text"
                placeholder="Reg. No. or Name"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
              />
            </div>

            {/* School Filter */}
            <div className="sm:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                <IconSchool className="w-4 h-4 inline mr-1" />
                School
              </label>
              <SearchableSelect
                options={[{ id: 'all', name: 'All Schools', student_count: '' }, ...schools]}
                value={selectedSchool}
                onChange={(value) => {
                  setSelectedSchool(value || 'all');
                  setPagination(prev => ({ ...prev, page: 1 }));
                }}
                placeholder="All Schools"
                searchPlaceholder="Search schools..."
                getOptionValue={(s) => s?.id?.toString() ?? ''}
                getOptionLabel={(s) => !s ? '' : s.id === 'all' ? 'All Schools' : `${s.name} (${s.student_count} students)`}
                renderOption={renderSchoolOption}
                renderSelected={renderSchoolSelected}
                maxDisplayed={100}
                emptyMessage="No schools found"
              />
            </div>

            {/* Session Selection */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                <IconCalendar className="w-4 h-4 inline mr-1" />
                Session
              </label>
              <Select
                value={selectedSession}
                onChange={(e) => handleSessionChange(e.target.value)}
                className="text-sm"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id.toString()}>
                    {session.name} {session.is_current ? '(Current)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Info Banner */}
      {sessionInfo && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-primary-200 bg-rimary-50 p-3">
          <Badge variant="info" className="px-3 py-1">
            📅 {sessionInfo.name}
          </Badge>
          <Badge variant="info" className="px-3 py-1">
            Max Visits: {maxVisits}
          </Badge>
          <Badge variant="info" className="px-3 py-1">
            {scoringType === 'advanced' ? '📊 Advanced Scoring' : '📝 Basic Scoring'}
          </Badge>
          <Badge variant={sessionInfo.status === 'active' ? 'success' : 'info'} className="px-3 py-1">
            {sessionInfo.status === 'active' ? '✓ Active' : sessionInfo.status}
          </Badge>
          {sessionInfo.is_current && (
            <Badge variant="info" className="px-3 py-1">
              Current Session
            </Badge>
          )}
        </div>
      )}

      {/* Students Table */}
      {selectedSession ? (
        <DataTable
          data={students}
          columns={studentsColumns}
          keyField="student_id"
          loading={loading}
          sortable
          searchable={false}
          exportable={true}
          headerActionsRight={tableHeaderActions}
          emptyIcon={IconUsers}
          emptyTitle="No students found"
          emptyDescription={
            selectedSchool !== 'all'
              ? "No students found for this school"
              : "No students with approved acceptances in this session"
          }
          pagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            onPageChange: (page) => setPagination(prev => ({ ...prev, page })),
          }}
        />
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <IconCalendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Select a session to view and manage student results</p>
          </CardContent>
        </Card>
      )}

      {/* Advanced Scoring Dialog */}
      <Dialog
        isOpen={advancedDialogOpen}
        onClose={cancelAdvancedDialog}
        title={`Score ${getOrdinal(advancedDialogData?.visitNumber)} Visit`}
        size="md"
      >
        {advancedDialogData && (
          <div className="space-y-4">
            {/* Student Info */}
            <div className="bg-primary-50 rounded-lg p-3">
              <p className="font-medium text-primary-900">{advancedDialogData.student.student_name}</p>
              <p className="text-sm text-primary-600">{advancedDialogData.student.registration_number}</p>
              <p className="text-xs text-primary-500 mt-1">{advancedDialogData.student.school_name}</p>
            </div>

            {/* Criteria Fields */}
            <div className="space-y-3">
              {scoringCriteria.map(criterion => (
                <div
                    key={criterion.id}
                    className="grid grid-cols-1 gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2 sm:grid-cols-[1fr_auto]"
                >
                    {/* Criterion */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-800">
                            {criterion.label}
                        </label>
                        <div className="text-xs text-gray-500 mt--8">
                            Maximum allowed: {criterion.max_score}
                        </div>
                    </div>

                    {/* Score */}
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            min={0}
                            max={criterion.max_score}
                            step={0.5}
                            value={dialogBreakdown[criterion.id] ?? ''}
                            onChange={(e) =>
                                handleDialogCriterionChange(
                                    criterion.id,
                                    e.target.value,
                                    criterion.max_score
                                )
                            }
                            placeholder="0"
                            className="w-20 h-8 text-center "
                        />
                    </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="font-semibold text-gray-900">Total Score</span>
              <span className={`text-lg font-bold ${isDialogComplete ? 'text-green-600' : 'text-amber-600'}`}>
                {dialogTotal.toFixed(1)} / {totalMaxScore}
              </span>
            </div>

            {/* Incomplete Warning */}
            {!isDialogComplete && (
              <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg p-2">
                <IconAlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>Please fill in all criteria scores</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={cancelAdvancedDialog}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={saveAdvancedDialog}
                disabled={!isDialogComplete}
                className="flex-1"
              >
                Apply Score
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Criteria Management Dialog */}
      <Dialog
        isOpen={criteriaDialogOpen}
        onClose={closeCriteriaDialog}
        title={
          criteriaDialogMode === 'list' 
            ? 'Manage Scoring Criteria' 
            : criteriaDialogMode === 'add' 
              ? 'Add New Criteria' 
              : 'Edit Criteria'
        }
        width="2xl"
      >

      {/* Confirm Dialog for Delete/Initialize */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={closeConfirmDialog}
        onConfirm={handleConfirmAction}
        title={confirmDialog.type === 'delete' ? 'Delete Criteria' : 'Initialize Default Criteria'}
        message={
          confirmDialog.type === 'delete'
            ? 'Are you sure you want to delete this criteria? This action cannot be undone and may affect existing results.'
            : 'This will create 9 default scoring criteria for teaching practice evaluation. Continue?'
        }
        confirmText={confirmDialog.type === 'delete' ? 'Delete' : 'Initialize'}
        variant={confirmDialog.type === 'delete' ? 'danger' : 'info'}
        loading={confirmDialog.type === 'delete' ? deletingCriteriaId !== null : savingCriteria}
      />
        <div className="space-y-4">
          {/* List View */}
          {criteriaDialogMode === 'list' && (
            <>
              {/* Header Actions */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {scoringCriteria.length} criteria • Total max: {totalMaxScore} points
                </p>
                <div className="flex gap-2">
                  {scoringCriteria.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openInitializeConfirm}
                      disabled={savingCriteria}
                    >
                      Initialize Defaults
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={startAddCriteria}
                  >
                    <IconPlus className="w-4 h-4 mr-1" />
                    Add Criteria
                  </Button>
                </div>
              </div>

              {/* Criteria List */}
              {scoringCriteria.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <IconListDetails className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">No scoring criteria defined</p>
                  <p className="text-sm text-gray-400">
                    Add criteria or initialize with defaults to enable advanced scoring
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {scoringCriteria
                    .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
                    .map((criterion, index) => (
                      <div
                        key={criterion.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          criterion.is_active 
                            ? 'bg-white border-gray-200 hover:border-gray-300' 
                            : 'bg-gray-50 border-gray-200 opacity-60'
                        }`}
                      >
                        {/* Drag Handle (visual only for now) */}
                        <div className="text-gray-400 cursor-grab">
                          <IconGripVertical className="w-4 h-4" />
                        </div>

                        {/* Order Number */}
                        <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {index + 1}
                        </div>

                        {/* Criterion Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 truncate">
                                {criterion.label}
                                </span>
                                {!criterion.is_active && (
                                <Badge variant="secondary" className="text-xs">
                                    Inactive
                                </Badge>
                                )}
                            </div>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium text-gray-900 font-mono">
                                    {criterion.name}
                                </span>

                                {criterion.description && (
                                    <span className="text-xs text-gray-500 leading-relaxed">
                                    {criterion.description}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Max Score */}
                        <div className="text-right flex-shrink-0">
                          <span className="text-lg font-bold text-primary-600">
                            {criterion.max_score}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">pts</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleCriteriaActive(criterion)}
                            className={`p-1.5 h-auto w-auto rounded-md ${
                              criterion.is_active
                                ? 'text-green-600 hover:bg-green-50'
                                : 'text-gray-400 hover:bg-gray-100'
                            }`}
                            title={criterion.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {criterion.is_active ? (
                              <IconCheck className="w-4 h-4" />
                            ) : (
                              <IconX className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditCriteria(criterion)}
                            className="p-1.5 h-auto w-auto rounded-md text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <IconEdit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDeleteConfirm(criterion.id)}
                            disabled={deletingCriteriaId === criterion.id}
                            className="p-1.5 h-auto w-auto rounded-md text-red-600 hover:bg-red-50"
                            title="Delete"
                          >
                            {deletingCriteriaId === criterion.id ? (
                              <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <IconTrash className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {/* Close Button */}
              <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" onClick={closeCriteriaDialog}>
                  Close
                </Button>
              </div>
            </>
          )}

          {/* Add/Edit Form View */}
          {(criteriaDialogMode === 'add' || criteriaDialogMode === 'edit') && (
            <>
              {/* Back Button */}
              <Button
                variant="ghost"
                onClick={goBackToList}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 h-auto px-2 py-1"
              >
                <IconArrowBack className="w-4 h-4" />
                Back to list
              </Button>

              {/* Form Fields */}
              <div className="space-y-4">
                {/* Name Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={criteriaFormData.name}
                    onChange={(e) => handleCriteriaFormChange('name', e.target.value)}
                    placeholder="e.g., lesson_plan"
                    className={criteriaFormErrors.name ? 'border-red-500' : ''}
                  />
                  {criteriaFormErrors.name && (
                    <p className="text-xs text-red-500 mt-1">{criteriaFormErrors.name}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Internal identifier (lowercase, underscores)
                  </p>
                </div>

                {/* Label Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Label <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={criteriaFormData.label}
                    onChange={(e) => handleCriteriaFormChange('label', e.target.value)}
                    placeholder="e.g., Lesson Plan Preparation"
                    className={criteriaFormErrors.label ? 'border-red-500' : ''}
                  />
                  {criteriaFormErrors.label && (
                    <p className="text-xs text-red-500 mt-1">{criteriaFormErrors.label}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Display name shown to supervisors
                  </p>
                </div>

                {/* Description Field */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={criteriaFormData.description}
                    onChange={(e) => handleCriteriaFormChange('description', e.target.value)}
                    placeholder="Optional help text for supervisors..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                {/* Max Score & Order */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max Score <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      step={0.5}
                      value={criteriaFormData.max_score}
                      onChange={(e) => handleCriteriaFormChange('max_score', parseFloat(e.target.value) || 0)}
                      className={criteriaFormErrors.max_score ? 'border-red-500' : ''}
                    />
                    {criteriaFormErrors.max_score && (
                      <p className="text-xs text-red-500 mt-1">{criteriaFormErrors.max_score}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Order Index
                    </label>
                    <Input
                      type="number"
                      min={0}
                      value={criteriaFormData.order_index}
                      onChange={(e) => handleCriteriaFormChange('order_index', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>

                {/* Active Toggle */}
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={criteriaFormData.is_active}
                      onChange={(e) => handleCriteriaFormChange('is_active', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                  </label>
                  <span className="text-sm font-medium text-gray-700">
                    Active
                  </span>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={goBackToList}
                  className="flex-1"
                  disabled={savingCriteria}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={saveCriteria}
                  disabled={savingCriteria}
                  className="flex-1"
                >
                  {savingCriteria ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <IconDeviceFloppy className="w-4 h-4 mr-2" />
                      {criteriaDialogMode === 'edit' ? 'Update' : 'Create'}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </Dialog>

    </div>
  );
}

export default AdminResultsPage;
