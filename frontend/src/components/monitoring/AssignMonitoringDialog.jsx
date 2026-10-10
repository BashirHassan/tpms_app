/**
 * Assign Monitoring Dialog
 *
 * Two-pane picker: every assignable school on the left (grouped, searchable,
 * never truncated), the running selection on the right.
 *
 * The server only returns schools that have students this session and no live
 * assignment for the chosen monitoring type; `meta` says how many it left out.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconChevronDown,
  IconSchool,
  IconSearch,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { monitoringApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/helpers';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Select } from '../ui/Select';
import { SearchableSelect } from '../ui/SearchableSelect';

const MONITORING_TYPES = [
  {
    value: 'supervision_evaluation',
    label: 'Supervision Evaluation',
    hint: 'Check on the supervisors visiting the school',
  },
  {
    value: 'school_evaluation',
    label: 'School Evaluation',
    hint: 'Assess the school as a placement',
  },
];

const GROUPINGS = [
  { value: 'route', label: 'Route', field: 'route_name', fallback: 'No route' },
  { value: 'lga', label: 'LGA', field: 'lga', fallback: 'No LGA' },
  { value: 'none', label: 'A-Z' },
];

const DEFAULT_TYPE = 'supervision_evaluation';
const EMPTY_META = { already_assigned: 0, no_students: 0 };

const plural = (count, word) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;
const sumStudents = (schools) => schools.reduce((total, s) => total + (s.student_count || 0), 0);

const SchoolRow = memo(function SchoolRow({ school, checked, onToggle }) {
  const location = [school.lga, school.state].filter(Boolean).join(', ');
  return (
    <label
      className={cn(
        'flex items-stretch cursor-pointer border-b border-gray-100 last:border-b-0',
        checked ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
      )}
    >
      {/* Checkbox and count stay pinned while the row scrolls sideways */}
      <span className="sticky left-0 flex items-center px-3 bg-inherit">
        <input
          type="checkbox"
          className="h-4 w-4 flex-shrink-0 accent-primary-600"
          checked={checked}
          onChange={() => onToggle(school.id)}
        />
      </span>
      <div className="flex-1 py-2 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">{school.name}</div>
        <div className="text-xs text-gray-500">
          {[school.code, location, school.address].filter(Boolean).join(' • ') || 'No address'}
        </div>
      </div>
      <span
        className="sticky right-0 inline-flex items-center gap-1 flex-shrink-0 px-3 bg-inherit text-xs font-medium tabular-nums text-gray-600"
        title="Students posted to this school this session"
      >
        <IconUsers className="w-3.5 h-3.5 text-gray-400" />
        {school.student_count}
      </span>
    </label>
  );
});

