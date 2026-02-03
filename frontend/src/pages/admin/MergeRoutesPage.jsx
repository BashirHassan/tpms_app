/**
 * Merge Routes Page (Admin)
 * Merge small groups to share a single supervisor posting
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { groupsApi, sessionsApi } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import {
  IconLink,
  IconUnlink,
  IconBuildingBank as IconSchool,
  IconRefresh,
  IconAlertTriangle,
  IconX,
  IconGitMerge,
  IconUsers,
} from '@tabler/icons-react';

function MergeRoutesPage() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const canEdit = hasRole(['super_admin', 'head_of_teaching_practice']);

  // State
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');

  // Data
  const [mergedGroups, setMergedGroups] = useState([]);
  const [availableForMerge, setAvailableForMerge] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [maxMergeStudents, setMaxMergeStudents] = useState(6);

  // Form state
  const [primarySchool, setPrimarySchool] = useState('');
  const [primaryGroup, setPrimaryGroup] = useState('');
  const [secondarySchool, setSecondarySchool] = useState('');
  const [secondaryGroup, setSecondaryGroup] = useState('');
  const [primarySchoolGroups, setPrimarySchoolGroups] = useState([]);
  const [secondarySchoolGroups, setSecondarySchoolGroups] = useState([]);
  const [loadingPrimaryGroups, setLoadingPrimaryGroups] = useState(false);
  const [loadingSecondaryGroups, setLoadingSecondaryGroups] = useState(false);

  // Processing
  const [processing, setProcessing] = useState(false);

  // Unmerge confirmation modal
  const [unmergeTarget, setUnmergeTarget] = useState(null);

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch data when session changes
  useEffect(() => {
    if (selectedSession) {
      fetchData();
    }
  }, [selectedSession]);

  const fetchSessions = async () => {
    try {
      const response = await sessionsApi.getAll({ status: 'active' });
      const sessionsData = response.data.data || response.data || [];
      setSessions(sessionsData);
      const current = sessionsData.find((s) => s.is_current) || sessionsData[0];
      if (current) {
        setSelectedSession(current.id.toString());
        setMaxMergeStudents(current.max_students_per_merged_group || 6);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [mergedRes, availableRes] = await Promise.all([
        groupsApi.getMergedGroups(selectedSession),
        groupsApi.getAvailableForMerge(selectedSession),
      ]);
      const merged = mergedRes.data.data || [];
      const available = availableRes.data.data || [];
      setMergedGroups(merged);
      setAvailableForMerge(available);

      // Calculate statistics - count unique schools
      const uniqueSchools = new Map();
      available.forEach(item => {
        if (!uniqueSchools.has(item.school_id)) {
          uniqueSchools.set(item.school_id, item);
        }
      });

      setStatistics({
        total_merged: merged.length,
        available_count: uniqueSchools.size,
        total_students_merged: merged.reduce((acc, m) => acc + (m.total_students || 0), 0),
      });
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Get unique schools for dropdown
  const schoolsForDropdown = useMemo(() => {
    const schoolMap = new Map();
    availableForMerge.forEach(item => {
      const schoolId = item.institution_school_id;
      if (!schoolMap.has(schoolId)) {
        schoolMap.set(schoolId, {
          id: schoolId,
          name: item.school_name,
          route_name: item.route_name || 'N/A',
          category: item.location_category === 'outside' ? 'Outside' : 'Inside',
          student_count: item.student_count,
        });
      } else {
        // Sum up students from all groups
        const existing = schoolMap.get(schoolId);
        existing.student_count += item.student_count;
      }
    });
    return Array.from(schoolMap.values());
  }, [availableForMerge]);

  // Custom renderer for school options
  const renderSchoolOption = (school, { isSelected }) => (
    <div className="min-w-0">
      <div className={`font-medium truncate ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
        {school.name}
      </div>
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
        <span className="text-gray-600 font-medium">{school.route_name}</span>
        <span className="text-gray-400">•</span>
        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide ${
          school.category === 'Outside' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {school.category}
        </span>
        <span className="text-gray-400">•</span>
        <span>{school.student_count} students</span>
      </div>
    </div>
  );

  const renderSchoolSelected = (school) => (
    <div className="min-w-0">
      <div className="font-medium truncate text-gray-900">{school.name}</div>
    </div>
  );

  // Get set of groups already used as secondary in active merges
  const getSecondaryGroupKeys = useCallback(() => {
    const keys = new Set();
    mergedGroups
      .filter(m => m.status === 'active')
      .forEach(m => {
        // Key format: "schoolId-groupNumber"
        keys.add(`${m.secondary_institution_school_id}-${m.secondary_group_number}`);
      });
    return keys;
  }, [mergedGroups]);

  const fetchSchoolGroups = async (schoolId, type) => {
    if (!schoolId || !selectedSession) return;

    if (type === 'primary') {
      setLoadingPrimaryGroups(true);
    } else {
      setLoadingSecondaryGroups(true);
    }

    try {
      const response = await groupsApi.getSchoolGroups(schoolId, selectedSession);
      let groups = response.data?.data || response.data || [];

      // Filter out groups that are already merged as secondary
      // A group can only be a secondary in one merge at a time
      const secondaryKeys = getSecondaryGroupKeys();
      groups = groups.filter(group => {
        const key = `${schoolId}-${group.group_number}`;
        return !secondaryKeys.has(key);
      });

      if (type === 'primary') {
        setPrimarySchoolGroups(groups);
        setPrimaryGroup('');
      } else {
        setSecondarySchoolGroups(groups);
        setSecondaryGroup('');
      }
    } catch (err) {
      console.error('Failed to fetch school groups:', err);
      if (type === 'primary') {
        setPrimarySchoolGroups([]);
      } else {
        setSecondarySchoolGroups([]);
      }
    } finally {
      if (type === 'primary') {
        setLoadingPrimaryGroups(false);
      } else {
        setLoadingSecondaryGroups(false);
      }
    }
  };

  const handlePrimarySchoolChange = (schoolId) => {
    setPrimarySchool(schoolId);
    setPrimaryGroup('');
    if (schoolId) {
      fetchSchoolGroups(schoolId, 'primary');
    } else {
      setPrimarySchoolGroups([]);
    }
  };

  const handleSecondarySchoolChange = (schoolId) => {
    setSecondarySchool(schoolId);
    setSecondaryGroup('');
    if (schoolId) {
      fetchSchoolGroups(schoolId, 'secondary');
    } else {
      setSecondarySchoolGroups([]);
    }
  };

  const handleMerge = async (e) => {
    e.preventDefault();

    if (!primarySchool || !primaryGroup || !secondarySchool || !secondaryGroup) {
      toast.error('Please fill in all merge fields');
      return;
    }

    if (primarySchool === secondarySchool && primaryGroup === secondaryGroup) {
      toast.error('Cannot merge the same group with itself');
      return;
    }

    setProcessing(true);
    try {
      await groupsApi.createMerge(
        primarySchool,
        parseInt(primaryGroup),
        secondarySchool,
        parseInt(secondaryGroup),
        selectedSession
      );
      toast.success('Routes merged successfully');
      // Reset form
      setPrimarySchool('');
      setPrimaryGroup('');
      setSecondarySchool('');
      setSecondaryGroup('');
      setPrimarySchoolGroups([]);
      setSecondarySchoolGroups([]);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to merge routes');
    } finally {
      setProcessing(false);
    }
  };

  const handleUnmerge = async () => {
    if (!unmergeTarget) return;

    setProcessing(true);
    try {
      await groupsApi.cancelMerge(unmergeTarget.id);
      toast.success('Routes unmerged successfully');
      setUnmergeTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to unmerge routes');
    } finally {
      setProcessing(false);
    }
  };

  // Merged groups table columns
  const mergedColumns = useMemo(
    () => [
      {
        accessor: 'primary_school_name',
        header: 'Primary Route',
        render: (value, row) => (
          <div>
            <p className="font-medium text-gray-900">{value}</p>
            <p className="text-sm text-gray-500">Group {row.primary_group_number}</p>
          </div>
        ),
      },
      {
        accessor: 'secondary_school_name',
        header: 'Secondary Route',
        render: (value, row) => (
          <div>
            <p className="font-medium text-gray-900">{value}</p>
            <p className="text-sm text-gray-500">Group {row.secondary_group_number}</p>
          </div>
        ),
      },
      {
        accessor: 'total_students',
        header: 'Total Students',
        render: (value) => <Badge variant="outline">{value} students</Badge>,
      },
      {
        accessor: 'status',
        header: 'Status',
        render: (value) => (
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              value === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {value}
          </span>
        ),
      },
      ...(canEdit
        ? [
            {
              accessor: 'actions',
              header: 'Actions',
              sortable: false,
              exportable: false,
              render: (_, row) =>
                row.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUnmergeTarget(row)}
                    disabled={processing}
                  >
                    <IconUnlink className="w-4 h-4 mr-1" />
                    Unmerge
                  </Button>
                ),
            },
          ]
        : []),
    ],
    [canEdit, processing]
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Merge Routes</h1>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" onClick={fetchData} size="sm" className="active:scale-95">
            <IconRefresh className="w-4 h-4" />
          </Button>
          <Select
            value={selectedSession}
            onChange={(e) => {
              const sessionId = e.target.value;
              setSelectedSession(sessionId);
              const session = sessions.find(s => s.id.toString() === sessionId);
              if (session) {
                setMaxMergeStudents(session.max_students_per_merged_group || 6);
              }
            }}
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

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                  <IconGitMerge className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_merged}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Merged</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-100 flex items-center justify-center flex-shrink-0">
                  <IconSchool className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.available_count}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Available</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <IconUsers className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg sm:text-2xl font-bold">{statistics.total_students_merged}</p>
                  <p className="text-[10px] sm:text-sm text-gray-500 truncate">Students</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Merge Form */}
      {canEdit && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-600">
                Merge small groups to share a single supervisor posting.
              </p>
              <Badge variant="info" className="bg-blue-100 text-blue-700">
                Max {maxMergeStudents} students per merge
              </Badge>
            </div>
            <form onSubmit={handleMerge}>
              <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
                <div className="col-span-2">
                  <SearchableSelect
                    label="Primary Route"
                    options={schoolsForDropdown}
                    value={primarySchool}
                    onChange={(value) => handlePrimarySchoolChange(value)}
                    placeholder="Select school..."
                    searchPlaceholder="Search schools..."
                    getOptionValue={(s) => s.id}
                    getOptionLabel={(s) => s.name}
                    renderOption={renderSchoolOption}
                    renderSelected={renderSchoolSelected}
                    maxDisplayed={100}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group No.</label>
                  <Select
                    value={primaryGroup}
                    onChange={(e) => setPrimaryGroup(e.target.value)}
                    className="w-full"
                    disabled={loadingPrimaryGroups || !primarySchool}
                    required
                  >
                    <option value="">
                      {loadingPrimaryGroups ? 'Loading...' : '-- Select Group --'}
                    </option>
                    {primarySchoolGroups.map((group) => (
                      <option key={group.group_number} value={group.group_number}>
                        Group {group.group_number} ({group.student_count || 0} students)
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2">
                  <SearchableSelect
                    label="Secondary Route"
                    options={schoolsForDropdown}
                    value={secondarySchool}
                    onChange={(value) => handleSecondarySchoolChange(value)}
                    placeholder="Select school..."
                    searchPlaceholder="Search schools..."
                    getOptionValue={(s) => s.id}
                    getOptionLabel={(s) => s.name}
                    renderOption={renderSchoolOption}
                    renderSelected={renderSchoolSelected}
                    maxDisplayed={100}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group No.</label>
                  <Select
                    value={secondaryGroup}
                    onChange={(e) => setSecondaryGroup(e.target.value)}
                    className="w-full"
                    disabled={loadingSecondaryGroups || !secondarySchool}
                    required
                  >
                    <option value="">
                      {loadingSecondaryGroups ? 'Loading...' : '-- Select Group --'}
                    </option>
                    {secondarySchoolGroups.map((group) => (
                      <option key={group.group_number} value={group.group_number}>
                        Group {group.group_number} ({group.student_count || 0} students)
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="w-full" disabled={processing}>
                    <IconLink className="w-4 h-4 mr-2" />
                    {processing ? 'Merging...' : 'Merge'}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Merged Groups Table */}
      <DataTable
        data={mergedGroups}
        columns={mergedColumns}
        keyField="id"
        loading={loading}
        sortable
        exportable
        exportFilename="merged_routes"
        emptyIcon={IconGitMerge}
        emptyTitle="No merged routes yet"
        emptyDescription="Use the form above to merge small groups"
      />

      {/* Unmerge Confirmation Modal */}
      <Dialog
        isOpen={!!unmergeTarget}
        onClose={() => setUnmergeTarget(null)}
        title="Confirm Unmerge"
        width="md"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setUnmergeTarget(null)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={handleUnmerge}
              disabled={processing}
            >
              <IconUnlink className="w-4 h-4 mr-2" />
              {processing ? 'Unmerging...' : 'Yes, Unmerge'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <IconAlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-yellow-800">
                Are you sure you want to unmerge these routes?
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                The secondary route will become independent and will need a separate supervisor
                posting.
              </p>
            </div>
          </div>

          {unmergeTarget && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div>
                <p className="text-sm text-gray-500">Primary Route</p>
                <p className="font-medium">
                  {unmergeTarget.primary_school_name} - Group {unmergeTarget.primary_group_number}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Secondary Route</p>
                <p className="font-medium">
                  {unmergeTarget.secondary_school_name} - Group {unmergeTarget.secondary_group_number}
                </p>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}

export default MergeRoutesPage;
