/**
 * Supervisor Result Upload Page
 * Allows supervisors to upload/edit student scores for their assigned groups
 * 
 * UI/UX Pattern: Based on StudentsRegroupPage
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { resultsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable } from '../../components/ui/DataTable';
import {
  IconUsers,
  IconClipboardCheck,
  IconRefresh,
  IconDeviceFloppy,
  IconChartBar,
  IconAlertCircle,
  IconCheck,
  IconX,
} from '@tabler/icons-react';
import { getOrdinal } from '../../utils/helpers';

function SupervisorResultUploadPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Session & Postings
  const [session, setSession] = useState(null);
  const [hasPostings, setHasPostings] = useState(false);
  const [assignedGroups, setAssignedGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');

  // Students & Scoring
  const [students, setStudents] = useState([]);
  const [scoringCriteria, setScoringCriteria] = useState([]);
  const [totalMaxScore, setTotalMaxScore] = useState(100);
  
  // Scoring Mode is now derived from session settings
  const scoringType = session?.scoring_type || 'basic';
  
  // Pending Changes (student_id -> { total_score, score_breakdown })
  const [pendingChanges, setPendingChanges] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

  // Statistics
  const [statistics, setStatistics] = useState(null);

  // Search
  const [searchTerm, setSearchTerm] = useState('');

  // ============================================================
  // PHASE 1: Initialization & Access Control
  // ============================================================

  useEffect(() => {
    fetchAssignedGroups();
    fetchScoringCriteria();
  }, []);

  // Fetch assigned groups when component mounts
  const fetchAssignedGroups = async () => {
    setInitialLoading(true);
    try {
      const response = await resultsApi.getAssignedGroups();
      const data = response.data.data || response.data || {};
      
      setSession(data.session || null);
      setHasPostings(data.has_postings || false);
      setAssignedGroups(data.data || []);
    } catch (err) {
      console.error('Failed to load assigned groups:', err);
      toast.error('Failed to load your supervision assignments');
    } finally {
      setInitialLoading(false);
    }
  };

  // Fetch scoring criteria for advanced mode
  const fetchScoringCriteria = async () => {
    try {
      const response = await resultsApi.getScoringCriteria();
      setScoringCriteria(response.data.data || response.data || []);
      setTotalMaxScore(parseFloat(response.data.totalMaxScore) || 100);
    } catch (err) {
      console.error('Failed to load scoring criteria:', err);
    }
  };

  // ============================================================
  // PHASE 3: Student List Rendering
  // ============================================================

  // Fetch students when group selection changes
  useEffect(() => {
    if (selectedGroup) {
      fetchStudentsForScoring();
    }
  }, [selectedGroup]);

  // Clear pending changes when group changes
  useEffect(() => {
    setPendingChanges({});
  }, [selectedGroup]);

  const fetchStudentsForScoring = async () => {
    if (!selectedGroup) return;

    const [schoolId, groupNumber, visitNumber] = selectedGroup.split('-').map(Number);
    
    setLoading(true);
    try {
      const response = await resultsApi.getStudentsForScoring(schoolId, groupNumber, visitNumber);
      const studentsData = response.data.data || response.data || [];
      setStudents(studentsData);
      
      // Calculate statistics
      const scoredStudents = studentsData.filter(s => s.has_result);
      const scored = scoredStudents.length;
      const totalScore = scoredStudents.reduce((sum, s) => sum + (parseFloat(s.total_score) || 0), 0);
      const avgScore = scored > 0 ? (totalScore / scored).toFixed(1) : '0';
      
      setStatistics({
        total_students: studentsData.length,
        scored_students: scored,
        pending_students: studentsData.length - scored,
        average_score: avgScore,
      });
    } catch (err) {
      toast.error('Failed to load students for scoring');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // PHASE 4 & 5: Scoring Logic
  // ============================================================

  // Get current parsed group info
  const currentGroup = useMemo(() => {
    if (!selectedGroup) return null;
    const [schoolId, groupNumber, visitNumber] = selectedGroup.split('-').map(Number);
    const groupInfo = assignedGroups.find(
      g => g.school_id === schoolId && g.group_number === groupNumber && g.visit_number === visitNumber
    );
    return groupInfo;
  }, [selectedGroup, assignedGroups]);

  // Custom renderers for SearchableSelect
  const renderGroupOption = (group, { isSelected }) => (
    <div className="min-w-0">
      <div className={`font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
        {group.school_name}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
        <span className="px-1 rounded-md text-[10px] font-medium bg-primary-100 text-primary-700">
          Group {group.group_number}
        </span>
        <span className="px-1 rounded-md text-[10px] font-medium bg-green-100 text-green-700">
          {getOrdinal(group.visit_number)} Visit
        </span>
        {group.route_name && (
          <>
            <span className="text-gray-400">•</span>
            <span className="px-1 rounded-md text-[10px] font-medium text-gray-600">
              {group.route_name}
            </span>
          </>
        )}
      </div>
    </div>
  );

  const renderGroupSelected = (group) => (
    <div className="min-w-0">
      <div className="font-medium truncate text-gray-900">
        {group.school_name} - Group {group.group_number} - {getOrdinal(group.visit_number)} Visit
        {group.route_name ? ` (${group.route_name})` : ''}
      </div>
    </div>
  );

  // Handle score change (local state only)
  const handleScoreChange = useCallback((studentId, score) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 100) return;

    // Update students state optimistically
    setStudents(prev =>
      prev.map(s => s.student_id === studentId
        ? { ...s, total_score: numScore }
        : s
      )
    );

    // Track the change
    setPendingChanges(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        total_score: numScore,
        scoring_type: 'basic',
      },
    }));
  }, []);

  // Handle advanced scoring change
  const handleAdvancedScoreChange = useCallback((studentId, criterionId, score, maxScore) => {
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0) return;
    
    // Clamp to max score
    const clampedScore = Math.min(numScore, maxScore);

    // Get current breakdown
    const student = students.find(s => s.student_id === studentId);
    const currentBreakdown = pendingChanges[studentId]?.score_breakdown 
      || student?.score_breakdown 
      || {};

    const newBreakdown = {
      ...currentBreakdown,
      [criterionId]: clampedScore,
    };

    // Calculate total
    const newTotal = Object.values(newBreakdown).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

    // Update students state
    setStudents(prev =>
      prev.map(s => s.student_id === studentId
        ? { ...s, total_score: newTotal, score_breakdown: newBreakdown }
        : s
      )
    );

    // Track the change
    setPendingChanges(prev => ({
      ...prev,
      [studentId]: {
        score_breakdown: newBreakdown,
        total_score: newTotal,
        scoring_type: 'advanced',
      },
    }));
  }, [students, pendingChanges]);

  // ============================================================
  // PHASE 7: Save & Update Logic
  // ============================================================

  const saveAllChanges = async () => {
    const changes = Object.entries(pendingChanges);
    if (changes.length === 0) {
      toast.info('No changes to save');
      return;
    }

    if (!currentGroup) {
      toast.error('Please select a group first');
      return;
    }

    // Validate advanced scoring - all criteria must be filled for each pending change
    if (scoringType === 'advanced' && scoringCriteria.length > 0) {
      const incompleteStudents = [];
      for (const [studentId, scoreData] of changes) {
        const breakdown = scoreData.score_breakdown || {};
        const missingCriteria = scoringCriteria.filter(
          c => breakdown[c.id] === undefined || breakdown[c.id] === '' || breakdown[c.id] === null
        );
        if (missingCriteria.length > 0) {
          const student = students.find(s => s.student_id === parseInt(studentId));
          incompleteStudents.push(student?.registration_number || studentId);
        }
      }
      if (incompleteStudents.length > 0) {
        toast.error(`Please fill all criteria for: ${incompleteStudents.slice(0, 3).join(', ')}${incompleteStudents.length > 3 ? ` and ${incompleteStudents.length - 3} more` : ''}`);
        return;
      }
    }

    setSavingChanges(true);

    const results = changes.map(([studentId, scoreData]) => ({
      student_id: parseInt(studentId),
      school_id: currentGroup.school_id,
      group_number: currentGroup.group_number,
      visit_number: currentGroup.visit_number,
      scoring_type: scoreData.scoring_type || scoringType,
      total_score: scoreData.total_score,
      score_breakdown: scoreData.score_breakdown || null,
    }));

    try {
      const response = await resultsApi.submitBulkResults(results);
      const { successful, failed } = response.data.data || response.data || {};

      setPendingChanges({});

      if (failed?.length === 0) {
        toast.success(`Successfully saved ${successful?.length || 0} result(s)`);
      } else {
        toast.warning(`Saved ${successful?.length || 0}, failed ${failed?.length || 0}`);
      }

      // Refresh to get updated data
      fetchStudentsForScoring();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save results');
    } finally {
      setSavingChanges(false);
    }
  };

  const discardChanges = () => {
    setPendingChanges({});
    fetchStudentsForScoring();
  };

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // ============================================================
  // Filter & Table Columns
  // ============================================================

  const filteredStudents = useMemo(() =>
    students.filter(student =>
      student.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  [students, searchTerm]);

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
        accessor: 'has_result',
        header: 'Status',
        render: (value, row) => {
          const hasPending = pendingChanges[row.student_id] !== undefined;
          if (hasPending) {
            return (
              <Badge variant="warning" className="flex items-center gap-1 w-24">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Unsaved
              </Badge>
            );
          }
          return value ? (
            <Badge variant="success" className="flex items-center gap-1 w-24">
              <IconCheck className="w-3 h-3" />
              Saved
            </Badge>
          ) : (
            <Badge variant="outline" className="flex items-center gap-1">
              <IconX className="w-3 h-3" />
              Pending
            </Badge>
          );
        },
      },
    ];

    // Basic scoring column
    if (scoringType === 'basic') {
      baseColumns.push({
        accessor: 'total_score',
        header: 'Score (0-100)',
        sortable: false,
        exportable: true,
        render: (value, row) => {
          const hasPending = pendingChanges[row.student_id] !== undefined;
          const canEdit = row.can_edit !== false;
          const displayValue = pendingChanges[row.student_id]?.total_score ?? value;

          return (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={displayValue ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    // Allow clearing
                    setStudents(prev =>
                      prev.map(s => s.student_id === row.student_id
                        ? { ...s, total_score: null }
                        : s
                      )
                    );
                    return;
                  }
                  const numVal = parseFloat(val);
                  if (!isNaN(numVal) && numVal >= 0) {
                    // Update display immediately but don't validate yet
                    setStudents(prev =>
                      prev.map(s => s.student_id === row.student_id
                        ? { ...s, total_score: numVal }
                        : s
                      )
                    );
                  }
                }}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 100) {
                    handleScoreChange(row.student_id, val);
                  } else if (!isNaN(val) && val > 100) {
                    // Reset to max if over
                    handleScoreChange(row.student_id, 100);
                    toast.warning('Score capped at maximum 100');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > 100) {
                      // Reset to max and show warning
                      e.target.value = '100';
                      handleScoreChange(row.student_id, 100);
                      toast.warning('Score capped at maximum 100');
                    } else if (!isNaN(val) && val >= 0) {
                      handleScoreChange(row.student_id, val);
                    }
                    e.target.blur();
                  }
                }}
                placeholder="0-100"
                className={`w-24 h-8 text-center ${
                  hasPending ? 'border-amber-400 bg-amber-50' : ''
                } ${!canEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={savingChanges || !canEdit}
                title={!canEdit ? 'You cannot edit scores submitted by another supervisor' : ''}
              />
              {hasPending && (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved change" />
              )}
            </div>
          );
        },
      });
    }

    // Advanced scoring - show total and expand button
    if (scoringType === 'advanced') {
      baseColumns.push({
        accessor: 'total_score',
        header: `Total Score (max: ${Number(totalMaxScore).toFixed(2)})`,
        sortable: true,
        exportable: true,
        render: (value, row) => {
          const hasPending = pendingChanges[row.student_id] !== undefined;
          // Compute total from breakdown in real-time
          const breakdown = pendingChanges[row.student_id]?.score_breakdown || row.score_breakdown || {};
          const computedTotal = Object.values(breakdown).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
          const displayTotal = hasPending ? computedTotal : (value ?? 0);
          
          return (
            <div className="flex items-center gap-2">
              <span className={`font-semibold ${hasPending ? 'text-amber-600' : 'text-gray-900'}`}>
                {Number(displayTotal).toFixed(2)} / {Number(totalMaxScore).toFixed(2)}
              </span>
              {hasPending && (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved change" />
              )}
            </div>
          );
        },
      });

      // Add columns for each criterion
      scoringCriteria.forEach(criterion => {
        baseColumns.push({
          accessor: `criterion_${criterion.id}`,
          header: `${criterion.label} (${criterion.max_score})`,
          sortable: false,
          exportable: true,
          render: (_, row) => {
            const breakdown = pendingChanges[row.student_id]?.score_breakdown || row.score_breakdown || {};
            const currentValue = breakdown[criterion.id] ?? '';
            const canEdit = row.can_edit !== false;

            return (
              <Input
                type="number"
                min={0}
                max={criterion.max_score}
                step={0.5}
                value={currentValue}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    // Allow clearing - update breakdown without this criterion
                    const student = students.find(s => s.student_id === row.student_id);
                    const currentBd = pendingChanges[row.student_id]?.score_breakdown || student?.score_breakdown || {};
                    const newBd = { ...currentBd };
                    delete newBd[criterion.id];
                    const newTotal = Object.values(newBd).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
                    setStudents(prev =>
                      prev.map(s => s.student_id === row.student_id
                        ? { ...s, total_score: newTotal, score_breakdown: newBd }
                        : s
                      )
                    );
                    setPendingChanges(prev => ({
                      ...prev,
                      [row.student_id]: {
                        score_breakdown: newBd,
                        total_score: newTotal,
                        scoring_type: 'advanced',
                      },
                    }));
                    return;
                  }
                  const numVal = parseFloat(val);
                  if (!isNaN(numVal) && numVal >= 0) {
                    handleAdvancedScoreChange(row.student_id, criterion.id, numVal, criterion.max_score);
                  }
                }}
                onBlur={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > criterion.max_score) {
                    handleAdvancedScoreChange(row.student_id, criterion.id, criterion.max_score, criterion.max_score);
                    toast.warning(`Score capped at maximum ${criterion.max_score}`);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val > criterion.max_score) {
                      e.target.value = criterion.max_score.toString();
                      handleAdvancedScoreChange(row.student_id, criterion.id, criterion.max_score, criterion.max_score);
                      toast.warning(`Score capped at maximum ${criterion.max_score}`);
                    }
                    e.target.blur();
                  }
                }}
                placeholder={`0-${criterion.max_score}`}
                className="w-24 h-8 text-center"
                disabled={savingChanges || !canEdit}
              />
            );
          },
        });
      });
    }

    return baseColumns;
  }, [scoringType, scoringCriteria, totalMaxScore, pendingChanges, savingChanges, handleScoreChange, handleAdvancedScoreChange]);

  // Check if at least one student has complete criteria in advanced mode
  const hasCompleteAdvancedScoring = useMemo(() => {
    if (scoringType !== 'advanced' || scoringCriteria.length === 0) return true;
    
    const changes = Object.entries(pendingChanges);
    if (changes.length === 0) return false;
    
    return changes.some(([_, scoreData]) => {
      const breakdown = scoreData.score_breakdown || {};
      return scoringCriteria.every(
        c => breakdown[c.id] !== undefined && breakdown[c.id] !== '' && breakdown[c.id] !== null
      );
    });
  }, [scoringType, scoringCriteria, pendingChanges]);

  // Table header actions
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
        disabled={savingChanges || (scoringType === 'advanced' && !hasCompleteAdvancedScoring)}
        title={scoringType === 'advanced' && !hasCompleteAdvancedScoring ? 'Fill all criteria for at least one student' : ''}
      >
        <IconDeviceFloppy className="w-4 h-4 mr-2" />
        {savingChanges ? 'Saving...' : `Save (${Object.keys(pendingChanges).length})`}
      </Button>
    </>
  ) : null;

  // ============================================================
  // PHASE 1: Empty State - No Postings
  // ============================================================

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!hasPostings) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Result Upload</h1>
        </div>
        <Card>
          <CardContent className="p-8 sm:p-12 text-center">
            <IconAlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg sm:text-xl font-semibold text-gray-700 mb-2">No Supervision Assignment</h2>
            <p className="text-xs sm:text-sm text-gray-500 max-w-md mx-auto">
              You have not been posted to any school or student for supervision in the current session.
            </p>
            {session && (
              <p className="text-xs text-gray-400 mt-4">
                Current Session: {session.name}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Result Upload</h1>
          {session && (
            <p className="text-xs sm:text-sm text-gray-500 truncate">Session: {session.name}</p>
          )}
        </div>
        <Button variant="outline" onClick={fetchStudentsForScoring} disabled={!selectedGroup || loading} size="sm" className="active:scale-95 flex-shrink-0">
          <IconRefresh className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Statistics */}
      {statistics && selectedGroup && (
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
                  <IconCheck className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.scored_students}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Scored</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <IconClipboardCheck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.pending_students}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Pending</p>
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
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Group Selection */}
            <div className="lg:col-span-2">
              <SearchableSelect
                label="Select School / Group / Visit"
                options={assignedGroups}
                value={selectedGroup}
                onChange={(value) => setSelectedGroup(value || '')}
                placeholder="Select a group..."
                searchPlaceholder="Search groups..."
                getOptionValue={(g) => `${g.school_id}-${g.group_number}-${g.visit_number}`}
                getOptionLabel={(g) => `${g.school_name} - Group ${g.group_number} - ${getOrdinal(g.visit_number)} Visit${g.route_name ? ` (${g.route_name})` : ''}`}
                renderOption={renderGroupOption}
                renderSelected={renderGroupSelected}
                maxDisplayed={100}
                emptyMessage="No groups found"
              />
            </div>

            {/* Search */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Search Students</label>
              <Input
                type="text"
                placeholder="Search by reg number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Group Info */}
      {currentGroup && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-primary-200 bg-primary-50 p-3">
            <Badge variant="primary" className="px-3 py-1">
                🏫 {currentGroup.school_name}
            </Badge>
            <Badge variant="outline" className="px-3 py-1">
                Group {currentGroup.group_number}
            </Badge>
            <Badge variant="success" className="px-3 py-1">
                {getOrdinal(currentGroup.visit_number)} Visit
            </Badge>
            {currentGroup.route_name && (
                <Badge variant="secondary" className="px-3 py-1">
                {currentGroup.route_name}
                </Badge>
            )}
            <Badge variant={scoringType === 'advanced' ? 'info' : 'secondary'} className="px-3 py-1">
                {scoringType === 'advanced' ? '📊 Advanced Scoring' : '📝 Basic Scoring'}
            </Badge>
        </div>
      )}

      {/* Students Table */}
      {selectedGroup ? (
        <DataTable
          data={filteredStudents}
          columns={studentsColumns}
          keyField="student_id"
          loading={loading}
          sortable
          searchable={false}
          exportable
          exportFilename={`results_group_${currentGroup?.group_number}_visit_${currentGroup?.visit_number}`}
          headerActionsRight={tableHeaderActions}
          emptyIcon={IconUsers}
          emptyTitle="No students found"
          emptyDescription="No students are assigned to this group"
        />
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <IconClipboardCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Select a school/group/visit to view and score students</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SupervisorResultUploadPage;