export function AssignMonitoringDialog({ isOpen, onClose, sessionId, sessionName, onAssigned }) {
  const { toast } = useToast();

  const [monitoringType, setMonitoringType] = useState(DEFAULT_TYPE);
  const [monitorId, setMonitorId] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [monitors, setMonitors] = useState([]);
  const [schools, setSchools] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [processing, setProcessing] = useState(false);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [groupBy, setGroupBy] = useState('lga');
  const [collapsed, setCollapsed] = useState(() => new Set());

  // Only the latest schools request may write state - switching type quickly
  // would otherwise let a slow earlier response overwrite the current list.
  const schoolsRequest = useRef(0);

  const loadSchools = useCallback(async (type) => {
    const requestId = ++schoolsRequest.current;
    setLoadingSchools(true);
    try {
      const res = await monitoringApi.getUnassignedSchools(sessionId, type);
      if (requestId !== schoolsRequest.current) return;
      setSchools(res.data.data || []);
      setMeta({ ...EMPTY_META, ...res.data.meta });
    } catch (err) {
      if (requestId !== schoolsRequest.current) return;
      console.error('Failed to fetch unassigned schools:', err);
      toast.error('Failed to load available schools');
    } finally {
      if (requestId === schoolsRequest.current) setLoadingSchools(false);
    }
  }, [sessionId, toast]);

  // Start every opening from a clean form with fresh data
  useEffect(() => {
    if (!isOpen || !sessionId) return;

    setMonitoringType(DEFAULT_TYPE);
    setMonitorId('');
    setSelectedIds(new Set());
    setSchools([]);
    setMeta(EMPTY_META);
    setSearch('');
    setStateFilter('');
    setCollapsed(new Set());

    loadSchools(DEFAULT_TYPE);
    monitoringApi.getAvailableMonitors(sessionId)
      .then((res) => setMonitors(res.data.data || []))
      .catch((err) => {
        console.error('Failed to load monitors:', err);
        toast.error('Failed to load available monitors');
      });
  }, [isOpen, sessionId, loadSchools, toast]);

  const changeType = (type) => {
    if (type === monitoringType) return;
    setMonitoringType(type);
    // Each type has its own pool of unassigned schools, so the selection cannot carry over
    setSelectedIds(new Set());
    setCollapsed(new Set());
    loadSchools(type);
  };

  const toggleSchool = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setSchoolsSelected = (list, selected) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      list.forEach((s) => (selected ? next.add(s.id) : next.delete(s.id)));
      return next;
    });
  };

  const toggleCollapsed = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const availableStates = useMemo(
    () => [...new Set(schools.map((s) => s.state).filter(Boolean))].sort(),
    [schools]
  );

  const filteredSchools = useMemo(() => {
    const term = search.trim().toLowerCase();
    return schools.filter((s) => {
      if (stateFilter && s.state !== stateFilter) return false;
      if (!term) return true;
      return [s.name, s.code, s.route_name, s.lga, s.state, s.ward, s.address]
        .some((field) => field?.toLowerCase().includes(term));
    });
  }, [schools, search, stateFilter]);

  const groups = useMemo(() => {
    const grouping = GROUPINGS.find((g) => g.value === groupBy);
    if (!grouping?.field) return [{ key: 'all', label: null, schools: filteredSchools }];

    const byKey = new Map();
    filteredSchools.forEach((school) => {
      const key = school[grouping.field] || grouping.fallback;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(school);
    });
    return [...byKey.entries()]
      .map(([key, list]) => ({ key, label: key, schools: list }))
      // Named groups alphabetically, the "No route" / "No LGA" bucket last
      .sort((a, b) =>
        (a.key === grouping.fallback) - (b.key === grouping.fallback) || a.key.localeCompare(b.key));
  }, [filteredSchools, groupBy]);

  const selectedSchools = useMemo(
    () => schools.filter((s) => selectedIds.has(s.id)),
    [schools, selectedIds]
  );
  const selectedMonitor = monitors.find((m) => m.id.toString() === monitorId);
  const typeLabel = MONITORING_TYPES.find((t) => t.value === monitoringType)?.label;
  const filtersActive = Boolean(search.trim() || stateFilter);
  const allShownSelected = filteredSchools.length > 0 && filteredSchools.every((s) => selectedIds.has(s.id));
  const hiddenNotes = [
    meta.already_assigned > 0 && `${plural(meta.already_assigned, 'school')} already assigned for ${typeLabel}`,
    meta.no_students > 0 && `${plural(meta.no_students, 'school')} with no students this session`,
  ].filter(Boolean);

  const handleSubmit = async () => {
    setProcessing(true);
    try {
      const response = await monitoringApi.createAssignments({
        session_id: sessionId,
        monitor_id: monitorId,
        school_ids: selectedSchools.map((s) => s.id.toString()),
        monitoring_type: monitoringType,
      });

      const { successful = [], failed = [] } = response.data.data || response.data || {};
      if (successful.length > 0) {
        toast.success(`Assigned ${plural(successful.length, 'school')} to ${selectedMonitor?.name || 'the monitor'}`);
      }
      if (failed.length > 0) {
        toast.warning(`${failed.length} assignment(s) failed: ${failed.map((f) => f.reason).join(', ')}`);
      }

      onAssigned?.();
      onClose();
    } catch (err) {
      console.error('Create assignment error:', err);
      toast.error(err.response?.data?.message || 'Failed to create assignment');
    } finally {
      setProcessing(false);
    }
  };

  const canSubmit = Boolean(monitorId) && selectedSchools.length > 0 && !loadingSchools;
  const footerHint = !monitorId
    ? 'Choose a monitor to continue'
    : selectedSchools.length === 0
      ? 'Tick at least one school'
      : `${plural(selectedSchools.length, 'school')} • ${plural(sumStudents(selectedSchools), 'student')}`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Monitoring"
      description={sessionName ? `${sessionName} session` : undefined}
      width="5xl"
      closeOnOutsideClick={!processing}
      contentClassName="space-y-4"
      customFooter={
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 sm:px-6 border-t border-gray-100 flex-shrink-0">
          <p className="text-sm text-gray-600" aria-live="polite">{footerHint}</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={processing}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={processing} disabled={!canSubmit}>
              {selectedSchools.length > 0 ? `Assign ${plural(selectedSchools.length, 'school')}` : 'Assign schools'}
            </Button>
          </div>
        </div>
      }
    >
      {/* Step 1 - what kind of visit, and who makes it */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Monitoring type</span>
          <div role="radiogroup" aria-label="Monitoring type" className="grid grid-cols-2 gap-2">
            {MONITORING_TYPES.map((type) => {
              const active = type.value === monitoringType;
              return (
                <button
                  key={type.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => changeType(type.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                    active ? 'border-primary-600 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <div className={cn('text-sm font-medium', active ? 'text-primary-700' : 'text-gray-900')}>
                    {type.label}
                  </div>
                  <div className="text-xs text-gray-500">{type.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-1">Monitor</span>
          <SearchableSelect
            options={monitors}
            value={monitorId}
            onChange={(val) => setMonitorId(val || '')}
            placeholder="Select a monitor..."
            searchPlaceholder="Search monitors..."
            getOptionValue={(opt) => opt.id.toString()}
            getOptionLabel={(opt) => opt.name}
            renderOption={(opt, { isSelected }) => (
              <div>
                <div className={`font-medium ${isSelected ? 'text-primary-700' : 'text-gray-900'}`}>
                  {opt.name}
                </div>
                <div className="text-xs text-gray-500">
                  {opt.rank_name || 'No rank'} • {plural(Number(opt.current_assignments) || 0, 'school')} so far
                </div>
              </div>
            )}
          />
          <p className="text-xs text-gray-500 mt-1 min-h-[1rem]">
            {selectedMonitor && (
              <>
                Has {plural(Number(selectedMonitor.current_assignments) || 0, 'school')} this session
                {selectedSchools.length > 0 &&
                  ` - ${(Number(selectedMonitor.current_assignments) || 0) + selectedSchools.length} after this assignment`}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Step 2 - pick schools (left) and review the selection (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-4">
        <section className="flex flex-col border border-gray-200 rounded-lg overflow-hidden h-[26rem] lg:h-[52vh] lg:min-h-[20rem]">
          <div className="p-2 space-y-2 border-b border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <IconSearch className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  className="w-full h-10 border border-gray-300 rounded-lg pl-9 pr-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Search name, code, route, LGA, address..."
                  aria-label="Search schools"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {availableStates.length > 1 && (
                <Select
                  className="sm:w-44"
                  aria-label="Filter by state"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="">All states</option>
                  {availableStates.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </Select>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Group by</span>
                <div role="radiogroup" aria-label="Group schools by" className="inline-flex rounded-md border border-gray-300 bg-white overflow-hidden">
                  {GROUPINGS.map((grouping) => (
                    <button
                      key={grouping.value}
                      type="button"
                      role="radio"
                      aria-checked={groupBy === grouping.value}
                      onClick={() => setGroupBy(grouping.value)}
                      className={cn(
                        'px-2.5 py-1 font-medium border-r border-gray-300 last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
                        groupBy === grouping.value ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                      )}
                    >
                      {grouping.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-600 tabular-nums">
                  {filtersActive
                    ? `${filteredSchools.length.toLocaleString()} of ${plural(schools.length, 'school')}`
                    : plural(schools.length, 'school')}
                </span>
                {filteredSchools.length > 0 && (
                  <button
                    type="button"
                    className="font-medium text-primary-700 hover:underline"
                    onClick={() => setSchoolsSelected(filteredSchools, !allShownSelected)}
                  >
                    {allShownSelected ? 'Untick all' : filtersActive ? 'Tick all matches' : 'Tick all'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto [container-type:inline-size]">
            {loadingSchools ? (
              <div className="h-full flex flex-col items-center justify-center text-sm text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mb-2" />
                Loading available schools...
              </div>
            ) : schools.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <IconSchool className="w-10 h-10 text-gray-300 mb-2" />
                <p className="font-medium text-gray-700">No schools left to assign</p>
                <p className="text-sm text-gray-500 max-w-sm">
                  {hiddenNotes.length > 0
                    ? `Nothing is waiting for ${typeLabel}: ${hiddenNotes.join(', ')}.`
                    : 'This institution has no active schools yet.'}
                </p>
              </div>
            ) : filteredSchools.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <p className="text-sm text-gray-600">No schools match your search</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1"
                  onClick={() => { setSearch(''); setStateFilter(''); }}
                >
                  Clear filters
                </Button>
              </div>
            ) : (
              <div className="w-max min-w-full">
                {groups.map((group) => {
                  const tickedCount = group.schools.filter((s) => selectedIds.has(s.id)).length;
                  const allTicked = tickedCount === group.schools.length;
                  const isCollapsed = collapsed.has(group.key);
                  return (
                    <div key={group.key}>
                      {group.label && (
                        <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200">
                          <div className="sticky left-0 w-[100cqw] flex items-center gap-3 px-3 py-1.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 flex-shrink-0 accent-primary-600"
                              aria-label={`Select every school in ${group.label}`}
                              checked={allTicked}
                              ref={(el) => { if (el) el.indeterminate = tickedCount > 0 && !allTicked; }}
                              onChange={() => setSchoolsSelected(group.schools, !allTicked)}
                            />
                            <button
                              type="button"
                              className="flex flex-1 min-w-0 items-center gap-2 text-left"
                              aria-expanded={!isCollapsed}
                              onClick={() => toggleCollapsed(group.key)}
                            >
                              <span className="text-xs font-semibold uppercase tracking-wide text-gray-700 truncate">
                                {group.label}
                              </span>
                              <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                                {tickedCount > 0 ? `${tickedCount}/${group.schools.length}` : group.schools.length}
                                {' • '}
                                {plural(sumStudents(group.schools), 'student')}
                              </span>
                              <IconChevronDown
                                className={cn('w-4 h-4 ml-auto flex-shrink-0 text-gray-500 transition-transform', isCollapsed && '-rotate-90')}
                              />
                            </button>
                          </div>
                        </div>
                      )}
                      {!isCollapsed && group.schools.map((school) => (
                        <SchoolRow
                          key={school.id}
                          school={school}
                          checked={selectedIds.has(school.id)}
                          onToggle={toggleSchool}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col border border-gray-200 rounded-lg overflow-hidden max-h-64 lg:max-h-none lg:h-[52vh] lg:min-h-[20rem]">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">
              Selected <span className="tabular-nums text-gray-500">({selectedSchools.length})</span>
            </h3>
            {selectedSchools.length > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-red-600 hover:underline"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            {selectedSchools.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">
                Schools you tick appear here so you can review them before assigning.
              </p>
            ) : (
              <div className="w-max min-w-full">
                {selectedSchools.map((school) => (
                  <div key={school.id} className="flex items-stretch bg-white border-b border-gray-100 last:border-b-0">
                    <div className="flex-1 pl-3 pr-2 py-1.5 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{school.name}</div>
                      <div className="text-xs text-gray-500">
                        {[school.route_name, plural(school.student_count, 'student')].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <span className="sticky right-0 flex items-center pr-1 bg-inherit flex-shrink-0">
                      <button
                        type="button"
                        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-gray-100"
                        aria-label={`Remove ${school.name}`}
                        onClick={() => toggleSchool(school.id)}
                      >
                        <IconX className="w-4 h-4" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {schools.length > 0 && hiddenNotes.length > 0 && (
        <p className="text-xs text-gray-500">Not listed: {hiddenNotes.join(', ')}.</p>
      )}
    </Dialog>
  );
}

export default AssignMonitoringDialog;
