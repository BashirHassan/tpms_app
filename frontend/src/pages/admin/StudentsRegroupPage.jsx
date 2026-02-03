/**
 * Students Regrouping Page (Admin)
 * Change individual student group numbers within a school
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { groupsApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable } from '../../components/ui/DataTable';
import {
  IconUsers,
  IconLink,
  IconBuildingBank as IconSchool,
  IconRefresh,
  IconCheck,
  IconDeviceFloppy,
} from '@tabler/icons-react';

function StudentsRegroupPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState('');

  // Data
  const [schoolStudents, setSchoolStudents] = useState([]);
  const [schoolGroups, setSchoolGroups] = useState([]);
  const [statistics, setStatistics] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');

  // Processing
  const [processing, setProcessing] = useState(false);

  // Track pending changes (student_id -> new_group_number)
  const [pendingChanges, setPendingChanges] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch schools when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchSchools();
    }
  }, [selectedSession]);

  // Fetch data when session/school changes
  useEffect(() => {
    if (selectedSession && selectedSchool) {
      fetchSchoolData();
    }
  }, [selectedSession, selectedSchool]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll({ status: 'active' });
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
      if (current) setSelectedSession(current.id.toString());
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  // Fetch schools from group summary (only schools with acceptances in session)
  const fetchSchools = async () => {
    try {
      const response = await groupsApi.getSummary(selectedSession);
      const summary = response.data?.data || response.data || [];
      // Transform to school list format and remove duplicates
      const schoolMap = new Map();
      summary.forEach(item => {
        if (!schoolMap.has(item.institution_school_id)) {
          schoolMap.set(item.institution_school_id, {
            id: item.institution_school_id,
            name: item.school_name,
            category: item.route_name || 'N/A',
            student_count: item.student_count,
            group_count: item.group_count,
          });
        }
      });
      setSchools(Array.from(schoolMap.values()));
    } catch (err) {
      console.error('Failed to load schools:', err);
    }
  };

  // Custom renderer for school options
  const renderSchoolOption = (school, { isSelected }) => (
    <div className="min-w-0">
      <div className={`font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
        {school.name}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600">
          {school.category}
        </span>
        <span className="text-gray-400">•</span>
        <span>{school.student_count} students</span>
        <span className="text-gray-400">•</span>
        <span>{school.group_count} groups</span>
      </div>
    </div>
  );

  const renderSchoolSelected = (school) => (
    <div className="min-w-0">
      <div className="font-medium truncate text-gray-900">{school.name} - {school.student_count} students • {school.group_count} groups</div>
    </div>
  );

  const fetchSchoolData = async () => {
    if (!selectedSchool || !selectedSession) return;

    setLoading(true);
    try {
      const [studentsRes, groupsRes] = await Promise.all([
        groupsApi.getStudentsBySchool(selectedSchool, selectedSession),
        groupsApi.getSchoolGroups(selectedSchool, selectedSession),
      ]);
      const studentsData = studentsRes.data?.data || studentsRes.data || [];
      const groupsData = groupsRes.data?.data || groupsRes.data || [];
      setSchoolStudents(Array.isArray(studentsData) ? studentsData : []);
      setSchoolGroups(Array.isArray(groupsData) ? groupsData : []);

      // Calculate statistics
      const stats = {
        total_students: studentsData.length,
        total_groups: groupsData.length,
        merged_groups: groupsData.filter((g) => g.is_merged).length,
      };
      setStatistics(stats);
    } catch (err) {
      toast.error('Failed to load school data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignGroup = async (studentId, newGroup) => {
    if (!selectedSchool) return;

    setProcessing(true);
    try {
      await groupsApi.assignStudentGroup(studentId, selectedSchool, newGroup, selectedSession);
      toast.success('Student regrouped successfully');
      fetchSchoolData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to regroup student');
    } finally {
      setProcessing(false);
    }
  };

  // Calculate current group student counts (accounting for pending changes)
  const getGroupStudentCounts = useCallback(() => {
    const counts = {};
    schoolStudents.forEach(student => {
      // Use pending change if exists, otherwise current group
      const groupNum = pendingChanges[student.student_id] ?? student.group_number;
      counts[groupNum] = (counts[groupNum] || 0) + 1;
    });
    return counts;
  }, [schoolStudents, pendingChanges]);

  // Check if a group is merged
  const isGroupMerged = useCallback((groupNumber) => {
    const group = schoolGroups.find(g => g.group_number === groupNumber);
    return group?.is_merged == 1;
  }, [schoolGroups]);

  // Handle local group change (no API call yet)
  const handleLocalGroupChange = useCallback((studentId, newGroup) => {
    if (newGroup < 1) return;
    
    // Find the student's current group (considering pending changes)
    const student = schoolStudents.find(s => s.student_id === studentId);
    if (!student) return;
    
    const currentGroup = pendingChanges[studentId] ?? student.group_number;
    
    // If moving from a merged group, check if this would leave it empty
    if (currentGroup !== newGroup && isGroupMerged(currentGroup)) {
      const counts = getGroupStudentCounts();
      const currentGroupCount = counts[currentGroup] || 0;
      
      if (currentGroupCount <= 1) {
        toast.error(
          'Cannot move the last student from a merged group. At least one student must remain, or unmerge the group first.',
          { duration: 5000 }
        );
        return;
      }
    }
    
    // Update local state optimistically
    setSchoolStudents(prev => 
      prev.map(s => s.student_id === studentId ? { ...s, group_number: newGroup } : s)
    );
    
    // Track the change
    setPendingChanges(prev => ({
      ...prev,
      [studentId]: newGroup
    }));
  }, [schoolStudents, pendingChanges, isGroupMerged, getGroupStudentCounts, toast]);

  // Save all pending changes
  const saveAllChanges = async () => {
    const changes = Object.entries(pendingChanges);
    if (changes.length === 0) {
      toast.info('No changes to save');
      return;
    }

    setSavingChanges(true);
    let successCount = 0;
    let errorCount = 0;

    for (const [studentId, groupNumber] of changes) {
      try {
        await groupsApi.assignStudentGroup(
          parseInt(studentId), 
          selectedSchool, 
          groupNumber, 
          selectedSession
        );
        successCount++;
      } catch (err) {
        errorCount++;
        console.error(`Failed to update student ${studentId}:`, err);
      }
    }

    setSavingChanges(false);
    setPendingChanges({});

    if (errorCount === 0) {
      toast.success(`Successfully saved ${successCount} change${successCount > 1 ? 's' : ''}`);
    } else {
      toast.warning(`Saved ${successCount}, failed ${errorCount}`);
    }

    // Refresh to get updated group overview
    fetchSchoolData();
  };

  // Clear pending changes when school changes
  useEffect(() => {
    setPendingChanges({});
  }, [selectedSchool]);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // Filter students by search
  const filteredStudents = useMemo(
    () =>
      schoolStudents.filter(
        (student) =>
          student.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [schoolStudents, searchTerm]
  );

  // Handle group change
  const handleGroupChange = useCallback(
    (studentId, newGroup) => {
      handleLocalGroupChange(studentId, newGroup);
    },
    [handleLocalGroupChange]
  );

  // Students table columns
  const studentsColumns = useMemo(() => {
    // Pre-calculate group counts and merged status for the render
    const groupCounts = {};
    schoolStudents.forEach(student => {
      const groupNum = pendingChanges[student.student_id] ?? student.group_number;
      groupCounts[groupNum] = (groupCounts[groupNum] || 0) + 1;
    });
    
    const mergedGroupNumbers = new Set(
      schoolGroups.filter(g => g.is_merged == 1).map(g => g.group_number)
    );

    return [
      {
        accessor: 'name',
        header: 'Student',
        render: (value, row) => (
          <div>
            <p className="font-medium text-gray-900">{row.registration_number}</p>
          </div>
        ),
      },
      {
        accessor: 'program_name',
        header: 'Program',
        render: (value) => value || 'N/A',
      },
      {
        accessor: 'group_number',
        header: 'Current Group',
        render: (value, row) => {
          const groupNum = pendingChanges[row.student_id] ?? value;
          const isMerged = mergedGroupNumbers.has(groupNum);
          const isLastInMerged = isMerged && (groupCounts[groupNum] || 0) <= 1;
          
          return (
            <div className="flex items-center gap-2">
              <Badge variant={isMerged ? 'purple' : 'outline'}>
                Group {groupNum || 1}
              </Badge>
              {isMerged && (
                <IconLink className="w-3.5 h-3.5 text-purple-500" title="Merged group" />
              )}
              {isLastInMerged && (
                <span 
                  className="text-xs text-amber-600 font-medium" 
                  title="Last student in merged group - cannot be moved"
                >
                  (locked)
                </span>
              )}
            </div>
          );
        },
      },
      ...(canEdit
        ? [
            {
              accessor: 'change_group',
              header: 'Change Group',
              sortable: false,
              exportable: false,
              render: (_, row) => {
                const hasChange = pendingChanges[row.student_id] !== undefined;
                const currentGroup = pendingChanges[row.student_id] ?? row.group_number;
                const isMerged = mergedGroupNumbers.has(currentGroup);
                const isLastInMerged = isMerged && (groupCounts[currentGroup] || 0) <= 1;
                
                return (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      defaultValue={row.group_number || 1}
                      key={`${row.student_id}-${row.group_number}`}
                      onBlur={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (val >= 1 && val !== row.group_number) {
                          handleGroupChange(row.student_id, val);
                        } else if (!val || val < 1) {
                          // Reset to current value if invalid
                          e.target.value = row.group_number || 1;
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.target.blur();
                        }
                      }}
                      className={`w-20 h-8 py-1 text-center ${
                        hasChange ? 'border-amber-400 bg-amber-50' : ''
                      } ${isLastInMerged ? 'border-purple-300 bg-purple-50 cursor-not-allowed' : ''}`}
                      disabled={savingChanges || isLastInMerged}
                      title={isLastInMerged ? 'Last student in merged group - unmerge the group first' : ''}
                    />
                    {hasChange && (
                      <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved change" />
                    )}
                    {isLastInMerged && (
                      <span className="text-xs text-purple-600" title="Unmerge group first">🔒</span>
                    )}
                  </div>
                );
              },
            },
          ]
        : []),
    ];
  }, [canEdit, processing, handleGroupChange, pendingChanges, savingChanges, schoolStudents, schoolGroups]);

  // Header actions for the DataTable (near export button)
  const tableHeaderActions = hasPendingChanges ? (
    <>
      <Button 
        variant="ghost" 
        size="sm"
        className="border"
        onClick={() => {
          setPendingChanges({});
          fetchSchoolData();
        }}
      >
        Discard ({Object.keys(pendingChanges).length})
      </Button>
      <Button 
        variant="primary" 
        size="sm"
        onClick={saveAllChanges} 
        disabled={savingChanges}
      >
        <IconDeviceFloppy className="w-4 h-4 mr-2" />
        {savingChanges ? 'Saving...' : `Save (${Object.keys(pendingChanges).length})`}
      </Button>
    </>
  ) : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Students Regrouping</h1>
        <Button variant="outline" onClick={fetchSchoolData} disabled={!selectedSchool} size="sm" className="active:scale-95 flex-shrink-0">
          <IconRefresh className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Statistics */}
      {statistics && selectedSchool && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconUsers className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_students}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Students</p>
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
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_groups}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Groups</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <IconLink className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.merged_groups}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Merged</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="md:col-span-2">
              <SearchableSelect
                label="School"
                options={schools}
                value={selectedSchool}
                onChange={(value) => setSelectedSchool(value || '')}
                placeholder="Select a school..."
                searchPlaceholder="Search schools..."
                getOptionValue={(s) => s.id}
                getOptionLabel={(s) => s.name}
                renderOption={renderSchoolOption}
                renderSelected={renderSchoolSelected}
                maxDisplayed={100}
                emptyMessage="No schools found"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Students</label>
              <Input
                type="text"
                placeholder="Search by name or reg number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Session</label>
              <Select
                value={selectedSession}
                onChange={(e) => setSelectedSession(e.target.value)}
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} {session.is_current && '(Current)'}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* School Groups Overview */}
      {selectedSchool && schoolGroups.length > 0 && (
        <div>
            <h4 className="text-lg font-semibold mb-1">Groups Overview</h4>
            <div>
                <div className="flex flex-wrap gap-1">
                {schoolGroups.map((group) => (
                    <div
                    key={group.group_number}
                    className={`px-2 py-1 rounded-lg border ${
                        group.is_merged ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'
                    }`}
                    >
                    <div className="flex items-center gap-2">
                        <span className="font-medium">Group {group.group_number}</span>
                        <Badge variant="outline">{group.student_count} students</Badge>
                        {group.is_merged == 1 && <IconLink className="w-3 h-3 text-purple-500" />}
                    </div>
                    </div>
                ))}
                </div>
            </div>
        </div>
      )}

      {/* Students Table */}
      {selectedSchool ? (
        <DataTable
          data={filteredStudents}
          columns={studentsColumns}
          keyField="id"
          loading={loading}
          sortable
          searchable={false}
          exportable
          exportFilename="school_students_regroup"
          headerActionsRight={tableHeaderActions}
          emptyIcon={IconUsers}
          emptyTitle="No students found for this school"
          emptyDescription="Students will appear here after submitting acceptance forms"
        />
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <IconSchool className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">Select a school to view and regroup students</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default StudentsRegroupPage;
